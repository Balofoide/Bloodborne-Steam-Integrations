function detectLocale(): string {
  const doc = typeof document !== "undefined" ? document.documentElement?.lang : ""
  return (doc || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase()
}

const locale = detectLocale()
export const isPt = locale.startsWith("pt")

/** PS4 language index used by TROP_XX.XML ("" = default TROP.XML). */
export function trophyLanguageIndex(): string {
  if (locale.startsWith("pt-br") || locale === "pt") return "17"
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
  achievements: "Conquistas",
  unlockedOf: (a: number, b: number, pct: number) => `Você desbloqueou ${a} de ${b} (${pct}%)`,
  lockedAchievements: "Conquistas bloqueadas",
  hiddenRemaining: (n: number) => (n === 1 ? "1 conquista oculta restante" : `${n} conquistas ocultas restantes`),
  viewAll: "Ver minhas conquistas",
  hiddenName: "Conquista oculta",
  hiddenDetail: "Os detalhes desta conquista serão revelados quando ela for desbloqueada.",
  showHidden: "Mostrar ocultas",
  unlockedOn: (d: string) => `Desbloqueada em ${d}`,
  unlocked: "Desbloqueadas",
  locked: "Bloqueadas",
  baseGame: "Jogo base",
  activity: "Atividade",
  updates: "Atualizações",
  achievementUnlocked: "Conquista desbloqueada",
  patchNotes: "Notas de atualização",
  prerelease: "Versão beta",
  readMore: "Ler mais",
  viewOnGithub: "Ver todas no GitHub",
  updateAvailable: (v: string) => `Atualização disponível: ${v}`,
  betaAvailable: (v: string) => `Nova versão beta disponível: ${v}`,
  upToDate: "Você está com a versão mais recente",
  installed: (v: string) => `Instalada: v${v}`,
  noActivity: "Nenhuma atividade ainda. Os troféus que você desbloquear no jogo aparecem aqui.",
  close: "Fechar",
  today: "Hoje",
  yesterday: "Ontem",
  tiers: { P: "Platina", G: "Ouro", S: "Prata", B: "Bronze" } as Record<string, string>,
}

const en: typeof pt = {
  achievements: "Achievements",
  unlockedOf: (a, b, pct) => `You've unlocked ${a} of ${b} (${pct}%)`,
  lockedAchievements: "Locked achievements",
  hiddenRemaining: (n) => (n === 1 ? "1 hidden achievement remaining" : `${n} hidden achievements remaining`),
  viewAll: "View my achievements",
  hiddenName: "Hidden achievement",
  hiddenDetail: "Details for this achievement will be revealed once unlocked.",
  showHidden: "Show hidden",
  unlockedOn: (d) => `Unlocked ${d}`,
  unlocked: "Unlocked",
  locked: "Locked",
  baseGame: "Base game",
  activity: "Activity",
  updates: "Updates",
  achievementUnlocked: "Achievement unlocked",
  patchNotes: "Patch notes",
  prerelease: "Beta build",
  readMore: "Read more",
  viewOnGithub: "View all on GitHub",
  updateAvailable: (v) => `Update available: ${v}`,
  betaAvailable: (v) => `New beta available: ${v}`,
  upToDate: "You're on the latest version",
  installed: (v) => `Installed: v${v}`,
  noActivity: "No activity yet. Trophies you unlock in game show up here.",
  close: "Close",
  today: "Today",
  yesterday: "Yesterday",
  tiers: { P: "Platinum", G: "Gold", S: "Silver", B: "Bronze" },
}

export const t = isPt ? pt : en

const dateFmt = new Intl.DateTimeFormat(isPt ? "pt-BR" : undefined, { day: "numeric", month: "short", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat(isPt ? "pt-BR" : undefined, { hour: "2-digit", minute: "2-digit" })

export function formatDateTime(ms: number): string {
  return `${dateFmt.format(ms)}, ${timeFmt.format(ms)}`
}

export function formatDay(ms: number): string {
  const day = new Date(ms); day.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return t.today
  if (diff === 1) return t.yesterday
  return dateFmt.format(ms)
}
