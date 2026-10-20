import React from "react"
import type { FailReason } from "../api"
import { g, openAddNonSteamGame, openLanternReleases, openLibraryPage, openShortcutProperties, winPath } from "../guide"
import { cx } from "../steam/classes"
import { Section } from "./Section"

// Shown on the Bloodborne page (in place of Steam's dashed "non-Steam"
// box) when the shortcut has no data: folder moved / deleted, or the game was
// never launched. Native section look, with the Steam actions that fix it.

interface Props {
  appid: string
  reason: FailReason
  path?: string
  /** Another Bloodborne shortcut that works, if any. */
  workingAppid?: string
}

const titleStyle: React.CSSProperties = { fontSize: 16, color: "#fff", marginBottom: 6 }
const textStyle: React.CSSProperties = { fontSize: 13, lineHeight: "19px", color: "#a7adb3" }
const actionsStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }

export function ActionButton({ children, onClick, primary, disabled }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={cx("DialogButton", "_DialogLayout", primary ? "Primary" : "Secondary")}
      style={{ width: "auto", minWidth: 0, padding: "8px 16px", fontSize: 13 }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function GuideNotice({ appid, reason, path, workingAppid }: Props) {
  const missing = reason === "missing_folder"
  return (
    <Section label={g.product}>
      <div style={{ padding: "12px 14px" }}>
        <div style={titleStyle}>{missing ? g.missingTitle : g.noDataTitle}</div>
        <div style={textStyle}>{missing ? g.missingBody(winPath(path)) : g.noDataBody(winPath(path))}</div>
        {missing && workingAppid && workingAppid !== appid && <div style={{ ...textStyle, marginTop: 8 }}>{g.otherWorks}</div>}
        <div style={actionsStyle}>
          {missing && workingAppid && workingAppid !== appid && (
            <ActionButton primary onClick={() => openLibraryPage(workingAppid)}>{g.openOther}</ActionButton>
          )}
          {missing && <ActionButton onClick={() => openShortcutProperties(appid)}>{g.properties}</ActionButton>}
          {missing && <ActionButton onClick={openAddNonSteamGame}>{g.addNonSteam}</ActionButton>}
          <ActionButton onClick={openLanternReleases}>{g.download}</ActionButton>
        </div>
      </div>
    </Section>
  )
}
