import { findClassModule } from "@steambrew/client"
import { MODULES, type ModuleName } from "./modules.generated"

// Steam renders the library with hashed CSS-module classes. Using the same
// classes on our elements makes Steam's own stylesheet style them, so the
// injected sections look exactly like the native ones and follow Steam's theme.
//
// Each module is looked up live by a set of distinctive keys; the hashes from
// the build we analysed are the fallback if the lookup fails.

type ClassMap = Record<string, string>

// Extra checks for modules whose keys alone are ambiguous.
const EXTRA: Partial<Record<ModuleName, (m: ClassMap) => boolean>> = {
  reset: (m) => Object.keys(m).length <= 3,
  achList: (m) => !("MyAchievementsHeader" in m),
  // The base gamepad-dialog module (#2053); theme variants carry 140+ keys.
  field: (m) => Object.keys(m).length < 100,
}

const resolved = new Map<ModuleName, ClassMap>()
// A miss is remembered for a while: every lookup scans all of Steam's webpack
// modules, and css() runs dozens of times per render.
const misses = new Map<ModuleName, { map: ClassMap; at: number }>()
const MISS_RETRY_MS = 30000

export function css(name: ModuleName): ClassMap {
  const hit = resolved.get(name)
  if (hit) return hit
  const miss = misses.get(name)
  if (miss && Date.now() - miss.at < MISS_RETRY_MS) return miss.map
  const { keys, fallback } = MODULES[name]
  let live: ClassMap | undefined
  try {
    live = findClassModule((m: ClassMap) =>
      Boolean(m) && keys.every((k) => k in m) && (EXTRA[name]?.(m) ?? true),
    ) as ClassMap | undefined
  } catch {}
  const map = { ...(fallback as ClassMap), ...(live ?? {}) }
  if (live) {
    resolved.set(name, map)
    misses.delete(name)
  } else {
    misses.set(name, { map, at: Date.now() })
  }
  return map
}

/** Join class names, skipping falsy entries (like Steam's own helper). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

/** "a b" → ".a.b" for querySelector. */
export function sel(value: string | undefined): string {
  const tokens = String(value ?? "").split(/\s+/).filter(Boolean)
  return tokens.length && tokens.every((x) => /^[-_a-zA-Z0-9]+$/.test(x)) ? tokens.map((x) => `.${x}`).join("") : ""
}
