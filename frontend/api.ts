import { callable } from "@steambrew/client"

// Keys are listed alphabetically to match the Lua parameter order.
const stateRaw = callable<[{ appid: string; lang: string }], string>("bb_state")
const iconRaw = callable<[{ appid: string; file: string }], string>("bb_icon")
const releasesRaw = callable<[], string>("bb_releases")

/** callable() resolves to JSON.stringify(backend value); a backend string may
 * itself be JSON (GitHub feed), so unwrap up to two levels. */
function unwrap<T>(raw: unknown): T {
  let value: unknown = raw
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try { value = JSON.parse(value) } catch { break }
  }
  return value as T
}

export interface BackendState {
  ok: boolean
  error?: string
  root?: string
  npcommid?: string
  user?: string
  /** Per-profile trophy XML with unlockstate/timestamp (English names). */
  progress?: string
  /** TROP_XX.XML for the UI language, or "" when unavailable. */
  localized?: string
  version?: string
  engine?: string
}

export interface Release {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
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

// ── icons: fetched lazily, a few at a time, cached for the session ─────

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

export function openExternal(url: string) {
  const sc = (window as { SteamClient?: { System?: { OpenInSystemBrowser?: (u: string) => void } } }).SteamClient
  if (sc?.System?.OpenInSystemBrowser) sc.System.OpenInSystemBrowser(url)
  else window.open(url, "_blank")
}
