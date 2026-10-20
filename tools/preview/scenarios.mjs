// Screenshots each UX scenario: ready (+ first-run SteamGridDB dialog),
// missing folder, no trophy data yet, Bloodborne not in the library.
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
for (const scenario of ["ready", "missing", "nodata", "notfound"]) {
  const page = await browser.newPage({ viewport: { width: 1640, height: 1000 } })
  page.on("pageerror", (e) => console.log(`[${scenario}] PAGEERROR:`, e.message))
  await page.goto(`file://${out}/page.html#${scenario}`)
  await page.waitForTimeout(4500) // the first-run dialog opens after 2.5 s
  const info = await page.evaluate(() => ({
    mounts: [...document.querySelectorAll("[data-bbpc]")].map((e) => e.getAttribute("data-bbpc")).filter((x) => x && x !== "section"),
    dialog: document.querySelector('[data-bbpc="setup"]')?.innerText.split("\n")[0] ?? null,
    guide: document.querySelector('[data-bbpc="guide"]')?.innerText.split("\n").slice(0, 2).join(" | ") ?? null,
  }))
  console.log(scenario, JSON.stringify(info))
  await page.screenshot({ path: `${out}/scenario-${scenario}.png` })
  if (info.dialog) {
    await page.locator('[data-bbpc="setup"] button').first().click()   // dismiss
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/scenario-${scenario}-page.png` })
  }
  const s = page.locator("#settings-preview")
  await s.screenshot({ path: `${out}/scenario-${scenario}-settings.png` })
  await page.close()
}
await browser.close()
