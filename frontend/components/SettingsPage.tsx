import React, { useEffect, useState } from "react"
import { findBloodborne, openExternal, type BloodborneShortcut } from "../api"
import { applyArtwork, settings, type ArtReport } from "../artwork"
import { g, openAddNonSteamGame, openLanternReleases } from "../guide"
import { isPt, t } from "../i18n"
import { openSetup } from "../setup-bus"
import { css } from "../steam/classes"
import { selfAccountId } from "../steam/persona"
import { formatPlaytime } from "../stats"
import { ActionButton } from "./GuideNotice"
import { BodyText, Button, Field, SectionHeader, TextField, ToggleField } from "./SettingsUI"

// Plugin options in Millennium's settings, laid out with Steam's own settings
// controls. The plugin is for Bloodborne only: one game, no game list.

const KEY_URL = "https://www.steamgriddb.com/profile/preferences/api"

const pt = {
  intro: "Mostra os troféus do Bloodborne como conquistas e as atualizações do Lantern Engine na página do jogo.",
  library: "Biblioteca",
  ready: (_name: string, profile?: string) => (profile ? `Perfil do launcher: ${profile}` : "Pronto"),
  noData: (_name: string) => "Abra o jogo uma vez para carregar os troféus.",
  notFound: "Não encontrado. No Lantern Engine, use Add to Steam na aba Game.",
  playtime: "Tempo de jogo",
  playtimeDesc: (_profile: string) => "Contado pelo launcher, inclusive as sessões iniciadas pelo Steam.",
  setup: "Configuração inicial",
  setupDesc: "",
  artwork: "Artes do SteamGridDB",
  key: "Chave da API",
  keyDesc: "Opcional.",
  getKey: "Obter chave",
  auto: "Completar artes ausentes",
  autoDesc: "Baixa só o que ainda não foi personalizado.",
  replace: "Substituir todas as artes",
  replaceDesc: "Prioriza logo e ícone oficiais e arte nos tamanhos do Steam.",
  working: "Baixando…",
  nothing: "Nada para aplicar.",
}
const en: typeof pt = {
  intro: "Shows Bloodborne's trophies as achievements and Lantern Engine's updates on the game page.",
  library: "Library",
  ready: (_name, profile) => (profile ? `Launcher profile: ${profile}` : "Ready"),
  noData: () => "Launch the game once to load its trophies.",
  notFound: "Not found. In Lantern Engine, use Add to Steam on the Game tab.",
  playtime: "Playtime",
  playtimeDesc: () => "Counted by the launcher, including sessions started from Steam.",
  setup: "First-run setup",
  setupDesc: "",
  artwork: "SteamGridDB artwork",
  key: "API key",
  keyDesc: "Optional.",
  getKey: "Get a key",
  auto: "Fill in missing artwork",
  autoDesc: "Only downloads what you have not customised.",
  replace: "Replace all artwork",
  replaceDesc: "Official logo and icon first, then artwork at Steam's sizes.",
  working: "Downloading…",
  nothing: "Nothing to apply.",
}
const s = isPt ? pt : en

function Report({ r }: { r: ArtReport }) {
  if (!r.applied.length && !r.errors.length) return <>{s.nothing}</>
  return (
    <>
      {r.game && <div>{r.game}</div>}
      {r.applied.map((k) => <div key={k}>✓ {t.artKinds[k]}{r.picked[k] ? ` — ${r.picked[k]}` : ""}</div>)}
      {r.errors.map((e, i) => <div key={i} style={{ color: "#e5604f" }}>{e}</div>)}
    </>
  )
}

export function SettingsPage() {
  const [key, setKey] = useState(settings.key)
  const [auto, setAuto] = useState(settings.auto)
  const [game, setGame] = useState<BloodborneShortcut | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ArtReport | null>(null)

  useEffect(() => {
    let alive = true
    findBloodborne(selfAccountId()).then((v) => alive && setGame(v))
    return () => { alive = false }
  }, [])

  const replace = async () => {
    if (!game?.appid) return
    setBusy(true)
    try {
      setReport(await applyArtwork(game.appid, game.name || "Bloodborne", true))
    } finally {
      setBusy(false)
    }
  }

  const name = game?.name || "Bloodborne"
  const status = !game ? "…" : !game.found ? s.notFound : game.ready ? s.ready(name, game.profile) : s.noData(name)

  // Steam scopes section-header, spacing and separator styles to its dialog
  // content container, so the page provides one (a no-op if already nested).
  return (
    <div className={css("field").GamepadDialogContent} style={{ padding: 0 }}>
      <BodyText>{s.intro}</BodyText>

      <SectionHeader>{g.product}</SectionHeader>
      <Field label={s.library} description={status} below={game ? !game.found : false}>
        {game && !game.found && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ActionButton primary onClick={openAddNonSteamGame}>{g.addNonSteam}</ActionButton>
            <ActionButton onClick={openLanternReleases}>{g.download}</ActionButton>
          </div>
        )}
      </Field>
      {game?.ready && game.playtime !== undefined && (
        <Field label={`${s.playtime}: ${formatPlaytime(game.playtime)}`} description={s.playtimeDesc(game.profile || "Main")} />
      )}
      <Field label={s.setup} below>
        <Button onClick={(e) => openSetup(e?.currentTarget.ownerDocument)}>{g.setupAgain}</Button>
      </Field>

      <SectionHeader>{s.artwork}</SectionHeader>
      <TextField
        label={s.key}
        description={
          <>
            {s.keyDesc}{" "}
            <a href={KEY_URL} style={{ color: "#1a9fff" }} onClick={(e) => { e.preventDefault(); openExternal(KEY_URL) }}>{s.getKey}</a>
          </>
        }
        value={key}
        password
        onChange={(v) => { setKey(v); settings.key = v }}
      />
      <ToggleField label={s.auto} description={s.autoDesc} checked={auto} onChange={(v) => { setAuto(v); settings.auto = v }} />
      {game?.found && (
        <Field description={report ? <Report r={report} /> : s.replaceDesc} below>
          <Button onClick={replace} disabled={!key || busy}>{busy ? s.working : s.replace}</Button>
        </Field>
      )}
    </div>
  )
}
