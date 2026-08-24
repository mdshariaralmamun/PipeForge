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
- Plan (Top), elevation (Front/Side), isometric and 3D views of one 3D model,
  with a CAD-style mouse model: left-drag pans empty space or moves parts,
  right-drag orbits, right-drag stretches tube ends, Shift locks the axis,
  Esc cancels
- Schematic + dimensioned iso sheet (SVG), MTO with order notes (CSV)
- CAD exchange: DXF, vector-PDF and IFC4 export (DWG flagged via ODA File
  Converter), vendor PDF-catalog import with a review step, and DXF/PDF
  drawing underlays with two-point scale calibration
- AI chat designer (bring-your-own OpenAI-compatible key, works with Ollama):
  conversational copilot that explains the project and modifies it — adds parts,
  routes 3D tube runs (horizontal + vertical), removes parts, clears, undoes
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
