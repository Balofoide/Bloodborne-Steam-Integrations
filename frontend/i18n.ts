import { L, locales } from "./steam/l10n"

// Steam's own strings come from steam/l10n.ts. This file only holds what
// Steam has no string for (PlayStation trophy grades, the installed build…)
// plus the trophy-language and date helpers.

function detectLocale(): string {
  const doc = typeof document !== "undefined" ? document.documentElement?.lang : ""
  return (locales()?.[0] || doc || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase()
}

const locale = detectLocale()
export const isPt = locale.startsWith("pt")

/** PS4 language index used by TROP_XX.XML ("" = default TROP.XML). */
export function trophyLanguageIndex(): string {
  if (locale.startsWith("pt-br") || locale === "pt" || locale === "brazilian") return "17"
  if (locale.startsWith("pt")) return "07"
  if (locale.startsWith("es-419") || locale.startsWith("es-mx")) return "20"
  const map: Record<string, string> = {
    ja: "00", fr: "02", es: "03", de: "04", it: "05", nl: "06", ru: "08", ko: "09",
    fi: "12", sv: "13", da: "14", no: "15", nb: "15", pl: "16", tr: "19",
  }
  if (locale.startsWith("zh")) return locale.includes("tw") || locale.includes("hant") ? "10" : "11"
  return map[locale.slice(0, 2)] ?? ""
}

const pt = {
  tiers: { P: "Troféu de platina", G: "Troféu de ouro", S: "Troféu de prata", B: "Troféu de bronze" } as Record<string, string>,
  installed: (v: string) => `Versão instalada: v${v}`,
  noActivity: "Nenhuma atividade ainda. Os troféus que você alcançar no jogo aparecem aqui.",
  you: "Você",
  artKinds: { capsule: "Capa", header: "Capa horizontal", hero: "Fundo", logo: "Logo", icon: "Ícone" } as Record<string, string>,
  artErrors: {
    no_key: "Informe a chave da API do SteamGridDB nas configurações do plugin.",
    bad_key: "Chave da API do SteamGridDB inválida.",
    no_client: "API do cliente Steam indisponível.",
    not_found: (name: string) => `"${name}" não encontrado no SteamGridDB.`,
    network: "Falha de rede",
    http: "O SteamGridDB respondeu HTTP",
    download: "Falha no download",
    empty_file: "Arquivo vazio.",
    too_large: "Imagem grande demais.",
    bad_request: "Pedido inválido.",
    url_not_allowed: "Endereço de imagem não permitido.",
    bad_response: "Resposta inválida do SteamGridDB.",
    icon: "Não foi possível salvar o ícone.",
  },
}

const en: typeof pt = {
  tiers: { P: "Platinum trophy", G: "Gold trophy", S: "Silver trophy", B: "Bronze trophy" },
  installed: (v) => `Installed version: v${v}`,
  noActivity: "No activity yet. Trophies you unlock in game show up here.",
  you: "You",
  artKinds: { capsule: "Capsule", header: "Wide capsule", hero: "Hero", logo: "Logo", icon: "Icon" },
  artErrors: {
    no_key: "Enter a SteamGridDB API key in the plugin settings.",
    bad_key: "Invalid SteamGridDB API key.",
    no_client: "Steam client API unavailable.",
    not_found: (name) => `"${name}" was not found on SteamGridDB.`,
    network: "Network error",
    http: "SteamGridDB responded with HTTP",
    download: "Download failed",
    empty_file: "Empty file.",
    too_large: "Image too large.",
    bad_request: "Invalid request.",
    url_not_allowed: "Image address not allowed.",
    bad_response: "Invalid response from SteamGridDB.",
    icon: "Could not save the icon.",
  },
}

export const t = isPt ? pt : en

/** Backend/artwork error code ("bad_key", "download: timeout"…) → text. */
export function artErrorText(code: string): string {
  const [head, ...rest] = code.split(": ")
  const detail = rest.join(": ")
  const known = (t.artErrors as Record<string, unknown>)[head]
  if (typeof known !== "string") return code
  return detail ? `${known}: ${detail}` : known
}

const prefs = () => locales() ?? (isPt ? ["pt-BR"] : undefined)

/** Steam's achievement date style, e.g. "17 de dez. de 2025". */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(prefs(), { day: "numeric", month: "short", year: "numeric" })
}

/** Activity day label like Steam's LocalizeRTimeToDateWithRelative. */
export function formatDay(ms: number): string {
  const day = new Date(ms); day.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return L("Time_Today")
  if (diff === 1) return L("Time_Yesterday")
  const sameYear = day.getFullYear() === today.getFullYear()
  return day.toLocaleDateString(prefs(), sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" })
}
