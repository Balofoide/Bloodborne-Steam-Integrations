// Idle-cost check: with the page open and nothing changing, count webpack
// module lookups and React root renders over 15 s (ticks every 1.5 s).
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } })
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message))
await page.goto(`file://${out}/page.html`)
await page.waitForTimeout(5000)
const before = await page.evaluate(() => ({ lookups: window.__lookups, renders: window.__renders }))
await page.waitForTimeout(15000)
const after = await page.evaluate(() => ({ lookups: window.__lookups, renders: window.__renders, mounted: document.querySelectorAll("[data-bbpc]").length }))
console.log(JSON.stringify({ startup: before, idle15s: { lookups: after.lookups - before.lookups, renders: after.renders - before.renders }, mounted: after.mounted }))
await browser.close()
