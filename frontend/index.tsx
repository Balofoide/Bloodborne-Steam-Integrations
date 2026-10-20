import React from "react"
import { definePlugin, Millennium } from "@steambrew/client"
import { fetchReleases, fetchState, findBloodborne, type BackendState, type BloodborneShortcut, type Release } from "./api"
import { findColumns, findNotice, findStatSections } from "./dom"
import { isPt, trophyLanguageIndex } from "./i18n"
import { css, cx } from "./steam/classes"
import { L } from "./steam/l10n"
import { ensureStyles } from "./styles"
import { buildTrophySet, type TrophySet } from "./trophies"
import { newerRelease } from "./versions"
import { AchievementsSection } from "./components/AchievementsSection"
import { ActivityFeed } from "./components/ActivityFeed"
import { AchievementsOverlay, type Artwork } from "./components/AchievementsOverlay"
import { EventOverlay } from "./components/EventOverlay"
import { SettingsPage } from "./components/SettingsPage"
import { GuideNotice } from "./components/GuideNotice"
import { LinksBar } from "./components/LinksBar"
import { openSetupDialog, setupState } from "./components/SetupDialog"
import { autoApplyArtwork, settings } from "./artwork"
import { selfAccountId } from "./steam/persona"
import { setSetupOpener } from "./setup-bus"
import { LAST_PLAYED_ID, PLAYTIME_ID, readSteamStats, renderPlaybarStats } from "./stats"

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
  appStore?: {
    GetAppOverviewByAppID?(id: number): AppOverview | null
    GetCustomHeroImageURLs?(app: AppOverview): string[]
    GetIconURLForApp?(app: AppOverview): string
  }
}
interface AppOverview { display_name?: string; app_type?: number }
const steam = () => window as unknown as SteamGlobals

const log = (...a: unknown[]) => console.warn("[bloodborne-pc]", ...a)

interface GameData { state: BackendState; set: TrophySet; fetchedAt: number }
const games = new Map<string, GameData>()
const misses = new Map<string, number>()
/** Last failure per shortcut (reason/path) to explain it on the page. */
const failures = new Map<string, BackendState>()
const FAIL_RETRY_MS = 10000

// The account's working Bloodborne shortcut (for "open the working one").
let bloodborne: { at: number; value: BloodborneShortcut } | null = null
async function workingBloodborne(): Promise<BloodborneShortcut> {
  if (bloodborne && Date.now() - bloodborne.at < 60000) return bloodborne.value
  const value = await findBloodborne(selfAccountId())
  bloodborne = { at: Date.now(), value }
  return value
}
let releases: Release[] = []
let releasesAt = 0

async function getGame(appid: string): Promise<GameData | null> {
  const cached = games.get(appid)
  if (cached && Date.now() - cached.fetchedAt < STATE_TTL_MS) return cached
  // Re-check a broken Bloodborne shortcut sooner, so fixing it shows up fast.
  const ttl = failures.get(appid)?.bloodborne ? FAIL_RETRY_MS : MISS_TTL_MS
  if (!cached && Date.now() - (misses.get(appid) ?? 0) < ttl) return null

  const state = await fetchState(appid, trophyLanguageIndex())
  // Same files as last time → keep the same objects so nothing re-renders.
  if (cached && state.ok && state.progress === cached.state.progress && state.localized === cached.state.localized
      && state.version === cached.state.version) {
    cached.fetchedAt = Date.now()
    return cached
  }
  const set = state.ok ? buildTrophySet(state) : null
  if (!set) {
    if (!state.ok && state.bloodborne) log(`appid ${appid}: ${state.error}`)
    failures.set(appid, state.ok ? { ok: false, reason: "no_data", bloodborne: true } : state)
    misses.set(appid, Date.now())
    games.delete(appid)
    return null
  }
  failures.delete(appid)
  const data = { state, set, fetchedAt: Date.now() }
  games.set(appid, data)
  return data
}

function refreshReleases(onDone: () => void) {
  if (Date.now() - releasesAt < 10 * 60000) return
  releasesAt = Date.now()
  fetchReleases().then((list) => { if (list.length) { releases = list; onDone() } })
}

type MountKey = "feed" | "achievements" | "overlay" | "event" | "guide" | "setup" | "links"
interface Mount { el: HTMLElement; root: ReactRoot; deps?: unknown[] }
const mounts: Record<MountKey, Mount | null> = {
  feed: null, achievements: null, overlay: null, event: null, guide: null, setup: null, links: null,
}

function mountAt(key: MountKey, doc: Document, place: (el: HTMLElement) => void): Mount | null {
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

/** Avoid re-rendering sections on every watcher tick. */
function renderIfChanged(m: Mount | null, deps: unknown[], node: () => React.ReactNode) {
  if (!m) return
  if (m.deps && m.deps.length === deps.length && m.deps.every((d, i) => d === deps[i])) return
  m.deps = deps
  m.root.render(node())
}

function unmount(key: MountKey) {
  const m = mounts[key]
  if (!m) return
  try { m.root.unmount() } catch {}
  m.el.remove()
  mounts[key] = null
}

function deactivate(doc: Document) {
  // Page-bound mounts only: the first-run dialog is not tied to a page.
  for (const key of Object.keys(mounts) as MountKey[]) if (key !== "setup") unmount(key)
  doc.documentElement.removeAttribute(ACTIVE_ATTR)
  doc.querySelectorAll(`[${NOTICE_ATTR}]`).forEach((el) => el.removeAttribute(NOTICE_ATTR))
  for (const id of [STAT_ID, LAST_PLAYED_ID, PLAYTIME_ID]) doc.getElementById(id)?.remove()
}

/** The shortcut's custom artwork, as Steam's own achievements page uses it. */
function artworkFor(overview: AppOverview | null | undefined): Artwork {
  const store = steam().appStore
  if (!overview || !store) return {}
  try {
    // Steam returns one URL per possible extension (.jpg and .png); the image
    // component tries them in order, like Steam's own artwork component.
    return { heroes: store.GetCustomHeroImageURLs?.(overview) ?? [], icon: store.GetIconURLForApp?.(overview) || undefined }
  } catch {
    return {}
  }
}

function openOverlay(doc: Document, appid: string, game: GameData, gameName: string, art: Artwork) {
  const m = mountAt("overlay", doc, (el) => doc.body.appendChild(el))
  m?.root.render(
    <AchievementsOverlay appid={appid} set={game.set} gameName={gameName} art={art} doc={doc} onClose={() => unmount("overlay")} />,
  )
}

function openEvent(doc: Document, list: Release[], tag: string, installed: string) {
  const m = mountAt("event", doc, (el) => doc.body.appendChild(el))
  m?.root.render(
    <EventOverlay releases={list} initialTag={tag} installed={installed} doc={doc} onClose={() => unmount("event")} />,
  )
}

// Steam's play-bar trophy glyph (sp.js #42095 "OiG", outline variant).
const TROPHY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="currentColor">' +
  '<path d="M9.64304 9.49988L6.39294 12.8055L9.64304 16.1112V20.8333H14.2858L18.0001 24.6111L21.7143 20.8333H26.3573V16.111L29.6072 12.8055L26.3573 9.50012V4.77777H21.7143L18.0001 1L14.2858 4.77777H9.64304V9.49988ZM22.6432 12.8056C22.6432 15.4136 20.5645 17.5278 18.0004 17.5278C15.4362 17.5278 13.3575 15.4136 13.3575 12.8056C13.3575 10.1976 15.4362 8.08334 18.0004 8.08334C20.5645 8.08334 22.6432 10.1976 22.6432 12.8056Z"/>' +
  '<path d="M5 30.2778L8.25 24.6111H12.4286L15.6786 27.9167L11.5 35L9.17857 30.2778H5Z"/>' +
  '<path d="M30.9999 30.2778L27.7499 24.6111H23.5713L20.3213 27.9167L24.4999 35L26.8213 30.2778H30.9999Z"/>' +
  "</svg>"

/** Steam's play-bar achievements stat (sp.js "Ft"), built with its classes:
 * div.GameStat.MiniAchievements > icon + label + "x/y" + progress bar. */
function renderStat(section: HTMLElement, set: TrophySet, onClick: () => void) {
  const doc = section.ownerDocument
  const p = css("playbar")
  let stat = doc.getElementById(STAT_ID)
  if (!stat || stat.parentElement !== section) {
    stat?.remove()
    stat = doc.createElement("div")
    stat.id = STAT_ID
    stat.setAttribute("data-bbpc", "stat")
    stat.className = cx(p.GameStat, p.MiniAchievements)
    stat.addEventListener("click", onClick)
    stat.innerHTML =
      `<div class="${cx(p.GameStatIcon, p.AchievementSVG)}">${TROPHY_SVG}</div>` +
      `<div class="${cx(p.GameStatRight, p.AchievementRight)}">` +
      `<div class="${cx(p.PlayBarLabel, p.AchievementLabel)}" data-bbpc-label></div>` +
      `<div class="${p.AchievementProgressRow ?? ""}">` +
      `<div class="${cx(p.PlayBarDetailLabel, p.AchievementCountLabel)}" data-bbpc-count></div>` +
      `<div role="progressbar" class="${p.DetailsProgressContainer ?? ""}"><div class="${p.DetailsProgressBar ?? ""}" data-bbpc-fill></div></div>` +
      `</div></div>`
    section.appendChild(stat)
  }
  const label = stat.querySelector("[data-bbpc-label]")
  const count = stat.querySelector("[data-bbpc-count]")
  const fill = stat.querySelector<HTMLElement>("[data-bbpc-fill]")
  const pct = set.total ? (100 * set.unlocked) / set.total : 0
  const setText = (el: Element | null, v: string) => { if (el && el.textContent !== v) el.textContent = v }
  setText(label, L("AppDetails_SectionTitle_Achievements"))
  setText(count, `${set.unlocked}/${set.total}`)
  const width = `${Math.min(100, pct)}%`
  if (fill && fill.style.width !== width) fill.style.width = width
  stat.querySelector('[role="progressbar"]')?.setAttribute("aria-valuenow", String(pct))
}

/** Bloodborne shortcut without data: explain why in place of the sections. */
async function showGuide(doc: Document, appid: string, fail: BackendState) {
  for (const key of ["feed", "achievements", "links"] as MountKey[]) unmount(key)
  for (const id of [STAT_ID, LAST_PLAYED_ID, PLAYTIME_ID]) doc.getElementById(id)?.remove()
  ensureStyles(doc)
  const notice = findNotice(doc)
  const columns = findColumns(doc, notice)
  if (!columns) return
  doc.documentElement.setAttribute(ACTIVE_ATTR, "1")
  notice?.setAttribute(NOTICE_ATTR, "1")
  const working = fail.reason === "missing_folder" ? await workingBloodborne() : undefined
  const guide = mountAt("guide", doc, (el) => {
    if (notice?.parentElement) notice.parentElement.insertBefore(el, notice.nextSibling)
    else columns.left.prepend(el)
  })
  const workingAppid = working?.ready ? working.appid : undefined
  renderIfChanged(guide, [appid, fail.reason, fail.path, workingAppid], () => (
    <GuideNotice appid={appid} reason={fail.reason!} path={fail.path} workingAppid={workingAppid} />
  ))
}

/** First run: tell the user how to add Bloodborne, or offer the optional
 * SteamGridDB key once it is in the library. */
async function maybeShowSetup(doc: Document, force = false) {
  const state = setupState.get()
  const shortcut = await findBloodborne(selfAccountId())
  if (!force && (state === "done" || (!shortcut.found && state === "hide-missing"))) return
  if (!force && shortcut.found && settings.key) { setupState.set("done"); return }
  openSetupDialog(shortcut, (render) => {
    const m = mountAt("setup", doc, (el) => doc.body.appendChild(el))
    m?.root.render(render(() => unmount("setup")))
  })
}

/** From the settings page: open in the document the button is in. */
function showSetupNow(from?: Document) {
  const doc = from ?? attachedDoc
  if (doc) maybeShowSetup(doc, true).catch((e) => log("setup error", e))
}

async function sync(doc: Document, appid: string | null, isCurrent: () => boolean) {
  if (!appid) return deactivate(doc)
  const overview = steam().appStore?.GetAppOverviewByAppID?.(Number(appid))
  const isShortcut = overview ? overview.app_type === SHORTCUT_APP_TYPE : Number(appid) >= 2147483648
  if (!isShortcut) return deactivate(doc)

  const game = await getGame(appid)
  if (!isCurrent()) return
  if (!game) {
    const fail = failures.get(appid)
    if (fail?.bloodborne && (fail.reason === "missing_folder" || fail.reason === "no_data")) return showGuide(doc, appid, fail)
    return deactivate(doc)
  }
  unmount("guide")
  readSteamStats(appid)

  ensureStyles(doc)
  const notice = findNotice(doc)
  const columns = findColumns(doc, notice)
  if (!columns) return // page still rendering; next tick retries

  doc.documentElement.setAttribute(ACTIVE_ATTR, "1")
  notice?.setAttribute(NOTICE_ATTR, "1")

  const gameName = overview?.display_name || game.set.title
  autoApplyArtwork(appid, gameName, log)
  const open = () => openOverlay(doc, appid, games.get(appid) ?? game, gameName, artworkFor(overview))
  const showUpdates = Boolean(game.state.engine) || /bloodborne/i.test(game.set.title)
  if (showUpdates) refreshReleases(() => sync(doc, appid, isCurrent))
  const feedReleases = showUpdates ? releases : []
  const featured = newerRelease(feedReleases, game.state.version ?? "")
  const openNews = (tag: string) => openEvent(doc, feedReleases, tag, game.state.version ?? "")

  // Left column: [notice (hidden)] → Atividade (with Destaque pinned on top)
  const feed = mountAt("feed", doc, (el) => {
    if (notice?.parentElement) notice.parentElement.insertBefore(el, notice.nextSibling)
    else columns.left.prepend(el)
  })
  renderIfChanged(feed, [appid, game.set, feedReleases, featured?.tag_name, game.state.version], () => (
    <ActivityFeed key={appid} appid={appid} set={game.set} releases={feedReleases} featured={featured}
      installed={game.state.version ?? ""} onOpenAchievements={open} onOpenEvent={openNews} />
  ))

  // Links bar above the two columns, where official games have theirs.
  const row = columns.left.parentElement
  const links = row?.parentElement ? mountAt("links", doc, (el) => row.parentElement!.insertBefore(el, row)) : null
  const latest = feedReleases[0]?.tag_name
  renderIfChanged(links, [appid, game.state.root, game.state.saves_dir, latest], () => (
    <LinksBar root={game.state.root} savesDir={game.state.saves_dir} onLatestNews={latest ? () => openNews(latest) : undefined} />
  ))

  // Right column: Conquistas at the top, like Steam's section order.
  const achievements = mountAt("achievements", doc, (el) => {
    if (columns.right) columns.right.prepend(el)
    else feed?.el.parentElement?.insertBefore(el, feed.el)
  })
  renderIfChanged(achievements, [appid, game.set], () => (
    <AchievementsSection key={appid} appid={appid} set={game.set} onOpen={open} />
  ))

  for (const section of findStatSections(doc)) {
    renderStat(section, game.set, open)
    renderPlaybarStats(section, appid, game.state, doc.getElementById(STAT_ID))
  }
}

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
  // Give the library a moment to settle before the first-run dialog.
  window.setTimeout(() => maybeShowSetup(doc).catch((e) => log("setup error", e)), 2500)
}

setSetupOpener(showSetupNow)

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
    title: <div>{isPt ? "Bloodborne · Biblioteca" : "Bloodborne · Library"}</div>,
    icon: <div>🩸</div>,
    content: <SettingsPage />,
  }
})
