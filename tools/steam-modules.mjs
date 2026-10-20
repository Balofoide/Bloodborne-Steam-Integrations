// Dev tool: list/inspect Steam's CSS-module export objects ({Key:"hash",...}) in steamui/sp.js.
//   node tools/steam-modules.mjs <sp.js> find Key1 Key2 ...   → every module containing all keys
//   node tools/steam-modules.mjs <sp.js> spec <spec.json>     → {name: module} for each name: [keys]
import fs from "node:fs"

const [, , bundle, mode, ...rest] = process.argv
const src = fs.readFileSync(bundle, "utf8")
const objects = []
const re = /exports\s*=\s*\{((?:[A-Za-z0-9_$"'-]+:"[^"]*",?)+)\}/g
for (let m; (m = re.exec(src)); ) {
  const obj = {}
  for (const kv of m[1].matchAll(/([A-Za-z0-9_$-]+|"[^"]+"):"([^"]*)"/g)) obj[kv[1].replace(/"/g, "")] = kv[2]
  objects.push(obj)
}
const NOISE = /^(Break|RightBreak|GamepadUI|duration-|ItemFocusAnim|focusAnimation|hoverAnimation|BackgroundAnimation|SpotlightBreak)/
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !NOISE.test(k)))

if (mode === "find") {
  const hits = objects.filter((o) => rest.every((k) => k in o)).map(clean)
  console.log(JSON.stringify(hits, null, 1))
} else if (mode === "spec") {
  const spec = JSON.parse(fs.readFileSync(rest[0], "utf8"))
  const out = {}
  for (const [name, keys] of Object.entries(spec)) {
    const hits = objects.filter((o) => keys.every((k) => k in o))
    if (hits.length !== 1) console.error(`${name}: ${hits.length} matches for ${keys.join(",")}`)
    if (hits[0]) out[name] = clean(hits[0])
  }
  console.log(JSON.stringify(out, null, 1))
}
console.error(`(${objects.length} module objects scanned)`)
