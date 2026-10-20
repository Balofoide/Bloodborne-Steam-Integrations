// Screenshots the preview page: full page, a hover card, and the achievements overlay.
import path from "node:path"
import { chromium } from "playwright"

const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`
const browser = await chromium.launch({ executablePath: exe, args: ["--allow-file-access-from-files"] })
const page = await browser.newPage({ viewport: { width: 1640, height: 1100 } })
page.on("console", (m) => { if (!/DevTools/.test(m.text())) console.log("console:", m.text()) })
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message))
await page.goto(`file://${out}/page.html`)
await page.waitForTimeout(4000)
console.log(JSON.stringify(await page.evaluate(() => ({
  mounts: [...document.querySelectorAll("[data-bbpc]")].map((e) => e.getAttribute("data-bbpc")).filter((x) => x && x !== "section"),
  noticeHidden: getComputedStyle(document.querySelector("[data-bbpc-notice]") ?? document.body).display,
  stat: document.getElementById("bbpc-stat")?.innerText.replace(/\n/g, " "),
  icons: [...document.querySelectorAll("[data-bbpc] img")].filter((i) => i.naturalWidth > 0).length,
}))))
await page.screenshot({ path: `${out}/page.png`, fullPage: true })
console.log("overview after stats:", JSON.stringify(await page.evaluate(() => window.__overview)))
const icon = page.locator('[data-bbpc="achievements"] img').first()
await icon.hover()
await page.waitForTimeout(400)
const box = await icon.boundingBox()
await page.screenshot({ path: `${out}/hover.png`, clip: { x: Math.max(0, box.x - 470), y: Math.max(0, box.y - 60), width: 900, height: 360 } })
await page.click("#bbpc-stat")
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/overlay.png` })
console.log("overlay hero:", await page.evaluate(() => {
  const img = [...document.querySelectorAll('[data-bbpc="overlay"] img')].find((i) => /_hero\./.test(i.src))
  return img ? `${img.src.split("/").pop()} loaded=${img.naturalWidth > 0}` : "none"
}))
console.log("tabs:", await page.locator('[data-bbpc="overlay"] [role="tab"]').allInnerTexts())
await page.fill('[data-bbpc="overlay"] input', "eminente")
await page.waitForTimeout(300)
console.log("rows matching 'eminente':", await page.locator('[data-bbpc="overlay"] [class*="AchievementListItemBase"], [data-bbpc="overlay"] ._2Kmn7fJOkLT4KyWl467a9M').count())
await page.screenshot({ path: `${out}/overlay-search.png` })
await page.fill('[data-bbpc="overlay"] input', "")
await page.keyboard.press("Escape")
await page.waitForTimeout(200)
console.log("overlay after Esc:", await page.locator('[data-bbpc="overlay"]').count())

// Event viewer: click the second patch-notes card in the feed.
await page.locator('[data-bbpc="feed"] [style*="cursor: pointer"]').nth(1).click()
await page.waitForTimeout(1200)
console.log("event cards:", await page.locator('[data-bbpc="event"] [data-tag]').count())
await page.screenshot({ path: `${out}/event.png` })
await page.mouse.wheel(0, 900)
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/event-scrolled.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(200)
console.log("event after Esc:", await page.locator('[data-bbpc="event"]').count())
// SteamGridDB flow with the simulated backend.
console.log("artwork report:", JSON.stringify(await page.evaluate(async () => {
  window.__art.settings.key = "test-key"
  const r = await window.__art.applyArtwork(window.__MOCK.appid, "Bloodborne", false)
  return { r, calls: window.__steamCalls }
})))
const s = page.locator("#settings-preview")
await s.scrollIntoViewIfNeeded()
await s.screenshot({ path: `${out}/settings.png` })
await browser.close()
