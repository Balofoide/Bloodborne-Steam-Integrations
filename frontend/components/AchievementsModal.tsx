import React, { useEffect, useState } from "react"
import { formatDateTime, t } from "../i18n"
import { sortForDisplay, type Trophy, type TrophySet } from "../trophies"
import { TrophyIcon } from "./TrophyIcon"

type Filter = "all" | "unlocked" | "locked"

interface Props {
  appid: string
  set: TrophySet
  gameName: string
  doc: Document
  onClose: () => void
}

/** Full list, the equivalent of Steam's "Ver minhas conquistas" page. */
export function AchievementsModal({ appid, set, gameName, doc, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    doc.addEventListener("keydown", onKey)
    return () => doc.removeEventListener("keydown", onKey)
  }, [doc, onClose])

  const visible = sortForDisplay(set.trophies).filter((x) =>
    filter === "all" ? true : filter === "unlocked" ? x.unlocked : !x.unlocked,
  )
  // Base game first, then each DLC group in file order.
  const groups: Array<{ id: string; label: string; items: Trophy[] }> = [
    { id: "", label: t.baseGame, items: visible.filter((x) => !x.group) },
    ...Object.entries(set.groups).map(([id, label]) => ({ id, label, items: visible.filter((x) => x.group === id) })),
  ].filter((g) => g.items.length > 0)

  return (
    <div className="bbpc-modal" data-bbpc onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bbpc-modal__dialog">
        <div className="bbpc-modal__head">
          <div className="bbpc-modal__title">
            <span>{gameName || set.title} · {t.achievements}</span>
            <button className="bbpc-modal__close" onClick={onClose} aria-label={t.close}>×</button>
          </div>
          <div className="bbpc-progress__label">{t.unlockedOf(set.unlocked, set.total, set.percent)}</div>
          <div className="bbpc-bar"><div style={{ width: `${set.percent}%` }} /></div>
          <div className="bbpc-modal__tools">
            {(["all", "unlocked", "locked"] as Filter[]).map((f) => (
              <button key={f} className={`bbpc-chip${filter === f ? " bbpc-chip--on" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? `${t.achievements} (${set.total})` : f === "unlocked" ? `${t.unlocked} (${set.unlocked})` : `${t.locked} (${set.total - set.unlocked})`}
              </button>
            ))}
            <button className={`bbpc-chip bbpc-chip--toggle${showHidden ? " bbpc-chip--on" : ""}`} onClick={() => setShowHidden(!showHidden)}>
              {t.showHidden}
            </button>
          </div>
        </div>
        <div className="bbpc-modal__list">
          {groups.map((g) => (
            <div key={g.id || "base"}>
              {groups.length > 1 || g.id ? <div className="bbpc-group">{g.label}</div> : null}
              {g.items.map((tr) => <Row key={tr.id} appid={appid} trophy={tr} reveal={showHidden} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ appid, trophy, reveal }: { appid: string; trophy: Trophy; reveal: boolean }) {
  const masked = trophy.hidden && !trophy.unlocked && !reveal
  return (
    <div className={`bbpc-row${trophy.unlocked ? "" : " bbpc-row--locked"}`}>
      <TrophyIcon appid={appid} trophy={trophy} maskHidden={masked} tooltip={false} />
      <div className="bbpc-row__main">
        <div className="bbpc-row__name">{masked ? t.hiddenName : trophy.name}</div>
        <div className="bbpc-row__detail">{masked ? t.hiddenDetail : trophy.detail}</div>
      </div>
      <div className="bbpc-row__side">
        {trophy.unlockedAt ? t.unlockedOn(formatDateTime(trophy.unlockedAt)) : trophy.unlocked ? t.unlocked : ""}
        <div className="bbpc-row__tier"><span className={`bbpc-tier bbpc-tier--${trophy.tier}`} />{t.tiers[trophy.tier]}</div>
      </div>
    </div>
  )
}
