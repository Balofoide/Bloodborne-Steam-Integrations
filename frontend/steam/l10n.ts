import { STRINGS } from "./strings.generated"

// Steam's own strings, in the client's language, via the global
// LocalizationManager. The generated pt-BR/English table covers the case
// where it is unavailable.

type Token = keyof (typeof STRINGS)["pt"]

interface LocalizationManager {
  LocalizeString?(token: string, suppressError?: boolean): string | undefined
  GetPreferredLocales?(): string[]
}

const manager = () => (window as { LocalizationManager?: LocalizationManager }).LocalizationManager

export function locales(): string[] | undefined {
  try { return manager()?.GetPreferredLocales?.() } catch { return undefined }
}

const lang = (): "pt" | "en" => {
  const l = (locales()?.[0] ?? (typeof navigator !== "undefined" ? navigator.language : "") ?? "").toLowerCase()
  return l.startsWith("pt") ? "pt" : "en"
}

function format(template: string, args: Array<string | number>): string {
  return template.replace(/%(\d+)\$s/g, (_, i) => String(args[Number(i) - 1] ?? ""))
}

export function L(token: Token, ...args: Array<string | number>): string {
  let text: string | undefined
  try { text = manager()?.LocalizeString?.(`#${token}`, true) } catch {}
  if (!text || text === `#${token}`) text = STRINGS[lang()][token] ?? STRINGS.en[token] ?? token
  return format(text, args)
}

/** Steam's plural convention: "<token>_Plural" when the count is not 1. */
export function Lp(token: Token, count: number, ...args: Array<string | number>): string {
  const plural = `${token}_Plural` as Token
  return count !== 1 && plural in STRINGS.en ? L(plural, count, ...args) : L(token, count, ...args)
}
