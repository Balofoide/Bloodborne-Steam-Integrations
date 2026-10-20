import { openExternal } from "./api"
import { isPt } from "./i18n"

// UX guidance: what to tell the user when Bloodborne is not in the
// library, its folder moved, or it has no trophy data yet, plus the native
// Steam actions that fix each case.

export const LANTERN_RELEASES = "https://github.com/Awakenchan/LanternEngine/releases"

interface SteamClientLike {
  URL?: { ExecuteSteamURL?(url: string): void }
  Apps?: { OpenAppSettingsDialog?(appid: number, section: string): void }
}
// Not named "client": millennium-ttc finds the SDK import by that exact name.
const steamClient = () => (window as { SteamClient?: SteamClientLike }).SteamClient

/** Steam's own "Adicionar um jogo não Steam" dialog. */
export function openAddNonSteamGame() {
  steamClient()?.URL?.ExecuteSteamURL?.("steam://open/addnonsteamgame")
}

/** The shortcut's Properties (target, start folder, name). */
export function openShortcutProperties(appid: string) {
  steamClient()?.Apps?.OpenAppSettingsDialog?.(Number(appid), "")
}

export function openLibraryPage(appid: string) {
  steamClient()?.URL?.ExecuteSteamURL?.(`steam://nav/games/details/${appid}`)
}

export function openLanternReleases() {
  openExternal(LANTERN_RELEASES)
}

const pt = {
  product: "Bloodborne",
  notFoundTitle: "Bloodborne não está na biblioteca",
  notFoundSteps: [
    "No Lantern Engine, abra a aba Game e clique em Add to Steam.",
    "Abra o jogo uma vez para os troféus aparecerem aqui.",
  ],
  missingTitle: "Arquivos do jogo não encontrados",
  missingBody: (path: string) => `O atalho aponta para ${path}, que não existe mais. Corrija o destino nas propriedades do atalho ou adicione o jogo de novo pelo Lantern Engine.`,
  otherWorks: "Outro atalho do Bloodborne está funcionando; este pode ser removido.",
  noDataTitle: "Troféus indisponíveis",
  noDataBody: (_path: string) => "Abra o jogo uma vez pelo Steam para carregar os troféus.",
  addNonSteam: "Adicionar manualmente",
  properties: "Propriedades do atalho",
  openOther: "Abrir o outro atalho",
  download: "Baixar Lantern Engine",
  foundTitle: "Artes do SteamGridDB",
  foundBody: "Opcional: informe uma chave da API para baixar capa, fundo, logo e ícone do jogo.",
  foundNoData: "Os troféus aparecem depois que você abrir o jogo uma vez.",
  sgdbOptional: "",
  saveAndApply: "Salvar",
  later: "Agora não",
  dontShow: "Não mostrar novamente",
  close: "OK",
  closeLabel: "Fechar",
  applying: "Baixando…",
  setupAgain: "Abrir",
  keyPlaceholder: "Chave da API",
  getKey: "Obter chave",
}
const en: typeof pt = {
  product: "Bloodborne",
  notFoundTitle: "Bloodborne is not in your library",
  notFoundSteps: [
    "In Lantern Engine, open the Game tab and click Add to Steam.",
    "Launch the game once for its trophies to show up here.",
  ],
  missingTitle: "Game files not found",
  missingBody: (path) => `The shortcut points to ${path}, which no longer exists. Fix the target in the shortcut's properties or add the game again from Lantern Engine.`,
  otherWorks: "Another Bloodborne shortcut works; this one can be removed.",
  noDataTitle: "Trophies unavailable",
  noDataBody: () => "Launch the game once from Steam to load its trophies.",
  addNonSteam: "Add manually",
  properties: "Shortcut properties",
  openOther: "Open the other shortcut",
  download: "Download Lantern Engine",
  foundTitle: "SteamGridDB artwork",
  foundBody: "Optional: enter an API key to download the game's capsule, hero, logo and icon.",
  foundNoData: "Trophies show up after you launch the game once.",
  sgdbOptional: "",
  saveAndApply: "Save",
  later: "Not now",
  dontShow: "Don't show again",
  close: "OK",
  closeLabel: "Close",
  applying: "Downloading…",
  setupAgain: "Open",
  keyPlaceholder: "API key",
  getKey: "Get a key",
}

export const g = isPt ? pt : en

/** Path as Windows shows it. */
export const winPath = (p?: string) => (p ?? "").replace(/\//g, "\\")
