import { callable } from "@steambrew/client"

// Keys are listed alphabetically to match the Lua parameter order.
const stateRaw = callable<[{ appid: string; lang: string }], string>("bb_state")
const iconRaw = callable<[{ appid: string; file: string }], string>("bb_icon")
const releasesRaw = callable<[], string>("bb_releases")
const sgdbSearchRaw = callable<[{ key: string; term: string }], string>("bb_sgdb_search")
const sgdbAssetsRaw = callable<[{ game: number; key: string; kind: string }], string>("bb_sgdb_assets")
const fetchImageRaw = callable<[{ url: string }], string>("bb_fetch_image")
const artStatusRaw = callable<[{ accountid: string; appid: string }], string>("bb_art_status")
const findBloodborneRaw = callable<[{ accountid: string }], string>("bb_find_bloodborne")
const saveIconRaw = callable<[{ accountid: string; appid: string; url: string }], string>("bb_save_icon")

/** callable() resolves to JSON.stringify(backend value); a backend string may
 * itself be JSON (GitHub feed), so unwrap up to two levels. */
function unwrap<T>(raw: unknown): T {
  let value: unknown = raw
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try { value = JSON.parse(value) } catch { break }
  }
  return value as T
}

export type FailReason = "not_shortcut" | "missing_folder" | "no_data"

export interface BackendState {
  ok: boolean
  error?: string
  /** Why there is no data (when !ok). */
  reason?: FailReason
  /** Folder the shortcut points at (when !ok). */
  path?: string
  /** The shortcut looks like Bloodborne PC (when !ok): explain instead of hiding. */
  bloodborne?: boolean
  root?: string
  npcommid?: string
  user?: string
  /** Per-profile trophy XML with unlockstate/timestamp (English names). */
  progress?: string
  /** TROP_XX.XML for the UI language, or "" when unavailable. */
  localized?: string
  version?: string
  engine?: string
  /** "launcher" (LanternEngine profile), "shadps4" (older files) or "none". */
  source?: string
  /** False when using the built-in list (no extracted icons). */
  icons?: boolean
  /** Launcher playtime of the active profile, in seconds. */
  playtime?: number
  /** Unix time of the profile's last session. */
  last_played?: number
  /** The launcher profile's folder (saves + trophies.log). */
  saves_dir?: string
}

export interface Release {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
  author?: { login?: string }
}

export async function fetchState(appid: string, lang: string): Promise<BackendState> {
  try {
    return unwrap<BackendState>(await stateRaw({ appid, lang })) ?? { ok: false, error: "empty" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchReleases(): Promise<Release[]> {
  try {
    const list = unwrap<unknown>(await releasesRaw())
    return Array.isArray(list) ? (list as Release[]).filter((r) => !r.draft) : []
  } catch {
    return []
  }
}

const iconCache = new Map<string, Promise<string>>()
const queue: Array<() => void> = []
let running = 0
const MAX_PARALLEL = 4

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++
      job().then(resolve, reject).finally(() => {
        running--
        queue.shift()?.()
      })
    }
    if (running < MAX_PARALLEL) run()
    else queue.push(run)
  })
}

export function loadIcon(appid: string, file: string): Promise<string> {
  const key = `${appid}/${file}`
  let p = iconCache.get(key)
  if (!p) {
    p = schedule(async () => unwrap<string>(await iconRaw({ appid, file })) || "")
    p.catch(() => iconCache.delete(key))
    iconCache.set(key, p)
  }
  return p
}

export function safeWebUrl(value: string, httpsOnly = false): string | null {
  try {
    const url = new URL(value)
    if (url.username || url.password || (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:"))) return null
    return url.href
  } catch {
    return null
  }
}

export function openExternal(value: string) {
  const url = safeWebUrl(value)
  if (!url) return
  const sc = (window as { SteamClient?: { System?: { OpenInSystemBrowser?: (u: string) => void } } }).SteamClient
  if (sc?.System?.OpenInSystemBrowser) sc.System.OpenInSystemBrowser(url)
  else window.open(url, "_blank", "noopener,noreferrer")
}

export type ArtKind = "capsule" | "header" | "hero" | "logo" | "icon"

export interface SgdbGame { id: number; name: string }
export interface SgdbAsset {
  id: number
  url: string
  thumb?: string
  width?: number
  height?: number
  mime?: string
  style?: string
  score?: number
  language?: string
  author?: { name?: string; steam64?: string }
}
type Errorish = { error?: string }

function sgdbList<T>(raw: unknown): T[] {
  const v = unwrap<{ success?: boolean; data?: T[]; errors?: string[] } & Errorish>(raw)
  if (v?.error) throw new Error(v.error)
  if (!v?.success) throw new Error(v?.errors?.join(", ") || "bad_response")
  return v.data ?? []
}

export async function sgdbSearch(key: string, term: string): Promise<SgdbGame[]> {
  return sgdbList<SgdbGame>(await sgdbSearchRaw({ key, term }))
}

/** `kind` is the strict official-style query; `${kind}_any` the fallback. */
export async function sgdbAssets(key: string, game: number, kind: ArtKind | `${ArtKind}_any`): Promise<SgdbAsset[]> {
  return sgdbList<SgdbAsset>(await sgdbAssetsRaw({ game, key, kind }))
}

export async function fetchImage(url: string): Promise<{ b64: string; ext: string }> {
  const v = unwrap<{ b64?: string; ext?: string } & Errorish>(await fetchImageRaw({ url }))
  if (!v?.b64 || !v.ext) throw new Error(v?.error || "download")
  return { b64: v.b64, ext: v.ext }
}

export async function artStatus(accountid: string, appid: string): Promise<Partial<Record<ArtKind, boolean>>> {
  const v = unwrap<Partial<Record<ArtKind, boolean>> & Errorish>(await artStatusRaw({ accountid, appid }))
  if (v?.error) throw new Error(v.error)
  return v ?? {}
}

export async function saveIcon(accountid: string, appid: string, url: string): Promise<string> {
  const v = unwrap<{ path?: string } & Errorish>(await saveIconRaw({ accountid, appid, url }))
  if (!v?.path) throw new Error(v?.error || "icon")
  return v.path
}

export interface BloodborneShortcut { found: boolean; appid?: string; name?: string; ready?: boolean; profile?: string; playtime?: number }

/** Is Bloodborne in this account's library, and does it have trophy data? */
export async function findBloodborne(accountid: string): Promise<BloodborneShortcut> {
  try {
    return unwrap<BloodborneShortcut>(await findBloodborneRaw({ accountid })) ?? { found: false }
  } catch {
    return { found: false }
  }
}
