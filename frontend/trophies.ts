import type { BackendState } from "./api"

export type Tier = "P" | "G" | "S" | "B"

export interface Trophy {
  id: string
  name: string
  detail: string
  tier: Tier
  hidden: boolean
  /** Trophy group id ("001" = The Old Hunters), null for the base game. */
  group: string | null
  unlocked: boolean
  /** Unlock time in ms since epoch. */
  unlockedAt: number | null
  icon: string
}

export interface TrophySet {
  title: string
  groups: Record<string, string>
  trophies: Trophy[]
  unlocked: number
  total: number
  percent: number
}

function parse(xml: string): Document | null {
  if (!xml) return null
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  return doc.getElementsByTagName("parsererror").length ? null : doc
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").trim()

/** Merge the per-profile progress file (unlock state, English text) with the
 * localized TROP_XX.XML (names/descriptions only). */
export function buildTrophySet(state: BackendState): TrophySet | null {
  const progress = parse(state.progress ?? "")
  if (!progress) return null
  const localized = parse(state.localized ?? "")

  const localText = new Map<string, { name: string; detail: string }>()
  const localGroups = new Map<string, string>()
  if (localized) {
    for (const el of Array.from(localized.getElementsByTagName("trophy"))) {
      localText.set(el.getAttribute("id") ?? "", {
        name: text(el.getElementsByTagName("name")[0]),
        detail: text(el.getElementsByTagName("detail")[0]),
      })
    }
    for (const el of Array.from(localized.getElementsByTagName("group"))) {
      localGroups.set(el.getAttribute("id") ?? "", text(el.getElementsByTagName("name")[0]))
    }
  }

  const groups: Record<string, string> = {}
  for (const el of Array.from(progress.getElementsByTagName("group"))) {
    const id = el.getAttribute("id") ?? ""
    groups[id] = localGroups.get(id) || text(el.getElementsByTagName("name")[0])
  }

  const trophies: Trophy[] = Array.from(progress.getElementsByTagName("trophy")).map((el) => {
    const id = el.getAttribute("id") ?? ""
    const loc = localText.get(id)
    const ts = Number(el.getAttribute("timestamp"))
    const unlocked = el.getAttribute("unlockstate") === "true"
    return {
      id,
      name: loc?.name || text(el.getElementsByTagName("name")[0]),
      detail: loc?.detail || text(el.getElementsByTagName("detail")[0]),
      tier: (el.getAttribute("ttype") as Tier) || "B",
      hidden: el.getAttribute("hidden") === "yes",
      group: el.getAttribute("gid"),
      unlocked,
      unlockedAt: unlocked && ts > 0 ? ts * 1000 : null,
      icon: `TROP${id.padStart(3, "0")}.PNG`,
    }
  })

  const unlocked = trophies.filter((x) => x.unlocked).length
  const total = trophies.length
  return {
    title: text(progress.getElementsByTagName("title-name")[0]),
    groups,
    trophies,
    unlocked,
    total,
    percent: total ? Math.floor((unlocked / total) * 100) : 0,
  }
}

/** Unlocked first (newest first), then locked in set order — Steam's ordering. */
export function sortForDisplay(list: Trophy[]): Trophy[] {
  const done = list.filter((x) => x.unlocked).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
  const todo = list.filter((x) => !x.unlocked)
  return [...done, ...todo]
}
