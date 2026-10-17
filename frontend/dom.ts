import { findClassModule } from "@steambrew/client"

// Steam's CSS-module class names are hashed and change between client updates.
// Resolve them from Steam's own webpack modules first; the hashes below are
// the fallbacks known for the October 2026 desktop client.

type ClassMap = Record<string, string>

function resolve(predicate: (m: ClassMap) => boolean, fallback: ClassMap): ClassMap {
  try {
    const mod = findClassModule((m: ClassMap) => Boolean(predicate(m))) as ClassMap | undefined
    if (mod) return { ...fallback, ...mod }
  } catch {}
  return fallback
}

/** "a b" → ".a.b" (empty when the class is unknown). */
export function sel(value: string | undefined): string {
  const tokens = String(value ?? "").split(/\s+/).filter(Boolean)
  return tokens.length && tokens.every((x) => /^[-_a-zA-Z0-9]+$/.test(x)) ? tokens.map((x) => `.${x}`).join("") : ""
}

let cache: { notice: string[]; columns: ClassMap; playbar: ClassMap } | null = null

function classes() {
  if (cache) return cache
  const gameInfo = resolve(
    (m) => Boolean(m.Shortcut && m.Container && m.GameDescription && m.FeaturesList && m.AssociationList),
    { Container: "_2jPMy2QZr8bWi6yrk5ZzHA", Shortcut: "_2K2bYzcKrhqLqDp0Jy6Ksz" },
  )
  const offline = resolve(
    (m) => Boolean(m.Body && m.OfflineButton && m.InnerContainer && !m.Container && !m.OfflineSectionBody),
    { Body: "_1TGl52GwsFQg3CXUYvThP-" },
  )
  const columns = resolve(
    (m) => Boolean(m.ColumnContainer && m.LeftColumn && m.RightColumn && m.SeekTarget),
    { ColumnContainer: "OhSdLYuggDtBcWjYP0j_9", LeftColumn: "_1sZgBDTw5NH-yuVDZK1SUU", RightColumn: "_2aor4XVOYzN1PBSREk0UbO" },
  )
  const playbar = resolve(
    (m) => Boolean(m.PlayBarDetailLabel && m.GameStatsSection && m.PlayBarCloudStatusContainer && m.AppButtonsContainer && m.InPage),
    {
      GameStatsSection: "_1mDAVT4sTzFRwJtlKCw2Ws",
      GameStat: "_1kiZKVbDe-9Ikootk57kpA",
      PlayBarLabel: "_34lrt5-Fc3usZU6trA1P0-",
      PlayBarDetailLabel: "_2TYVGoD27ZMfjRirKQNLfk",
    },
  )
  const notice = [
    sel(gameInfo.Container) && sel(gameInfo.Shortcut) ? `${sel(gameInfo.Container)} > ${sel(gameInfo.Shortcut)}` : "",
    sel(offline.Body),
  ].filter(Boolean)
  // Only cache once the live modules were found; otherwise retry next time.
  const live = columns.SeekTarget !== undefined
  const result = { notice, columns, playbar }
  if (live) cache = result
  return result
}

const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0

const NOTICE_TEXT = /não.?steam|non.?steam|no.?steam|nicht.?steam|non.?steam/i

/** The dashed "some information is unavailable for non-Steam games" box. */
export function findNotice(doc: Document): HTMLElement | null {
  for (const s of classes().notice) {
    const hit = Array.from(doc.querySelectorAll<HTMLElement>(s)).find(
      (el) => visible(el) && !el.closest("[data-bbpc]"),
    )
    if (hit) return hit
  }
  // Text fallback: the smallest visible element with a dashed border whose
  // text mentions non-Steam games.
  const left = sel(classes().columns.LeftColumn)
  const scope = left ? Array.from(doc.querySelectorAll<HTMLElement>(left)).find(visible) : null
  if (!scope) return null
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>("div")).filter((el) => {
    if (!NOTICE_TEXT.test(el.textContent ?? "") || el.closest("[data-bbpc]")) return false
    const style = el.ownerDocument.defaultView?.getComputedStyle(el)
    return style?.borderTopStyle === "dashed"
  })
  return candidates.pop() ?? null
}

export interface Columns {
  left: HTMLElement
  right: HTMLElement | null
}

export function findColumns(doc: Document, notice: HTMLElement | null): Columns | null {
  const c = classes().columns
  const leftSel = sel(c.LeftColumn)
  const rightSel = sel(c.RightColumn)
  let left = notice && leftSel ? (notice.closest(leftSel) as HTMLElement | null) : null
  if (!left && leftSel) left = Array.from(doc.querySelectorAll<HTMLElement>(leftSel)).find(visible) ?? null
  if (!left) return null
  const row = left.parentElement
  const right = row && rightSel
    ? (Array.from(row.children).find((el) => el.matches(rightSel)) as HTMLElement | undefined) ?? null
    : null
  return { left, right }
}

export interface StatRow {
  section: HTMLElement
  /** A native stat (e.g. "TEMPO DE JOGO") used as a template for ours. */
  template: HTMLElement | null
  classes: ClassMap
}

export function findStatRows(doc: Document): StatRow[] {
  const p = classes().playbar
  const sectionSel = sel(p.GameStatsSection)
  if (!sectionSel) return []
  return Array.from(doc.querySelectorAll<HTMLElement>(sectionSel))
    .filter(visible)
    .map((section) => {
      const stats = Array.from(section.querySelectorAll<HTMLElement>(sel(p.GameStat) || ":scope > div"))
        .filter((el) => !el.closest("[data-bbpc]") && el.querySelector(sel(p.PlayBarDetailLabel) || "div div"))
      return { section, template: stats[stats.length - 1] ?? null, classes: p }
    })
}
