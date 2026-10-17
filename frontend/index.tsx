import React from "react"
import { definePlugin, Millennium } from "@steambrew/client"
import { fetchReleases, fetchState, type BackendState, type Release } from "./api"
import { findColumns, findNotice, findStatRows, sel, type StatRow } from "./dom"
import { t, trophyLanguageIndex } from "./i18n"
import { ensureStyles } from "./styles"
import { buildTrophySet, type TrophySet } from "./trophies"
import { AchievementsCard } from "./components/AchievementsCard"
import { ActivityFeed } from "./components/ActivityFeed"
import { AchievementsModal } from "./components/AchievementsModal"

const SHORTCUT_APP_TYPE = 1073741824
const TICK_MS = 1500
const STATE_TTL_MS = 8000
const MISS_TTL_MS = 60000
const ACTIVE_ATTR = "data-bbpc-active"
const NOTICE_ATTR = "data-bbpc-notice"
const STAT_ID = "bbpc-stat"

interface ReactRoot { render(node: React.ReactNode): void; unmount(): void }
interface Popup { m_strName: string; m_popup: { document: Document; window: Window } }

// Steam globals, typed loosely: the SDK's own declarations vary by version.
interface SteamGlobals {
  SP_REACTDOM?: { createRoot(el: Element): ReactRoot }
  MainWindowBrowserManager?: { m_browser?: { on?(ev: string, cb: () => void): void }; m_lastLocation?: unknown }
  appStore?: { GetAppOverviewByAppID?(id: number): { display_name?: string; app_type?: number } | null }
}
const steam = () => window as unknown as SteamGlobals

const log = (...a: unknown[]) => console.log("[bloodborne-pc]", ...a)

// ── state per shortcut ────────────────────────────────────────────────

interface GameData { state: BackendState; set: TrophySet; fetchedAt: number }
const games = new Map<string, GameData>()
const misses = new Map<string, number>()
let releases: Release[] = []
let releasesAt = 0

async function getGame(appid: string): Promise<GameData | null> {
  const cached = games.get(appid)
  if (cached && Date.now() - cached.fetchedAt < STATE_TTL_MS) return cached
  if (!cached && Date.now() - (misses.get(appid) ?? 0) < MISS_TTL_MS) return null

  const state = await fetchState(appid, trophyLanguageIndex())
  const set = state.ok ? buildTrophySet(state) : null
  if (!set) {
    if (!state.ok) log(`appid ${appid}: ${state.error}`)
    misses.set(appid, Date.now())
    games.delete(appid)
    return null
  }
  const data = { state, set, fetchedAt: Date.now() }
  games.set(appid, data)
  return data
}

function refreshReleases(onDone: () => void) {
  if (Date.now() - releasesAt < 10 * 60000) return
  releasesAt = Date.now()
  fetchReleases().then((list) => { if (list.length) { releases = list; onDone() } })
}

// ── mounting ──────────────────────────────────────────────────────────

interface Mount { el: HTMLElement; root: ReactRoot }
const mounts: Record<"left" | "right" | "modal", Mount | null> = { left: null, right: null, modal: null }

function mountAt(key: "left" | "right" | "modal", doc: Document, place: (el: HTMLElement) => void): Mount | null {
  let m = mounts[key]
  if (m && (m.el.ownerDocument !== doc || !m.el.isConnected)) { unmount(key); m = null }
  if (!m) {
    const RD = steam().SP_REACTDOM
    if (!RD) return null
    const el = doc.createElement("div")
    el.setAttribute("data-bbpc", key)
    place(el)
    m = { el, root: RD.createRoot(el) }
    mounts[key] = m
  }
  return m
}

function unmount(key: "left" | "right" | "modal") {
  const m = mounts[key]
  if (!m) return
  try { m.root.unmount() } catch {}
  m.el.remove()
  mounts[key] = null
}

function deactivate(doc: Document) {
  unmount("left"); unmount("right"); unmount("modal")
  doc.documentElement.removeAttribute(ACTIVE_ATTR)
  doc.querySelectorAll(`[${NOTICE_ATTR}]`).forEach((el) => el.removeAttribute(NOTICE_ATTR))
  doc.getElementById(STAT_ID)?.remove()
}

function openModal(doc: Document, appid: string, game: GameData, gameName: string) {
  const m = mountAt("modal", doc, (el) => doc.body.appendChild(el))
  m?.root.render(
    <AchievementsModal appid={appid} set={game.set} gameName={gameName} doc={doc} onClose={() => unmount("modal")} />,
  )
}

/** Clone a native play-bar stat (e.g. TEMPO DE JOGO) so ours inherits Steam's
 * exact layout, then swap in the icon, label and progress. */
function renderStat(row: StatRow, set: TrophySet, onClick: () => void) {
  const doc = row.section.ownerDocument
  let stat = doc.getElementById(STAT_ID)
  if (!stat || stat.parentElement !== row.section) {
    stat?.remove()
    if (!row.template) return
    stat = row.template.cloneNode(true) as HTMLElement
    stat.id = STAT_ID
    stat.setAttribute("data-bbpc", "stat")
    stat.classList.add("bbpc-stat")
    stat.addEventListener("click", onClick)
    const svg = stat.querySelector("svg")
    if (svg) {
      svg.setAttribute("viewBox", "0 0 36 36")
      svg.innerHTML =
        '<path fill="currentColor" d="M27 6V3H9v3H3v5c0 4.1 3 7.4 6.9 7.9A9 9 0 0 0 16 24.3V29h-5v4h14v-4h-5v-4.7a9 9 0 0 0 6.1-5.4C30 18.4 33 15.1 33 11V6h-6ZM7 11V9h2v6a4 4 0 0 1-2-4Zm22 0a4 4 0 0 1-2 4V9h2v2Z"/>'
    }
    const bar = doc.createElement("div")
    bar.className = "bbpc-stat__bar"
    bar.appendChild(doc.createElement("div"))
    const detail = stat.querySelector(sel(row.classes.PlayBarDetailLabel)) ?? stat.querySelector("div div:last-child")
    detail?.parentElement?.appendChild(bar)
    row.section.appendChild(stat)
  }
  const label = stat.querySelector(sel(row.classes.PlayBarLabel))
  const detail = stat.querySelector(sel(row.classes.PlayBarDetailLabel))
  if (label) label.textContent = t.achievements
  if (detail) detail.textContent = `${set.unlocked}/${set.total}`
  const fill = stat.querySelector<HTMLElement>(".bbpc-stat__bar > div")
  if (fill) fill.style.width = `${set.percent}%`
}

async function sync(doc: Document, appid: string | null, isCurrent: () => boolean) {
  if (!appid) return deactivate(doc)
  const overview = steam().appStore?.GetAppOverviewByAppID?.(Number(appid))
  const isShortcut = overview ? overview.app_type === SHORTCUT_APP_TYPE : Number(appid) >= 2147483648
  if (!isShortcut) return deactivate(doc)

  const game = await getGame(appid)
  if (!isCurrent()) return
  if (!game) return deactivate(doc)

  ensureStyles(doc)
  const notice = findNotice(doc)
  const columns = findColumns(doc, notice)
  if (!columns) return // page still rendering; next tick retries

  doc.documentElement.setAttribute(ACTIVE_ATTR, "1")
  notice?.setAttribute(NOTICE_ATTR, "1")

  const gameName = overview?.display_name || game.set.title
  const open = () => openModal(doc, appid, games.get(appid) ?? game, gameName)
  const showUpdates = Boolean(game.state.engine) || /bloodborne/i.test(game.set.title)
  if (showUpdates) refreshReleases(() => sync(doc, appid, isCurrent))

  const left = mountAt("left", doc, (el) => {
    if (notice?.parentElement) notice.parentElement.insertBefore(el, notice.nextSibling)
    else columns.left.prepend(el)
  })
  left?.root.render(
    <ActivityFeed
      key={appid}
      appid={appid}
      set={game.set}
      releases={releases}
      installedVersion={game.state.version ?? ""}
      showUpdates={showUpdates}
      onOpenAchievements={open}
    />,
  )

  const right = mountAt("right", doc, (el) => {
    if (columns.right) columns.right.prepend(el)
    else left?.el.parentElement?.insertBefore(el, left.el)
  })
  right?.root.render(<AchievementsCard key={appid} appid={appid} set={game.set} onOpen={open} />)

  for (const row of findStatRows(doc)) renderStat(row, game.set, open)
}

// ── Steam window watcher ──────────────────────────────────────────────

function appIdFrom(location: unknown): string | null {
  const path = typeof location === "string" ? location
    : location && typeof location === "object" ? String((location as { pathname?: string }).pathname ?? "") : ""
  return path.match(/\/library\/app\/(\d+)/)?.[1] ?? null
}

let attachedDoc: Document | null = null

async function attach(popup: Popup) {
  if (popup.m_strName !== "SP Desktop_uid0") return
  const doc = popup.m_popup?.document
  if (!doc || doc === attachedDoc) return
  attachedDoc = doc

  let mwbm = steam().MainWindowBrowserManager
  for (let i = 0; !mwbm && i < 300; i++) {
    await new Promise((r) => setTimeout(r, 100))
    mwbm = steam().MainWindowBrowserManager
  }
  if (!mwbm) return log("MainWindowBrowserManager not found")

  let generation = 0
  let busy = false
  let lastAppId: string | null = null
  const tick = () => {
    if (busy || doc !== attachedDoc) return
    const appid = appIdFrom(mwbm!.m_lastLocation)
    if (appid !== lastAppId) {
      lastAppId = appid
      generation++
      deactivate(doc)
    }
    const gen = generation
    busy = true
    sync(doc, appid, () => gen === generation && doc === attachedDoc)
      .catch((e) => log("sync error", e))
      .finally(() => { busy = false })
  }
  try { mwbm.m_browser?.on?.("finished-request", tick) } catch {}
  const timer = window.setInterval(tick, TICK_MS)
  popup.m_popup.window?.addEventListener("unload", () => {
    window.clearInterval(timer)
    if (attachedDoc === doc) attachedDoc = null
  })
  tick()
  log("attached to main window")
}

export default definePlugin(() => {
  Millennium.AddWindowCreateHook?.((ctx: unknown) => {
    attach(ctx as Popup).catch((e) => log("attach error", e))
  })
  // If the main window already existed when the plugin loaded (plugin reload),
  // the create hook never fires for it.
  try {
    const pm = (window as { g_PopupManager?: { GetExistingPopup?(name: string): Popup | undefined } }).g_PopupManager
    const existing = pm?.GetExistingPopup?.("SP Desktop_uid0")
    if (existing) attach(existing).catch((e) => log("attach error", e))
  } catch {}
  return {
    title: <div>Bloodborne PC · Biblioteca</div>,
    icon: <div>🩸</div>,
    content: (
      <div style={{ padding: 16, lineHeight: 1.5 }}>
        Mostra os troféus locais do BloodBorneButPc como conquistas na página do atalho não-Steam,
        junto com as atualizações do projeto. Nada é enviado para a Steam; tudo fica só neste PC.
      </div>
    ),
  }
})
