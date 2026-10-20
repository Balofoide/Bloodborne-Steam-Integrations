// Locked achievements must render greyed (Steam uses grey icons for them).
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } })
await page.goto(`file://${out}/page.html#ready`)
await page.waitForTimeout(3500)
await page.evaluate(() => document.querySelectorAll('[data-bbpc="setup"]').forEach((e) => e.remove()))
const card = await page.locator('[data-bbpc="achievements"]').boundingBox()
await page.screenshot({ path: `${out}/locked-card.png`, clip: card })
await page.click("#bbpc-stat")
await page.waitForTimeout(1200)
const title = page.locator('[data-bbpc="overlay"] >> text=Conquistas não alcançadas')
await title.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const box = await title.boundingBox()
await page.screenshot({ path: `${out}/locked-list.png`, clip: { x: box.x - 20, y: box.y - 120, width: 830, height: 380 } })
console.log(JSON.stringify(await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('[data-bbpc="overlay"] img')].filter((i) => !/_hero/.test(i.src))
  return { grey: imgs.filter((i) => i.style.filter === "grayscale(1)").length, colour: imgs.filter((i) => !i.style.filter).length }
})))
await browser.close()
