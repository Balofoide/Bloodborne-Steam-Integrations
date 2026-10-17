import React, { useEffect, useState } from "react"
import { loadIcon } from "../api"
import { formatDateTime, t } from "../i18n"
import type { Trophy } from "../trophies"

interface Props {
  appid: string
  trophy: Trophy
  /** Mask hidden locked trophies like Steam does. */
  maskHidden?: boolean
  tooltip?: boolean
  onClick?: () => void
}

export function TrophyIcon({ appid, trophy, maskHidden = true, tooltip = true, onClick }: Props) {
  const masked = maskHidden && trophy.hidden && !trophy.unlocked
  const [src, setSrc] = useState("")
  const [tip, setTip] = useState<{ x: number; y: number; vw: number; body: HTMLElement } | null>(null)

  useEffect(() => {
    if (masked) return
    let alive = true
    loadIcon(appid, trophy.icon).then((url) => alive && setSrc(url), () => {})
    return () => { alive = false }
  }, [appid, trophy.icon, masked])

  const cls = ["bbpc-icon", !trophy.unlocked && "bbpc-icon--locked", masked && "bbpc-icon--hidden"].filter(Boolean).join(" ")
  return (
    <div
      className={cls}
      onClick={onClick}
      onMouseMove={tooltip ? (e) => {
        const doc = e.currentTarget.ownerDocument
        setTip({ x: e.clientX, y: e.clientY, vw: doc.defaultView?.innerWidth ?? 1920, body: doc.body })
      } : undefined}
      onMouseLeave={tooltip ? () => setTip(null) : undefined}
    >
      {masked ? "?" : src ? <img src={src} alt="" draggable={false} /> : null}
      {!masked && <span className={`bbpc-tier bbpc-tier--${trophy.tier}`} />}
      {tip && portal(<Tooltip x={tip.x} y={tip.y} vw={tip.vw} trophy={trophy} masked={masked} />, tip.body)}
    </div>
  )
}

// Render into the popup's <body> so no transformed/clipped ancestor in Steam's
// page can trap the fixed-position tooltip.
function portal(node: React.ReactNode, target: HTMLElement): React.ReactNode {
  const RD = (window as { SP_REACTDOM?: { createPortal?: (n: React.ReactNode, el: Element) => React.ReactNode } }).SP_REACTDOM
  return RD?.createPortal ? RD.createPortal(node, target) : node
}

function Tooltip({ x, y, vw, trophy, masked }: { x: number; y: number; vw: number; trophy: Trophy; masked: boolean }) {
  const width = 300
  const left = x + 16 + width > vw ? x - width - 12 : x + 16
  return (
    <div className="bbpc-tip" style={{ left, top: y + 14 }}>
      <b>{masked ? t.hiddenName : trophy.name}</b>
      {masked ? t.hiddenDetail : trophy.detail}
      <i>
        {t.tiers[trophy.tier]}
        {trophy.unlockedAt ? ` · ${t.unlockedOn(formatDateTime(trophy.unlockedAt))}` : ""}
      </i>
    </div>
  )
}
