import { artStatus, fetchImage, saveIcon, sgdbAssets, sgdbSearch, type ArtKind, type SgdbAsset } from "./api"
import { artErrorText, t } from "./i18n"
import { selfAccountId } from "./steam/persona"

// Pulls a shortcut's artwork from SteamGridDB and applies it the way Steam's
// own "Personalizar arte" menu does (SteamClient.Apps.SetCustomArtworkForApp),
// so it lands in the account's grid folder and every library view updates.

// Steam's ELibraryAssetType (library.js #94601): 0 capsule, 1 hero, 2 logo, 3 header.
const ASSET_TYPE: Record<Exclude<ArtKind, "icon">, number> = { capsule: 0, hero: 1, logo: 2, header: 3 }
const KINDS: ArtKind[] = ["capsule", "header", "hero", "logo", "icon"]

const KEY_STORAGE = "bloodborne-pc.sgdbKey"
const AUTO_STORAGE = "bloodborne-pc.sgdbAuto"

export const settings = {
  get key(): string { try { return localStorage.getItem(KEY_STORAGE) ?? "" } catch { return "" } },
  set key(v: string) { try { localStorage.setItem(KEY_STORAGE, v.trim()) } catch {} },
  get auto(): boolean { try { return localStorage.getItem(AUTO_STORAGE) !== "0" } catch { return true } },
  set auto(v: boolean) { try { localStorage.setItem(AUTO_STORAGE, v ? "1" : "0") } catch {} },
}

interface SteamApps {
  SetCustomArtworkForApp?(appid: number, base64: string, ext: string, assetType: number): Promise<unknown>
  SetShortcutIcon?(appid: number, path: string): unknown
}
const apps = () => (window as { SteamClient?: { Apps?: SteamApps } }).SteamClient?.Apps

export interface ArtReport {
  game?: string
  applied: ArtKind[]
  skipped: ArtKind[]
  errors: string[]
  /** kind → "author · style · WxH" of what was applied. */
  picked: Partial<Record<ArtKind, string>>
}

const MAX_ATTEMPTS = 3

/** Rank SteamGridDB candidates the way that looks most like an official
 * release: community score first, then resolution, English (or language-less)
 * art before localized variants, and — for the wide capsule and hero — the
 * same author as the chosen capsule when they have a well-rated one, so the
 * set matches. */
export function rankAssets(list: SgdbAsset[], preferAuthor?: string): SgdbAsset[] {
  const score = (a: SgdbAsset) => a.score ?? 0
  const pixels = (a: SgdbAsset) => (a.width ?? 0) * (a.height ?? 0)
  const lang = (a: SgdbAsset) => (!a.language || a.language === "en" ? 0 : 1)
  const ranked = [...list].sort((a, b) => score(b) - score(a) || lang(a) - lang(b) || pixels(b) - pixels(a))
  if (preferAuthor) {
    const same = ranked.find((a) => a.author?.name === preferAuthor && score(a) >= 0)
    if (same) return [same, ...ranked.filter((a) => a !== same)]
  }
  return ranked
}

const message = (e: unknown) => artErrorText(e instanceof Error ? e.message : String(e))

const describeAsset = (a: SgdbAsset) =>
  [a.author?.name, a.style, a.width && a.height ? `${a.width}×${a.height}` : ""].filter(Boolean).join(" · ")

/** Apply SteamGridDB artwork to a shortcut. Without `force`, only the kinds
 * the account has no custom image for are filled in. */
export async function applyArtwork(appid: string, name: string, force: boolean): Promise<ArtReport> {
  const report: ArtReport = { applied: [], skipped: [], errors: [], picked: {} }
  const key = settings.key
  const account = selfAccountId()
  const client = apps()
  if (!key) { report.errors.push(t.artErrors.no_key); return report }
  if (!account || !client?.SetCustomArtworkForApp) { report.errors.push(t.artErrors.no_client); return report }

  let have: Partial<Record<ArtKind, boolean>> = {}
  try { have = await artStatus(account, appid) } catch (e) { report.errors.push(message(e)) }
  const wanted = KINDS.filter((k) => force || !have[k])
  report.skipped = KINDS.filter((k) => !wanted.includes(k))
  if (wanted.length === 0) return report

  let game
  try { game = (await sgdbSearch(key, name))[0] } catch (e) { report.errors.push(message(e)); return report }
  if (!game) { report.errors.push(t.artErrors.not_found(name)); return report }
  report.game = game.name

  let capsuleAuthor: string | undefined
  for (const kind of wanted) {
    try {
      let list = await sgdbAssets(key, game.id, kind)
      if (list.length === 0) list = await sgdbAssets(key, game.id, `${kind}_any`)
      const candidates = rankAssets(list, kind === "header" || kind === "hero" ? capsuleAuthor : undefined)
      if (candidates.length === 0) { report.skipped.push(kind); continue }

      // A candidate can fail (e.g. too large for the IPC limit): try the next one.
      let lastError: unknown
      let done: SgdbAsset | undefined
      for (const pick of candidates.slice(0, MAX_ATTEMPTS)) {
        try {
          if (kind === "icon") {
            await client.SetShortcutIcon?.(Number(appid), await saveIcon(account, appid, pick.url))
          } else {
            const { b64, ext } = await fetchImage(pick.url)
            await client.SetCustomArtworkForApp(Number(appid), b64, ext, ASSET_TYPE[kind])
          }
          done = pick
          break
        } catch (e) {
          lastError = e
        }
      }
      if (!done) throw lastError
      if (kind === "capsule") capsuleAuthor = done.author?.name
      report.applied.push(kind)
      report.picked[kind] = describeAsset(done)
    } catch (e) {
      report.errors.push(`${t.artKinds[kind]}: ${message(e)}`)
    }
  }
  return report
}

const autoDone = new Set<string>()

/** Fill in missing artwork once per session per shortcut, when enabled. */
export function autoApplyArtwork(appid: string, name: string, log: (...a: unknown[]) => void) {
  if (autoDone.has(appid) || !settings.auto || !settings.key) return
  autoDone.add(appid)
  applyArtwork(appid, name, false)
    .then((r) => { if (r.errors.length) log("SteamGridDB:", r.errors) })
    .catch((e) => log("SteamGridDB error", e))
}
