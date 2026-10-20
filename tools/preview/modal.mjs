// Setup dialog: centred, sized to its content, closes with the button, X and Esc.
import path from "node:path"
import { chromium } from "playwright"
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "out")
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`, args: ["--allow-file-access-from-files"] })
const errors = []
const result = {}
let page
for (const how of ["button", "x", "esc"]) {
  page = await (await browser.newContext({ viewport: { width: 1640, height: 1000 } })).newPage()
  page.on("pageerror", (e) => errors.push(e.message))
  const dialog = page.locator('[data-bbpc="setup"] [role="dialog"]')
  await page.goto(`file://${out}/page.html#ready`)
  await dialog.waitFor({ timeout: 10000 })
  if (how === "button") await page.screenshot({ path: `${out}/modal.png` })
  const b = await dialog.boundingBox()
  result[how] = b && { dx: Math.round(b.x + b.width / 2 - 820), dy: Math.round(b.y + b.height / 2 - 500), h: Math.round(b.height) }
  if (how === "button") await dialog.locator("text=Agora não").click()
  else if (how === "x") await dialog.locator('button[aria-label="Fechar"]').click()
  else await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  result[how].open = await page.locator('[data-bbpc="setup"] [role="dialog"]').count()
}
console.log(JSON.stringify({ result, errors }))
await browser.close()
