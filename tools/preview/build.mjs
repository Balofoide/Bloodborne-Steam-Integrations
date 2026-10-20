// Builds out/page.html + out/bundle.js: a mock of Steam's library app page
// (real class names, real sp.css) running the real plugin frontend.
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const here = path.dirname(new URL(import.meta.url).pathname)
const STEAM = process.env.STEAM ?? "C:/Program Files (x86)/Steam"
const GAME = process.env.GAME
const ACCOUNT_ID = process.env.STEAM_ACCOUNT_ID ?? "1"
const SHORTCUT_APP_ID = process.env.SHORTCUT_APP_ID ?? "1234567890"
if (!GAME) throw new Error("Set GAME to the Bloodborne PC installation folder before building the preview.")
const out = path.join(here, "out")
fs.mkdirSync(out, { recursive: true })

const read = (p) => fs.readFileSync(p, "utf8")
const pkg = JSON.parse(read(`${GAME}/package.json`))
// Same rule as the backend: definitions extracted by the engine + the
// launcher profile's trophies.log (the preview uses profile PROFILE).
const PROFILE = process.env.PROFILE ?? "Emulador"
const defsDir = `${GAME}/user/game_data/CUSA00900/TrophyFiles/trophy00/Xml`
const logPath = PROFILE === "Main" ? `${GAME}/user/trophies.log` : `${GAME}/user/profiles/${PROFILE}/trophies.log`
const got = {}
for (const line of (fs.existsSync(logPath) ? read(logPath) : "").split(/\r?\n/)) {
  const m = /^\s*(\d+)\s+(\d+)/.exec(line)
  if (m && (!got[m[1]] || +m[2] < got[m[1]])) got[+m[1]] = +m[2]
}
// OLD_UNLOCKS=1: extra unlocks on older days (to exercise "Carregar mais atividade").
if (process.env.OLD_UNLOCKS) for (const [id, day] of [[7, 1], [8, 3], [9, 5], [14, 8], [15, 13]]) got[id] = 1765000000 + day * 86400
const progress = read(`${defsDir}/TROP.XML`).replace(/<trophy(\s[^>]*?)>/g, (_, attrs) => {
  const id = +(/id="(\d+)"/.exec(attrs)?.[1] ?? -1)
  attrs = attrs.replace(/\s+unlockstate="[^"]*"/, "").replace(/\s+timestamp="[^"]*"/, "")
  return `<trophy${attrs}${got[id] ? ` unlockstate="true" timestamp="${got[id]}"` : ""}>`
})
const state = {
  ok: true, root: GAME, npcommid: "trophy00", user: PROFILE, source: "launcher", icons: true,
  progress, localized: read(`${defsDir}/TROP_17.XML`),
  version: pkg.version, engine: pkg.engine,
  playtime: 8740, last_played: 1792360437, saves_dir: `${GAME}/user/profiles/${PROFILE}`,
}
const releases = await (await fetch("https://api.github.com/repositories/1414718338/releases?per_page=30", {
  headers: { "User-Agent": "bbpc-preview", Accept: "application/vnd.github+json" },
})).text()
const strings = JSON.parse(read(path.join(here, "../steam-strings.json"))).brazilian
const icons = `file://${GAME}/user/game_data/CUSA00900/TrophyFiles/trophy00/Icons/`
const grid = `${STEAM}/userdata/${ACCOUNT_ID}/config/grid/${SHORTCUT_APP_ID}`
const art = { hero: `file://${grid}_hero.png`, icon: `file://${GAME}/user/trophy/NPWR05818_00/Icons/ICON0.PNG` }
const mock = { art, appid: SHORTCUT_APP_ID, accountid: Number(ACCOUNT_ID), state, releases, iconBase: icons, strings, persona: { name: "Player", avatar: `${icons}ICON0.PNG` } }

const M = JSON.parse(read(path.join(here, "../steam-classes.json")))
const c = (mod, ...keys) => keys.map((k) => M[mod][k]).filter(Boolean).join(" ")
const stat = (kind, label, value) => `
      <div class="${c("playbar", "GameStat", kind)}" data-native="${kind}"><div class="${c("playbar", "GameStatRight")}">
        <div class="${c("playbar", "PlayBarLabel")}">${label}</div><div class="${c("playbar", "PlayBarDetailLabel", kind === "LastPlayed" ? "LastPlayedInfo" : "PlaytimeInfo")}">${value}</div>
      </div></div>`
const html = `<!doctype html><html lang="${process.env.PREVIEW_LANG || "pt-BR"}"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${STEAM}/steamui/css/sp.css">
<link rel="stylesheet" href="file://${STEAM}/steamui/css/library.css">
<style>
  html, body { margin: 0; background: #1b1f25; color: #dcdedf; font-family: "Motiva Sans", Arial, Helvetica, sans-serif; width: 1640px; }
  .hero { height: 300px; background: url("file://${grid}_hero.png") center/cover; position: relative; }
  .hero h1 { position: absolute; left: 60px; top: 150px; margin: 0; font: 400 92px Georgia, serif; color: #f4f1ea; letter-spacing: -2px; }
  .playbar { display: flex; align-items: center; gap: 24px; padding: 14px 24px; background: rgba(14, 20, 27, .65); }
  .play { background: linear-gradient(90deg, #47bf28, #3a9f23); color: #fff; font-size: 20px; padding: 13px 40px; border-radius: 2px; letter-spacing: .06em; }
  .notice { border: 2px dashed #4c535c; padding: 30px 14px; font-size: 13px; color: #b8bcbf; margin: 10px; }
</style></head><body>
<div class="${c("layout", "Container")}">
  <div class="hero"></div>
  <div class="${c("playbar", "Container", "InPage")}"><div class="playbar">
    <div class="play">▶ JOGAR</div>
    <div class="${c("playbar", "GameStatsSection")}" style="display:flex;gap:28px;align-items:center">${stat("LastPlayed", "Última sessão", "hoje")}${stat("Playtime", "Tempo de jogo", "5 minutos")}
    </div></div></div>
  <div class="${c("layout", "ColumnContainer")}">
    <div class="${c("layout", "RightColumn")}">
      <div class="Panel ${c("section", "AppDetailsSection")}">
        <h2 class="${c("reset", "Reset")} ${c("header", "SectionHeader", "PadLeft")}"><div class="${c("header", "Label")}"><div class="${c("header", "LabelText")}">Anotações</div></div></h2>
        <div class="Panel ${c("section", "AppDetailsSectionContainer", "AppDetailsSectionHasLabel", "RightColumnSection")}">
          <div class="${c("section", "Body")}" style="font-size:13px;font-style:italic;padding:12px">Sem título</div></div>
      </div>
    </div>
    <div class="${c("layout", "LeftColumn")}">
      <div class="${M.layout.SeekTarget}"><div class="notice _1TGl52GwsFQg3CXUYvThP-">Algumas informações detalhadas sobre Bloodborne estão indisponíveis por ser um jogo ou uma mod não Steam.</div></div>
    </div>
  </div>
</div>
<script>window.__MOCK = ${JSON.stringify(mock).replace(/</g, "\\u003c")};</script>
<script src="bundle.js"></script>
</body></html>`
fs.writeFileSync(path.join(out, "page.html"), html)

const esbuild = path.join(here, "../../node_modules/.bin/esbuild")
execFileSync(esbuild, [path.join(here, "entry.jsx"), "--bundle", "--format=iife", `--outfile=${path.join(out, "bundle.js")}`,
  `--alias:@steambrew/client=${path.join(here, "mock-client.js")}`, "--log-level=warning", `--define:process.env.NODE_ENV="development"`],
  { stdio: "inherit", env: { ...process.env, NODE_PATH: path.join(here, "node_modules") } })
console.log("built", path.join(out, "page.html"))
