import * as React from "react"
import * as ReactDOMClient from "react-dom/client"
import { createPortal } from "react-dom"
import plugin from "../../frontend/index.tsx"
import { applyArtwork, settings } from "../../frontend/artwork.ts"

const M = window.__MOCK
// "#fresh": a shortcut Steam never ran — it shows no last-played/playtime stats.
if (location.hash.includes("fresh")) document.querySelectorAll("[data-native]").forEach((el) => el.remove())
window.SP_REACT = React
// Count root renders so tools/preview/perf.mjs can check idle work.
window.__renders = 0
const createRoot = (el) => { const r = ReactDOMClient.createRoot(el); const render = r.render.bind(r); r.render = (n) => { window.__renders++; render(n) }; return r }
window.SP_REACTDOM = { ...ReactDOMClient, createRoot, createPortal }
window.MainWindowBrowserManager = { m_lastLocation: { pathname: `/library/app/${M.appid}` }, m_browser: { on() {} } }
// A fresh shortcut: Steam has counted nothing for it yet.
window.__overview = { display_name: "Bloodborne", app_type: 1073741824, minutes_playtime_forever: location.hash.includes("fresh") ? 0 : 5, rt_last_time_played: 0 }
window.appStore = {
  GetAppOverviewByAppID: () => window.__overview,
  // Like Steam: one URL per extension; only the .png exists here.
  GetCustomHeroImageURLs: () => [M.art.hero.replace(/\.png$/, ".jpg"), M.art.hero],
  GetIconURLForApp: () => M.art.icon,
}
window.LocalizationManager = {
  LocalizeString: (tok) => M.strings[tok.replace(/^#/, "")],
  GetPreferredLocales: () => ["pt-BR"],
}
window.g_FriendsUIApp = { FriendStore: { self: { accountid: M.accountid, display_name: M.persona.name, persona: { avatar_url_medium: M.persona.avatar } } } }
window.__steamCalls = []
window.SteamClient = { Apps: {
  SetCustomArtworkForApp: async (...a) => { window.__steamCalls.push(["SetCustomArtworkForApp", a[0], a[2], a[3]]) },
  SetShortcutIcon: (...a) => { window.__steamCalls.push(["SetShortcutIcon", ...a]) },
}, System: {
  OpenInSystemBrowser: (u) => window.__steamCalls.push(["OpenInSystemBrowser", u]),
  OpenLocalDirectoryInSystemExplorer: (p) => window.__steamCalls.push(["OpenLocalDirectoryInSystemExplorer", p]),
} }
window.__art = { applyArtwork, settings }
const def = plugin()
const host = document.createElement("div")
host.id = "settings-preview"
host.style.cssText = "width:340px;padding:16px 20px;background:#1b1e24;color:#dcdedf;font:14px Arial"
document.body.appendChild(host)
ReactDOMClient.createRoot(host).render(def.content)
window.__hook({ m_strName: "SP Desktop_uid0", m_popup: { document, window } })
