import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { loadIcon } from "../api"
import { formatDate, t } from "../i18n"
import { css, cx } from "../steam/classes"
import { L } from "../steam/l10n"
import type { Trophy } from "../trophies"

// Mirrors of Steam's achievement pieces (sp.js modules 59894 / 3270 / 15033 /
// 50178), rendered with Steam's own CSS-module classes.

/** Gold and platinum trophies get Steam's "rare achievement" glow. */
export const isRare = (tr: Trophy) => tr.unlocked && (tr.tier === "P" || tr.tier === "G")
export const isMasked = (tr: Trophy) => tr.hidden && !tr.unlocked

// Steam shows a locked achievement with its developer-made grey icon; PS4
// trophies ship one colour icon only, so locked ones are greyed here.
export const lockedStyle = (tr: Trophy): React.CSSProperties | undefined =>
  tr.unlocked ? undefined : { filter: "grayscale(1)" }

// Grade-coloured trophy glyph (Steam's play-bar trophy shape) for when the
// engine has not extracted the game's icons yet and the built-in list is used.
const TIER_COLOR: Record<string, string> = { P: "#c9d7ef", G: "#e7b64a", S: "#c4cbd2", B: "#c4814b" }
const glyph = (tier: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1d2128"/>` +
    `<g transform="translate(14 13)" fill="${TIER_COLOR[tier] ?? "#8b929a"}">` +
    `<path d="M9.64 9.5L6.39 12.8l3.25 3.31v4.72h4.64L18 24.61l3.71-3.78h4.65v-4.72l3.25-3.31-3.25-3.31V4.78h-4.65L18 1l-3.72 3.78H9.64V9.5zM22.64 12.8a4.64 4.64 0 1 1-9.28 0 4.64 4.64 0 0 1 9.28 0z"/>` +
    `<path d="M5 30.28l3.25-5.67h4.18l3.25 3.31L11.5 35l-2.32-4.72H5zM31 30.28l-3.25-5.67h-4.18l-3.25 3.31L24.5 35l2.32-4.72H31z"/></g></svg>`)

export function useIcon(appid: string, tr: Trophy | undefined): string {
  const [src, setSrc] = useState("")
  useEffect(() => {
    if (!tr) return
    let alive = true
    loadIcon(appid, tr.icon).then((url) => alive && setSrc(url || glyph(tr.tier)), () => alive && setSrc(glyph(tr.tier)))
    return () => { alive = false }
  }, [appid, tr?.icon])
  return src
}

/** Steam's AchievementIcon (#3270): "?" box when hidden, glow when rare. */
export function AchievementIcon({ appid, trophy, hidden, className }: {
  appid: string; trophy: Trophy; hidden: boolean; className?: string
}) {
  const i = css("achIcon")
  const src = useIcon(appid, hidden ? undefined : trophy)
  const [loaded, setLoaded] = useState(false)
  if (hidden) return <div className={i.HiddenLabel}>?</div>
  const glow = loaded && isRare(trophy)
  return (
    <div className={cx(i.AchievementIconWrapper, className)}>
      {glow && (
        <div className={i.RareAchievementIconGlowContainerRoot}>
          <div className={i.RareAchievementIconGlowContainer}><div className={i.RareAchievementIconGlow} /></div>
        </div>
      )}
      {src && <img className={cx(i.Icon, glow && i.IconGlow)} src={src} alt="" style={lockedStyle(trophy)} onLoad={() => setLoaded(true)} />}
    </div>
  )
}

/** Steam's hover card (#59894 "Y" inside #15033 AppDetailsHover). */
function HoverCard({ appid, trophy, at }: { appid: string; trophy: Trophy; at: { x: number; y: number } }) {
  const a = css("ach"), h = css("hover")
  const src = useIcon(appid, trophy)
  return (
    <div
      className={cx(h.AppDetailsHover, a.Hover, trophy.unlocked ? a.Achieved : a.NotAchieved)}
      style={{ position: "fixed", left: at.x, top: at.y, width: 400, zIndex: 1500, isolation: "isolate", pointerEvents: "none" }}
    >
      <div className={h.Background}>{src && <div className={h.BlurContainer}><img src={src} alt="" style={lockedStyle(trophy)} /></div>}</div>
      <div className={a.TopSection}>
        <AchievementIcon appid={appid} trophy={trophy} hidden={false} className={cx(a.TopSectionAchievementIcon, a.Icon)} />
        <div className={a.TextSection}>
          <div className={a.Name}>{trophy.name}</div>
          <div className={a.Desc}>{trophy.detail}</div>
        </div>
      </div>
      <div className={a.Unlocked}>
        {trophy.unlockedAt && <div>{L("AppDetails_Achievements_Unlocked", formatDate(trophy.unlockedAt))}</div>}
        <div className={cx(isRare(trophy) && a.RareLabel)}>{t.tiers[trophy.tier]}</div>
      </div>
    </div>
  )
}

const portal = (node: React.ReactNode, target: Element) => {
  const RD = (window as { SP_REACTDOM?: { createPortal?: (n: React.ReactNode, el: Element) => React.ReactNode } }).SP_REACTDOM
  return RD?.createPortal ? RD.createPortal(node, target) : null
}

/** Steam's AchievementHoverContainer: shows the hover card next to the icon. */
function HoverContainer({ appid, trophy, children }: { appid: string; trophy: Trophy; children: React.ReactNode }) {
  const a = css("ach")
  const [at, setAt] = useState<{ x: number; y: number; body: Element } | null>(null)
  const masked = isMasked(trophy)
  const onEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (masked) return
    const el = e.currentTarget, doc = el.ownerDocument, view = doc.defaultView
    const r = el.getBoundingClientRect()
    const vw = view?.innerWidth ?? 1920, vh = view?.innerHeight ?? 1080
    const x = r.right + 12 + 400 > vw ? Math.max(8, r.left - 412) : r.right + 12
    const y = Math.max(8, Math.min(r.top - 20, vh - 220))
    setAt({ x, y, body: doc.body })
  }
  return (
    <div className={a.AchievementHoverContainer} onMouseEnter={onEnter} onMouseLeave={() => setAt(null)}>
      {children}
      {at && portal(<HoverCard appid={appid} trophy={trophy} at={at} />, at.body)}
    </div>
  )
}

/** Steam's achievement tile (#59894 "J"). `featured` adds name + description. */
export function AchievementTile({ appid, trophy, featured, className, onClick }: {
  appid: string; trophy: Trophy; featured?: boolean; className?: string; onClick?: () => void
}) {
  const a = css("ach")
  const masked = isMasked(trophy)
  return (
    <div
      className={cx("Panel", className, trophy.unlocked ? a.Achieved : a.NotAchieved, featured && a.Featured)}
      role="link"
      onClick={onClick}
    >
      <HoverContainer appid={appid} trophy={trophy}>
        <AchievementIcon appid={appid} trophy={trophy} hidden={masked} className={a.Icon} />
      </HoverContainer>
      {featured && (
        <div className={a.TextSection}>
          <div className={a.Name}>{masked ? L("AppDetailsAchievement_Hidden") : trophy.name}</div>
          <div className={a.Desc}>{masked ? L("AppDetailsAchievement_HiddenDesc") : trophy.detail}</div>
        </div>
      )}
    </div>
  )
}

/** Steam's "+N" tile (#59894 "R"); the background is the next icon, blurred. */
export function Remainder({ appid, count, next, className, label, onClick }: {
  appid: string; count: number; next?: Trophy; className?: string; label?: { name: string; desc?: string }; onClick?: () => void
}) {
  const a = css("ach"), f = css("feed")
  const src = useIcon(appid, next && !isMasked(next) ? next : undefined)
  return (
    <div className={cx("Panel", label && a.Featured, className, a.RemainderContainer)} onClick={onClick}>
      <div className={a.Remainder}>
        {label && src && <div className={f.AchievementRemainder} style={{ backgroundImage: `url('${src}')`, ...(next ? lockedStyle(next) : {}) }} />}
        <div className={a.RemainderText}>+{count}</div>
      </div>
      {label && (
        <div className={a.TextSection}>
          <div className={a.Name}>{label.name}</div>
          {label.desc && <div className={a.Desc}>{label.desc}</div>}
        </div>
      )}
    </div>
  )
}

/** Steam's single-row icon list (#50178): fits as many icons as the width
 * allows and turns the rest into a "+N" tile. */
export function IconRow({ appid, items, total, className, onClick }: {
  appid: string; items: Trophy[]; total: number; className?: string; onClick: () => void
}) {
  const r = css("row"), a = css("ach")
  const container = useRef<HTMLDivElement | null>(null)
  const first = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(1)

  const measure = useCallback(() => {
    const c = container.current?.clientWidth ?? 0
    const p = first.current?.offsetWidth ?? 0
    if (!c || !p) return
    let n = Math.min(items.length, Math.floor(c / p) - 1)
    if (total - n === 1) n = items.length
    setFit(Math.max(1, n))
  }, [items.length, total])

  useLayoutEffect(() => {
    measure()
    const el = container.current
    const RO = el?.ownerDocument.defaultView?.ResizeObserver
    if (!el || !RO) return
    const ro = new RO(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  if (items.length === 0 && total <= 0) return null
  const shown = items.slice(0, fit)
  return (
    <div className={className}>
      <div className={r.InnerContainer} ref={container}>
        {shown.map((tr, idx) => (
          <div className={r.ItemWrapper} key={tr.id} ref={idx === 0 ? first : undefined}>
            <AchievementTile appid={appid} trophy={tr} className={a.AdditionalItem} onClick={onClick} />
          </div>
        ))}
        {shown.length < total && (
          <div className={r.ItemWrapper}>
            <Remainder appid={appid} count={total - shown.length} next={items[shown.length]} className={a.AdditionalItem} onClick={onClick} />
          </div>
        )}
      </div>
    </div>
  )
}
