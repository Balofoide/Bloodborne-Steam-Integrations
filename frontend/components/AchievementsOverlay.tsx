import React, { useEffect, useMemo, useState } from "react"
import { formatDate, t } from "../i18n"
import { css, cx } from "../steam/classes"
import { L, Lp } from "../steam/l10n"
import type { Trophy, TrophySet } from "../trophies"
import { AchievementIcon, isRare } from "./Achievement"

// Mirror of Steam's "Ver as minhas conquistas" page (sp.js #83326 "re"/"V"/"pe",
// header #24124, tabs #10272, list rows #36000) inside the library overlay
// (AchievementsOverlayContainer > AchievementsPageContainer + CloseButton).

export interface Artwork {
  /** Candidate URLs for the custom hero (Steam lists one per extension). */
  heroes?: string[]
  icon?: string
}

/** <img> that falls through a list of sources until one loads. */
function FallbackImg({ sources, className }: { sources: string[]; className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [sources.join("|")])
  if (i >= sources.length) return null
  return <img className={className} src={sources[i]} alt="" onError={() => setI(i + 1)} />
}

interface Props {
  appid: string
  set: TrophySet
  gameName: string
  art: Artwork
  doc: Document
  onClose: () => void
}


/** Steam's progress bar (#50158 "z2"). */
function ProgressBar({ pct }: { pct: number }) {
  const p = css("progress")
  return (
    <div role="progressbar" aria-valuenow={pct} className={p.ProgressBar}>
      <div className={p.Percent} style={{ width: `${pct}%`, transition: "1s ease", background: "var(--gpColor-Blue, #1a9fff)" }} />
    </div>
  )
}

/** Header (#24124 "c$"): game icon + name and the earned-achievements stat. */
function Header({ set, gameName, art }: { set: TrophySet; gameName: string; art: Artwork }) {
  const h = css("achHeader")
  const all = set.total > 0 && set.unlocked >= set.total
  let pct = set.total ? Math.round((set.unlocked / set.total) * 100) : 0
  let pctLabel = `(${pct}%)`
  if (pct === 0 && set.unlocked > 0) pctLabel = "(<1%)"
  else if (pct === 100 && !all) { pctLabel = "(>99%)"; pct = 99 }
  const label = all
    ? L("AppDetails_PlayerUnlockedPercentAll", set.unlocked, set.total)
    : L("Achievements_HeaderStats_Earned_Label", set.unlocked, set.total)
  return (
    <div className={h.Container}>
      <div className={h.Content}>
        <div className={h.Title}>
          {art.icon && <img className={h.GameIcon} src={art.icon} alt="" />}
          {gameName || set.title}
        </div>
        <div className="Panel">
          <div className={h.StatsBlock}>
            <div className={cx(h.Stat, h.BigStat)}>
              <div className={h.StatLabelAndValue}>
                <div className={h.ProgressLabel}>
                  <div className={h.Label}>{label}</div>
                  <div className={h.Label}>{pctLabel}</div>
                </div>
                <div className={h.Progress}><ProgressBar pct={pct} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** List row (#36000 "z" → "D"): icon, title + description, unlock date. */
function Row({ appid, trophy }: { appid: string; trophy: Trophy }) {
  const l = css("achList")
  return (
    <div className={cx("Panel", l.AchievementListItemBase)}>
      <div className={l.Container}>
        <div><AchievementIcon appid={appid} trophy={trophy} hidden={false} /></div>
        <div className={l.Content}>
          <div className={cx(l.VerticalContent, l.AchievementContent)}>
            <div className={l.AchievementTitle}>{trophy.name}</div>
            <div className={l.AchievementDescription}>{trophy.detail}</div>
          </div>
        </div>
        <div className={l.Right}>
          <div className={cx(l.VerticalContent, l.AlignEnd)}>
            {trophy.unlockedAt && (
              <div className={l.UnlockDate}>{L("Achievements_ListItem_UnlockDateTime", formatDate(trophy.unlockedAt))}</div>
            )}
            <div className={cx(l.AchievementGlobalPercentage)} style={isRare(trophy) ? { color: "#e4a74a" } : undefined}>
              {t.tiers[trophy.tier]}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** "N conquistas ocultas restantes" row (#36000 "Q"). */
function HiddenRow({ count }: { count: number }) {
  const l = css("achList"), i = css("achIcon")
  return (
    <div className={cx("Panel", l.AchievementListItemBase)}>
      <div className={l.Container}>
        <div><div className={i.HiddenLabel}>?</div></div>
        <div className={l.Content}>
          <div className={cx(l.VerticalContent, l.HiddenAchievementContent)}>
            <div className={l.AchievementTitle}>{Lp("Achievements_HiddenAchievementItem_Title", count)}</div>
            <div className={l.AchievementDescription}>{L("Achievements_HiddenAchievementItem_Description")}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AchievementsOverlay({ appid, set, gameName, art, doc, onClose }: Props) {
  const lib = css("library"), page = css("achPage"), l = css("achList"), h = css("achHeader"), tb = css("tabs")
  const [filter, setFilter] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    doc.addEventListener("keydown", onKey)
    return () => doc.removeEventListener("keydown", onKey)
  }, [doc, onClose])

  const match = (x: Trophy) => !filter || `${x.name} ${x.detail}`.toLowerCase().includes(filter)
  const achieved = useMemo(() => set.trophies.filter((x) => x.unlocked).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)), [set])
  const unachieved = useMemo(() => set.trophies.filter((x) => !x.unlocked && !x.hidden), [set])
  const hidden = set.trophies.filter((x) => !x.unlocked && x.hidden).length
  const perfect = set.total > 0 && set.unlocked >= set.total

  // Only "Minhas conquistas": there are no worldwide unlock rates for these
  // trophies, so Steam's "Conquistas globais" tab would have nothing to show.
  const tabs = [{ id: "achievements", title: L("Achievements_Tab_MyAchievements") }]

  return (
    <div
      className={lib.AchievementsOverlayContainer}
      style={{ position: "fixed", zIndex: 1000, background: "rgba(0, 0, 0, 0.6)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-bbpc="overlay"
    >
      <div className={lib.AchievementsPageContainer} style={{ marginBottom: 32, minHeight: 0 }}>
        <div style={{ overflow: "hidden" }}>
          <div className={cx("Panel", page.Page)} style={{ height: "100%", overflowY: "auto", position: "relative" }}>
            {/* Background (#83326 "Ge"): the game's hero art, blurred. */}
            <div className={page.Background}>
              <div className={page.Blur} />
              {art.heroes?.length ? <FallbackImg sources={art.heroes} className={page.HeaderImage} /> : null}
            </div>
            <div className={cx("Panel", page.Container)}>
              <div className={cx("Panel", page.HeaderContainer, perfect && page.PerfectGame)}>
                <Header set={set} gameName={gameName} art={art} />
              </div>
              <div className={cx("Panel", page.AchievementTabs)}>
                <div className={cx("Panel", tb.GamepadTabbedPage, tb.CanBeHeaderBackground)}>
                  <div className={cx(tb.TabHeaderRowWrapper, tb.Pinned)}>
                    <div className={tb.TabRow}>
                      <div className={tb.TabRowTabs} role="tablist" aria-orientation="horizontal">
                        <div className={tb.TabsRowScroll}>
                          <div className={cx("Panel", tb.FixCenterAlignScroll)}>
                            <div className={tb.TabRowSpacer} />
                            {tabs.map((x) => (
                              <div
                                key={x.id}
                                role="tab"
                                aria-selected
                                className={cx("Panel", tb.Tab, tb.Selected, tb.RightAddon)}
                              >
                                <span className={tb.TabTitle}>{x.title}</span>
                              </div>
                            ))}
                            <div className={tb.TabRowSpacer} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={cx("Panel", tb.TabContents)}>
                    <div className={cx(tb.TabContentsScroll, "_TabContentsScroll")} role="tabpanel">
                      <div className={cx("Panel", l.AchievementList, page.List)}>
                        <div className={cx("Panel", h.AchievementSearchHeader, page.MyAchievementsHeader)}>
                          <div className={h.LeftContent} />
                          <div className={h.SearchField}>
                            <div className="DialogInput_Wrapper _DialogLayout Panel">
                              <input
                                type="text"
                                className="DialogInput DialogInputPlaceholder DialogTextInputBase Focusable"
                                placeholder={L("Achievements_Filter_Default")}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value.toLowerCase())}
                              />
                            </div>
                          </div>
                        </div>
                        {achieved.filter(match).map((x) => <Row key={x.id} appid={appid} trophy={x} />)}
                        {unachieved.filter(match).length > 0 && <div className={l.ListTitle}>{L("Achievements_LockedList_Title")}</div>}
                        {unachieved.filter(match).map((x) => <Row key={x.id} appid={appid} trophy={x} />)}
                        {hidden > 0 && !filter && (
                          <>
                            <div className={l.ListTitle} style={{ paddingTop: 0 }}>{L("Achievements_HiddenList_Title")}</div>
                            <HiddenRow count={hidden} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={lib.CloseButton} onClick={onClose} role="button" aria-label={L("Generic_Close")}>
          <svg className="SVGIcon_Button SVGIcon_X_Line" viewBox="0 0 256 256" width="100%" height="100%">
            <line fill="none" stroke="#FFFFFF" strokeWidth="45" strokeMiterlimit="10" x1="212" y1="212" x2="44" y2="44" />
            <line fill="none" stroke="#FFFFFF" strokeWidth="45" strokeMiterlimit="10" x1="44" y1="212" x2="212" y2="44" />
          </svg>
        </div>
      </div>
    </div>
  )
}
