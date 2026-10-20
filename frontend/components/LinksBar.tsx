import React from "react"
import { openExternal } from "../api"
import { isPt } from "../i18n"
import { css, cx } from "../steam/classes"
import { L } from "../steam/l10n"
import { Section } from "./Section"

// Mirror of the links bar official games have under the play bar
// ("Página na loja · Central da Comunidade · Guias · Suporte", sp.js links
// module): section LinksSection > Body LinksSectionBody > Links > LinkInner >
// Anchor > Link > Text. Steam positions each link from JS; here they wrap.

const PROJECT = "https://github.com/Awakenchan/LanternEngine"

interface Props {
  root?: string
  savesDir?: string
  onLatestNews?: () => void
}

interface SteamSystem { OpenLocalDirectoryInSystemExplorer?(path: string): void }
const openFolder = (path: string) =>
  (window as { SteamClient?: { System?: SteamSystem } }).SteamClient?.System?.OpenLocalDirectoryInSystemExplorer?.(path.replace(/\//g, "\\"))

const text = isPt
  ? { project: "Página do projeto", releases: "Versões e downloads", saves: "Pasta de saves" }
  : { project: "Project page", releases: "Releases and downloads", saves: "Saves folder" }

export function LinksBar({ root, savesDir, onLatestNews }: Props) {
  const l = css("links")
  const links: Array<{ label: string; onClick: () => void }> = [
    ...(onLatestNews ? [{ label: L("AppActivity_ViewLatestNews"), onClick: onLatestNews }] : []),
    { label: text.project, onClick: () => openExternal(PROJECT) },
    { label: text.releases, onClick: () => openExternal(`${PROJECT}/releases`) },
    ...(root ? [{ label: L("GameAction_BrowseLocalFiles"), onClick: () => openFolder(root) }] : []),
    ...(savesDir ? [{ label: text.saves, onClick: () => openFolder(savesDir) }] : []),
  ]
  return (
    <Section className={l.LinksSection} bodyClassName={l.LinksSectionBody} rightColumn>
      <div className={cx("Panel", l.Links)} style={{ display: "flex", flexWrap: "wrap", height: "auto" }}>
        {links.map((x) => (
          <div className={l.LinkInner} key={x.label} style={{ position: "static" }}>
            <div className={cx("Panel", l.Anchor)} role="link" onClick={x.onClick} style={{ cursor: "pointer" }}>
              <div className={l.Link}><span className={l.Text}>{x.label}</span></div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
