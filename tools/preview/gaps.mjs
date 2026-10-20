// Measures the vertical gap between consecutive feed events in the preview.
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } })
await page.goto(`file://${out}/page.html`)
await page.waitForTimeout(3500)
console.log(JSON.stringify(await page.evaluate(() => {
  const days = [...document.querySelectorAll('[data-bbpc="feed"] [role="region"]')]
  return days.map((day) => {
    const events = [...day.children[1].children]
    return events.slice(1).map((e, i) => Math.round(e.getBoundingClientRect().top - events[i].getBoundingClientRect().bottom))
  }).filter((g) => g.length)
})))
const feed = page.locator('[data-bbpc="feed"]')
const box = await feed.boundingBox()
await page.screenshot({ path: `${out}/feed.png`, clip: { x: box.x, y: box.y, width: box.width, height: 640 } })
await browser.close()
