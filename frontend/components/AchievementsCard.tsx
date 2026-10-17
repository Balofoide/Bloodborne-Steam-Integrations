import React from "react"
import { t } from "../i18n"
import { sortForDisplay, type TrophySet } from "../trophies"
import { TrophyIcon } from "./TrophyIcon"

const MAX_ICONS = 8

interface Props {
  appid: string
  set: TrophySet
  onOpen: () => void
}

/** Right-column "CONQUISTAS" panel, modelled on Steam's own. */
export function AchievementsCard({ appid, set, onOpen }: Props) {
  const ordered = sortForDisplay(set.trophies)
  const unlocked = ordered.filter((x) => x.unlocked)
  const lockedVisible = ordered.filter((x) => !x.unlocked && !x.hidden)
  const hiddenLeft = ordered.filter((x) => !x.unlocked && x.hidden).length

  return (
    <div className="bbpc-section" data-bbpc>
      <div className="bbpc-section__header">{t.achievements}</div>
      <div className="bbpc-panel">
        <div className="bbpc-progress__label">
          {t.unlockedOf(set.unlocked, set.total, set.percent)}
        </div>
        <div className="bbpc-bar"><div style={{ width: `${set.percent}%` }} /></div>

        {unlocked.length > 0 && (
          <IconRow appid={appid} list={unlocked} onOpen={onOpen} />
        )}

        {lockedVisible.length + hiddenLeft > 0 && (
          <>
            <div className="bbpc-icons__sub">{t.lockedAchievements}</div>
            {lockedVisible.length > 0 && <IconRow appid={appid} list={lockedVisible} onOpen={onOpen} compact />}
            {hiddenLeft > 0 && <div className="bbpc-icons__sub" style={{ marginTop: 10 }}>{t.hiddenRemaining(hiddenLeft)}</div>}
          </>
        )}

        <button className="bbpc-button" onClick={onOpen}>{t.viewAll}</button>
      </div>
    </div>
  )
}

function IconRow({ appid, list, onOpen, compact }: { appid: string; list: TrophySet["trophies"]; onOpen: () => void; compact?: boolean }) {
  const overflow = list.length > MAX_ICONS
  const shown = overflow ? list.slice(0, MAX_ICONS - 1) : list
  return (
    <div className="bbpc-icons" style={compact ? { marginTop: 0 } : undefined}>
      {shown.map((tr) => <TrophyIcon key={tr.id} appid={appid} trophy={tr} onClick={onOpen} />)}
      {overflow && (
        <div className="bbpc-icon bbpc-icon--more" onClick={onOpen}>+{list.length - shown.length}</div>
      )}
    </div>
  )
}
