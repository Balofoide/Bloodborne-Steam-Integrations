import React, { useEffect, useRef, useState } from "react"
import { openExternal, type BloodborneShortcut } from "../api"
import { applyArtwork, settings } from "../artwork"
import { g, openAddNonSteamGame } from "../guide"
import { css } from "../steam/classes"
import { ActionButton } from "./GuideNotice"

// First-run dialog:
//  • Bloodborne not in the library → use Lantern Engine's "Add to Steam"
//  • found → optional SteamGridDB key, then fill in the missing artwork

const KEY_URL = "https://www.steamgriddb.com/profile/preferences/api"
const SETUP_STORAGE = "bloodborne-pc.setup"

export const setupState = {
  get(): string { try { return localStorage.getItem(SETUP_STORAGE) ?? "" } catch { return "" } },
  set(v: "done" | "hide-missing") { try { localStorage.setItem(SETUP_STORAGE, v) } catch {} },
}

const heading: React.CSSProperties = { fontSize: 22, color: "#fff", fontWeight: 300, margin: "0 24px 12px 0" }
const text: React.CSSProperties = { fontSize: 14, lineHeight: "20px", color: "#b8bcbf", margin: 0 }
const footer: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }

function NotFound({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={heading}>{g.notFoundTitle}</div>
      <ol style={{ ...text, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {g.notFoundSteps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      <div style={footer}>
        <ActionButton onClick={() => { setupState.set("hide-missing"); onClose() }}>{g.dontShow}</ActionButton>
        <ActionButton onClick={() => { openAddNonSteamGame(); onClose() }}>{g.addNonSteam}</ActionButton>
        <ActionButton primary onClick={onClose}>{g.close}</ActionButton>
      </div>
    </>
  )
}

function Found({ shortcut, onClose }: { shortcut: BloodborneShortcut; onClose: () => void }) {
  const [key, setKey] = useState(settings.key)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState("")

  const save = async () => {
    settings.key = key.trim()
    setupState.set("done")
    if (!shortcut.appid) return onClose()
    setBusy(true)
    const r = await applyArtwork(shortcut.appid, shortcut.name || "Bloodborne", false)
    setBusy(false)
    if (r.errors.length) setResult(r.errors.join(" · "))
    else onClose()
  }

  return (
    <>
      <div style={heading}>{g.foundTitle}</div>
      <p style={text}>{g.foundBody}</p>
      {!shortcut.ready && <p style={{ ...text, marginTop: 8 }}>{g.foundNoData}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <div className="DialogInput_Wrapper _DialogLayout Panel" style={{ flex: 1 }}>
          <input type="password" className="DialogInput DialogInputPlaceholder DialogTextInputBase Focusable"
            placeholder={g.keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </div>
        <a href={KEY_URL} style={{ color: "#1a9fff", fontSize: 13, whiteSpace: "nowrap" }}
          onClick={(e) => { e.preventDefault(); openExternal(KEY_URL) }}>{g.getKey}</a>
      </div>
      {result && <p style={{ ...text, color: "#e5604f", marginTop: 8 }}>{result}</p>}
      <div style={footer}>
        <ActionButton onClick={() => { setupState.set("done"); onClose() }}>{g.later}</ActionButton>
        <ActionButton primary disabled={!key.trim() || busy} onClick={save}>{busy ? g.applying : g.saveAndApply}</ActionButton>
      </div>
    </>
  )
}

function Content({ shortcut, onClose }: { shortcut: BloodborneShortcut; onClose: () => void }) {
  return (
    <div className={css("field").GamepadDialogContent} style={{ padding: 0 }}>
      {shortcut.found ? <Found shortcut={shortcut} onClose={onClose} /> : <NotFound onClose={onClose} />}
    </div>
  )
}

/** Steam's dialog look (GenericDialog panel), drawn by the plugin: Steam's own
 * modal host placed it off-centre with a fixed height on Millennium's pages,
 * and its close callback re-entered itself (see git history of 1.7.x). */
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose() } }
    const win = ref.current?.ownerDocument.defaultView ?? window
    win.addEventListener("keydown", onKey, true)
    return () => win.removeEventListener("keydown", onKey, true)
  }, [onClose])
  return (
    <div
      ref={ref}
      data-bbpc="setup"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.6)" }}
    >
      <div role="dialog" aria-modal="true" style={{
        position: "relative", width: "min(560px, calc(100vw - 32px))", boxSizing: "border-box", padding: "24px 24px 20px",
        borderRadius: 4, backgroundImage: "radial-gradient(ellipse farthest-corner at top left, #3d4048 0%, #25282e 100%)",
        boxShadow: "0 0 24px rgba(0,0,0,.7)", fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
      }}>
        <button type="button" aria-label={g.closeLabel} onClick={onClose} style={{
          position: "absolute", top: 8, right: 8, width: 24, height: 24, padding: 0, border: 0, background: "none",
          color: "#8b929a", cursor: "pointer", display: "grid", placeItems: "center",
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}

/** Open the first-run dialog; `mount` renders it into the target document. */
export function openSetupDialog(
  shortcut: BloodborneShortcut,
  mount: (node: (close: () => void) => React.ReactNode) => void,
) {
  mount((close) => <Modal onClose={close}><Content shortcut={shortcut} onClose={close} /></Modal>)
}
