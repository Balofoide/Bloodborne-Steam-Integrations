// Build guard: every backend call in the bundle must carry the plugin name.
// millennium-ttc injects it into callable() only for named imports from
// @steambrew/client; when that silently fails, every RPC hits "plugin not
// running" and the library page stays empty (happened in 1.3.2).
import fs from "node:fs"

const bundle = fs.readFileSync(new URL("../.millennium/Dist/index.js", import.meta.url), "utf8")
const calls = [...bundle.matchAll(/\.callable\(([^,)]*)[,)]/g)].map((m) => m[1].trim())
const bad = calls.filter((first) => first !== "pluginName")
if (calls.length === 0 || bad.length) {
  console.error(`check-bundle: ${bad.length || "no"} callable() without pluginName (${calls.length} total): ${bad.join(", ")}`)
  console.error("  Known causes: a namespace import from @steambrew/client, or a top-level")
  console.error("  binding named `client` in any module (rollup then renames the SDK import).")
  process.exit(1)
}
console.log(`check-bundle: ${calls.length} callable() calls, all with pluginName`)
