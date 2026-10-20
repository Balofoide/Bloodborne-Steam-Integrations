import React, { useId } from "react"
import { css, cx } from "../steam/classes"

// Mirror of Steam's library section (sp.js #45026 "nZ"/"l_"/"Zt" + header #10909):
//   div.AppDetailsSection > h2.SectionHeader + div.AppDetailsSectionContainer
//     > [highlight] + div.Body > children + [button.AppDetailsButton.BottomRight]

interface Props {
  label?: string
  className?: string
  bodyClassName?: string
  rightColumn?: boolean
  highlight?: React.ReactNode
  action?: { label: string; onClick: () => void }
  children?: React.ReactNode
}

export function Section({ label, className, bodyClassName, rightColumn, highlight, action, children }: Props) {
  const s = css("section"), h = css("header"), r = css("reset"), b = css("button")
  const id = useId()
  return (
    <div className={cx("Panel", s.AppDetailsSection, className)} role="region" aria-labelledby={label ? id : undefined} data-bbpc="section">
      {label && (
        <h2 className={cx(r.Reset, h.SectionHeader, h.PadLeft)} id={id}>
          <div className={h.Label}><div className={h.LabelText}>{label}</div></div>
        </h2>
      )}
      <div className={cx("Panel", s.AppDetailsSectionContainer, label && s.AppDetailsSectionHasLabel, rightColumn && s.RightColumnSection)}>
        {highlight}
        <div className={cx(s.Body, bodyClassName)}>
          {children}
          {action && (
            <button
              type="button"
              className={cx("DialogButton", "_DialogLayout", "Secondary", b.AppDetailsButton, b.BottomRight)}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Section highlight strip ("Zt"). */
export function Highlight({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx(css("section").Highlight, className)}>{children}</div>
}
