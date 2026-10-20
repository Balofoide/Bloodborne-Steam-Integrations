import type { BackendState } from "./api"
import { css, cx, sel } from "./steam/classes"
import { L, locales } from "./steam/l10n"

// Statistics from the LanternEngine launcher (per player profile), so they
// survive a new Steam shortcut: Steam counts playtime per shortcut appid and
// starts a new shortcut from zero, while the launcher's count includes every
// session (Bloodborne.exe starts the game through the launcher).
//
// Shown in the play bar, which reads the app *details* (nPlaytimeForever /
// rtLastTimePlayed) and hides "ÚLTIMA SESSÃO"/"TEMPO DE JOGO" while they are
// zero — so the plugin renders those two stats itself, with Steam's markup,
// and corrects Steam's text when it is lower than the launcher's.
//
// Steam's app overview is only read, never written: writing playtime/last
// played into it every tick made the library re-sort and re-query its shelves
// ("what's new" tried to load partner events for the shortcut) and fought
// Steam's own updates — a real UI slowdown.

interface Overview { minutes_playtime_forever?: number; rt_last_time_played?: number }
interface AppStore { GetAppOverviewByAppID?(id: number): Overview | null }

// What Steam itself counted, per appid (read from the overview, never written).
const steamCount = new Map<string, { minutes: number; last: number }>()

/** Remember Steam's own playtime/last-played for the shortcut (read only). */
export function readSteamStats(appid: string) {
  const overview = (window as { appStore?: AppStore }).appStore?.GetAppOverviewByAppID?.(Number(appid))
  if (!overview) return
  steamCount.set(appid, { minutes: overview.minutes_playtime_forever ?? 0, last: overview.rt_last_time_played ?? 0 })
}

/** Steam's own playtime wording (sp.js #73530): minutes below 2 h, else hours. */
export function formatPlaytime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 120) return L("Playtime_Minutes", minutes)
  const hours = (Math.round((minutes / 60) * 10) / 10).toLocaleString(locales(), { minimumFractionDigits: 0, maximumFractionDigits: 1 })
  return L("Playtime_Hours", hours)
}

/** Steam's LocalizeRTimeToDateWithRelative with short months ("18 de out."). */
export function formatLastPlayed(unix: number): string {
  const day = new Date(unix * 1000); day.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return L("Time_Today")
  if (diff === 1) return L("Time_Yesterday")
  return day.toLocaleDateString(locales(), day.getFullYear() === today.getFullYear()
    ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" })
}

// Steam's play-time clock (sp.js #42095 "eNX").
const CLOCK_SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" class="SVGIcon_Button SVGIcon_PlayTime" x="0px" y="0px" width="256px" height="256px" viewBox="0 0 256 256">' +
  '<polyline fill="none" stroke="#000000" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" points="85.5,149.167 128,128 128,55.167 "/>' +
  '<path fill="none" stroke="#000000" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M128,17.5c61.027,0,110.5,49.473,110.5,110.5S189.027,238.5,128,238.5S17.5,189.027,17.5,128"/>' +
  '<circle stroke="#000000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" cx="26.448" cy="85.833" r="5.5"/>' +
  '<circle stroke="#000000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" cx="50.167" cy="50.5" r="5.5"/>' +
  '<circle stroke="#000000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" cx="86" cy="26.667" r="5.5"/>' +
  "</svg>"

export const LAST_PLAYED_ID = "bbpc-lastplayed"
export const PLAYTIME_ID = "bbpc-playtime"

const setText = (el: Element | null | undefined, v: string) => { if (el && el.textContent !== v) el.textContent = v }

/** The play bar's "ÚLTIMA SESSÃO" and "TEMPO DE JOGO", from the launcher's
 * numbers: Steam's own stats are corrected when lower, and stand-ins with
 * Steam's markup are added when Steam hides them (a shortcut it never ran). */
export function renderPlaybarStats(section: HTMLElement, appid: string, state: BackendState, before: Element | null) {
  const doc = section.ownerDocument
  const p = css("playbar")
  const steam = steamCount.get(appid) ?? { minutes: 0, last: 0 }
  const launcherMinutes = Math.floor((state.playtime ?? 0) / 60)
  const launcherLast = state.last_played ?? 0
  const ours = (el: Element) => Boolean(el.closest("[data-bbpc]"))
  const nativeLast = Array.from(section.querySelectorAll(sel(p.LastPlayed))).find((el) => !ours(el))
  const nativeTime = Array.from(section.querySelectorAll(sel(p.Playtime))).find((el) => !ours(el))

  // ÚLTIMA SESSÃO
  if (nativeLast) {
    doc.getElementById(LAST_PLAYED_ID)?.remove()
    if (launcherLast > steam.last) setText(nativeLast.querySelector(sel(p.PlayBarDetailLabel)), formatLastPlayed(launcherLast))
  } else if (launcherLast > 0) {
    let el = doc.getElementById(LAST_PLAYED_ID)
    if (!el || el.parentElement !== section) {
      el?.remove()
      el = doc.createElement("div")
      el.id = LAST_PLAYED_ID
      el.setAttribute("data-bbpc", "lastplayed")
      el.className = cx(p.GameStat, p.LastPlayed)
      el.innerHTML =
        `<div class="${cx(p.GameStatRight, p.LastPlayedRight)}">` +
        `<div class="${cx(p.PlayBarLabel, p.LastPlayedLabel)}" data-bbpc-label></div>` +
        `<div class="${cx(p.PlayBarDetailLabel, p.LastPlayedInfo)}" data-bbpc-value></div></div>`
      section.insertBefore(el, before)
    }
    setText(el.querySelector("[data-bbpc-label]"), L("AppDetails_SectionTitle_LastPlayed"))
    setText(el.querySelector("[data-bbpc-value]"), formatLastPlayed(launcherLast))
  }

  // TEMPO DE JOGO
  if (nativeTime) {
    doc.getElementById(PLAYTIME_ID)?.remove()
    if (launcherMinutes > steam.minutes) setText(nativeTime.querySelector(sel(p.PlayBarDetailLabel)), formatPlaytime(launcherMinutes * 60))
  } else if (launcherMinutes > 0) {
    let el = doc.getElementById(PLAYTIME_ID)
    if (!el || el.parentElement !== section) {
      el?.remove()
      el = doc.createElement("div")
      el.id = PLAYTIME_ID
      el.setAttribute("data-bbpc", "playtime")
      el.className = cx(p.GameStat, p.Playtime)
      el.innerHTML =
        `<div class="${cx(p.GameStatIcon, p.PlaytimeIcon)}">${CLOCK_SVG}</div>` +
        `<div class="${cx(p.GameStatRight, p.PlaytimeRight)}">` +
        `<div class="${cx(p.PlayBarLabel, p.PlaytimeLabel)}" data-bbpc-label></div>` +
        `<div class="${cx(p.PlayBarDetailLabel, p.PlaytimeInfo)}" data-bbpc-value></div></div>`
      section.insertBefore(el, before)
    }
    setText(el.querySelector("[data-bbpc-label]"), L("AppDetails_SectionTitle_PlayTime"))
    setText(el.querySelector("[data-bbpc-value]"), formatPlaytime(launcherMinutes * 60))
  }
}
