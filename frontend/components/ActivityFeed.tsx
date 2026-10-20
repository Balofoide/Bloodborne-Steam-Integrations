import React from "react"
import type { Release } from "../api"
import { formatDay, t } from "../i18n"
import { css, cx } from "../steam/classes"
import { L } from "../steam/l10n"
import { selfPersona } from "../steam/persona"
import type { Trophy, TrophySet } from "../trophies"
import { summaryOf } from "../markdown"
import { AchievementTile, Remainder } from "./Achievement"
import { Section } from "./Section"

// Mirror of Steam's library activity feed (sp.js #53128 "Ia"/"Ys"): day
// blocks, "<Name> conquistou" achievement events and partner-event cards.
// GitHub releases of the project are shown as Steam shows patch notes.

const MAX_DAYS = 8
const MAX_RELEASES = 3
const MAX_TILES = 7

type FeedEvent =
  | { kind: "release"; at: number; release: Release }
  | { kind: "unlocks"; at: number; trophies: Trophy[] }

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

function buildDays(set: TrophySet, releases: Release[], skipTag?: string) {
  const events: FeedEvent[] = releases
    .filter((r) => r.tag_name !== skipTag)
    .slice(0, MAX_RELEASES)
    .map((r) => ({ kind: "release" as const, at: Date.parse(r.published_at), release: r }))

  // One achievement event per day, like Steam groups a play session's unlocks.
  const byDay = new Map<string, Trophy[]>()
  for (const tr of set.trophies) {
    if (!tr.unlockedAt) continue
    const k = dayKey(tr.unlockedAt)
    byDay.set(k, [...(byDay.get(k) ?? []), tr])
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
    events.push({ kind: "unlocks", at: list[0].unlockedAt as number, trophies: list })
  }

  events.sort((a, b) => b.at - a.at)
  const days: Array<{ key: string; label: string; events: FeedEvent[] }> = []
  for (const e of events) {
    const k = dayKey(e.at)
    const last = days[days.length - 1]
    if (last?.key === k) last.events.push(e)
    else days.push({ key: k, label: formatDay(e.at), events: [e] })
  }
  return days.slice(0, MAX_DAYS)
}

const PATCH_ICON = (
  <svg className="SVGIcon_Button SVGIcon_Patch" width="256px" height="256px" viewBox="0 0 256 256" fill="currentColor">
    <path d="M171.176,136.219c-5.516-5.516-14.166-5.948-20.223-1.406L92.125,75.984l-8.002-29.738c-0.324-1.406-1.73-3.027-3.028-3.785 L46.49,24.186c-1.298-0.648-3.136-0.433-4.218,0.648L25.295,41.813c-0.974,0.973-1.298,2.92-0.649,4.217l18.276,34.605 c0.648,1.297,2.379,2.596,3.785,3.027l29.739,8.003l58.828,58.828c-4.542,6.056-4.109,14.707,1.405,20.222l56.882,56.882 c6.056,6.056,15.896,6.056,21.845,0l12.544-12.544c6.056-6.056,6.056-15.788,0-21.845L171.176,136.219z" />
    <path d="M153.116,122.16c2.271-0.648,4.65-0.973,7.138-0.973c0.865,0,1.622,0,2.486,0.107l26.928-26.927 c12.328,2.92,25.846-0.324,35.361-9.948c9.517-9.625,12.869-23.034,9.949-35.254l-20.33,20.33l-21.845-5.84l-5.84-21.952 l20.331-20.33c-12.221-2.92-25.738,0.324-35.254,9.948c-9.625,9.625-12.869,23.143-9.949,35.362L129.866,98.91L153.116,122.16z" />
    <path d="M99.371,129.406l-32.226,32.226c-12.328-2.92-25.845,0.324-35.362,9.948c-9.517,9.625-12.869,23.034-9.949,35.254 l20.331-20.33l21.953,5.84l5.839,21.952l-20.331,20.33c12.22,2.92,25.737-0.324,35.254-9.949 c9.625-9.624,12.869-23.142,9.949-35.361l27.035-27.035c-0.325-3.136,0-6.38,0.865-9.517L99.371,129.406z" />
  </svg>
)

// Steam clamps event summaries (it measures; three lines is its usual result).
const CLAMP: React.CSSProperties = {
  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis",
}

export function releaseLabel(r: Release) {
  return r.prerelease ? L("PartnerEvent_29") : L("PartnerEvent_13")
}

function PartnerEventCard({ release, featured, summary, onOpen }: {
  release: Release; featured?: boolean; summary?: string; onOpen: (tag: string) => void
}) {
  const f = css("feed")
  const text = summary ?? summaryOf(release.body ?? "")
  return (
    // The outer .Event must be a direct child of the day block: Steam spaces
    // events with `.Event { margin-top: 14px }` and `.Event:first-child { margin-top: 0 }`.
    <div className={cx("Panel", f.Event)}>
      <div className="Panel">
        <div
          className={cx(f.PartnerEventTextOnly, f.PartnerEvent, f.Event, featured && f.PartnerEventFeatured)}
          onClick={() => onOpen(release.tag_name)}
          style={{ cursor: "pointer" }}
        >
          {featured && <div className={f.PartnerEventFeaturedHeader}>{L("AppActivity_FeaturedEvent")}</div>}
          <div className={cx("Panel", f.PartnerEventTextOnly_Container)}>
            <div className={f.PartnerEventTextOnly_Icon} style={{ flexShrink: 0 }}>{PATCH_ICON}</div>
            <div className={f.PartnerEventTextOnly_TextColumn}>
              <div className={f.PartnerEventType}><div>{releaseLabel(release)}</div></div>
              <div className={f.PartnerEventTextOnly_Title}>{release.name || release.tag_name}</div>
              {text && (
                <div className={f.PartnerEventTextOnly_LimitedSummary}>
                  <span className={f.PartnerEventTextOnly_Summary} style={CLAMP}>{text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Headline() {
  const f = css("feed"), av = css("avatar")
  const me = selfPersona()
  return (
    <div className={cx("Panel", f.EventHeadline)}>
      <div className={cx("Panel", f.EventActorAvatar)} role="presentation" style={{ width: "fit-content" }}>
        <div className={cx(av.avatarHolder, "avatarHolder", "no-drag", "Small", "online")}>
          <div className={cx(av.avatarStatus, "avatarStatus", "right")} />
          {me.avatar && <img className={cx(av.avatar, "avatar")} src={me.avatar} draggable={false} alt="" />}
        </div>
      </div>
      <span className={f.SpanEvent}>
        <span className={cx(f.ActorName, "online")}>
          <span className="playerName" style={{ color: "#6dcff6" }}>{me.name || t.you}</span>
        </span>
        <span>{L("AppActivity_Achieved")}</span>
      </span>
    </div>
  )
}

function UnlockEvent({ appid, trophies, onOpen }: { appid: string; trophies: Trophy[]; onOpen: () => void }) {
  const f = css("feed")
  const n = trophies.length
  const columns = n <= 2 ? "repeat(auto-fit, [col-start] minmax( 49%, 260px ) [col-end])"
    : n === 3 ? "repeat(auto-fit, [col-start] minmax( 32%, 260px ) [col-end])" : undefined
  const shown = n > MAX_TILES + 1 ? trophies.slice(0, MAX_TILES) : trophies.slice(0, MAX_TILES + 1)
  const rest = n - shown.length
  const name = selfPersona().name || t.you
  return (
    <div className={cx("Panel", f.Event, f.NoCommentSupport)}>
      <Headline />
      <div className={f.EventBody}>
        <div className={cx("Panel", f.ActivityAchievementUnlocked)} style={columns ? { gridTemplateColumns: columns } : undefined}>
          {shown.map((tr) => (
            <div role="listitem" style={{ display: "contents" }} key={tr.id}>
              <AchievementTile appid={appid} trophy={tr} featured className={f.PrimaryAchievement} onClick={onOpen} />
            </div>
          ))}
          {rest > 0 && (
            <div role="listitem" style={{ display: "contents" }}>
              <Remainder
                appid={appid}
                count={rest}
                next={trophies[shown.length]}
                className={f.RemainderContainer}
                label={{ name: L("AppActivity_Achieved_PlusMore", rest), desc: L("AppActivity_Achieved_PlusMore_Label", name) }}
                onClick={onOpen}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** "Destaque": the newest release when it is newer than the installed build,
 * pinned at the top of "Atividade" (inside the section, not above it). */
function FeaturedRelease({ release, installed, onOpenEvent }: {
  release: Release; installed: string; onOpenEvent: (tag: string) => void
}) {
  const summary = [installed ? t.installed(installed) : "", summaryOf(release.body ?? "")].filter(Boolean).join("  ·  ")
  return (
    <div style={{ marginBottom: 18 }}>
      <PartnerEventCard release={release} featured summary={summary} onOpen={onOpenEvent} />
    </div>
  )
}

export function ActivityFeed({ appid, set, releases, featured, installed, onOpenAchievements, onOpenEvent }: {
  appid: string; set: TrophySet; releases: Release[]; featured?: Release | null; installed: string
  onOpenAchievements: () => void; onOpenEvent: (tag: string) => void
}) {
  const f = css("feed"), fr = css("feedRoot"), r = css("reset")
  const days = buildDays(set, releases, featured?.tag_name)
  return (
    <Section label={L("AppDetails_SectionTitle_Activity")} className={fr.ActivityFeedContainer} bodyClassName={fr.InnerContainer}>
      {featured && <FeaturedRelease release={featured} installed={installed} onOpenEvent={onOpenEvent} />}
      {days.length === 0 ? (
        <div className={cx("Panel", fr.NoActivity)}><div>{t.noActivity}</div></div>
      ) : (
        <div className="Panel">
          {days.map((day) => (
            <div className={f.AppActivityDay} role="region" key={day.key}>
              <h4 className={cx(r.Reset, f.AppActivityDate)}>
                {day.label}
                <div className={f.Rule} />
              </h4>
              <div>
                {day.events.map((e) =>
                  e.kind === "release"
                    ? <PartnerEventCard key={`r${e.release.tag_name}`} release={e.release} onOpen={onOpenEvent} />
                    : <UnlockEvent key={`u${e.at}`} appid={appid} trophies={e.trophies} onOpen={onOpenAchievements} />,
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
