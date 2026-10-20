import type { Release } from "./api"

/** "v0.9.34-beta.3" vs "0.9.33": numeric parts first, then stable > pre-release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ""] = v.replace(/^v/i, "").split("-", 2)
    return { nums: core.split(".").map((n) => parseInt(n, 10) || 0), pre }
  }
  const x = parse(a), y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

/** The release worth featuring: a newer stable build first, else a newer beta. */
export function newerRelease(releases: Release[], installed: string): Release | null {
  if (!installed) return null
  const stable = releases.find((r) => !r.prerelease)
  if (stable && compareVersions(stable.tag_name, installed) > 0) return stable
  const newest = releases[0]
  return newest && compareVersions(newest.tag_name, installed) > 0 ? newest : null
}
