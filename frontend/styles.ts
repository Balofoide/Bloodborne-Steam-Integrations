const STYLE_ID = "bbpc-style"

// Almost all styling comes from Steam's own stylesheet (the injected sections
// use Steam's CSS-module classes). Only plugin-specific glue lives here.
const CSS = `
html[data-bbpc-active] [data-bbpc-notice] { display: none !important; }
#bbpc-stat { cursor: pointer; }
[data-bbpc="overlay"] [role="button"] { cursor: pointer; }
`

export function ensureStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = STYLE_ID
  style.textContent = CSS
  ;(doc.head || doc.documentElement).appendChild(style)
}
