// Dev test: SteamGridDB candidate ranking (frontend/artwork.ts rankAssets).
//   node tools/test-artwork.mjs
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, "preview", "out", "artwork.test.mjs")
fs.mkdirSync(path.dirname(out), { recursive: true })
execFileSync(path.join(here, "../node_modules/.bin/esbuild"), [path.join(here, "../frontend/artwork.ts"), "--bundle", "--format=esm",
  "--platform=node", `--outfile=${out}`, `--alias:@steambrew/client=${path.join(here, "preview/mock-client.js")}`, "--log-level=error"])
const { rankAssets } = await import(out)

let failed = 0
const check = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) failed++ }
const a = (id, score, extra = {}) => ({ id, url: `u${id}`, score, width: 600, height: 900, ...extra })

check("higher score first", rankAssets([a(1, 2), a(2, 9), a(3, 5)]).map((x) => x.id).join() === "2,3,1")
check("tie → English/no language before localized", rankAssets([a(1, 4, { language: "ja" }), a(2, 4, { language: "en" })])[0].id === 2)
check("tie → higher resolution first", rankAssets([a(1, 3, { width: 1920, height: 620 }), a(2, 3, { width: 3840, height: 1240 })])[0].id === 2)
const pool = [a(1, 9, { author: { name: "X" } }), a(2, 3, { author: { name: "Capsule author" } })]
check("prefers the capsule's author when well rated", rankAssets(pool, "Capsule author")[0].id === 2)
check("ignores that author when they only have negative scores",
  rankAssets([a(1, 9), a(2, -1, { author: { name: "Capsule author" } })], "Capsule author")[0].id === 1)
check("keeps every candidate (for retries)", rankAssets(pool, "Capsule author").length === 2)
check("missing score counts as 0", rankAssets([a(1, undefined), a(2, 1)])[0].id === 2)
console.log(`\n${failed} failure(s)`)
process.exit(failed ? 1 : 0)
