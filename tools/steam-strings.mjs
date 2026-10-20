// Dev tool: pull selected Steam UI strings (pt-BR + English) out of steamui/localization/*.js.
// The files are webpack chunks; they are run in an empty vm context that only captures the chunk.
import fs from "node:fs"
import vm from "node:vm"

const [, , dir, ...tokens] = process.argv
const out = {}
for (const lang of ["brazilian", "english"]) {
  const table = {}
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(`_${lang}-json.js`)).sort()) {
    const chunks = []
    const sandbox = { self: { webpackChunksteamui: { push: (c) => chunks.push(c) } } }
    vm.runInNewContext(fs.readFileSync(`${dir}/${file}`, "utf8"), sandbox, { timeout: 5000 })
    for (const [, modules] of chunks) {
      for (const fn of Object.values(modules)) {
        const mod = { exports: {} }
        fn(mod)
        for (const t of tokens) if (t in mod.exports && !(t in table)) table[t] = mod.exports[t]
      }
    }
  }
  const missing = tokens.filter((t) => !(t in table))
  if (missing.length) console.error(lang, "missing:", missing.join(" "))
  out[lang] = table
}
console.log(JSON.stringify(out, null, 1))
