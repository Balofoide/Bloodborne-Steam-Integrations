import React, { useEffect, useLayoutEffect, useRef } from "react"
import { openExternal, type Release } from "../api"
import { t } from "../i18n"
import { Markdown } from "../markdown"
import { css, cx } from "../steam/classes"
import { L, locales } from "../steam/l10n"
import { releaseLabel } from "./ActivityFeed"

// Mirror of the library's partner-event viewer (sp.js "AppPartnerEventsPage"):
// close / previous / next controls on the right and the events stacked as
// cards (PartnerEvent.InLibraryView) with type · author · date, title and the
// body rendered like Steam's BBCode.

interface Props {
  releases: Release[]
  initialTag: string
  installed: string
  doc: Document
  onClose: () => void
}

const X_ICON = (
  <svg className="SVGIcon_Button SVGIcon_X_Line" viewBox="0 0 256 256" width="256px" height="256px">
    <line fill="none" stroke="#FFFFFF" strokeWidth="45" strokeMiterlimit="10" x1="212" y1="212" x2="44" y2="44" />
    <line fill="none" stroke="#FFFFFF" strokeWidth="45" strokeMiterlimit="10" x1="44" y1="212" x2="212" y2="44" />
  </svg>
)

const ARROW = (angle: number) => (
  <svg className="SVGIcon_Button SVGIcon_DownArrowContextMenu" viewBox="0 0 128 128" width="256px" height="256px"
    style={{ transform: `rotate(${angle}deg)` }}>
    <polygon fill="currentColor" points="50 59.49 13.21 22.89 4.75 31.39 50 76.41 95.25 31.39 86.79 22.89 50 59.49" transform="translate(14 14)" />
  </svg>
)

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  const loc = locales() ?? undefined
  return `${d.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}`
}

function EventCard({ release, installed }: { release: Release; installed: string }) {
  const ev = css("events"), d = css("eventDetail")
  const subtitle = release.tag_name + (installed ? `  ·  ${t.installed(installed)}` : "")
  return (
    <div className={cx(ev.PartnerEvent, d.InLibraryView)} data-tag={release.tag_name}>
      <div className={d.LibraryEventTitleContainer}>
        <div className={d.EventDetailTitleContainer}>
          <div className={ev.EventTypeAndTimeRow}>
            <div className={ev.TimeandPostedBy}>
              <span className={ev.EventType}>{releaseLabel(release)}</span>
              <span className={ev.PostedBy}> {L("EventDisplay_PostedBy")}{release.author?.login ?? "Awakenchan"} </span>
              <span className={d.EventDetailTimeInfo}>{formatEventDate(release.published_at)}</span>
            </div>
          </div>
          <div className={d.EventDetailTitle}>{release.name || release.tag_name}</div>
          <div className={cx(d.EventDetailsSubTitle, ev.LibraryViewSubtitle)}>{subtitle}</div>
          <div className={d.EventDetailUserType} />
        </div>
      </div>
      <div className={d.LibraryEventBodyContainer}>
        <div className={cx(d.EventDetailsBody, ev.EventDetailsBody)}>
          <Markdown text={release.body ?? ""} />
        </div>
        <div className={ev.ReadMoreCnt}>
          <button type="button" className={cx("DialogButton", "_DialogLayout", "Secondary")} style={{ width: "auto", padding: "10px 24px" }}
            onClick={() => openExternal(release.html_url)}>
            {L("EventEmail_Button_ClickForMoreDetails")}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EventOverlay({ releases, initialTag, installed, doc, onClose }: Props) {
  const ev = css("events")
  const scroller = useRef<HTMLDivElement | null>(null)

  const cards = () => Array.from(scroller.current?.querySelectorAll<HTMLElement>("[data-tag]") ?? [])
  // Keep the card's native 56px top margin visible, like Steam's scroll anchor.
  const scrollTo = (el: HTMLElement | undefined, smooth = true) => {
    const box = scroller.current
    if (!el || !box) return
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 56
    box.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" })
  }

  // Open at the event that was clicked, like Steam scrolls to its anchor.
  useLayoutEffect(() => {
    scrollTo(cards().find((c) => c.dataset.tag === initialTag), false)
  }, [initialTag])

  const step = (dir: -1 | 1) => {
    const top = scroller.current?.getBoundingClientRect().top ?? 0
    const list = cards()
    const current = list.findIndex((c) => c.getBoundingClientRect().bottom > top + 80)
    scrollTo(list[Math.max(0, Math.min(list.length - 1, (current < 0 ? 0 : current) + dir))])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowUp" && e.altKey) step(-1)
      else if (e.key === "ArrowDown" && e.altKey) step(1)
    }
    doc.addEventListener("keydown", onKey)
    return () => doc.removeEventListener("keydown", onKey)
  }, [doc, onClose])

  return (
    <div className={ev.AppPartnerEventsPage} style={{ position: "fixed", zIndex: 1000, background: "rgba(0, 0, 0, 0.6)" }} data-bbpc="event">
      <div
        className={ev.AppPartnerEventsBody}
        ref={scroller}
        tabIndex={-1}
        onClick={(e) => { if (!(e.target as Element).closest(`.${ev.PartnerEvent}`)) onClose() }}
      >
        <div className={cx(ev.ControlSection, ev.NoGameLink, releases.length < 2 && ev.NoScrollArrows)}>
          <div className={ev.ControlSectionWidth}>
            <div className={ev.ControlSectionRightSide}>
              <div className={cx(ev.CloseButton, ev.AnimIn)} onClick={(e) => { e.stopPropagation(); onClose() }}>{X_ICON}</div>
              {releases.length > 1 && (
                <>
                  <div className={cx(ev.ScrollButton, ev.Up, ev.AnimIn)} onClick={(e) => { e.stopPropagation(); step(-1) }}>{ARROW(180)}</div>
                  <div className={cx(ev.ScrollButton, ev.Down, ev.AnimIn)} onClick={(e) => { e.stopPropagation(); step(1) }}>{ARROW(0)}</div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className={cx(ev.AppPartnerEventsContainer, ev.NoGameLink)}>
          {releases.map((r) => <EventCard key={r.tag_name} release={r} installed={installed} />)}
        </div>
      </div>
    </div>
  )
}
