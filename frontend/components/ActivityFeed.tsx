import React from "react"
import { openExternal, type Release } from "../api"
import { formatDay, t } from "../i18n"
import type { Trophy, TrophySet } from "../trophies"
import { TrophyIcon } from "./TrophyIcon"

const MAX_ENTRIES = 10
const MAX_RELEASES = 3
const REPO_RELEASES = "https://github.com/Awakenchan/BloodBorneButPc/releases"

interface Props {
  appid: string
  set: TrophySet
  releases: Release[]
  installedVersion: string
  showUpdates: boolean
  onOpenAchievements: () => void
}

type Entry =
  | { kind: "release"; at: number; release: Release }
  | { kind: "unlock"; at: number; trophy: Trophy }

/** Left-column feed that takes the place of the dashed non-Steam notice:
 * project releases (patch notes) interleaved with local trophy unlocks. */
export function ActivityFeed({ appid, set, releases, installedVersion, showUpdates, onOpenAchievements }: Props) {
  const entries: Entry[] = [
    ...(showUpdates ? releases.slice(0, MAX_RELEASES).map((r) => ({ kind: "release" as const, at: Date.parse(r.published_at), release: r })) : []),
    ...set.trophies
      .filter((x) => x.unlockedAt)
      .map((x) => ({ kind: "unlock" as const, at: x.unlockedAt as number, trophy: x })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_ENTRIES)

  // Group consecutive entries by calendar day, like Steam's activity feed.
  const days: Array<{ label: string; items: Entry[] }> = []
  for (const e of entries) {
    const label = formatDay(e.at)
    if (days[days.length - 1]?.label === label) days[days.length - 1].items.push(e)
    else days.push({ label, items: [e] })
  }

  return (
    <div className="bbpc-section" data-bbpc>
      <div className="bbpc-section__header">
        {showUpdates ? `${t.activity} · ${t.updates}` : t.activity}
        {showUpdates && <small className="bbpc-link" onClick={() => openExternal(REPO_RELEASES)}>{t.viewOnGithub}</small>}
      </div>

      {showUpdates && <UpdateBanner releases={releases} installed={installedVersion} />}

      {days.length === 0 && <div className="bbpc-empty">{t.noActivity}</div>}
      {days.map((day) => (
        <div key={day.label}>
          <div className="bbpc-day">{day.label}</div>
          {day.items.map((e) =>
            e.kind === "release"
              ? <ReleaseCard key={`r${e.release.tag_name}`} release={e.release} />
              : <UnlockRow key={`u${e.trophy.id}`} appid={appid} trophy={e.trophy} onClick={onOpenAchievements} />,
          )}
        </div>
      ))}
    </div>
  )
}

function ReleaseCard({ release }: { release: Release }) {
  return (
    <div className="bbpc-panel bbpc-card" onClick={() => openExternal(release.html_url)}>
      <div className="bbpc-card__body">
        <div className={`bbpc-card__kind${release.prerelease ? " bbpc-card__kind--beta" : ""}`}>
          {release.prerelease ? t.prerelease : t.patchNotes}
        </div>
        <div className="bbpc-card__title">{release.name || release.tag_name}</div>
        <div className="bbpc-card__text">{plainText(release.body ?? "")}</div>
        <div className="bbpc-card__more">{t.readMore} ›</div>
      </div>
    </div>
  )
}

function UnlockRow({ appid, trophy, onClick }: { appid: string; trophy: Trophy; onClick: () => void }) {
  return (
    <div className="bbpc-panel bbpc-unlock" onClick={onClick}>
      <TrophyIcon appid={appid} trophy={trophy} tooltip={false} />
      <div>
        <div className="bbpc-unlock__kind">{t.achievementUnlocked} · {t.tiers[trophy.tier]}</div>
        <div className="bbpc-unlock__name">{trophy.name}</div>
        <div className="bbpc-unlock__detail">{trophy.detail}</div>
      </div>
    </div>
  )
}

function UpdateBanner({ releases, installed }: { releases: Release[]; installed: string }) {
  if (!installed || releases.length === 0) return null
  const stable = releases.find((r) => !r.prerelease)
  const newest = releases[0]
  const target = stable && compareVersions(stable.tag_name, installed) > 0 ? stable
    : compareVersions(newest.tag_name, installed) > 0 ? newest : null

  if (!target) {
    return (
      <div className="bbpc-banner bbpc-banner--ok">
        {t.upToDate}
        <span>{t.installed(installed)}</span>
      </div>
    )
  }
  return (
    <div className="bbpc-banner" style={{ cursor: "pointer" }} onClick={() => openExternal(target.html_url)}>
      {target.prerelease ? t.betaAvailable(target.tag_name) : t.updateAvailable(target.tag_name)}
      <span>{t.installed(installed)}</span>
    </div>
  )
}

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

function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "• ")
    .replace(/\s*\n+\s*/g, "  ")
    .trim()
}
