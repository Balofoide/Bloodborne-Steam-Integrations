// Stand-in for @steambrew/client in the preview: answers callable() from window.__MOCK.
export const callable = (name) => async (args) => {
  const m = window.__MOCK
  const raw = location.hash.slice(1) || "ready"
  const scenario = raw === "fresh" ? "ready" : raw  // fresh shortcut: same data, Steam just never ran it
  if (name === "bb_find_bloodborne") {
    return JSON.stringify(scenario === "notfound" ? { found: false }
      : { found: true, appid: m.appid, name: "Bloodborne", ready: scenario === "ready", profile: "Emulador", playtime: 8740 })
  }
  if (name === "bb_state" && scenario !== "ready") {
    return JSON.stringify(scenario === "missing"
      ? { ok: false, reason: "missing_folder", path: "C:/Games/BloodbornePC", bloodborne: true }
      : scenario === "nodata"
        ? { ok: false, reason: "no_data", path: "F:/Games/BloodbornePC", bloodborne: true }
        : { ok: false, reason: "not_shortcut", bloodborne: false })
  }
  if (name === "bb_state") return JSON.stringify(m.state)
  if (name === "bb_icon") return JSON.stringify(m.iconBase + args.file)
  if (name === "bb_releases") return JSON.stringify(m.releases)
  // SteamGridDB, simulated: records what the frontend asks for.
  if (name === "bb_art_status") return JSON.stringify({ capsule: true, header: false, hero: false, logo: false, icon: false })
  if (name === "bb_sgdb_search") return JSON.stringify(JSON.stringify({ success: true, data: [{ id: 4321, name: "Bloodborne" }] }))
  if (name === "bb_sgdb_assets") return JSON.stringify(JSON.stringify({ success: true, data: [{ id: 1, url: `https://cdn2.steamgriddb.com/${args.kind}/x.png` }] }))
  if (name === "bb_fetch_image") return JSON.stringify({ b64: "iVBORw0KGgo=", ext: "png" })
  if (name === "bb_save_icon") return JSON.stringify({ path: "C:\\Program Files (x86)\\Steam\\userdata\\1\\config\\grid\\1234567890_icon.png" })
  throw new Error("unknown " + name)
}
// No webpack modules here → every lookup uses the generated fallback hashes,
// which are exactly what Steam's sp.css (loaded by the page) targets.
export const findClassModule = () => { window.__lookups = (window.__lookups ?? 0) + 1; return undefined }
// Settings components: absent here, so the look-alike fallbacks render.
export const Field = undefined, ToggleField = undefined, TextField = undefined
export const DialogButton = undefined, DialogControlsSectionHeader = undefined, DialogBodyText = undefined
// "#steammodal": a stand-in for Steam's modal API with its real contract —
// closing a modal calls the root's closeModal back. Otherwise absent, so the
// setup dialog uses its look-alike.
const steamModal = typeof location !== "undefined" && location.hash.includes("steammodal")
export const ModalRoot = steamModal ? (props) => window.SP_REACT.createElement("div", { "data-steam-modal": "1" }, props.children) : undefined
export const showModal = steamModal ? (element, win) => {
  const host = document.createElement("div"); document.body.appendChild(host)
  const root = window.SP_REACTDOM.createRoot(host)
  root.render(element)
  window.__modal = { closeCalls: 0, open: true }
  const result = {
    Close() {
      window.__modal.closeCalls++
      if (window.__modal.closeCalls > 50) throw new RangeError("Maximum call stack size exceeded (simulated)")
      element.props.closeModal?.()   // Steam calls closeModal while closing
      if (window.__modal.open) { window.__modal.open = false; root.unmount(); host.remove() }
    },
  }
  return result
} : undefined
export const definePlugin = (fn) => fn
export const Millennium = { AddWindowCreateHook: (cb) => { window.__hook = cb } }
