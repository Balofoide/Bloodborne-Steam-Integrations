import { findClassModule } from "@steambrew/client"
import { css, sel } from "./steam/classes"

// Locating the pieces of Steam's library page we attach to.

type ClassMap = Record<string, string>

function resolve(predicate: (m: ClassMap) => boolean, fallback: ClassMap): ClassMap {
  try {
    const mod = findClassModule((m: ClassMap) => Boolean(m) && predicate(m)) as ClassMap | undefined
    if (mod) return { ...fallback, ...mod }
  } catch {}
  return fallback
}

/** Selectors for the dashed "unavailable for non-Steam games" notices.
 * Resolved once: each lookup scans every Steam webpack module. */
let noticeSelectorCache: string[] | null = null
function noticeSelectors(): string[] {
  if (noticeSelectorCache) return noticeSelectorCache
  const gameInfo = resolve(
    (m) => Boolean(m.Shortcut && m.Container && m.GameDescription && m.FeaturesList && m.AssociationList),
    { Container: "_2jPMy2QZr8bWi6yrk5ZzHA", Shortcut: "_2K2bYzcKrhqLqDp0Jy6Ksz" },
  )
  const offline = resolve(
    (m) => Boolean(m.Body && m.OfflineButton && m.InnerContainer && !m.Container && !m.OfflineSectionBody),
    { Body: "_1TGl52GwsFQg3CXUYvThP-" },
  )
  noticeSelectorCache = [
    sel(gameInfo.Container) && sel(gameInfo.Shortcut) ? `${sel(gameInfo.Container)} > ${sel(gameInfo.Shortcut)}` : "",
    sel(offline.Body),
  ].filter(Boolean)
  return noticeSelectorCache
}

const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0
const ours = (el: Element) => Boolean(el.closest("[data-bbpc]"))
const NOTICE_TEXT = /não.?steam|non.?steam|no.?steam|nicht.?steam/i

let lastFallbackScan = 0

export function findNotice(doc: Document): HTMLElement | null {
  // Once found, the notice is marked and hidden by the plugin — reuse it
  // instead of searching again (a hidden notice no longer matches "visible").
  const marked = doc.querySelector<HTMLElement>("[data-bbpc-notice]")
  if (marked?.isConnected) return marked

  for (const s of noticeSelectors()) {
    const hit = Array.from(doc.querySelectorAll<HTMLElement>(s)).find((el) => visible(el) && !ours(el))
    if (hit) return hit
  }

  // Fallback for renamed classes: a dashed box near the top of the left
  // column that mentions non-Steam games. Shallow and throttled — reading
  // textContent/computed style of every div each tick was a real CPU cost.
  const now = Date.now()
  if (now - lastFallbackScan < 5000) return null
  lastFallbackScan = now
  const left = sel(css("layout").LeftColumn)
  const scope = left ? Array.from(doc.querySelectorAll<HTMLElement>(left)).find(visible) : null
  if (!scope) return null
  const view = scope.ownerDocument.defaultView
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>(":scope > div, :scope > div > div, :scope > div > div > div"))) {
    if (ours(el) || view?.getComputedStyle(el).borderTopStyle !== "dashed") continue
    if (NOTICE_TEXT.test(el.textContent ?? "")) return el
  }
  return null
}

export interface Columns {
  left: HTMLElement
  right: HTMLElement | null
}

export function findColumns(doc: Document, notice: HTMLElement | null): Columns | null {
  const c = css("layout")
  const leftSel = sel(c.LeftColumn), rightSel = sel(c.RightColumn)
  let left = notice && leftSel ? (notice.closest(leftSel) as HTMLElement | null) : null
  if (!left && leftSel) left = Array.from(doc.querySelectorAll<HTMLElement>(leftSel)).find(visible) ?? null
  if (!left) return null
  const row = left.parentElement
  const right = row && rightSel
    ? (Array.from(row.children).find((el) => el.matches(rightSel)) as HTMLElement | undefined) ?? null
    : null
  return { left, right }
}

/** The play bar's stat rows (ÚLTIMA SESSÃO / TEMPO DE JOGO …). */
export function findStatSections(doc: Document): HTMLElement[] {
  const s = sel(css("playbar").GameStatsSection)
  return s ? Array.from(doc.querySelectorAll<HTMLElement>(s)).filter((el) => visible(el) && !ours(el)) : []
}
