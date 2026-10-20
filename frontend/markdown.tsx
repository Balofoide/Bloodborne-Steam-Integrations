import React from "react"
import { openExternal, safeWebUrl } from "./api"
import { css, cx } from "./steam/classes"

// GitHub-flavoured Markdown (release notes) → the same elements and classes
// Steam's BBCode renderer emits for event bodies (sp.js, CSS module "bb"):
//   [p] → p.Paragraph   [h1] → h1.Header1.BB_Header1   [list] → ul.List.bullets
//   [*] → li.ListItem   [code] → code.CodeBlock        [b] → b.Bold   …
// so a changelog reads exactly like a Steam patch-notes event.

type Block =
  | { t: "p"; text: string }
  | { t: "h"; level: number; text: string }
  | { t: "hr" }
  | { t: "code"; text: string }
  | { t: "quote"; blocks: Block[] }
  | { t: "list"; ordered: boolean; items: Array<{ text: string; children: Block[] }> }

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n")
  const out: Block[] = []
  let i = 0
  const para: string[] = []
  const flush = () => { if (para.length) { out.push({ t: "p", text: para.join(" ") }); para.length = 0 } }

  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const body: string[] = []
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i])
      out.push({ t: "code", text: body.join("\n") })
      i++
      continue
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) { flush(); out.push({ t: "h", level: Math.min(5, h[1].length), text: h[2] }); i++; continue }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ t: "hr" }); i++; continue }
    if (/^\s*>/.test(line)) {
      flush()
      const body: string[] = []
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/, ""))
      out.push({ t: "quote", blocks: parseBlocks(body.join("\n")) })
      continue
    }
    const li = LIST_ITEM.exec(line)
    if (li) {
      flush()
      const base = li[1].length
      const ordered = /\d/.test(li[2])
      const items: Array<{ text: string; children: Block[] }> = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i])
        if (m && m[1].length <= base) {
          items.push({ text: m[3], children: [] })
          i++
          continue
        }
        // Deeper-indented lines (nested lists, continuation text) belong to the last item.
        if (items.length && lines[i].trim() && /^\s+/.test(lines[i]) && (lines[i].match(/^\s*/)?.[0].length ?? 0) > base) {
          const nested: string[] = []
          while (i < lines.length && lines[i].trim() && (lines[i].match(/^\s*/)?.[0].length ?? 0) > base) nested.push(lines[i++])
          const sub = parseBlocks(nested.map((l) => l.slice(Math.min(base + 2, l.length - l.trimStart().length))).join("\n"))
          const last = items[items.length - 1]
          if (sub.length === 1 && sub[0].t === "p") last.text += " " + sub[0].text
          else last.children.push(...sub)
          continue
        }
        break
      }
      out.push({ t: "list", ordered, items })
      continue
    }
    if (!line.trim()) { flush(); i++; continue }
    para.push(line.trim())
    i++
  }
  flush()
  return out
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(!?\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  const safeHref = safeWebUrl(href)
  if (!safeHref) return <>{children}</>
  return (
    <a href={safeHref} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternal(safeHref) }}>
      {children}
    </a>
  )
}

function inline(text: string, key = ""): React.ReactNode[] {
  const b = css("bb")
  const nodes: React.ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) nodes.push(text.slice(last, at))
    const k = `${key}${n++}`
    const [all, code, bold, strike, ital, link, url] = m
    if (code) nodes.push(<code className={b.Code} key={k}>{code.slice(1, -1)}</code>)
    else if (bold) nodes.push(<b className={b.Bold} key={k}>{inline(bold.slice(2, -2), k)}</b>)
    else if (strike) nodes.push(<s className={b.Strike} key={k}>{inline(strike.slice(2, -2), k)}</s>)
    else if (ital) nodes.push(<i className={cx(b.Italic, "BB_Italic")} key={k}>{inline(ital.slice(1, -1), k)}</i>)
    else if (link) {
      const lm = /^(!?)\[([^\]]*)\]\(([^)\s]+)/.exec(link)!
      const href = safeWebUrl(lm[3], lm[1] === "!")
      if (lm[1]) {
        if (href) nodes.push(<img className={b.Image} src={href} alt={lm[2]} key={k} />)
        else nodes.push(lm[2] || lm[3])
      } else if (href) nodes.push(<Link href={href} key={k}>{inline(lm[2], k)}</Link>)
      else nodes.push(lm[2] || lm[3])
    } else if (url) nodes.push(<Link href={url} key={k}>{url}</Link>)
    else nodes.push(all)
    last = at + all.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function render(blocks: Block[], key = ""): React.ReactNode[] {
  const b = css("bb")
  return blocks.map((blk, idx) => {
    const k = `${key}${idx}`
    switch (blk.t) {
      case "p":
        return <p className={b.Paragraph} key={k}>{inline(blk.text, k)}<wbr /></p>
      case "h": {
        const Tag = `h${blk.level}` as "h1"
        return <Tag className={cx(b[`Header${blk.level}`], `BB_Header${blk.level}`)} key={k}>{inline(blk.text, k)}</Tag>
      }
      case "hr":
        return <hr className={b.HR} key={k} />
      case "code":
        return <code className={b.CodeBlock} key={k}>{blk.text}</code>
      case "quote":
        return <blockquote className={b.BlockQuote} key={k}>{render(blk.blocks, k)}</blockquote>
      case "list": {
        const items = blk.items.map((it, j) => (
          <li className={b.ListItem} key={`${k}.${j}`}>{inline(it.text, `${k}.${j}`)}{render(it.children, `${k}.${j}c`)}</li>
        ))
        return blk.ordered
          ? <ol className={b.OrderedList} key={k}>{items}</ol>
          : <ul className={cx(b.List, "bullets")} key={k}>{items}</ul>
      }
    }
  })
}

export function Markdown({ text }: { text: string }) {
  return <>{render(parseBlocks(text))}</>
}

/** First paragraph as plain text, for event card summaries. */
export function summaryOf(md: string): string {
  const first = parseBlocks(md).find((x) => x.t === "p") as { text: string } | undefined
  return (first?.text ?? "").replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
}
