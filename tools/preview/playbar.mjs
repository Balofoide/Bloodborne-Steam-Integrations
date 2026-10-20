// Play bar stats: Steam's own (lower) values corrected, and stand-ins on a fresh shortcut.
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
for (const hash of ["ready", "fresh"]) {
  const page = await browser.newPage({ viewport: { width: 1640, height: 900 } })
  page.on("pageerror", (e) => console.log(`[${hash}] PAGEERROR:`, e.message))
  await page.goto(`file://${out}/page.html#${hash}`)
  await page.waitForTimeout(3500)
  await page.evaluate(() => document.querySelectorAll('[data-bbpc="setup"]').forEach((e) => e.remove()))
  const stats = await page.evaluate(() => [...document.querySelector("[data-native], #bbpc-stat")?.parentElement?.children ?? []]
    .map((e) => e.innerText.replace(/\n/g, " ")))
  console.log(hash, JSON.stringify(stats))
  const bar = await page.locator("#bbpc-stat").evaluate((e) => e.parentElement.parentElement.getBoundingClientRect().toJSON())
  await page.screenshot({ path: `${out}/playbar-${hash}.png`, clip: { x: 0, y: bar.y - 10, width: 1100, height: bar.height + 20 } })
  await page.close()
}
await browser.close()
