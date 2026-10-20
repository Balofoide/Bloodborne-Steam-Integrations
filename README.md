# Bloodborne PC Library

A Millennium plugin that brings local Bloodborne PC trophies, playtime, and Lantern Engine release updates to the Steam library page for non-Steam shortcuts.

![Bloodborne PC Library preview](docs/preview.png)

## Features

- Shows trophy progress, rarity, hidden trophies, icons, and unlock activity.
- Adds playtime and trophy progress to the library page.
- Displays Lantern Engine releases and highlights updates newer than the installed game version.
- Optionally downloads Steam artwork from SteamGridDB and applies it to the non-Steam shortcut.
- Supports English and Brazilian Portuguese, using Steam's interface language where available.

## Requirements

- Steam with [Millennium](https://steambrew.app) installed.
- A Bloodborne Port installation with trophy data from [Lantern Engine](https://github.com/Awakenchan/LanternEngine) or shadPS4.
- A Steam non-Steam shortcut that points to the game's folder.

The plugin reads the shortcut's executable and working directory to locate the game data. Trophy progress appears after the game has created its trophy files.

## Build from source

Install Node.js, then run:

```sh
npm ci
npm run build
```

The Millennium compiler writes the frontend bundle to `.millennium/Dist/`. Build output, dependency folders, local credentials, and development reference dumps are excluded from Git.

## Privacy

Trophy, save, profile, and playtime data are read from the local game installation. Trophy data is not uploaded to Steam or the plugin author, and these trophies do not appear as Steam achievements on a public profile.

The plugin requests Lantern Engine release information from GitHub. SteamGridDB artwork is optional: if enabled, the user's API key is stored in Steam's local storage and sent to SteamGridDB for artwork requests. It is not required for trophy tracking.

## Development

The `tools/` directory contains build helpers and local development utilities. The preview utility depends on the installed Steam client and local game data; generated preview output and locally extracted Steam data are ignored.

## Disclaimer

This is an unofficial community plugin. Bloodborne and related names and artwork belong to their respective owners. This project is not affiliated with or endorsed by Sony Interactive Entertainment, FromSoftware, Valve, Millennium, Lantern Engine, or shadPS4.

## License and forks

This project is available under the [ICU License](LICENSE), which permits forks and modifications, provides an "as is" warranty disclaimer and liability limitation, and restricts promotional use of copyright holders' names without permission. We ask independent forks to use a distinct project name, identify their maintainers, and make clear that they are not endorsed by this project. The license does not grant rights to Bloodborne, Steam, or third-party artwork.

Created as a community project to make the Bloodborne PC library page feel less empty.
