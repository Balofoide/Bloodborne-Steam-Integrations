import React from "react"
import { css, cx } from "../steam/classes"
import { L } from "../steam/l10n"
import type { TrophySet } from "../trophies"
import { AchievementTile, IconRow } from "./Achievement"
import { Highlight, Section } from "./Section"

// Mirror of Steam's desktop right-column achievements section (sp.js #59894
// class "ae"): progress highlight, the newest unlock as a featured tile, the
// rest of the unlocks and the locked ones as single-row icon lists.

export function ProgressHighlight({ set }: { set: TrophySet }) {
  const a = css("ach")
  const pct = set.total ? Math.floor((set.unlocked * 100) / set.total) : 0
  const all = pct === 100
  return (
    <Highlight className={cx(a.HighlightDiv, all && a.AllAchieved)}>
      <div className={a.UnlockedLabel}>
        <span> {all ? L("AppDetails_PlayerUnlockedPercentAll", set.unlocked, set.total) : L("AppDetails_PlayerUnlockedPercent", set.unlocked, set.total)}</span>
        <span className={a.UnlockedLabelPercent}>{` (${pct}%)`}</span>
      </div>
      <div className={a.AchievementProgressContainer}>
        <div className={a.AchievementProgress} style={{ width: `${pct}%` }} />
      </div>
      <div className={a.GlobalStatLabel} />
    </Highlight>
  )
}

export function AchievementsSection({ appid, set, onOpen }: { appid: string; set: TrophySet; onOpen: () => void }) {
  const a = css("ach")
  // vecHighlight: unlocked, newest first. vecUnachieved: locked, in set order.
  const highlight = set.trophies.filter((x) => x.unlocked).sort((x, y) => (y.unlockedAt ?? 0) - (x.unlockedAt ?? 0))
  const unachieved = set.trophies.filter((x) => !x.unlocked)
  const first = highlight[0]

  return (
    <Section
      label={L("AppDetails_SectionTitle_Achievements")}
      rightColumn
      highlight={<ProgressHighlight set={set} />}
      action={{ label: L("AppDetails_ViewAllAchievements"), onClick: onOpen }}
    >
      {first && <AchievementTile appid={appid} trophy={first} featured className={a.RightAchievementSection} onClick={onOpen} />}
      {highlight.length === 2 && (
        <AchievementTile appid={appid} trophy={highlight[1]} featured className={a.RightAchievementSection} onClick={onOpen} />
      )}
      {highlight.length > 2 && (
        <IconRow appid={appid} items={highlight.slice(1)} total={set.unlocked - 1} className={a.Additional} onClick={onOpen} />
      )}
      {unachieved.length > 0 && (
        <div className={cx(a.UnachievedSection, highlight.length > 0 && a.ShowDivider)}>
          <div className={a.Label}>{L("AppDetails_Achievements_Locked")}</div>
          <IconRow appid={appid} items={unachieved} total={set.total - set.unlocked} className={cx(a.Additional, a.UnachievedList)} onClick={onOpen} />
        </div>
      )}
    </Section>
  )
}
