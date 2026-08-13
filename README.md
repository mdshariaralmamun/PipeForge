# PipeForge — 3D UHP / industrial piping designer

Browser-based 3D piping assembly designer: snap real catalog parts (Swagelok,
Uni-Lok, Vigor, Dockweiler ultron/TCC, GCE Druva, PP-H/HDPE) together, and get
isometric drawings with weld & bend schedules plus a complete Material Take-Off.

**Live app:** https://pipeforge.shariar.dev · **Manual:** /help

## Download the desktop app

| Windows | macOS | Linux |
| --- | --- | --- |
| [PipeForge-win.exe](https://github.com/mdshariaralmamun/PipeForge/releases/latest/download/PipeForge-win.exe) | [PipeForge-mac.dmg](https://github.com/mdshariaralmamun/PipeForge/releases/latest/download/PipeForge-mac.dmg) | [PipeForge-linux.AppImage](https://github.com/mdshariaralmamun/PipeForge/releases/latest/download/PipeForge-linux.AppImage) |

Installers are produced by the **Desktop installers** GitHub Actions workflow
(manual trigger) and uploaded to the rolling `desktop-latest` release.

## Features

- 3D snap-together assembly with real joining rules (compression, NPT, VCR
  face-seal, orbital weld, fusion, flange) and adapter suggestions
- Stretchable tube/pipe runs, auto weld-joint marking, bend formulas
- Dockable panels, dark/light theme, keyboard shortcuts, undo/redo
- Schematic + dimensioned iso sheet (SVG), MTO with order notes (CSV)
- AI designer (bring-your-own OpenAI-compatible key, works with Ollama)
- Accounts, per-user cloud projects, shared admin-approved catalog (Supabase)

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (standalone, for Docker)
npm run lint
```

## Desktop app

```bash
npm run desktop:start   # build + run locally
npm run desktop:dist    # build installer for the current OS
```

## Deploy

- Web (VPS, Docker + Caddy): see `DEPLOY.md`
- Accounts / cloud (Supabase): see `SUPABASE_SETUP.md`
