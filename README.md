# Warhammer 40,000 — Battle Guide v1.0

A **tabletop companion** to keep open while playing Warhammer 40,000 in real life. Walks both players through every phase and step from the Core Rules, with army-specific ability reminders pulled from roster files.

## Play locally (no Node.js, no server)

Double-click **`launch-offline.bat`** to play.

1. **Load Player 1 army** — upload a `.json` roster export (BattleScribe / New Recruit format)
2. **Load Player 2 army** — same format for your opponent
3. Click **Begin Battle Guide**
4. Click **Next Step** as you play through setup, deployment, and all 5 battle rounds
5. Use the **scoreboard** toggles to track CP, Secondary VP, Primary VP, and Total
6. **Click any unit** in the army panel for full stats, abilities, and weapon tables

## Features

- **Full phase checklist** — Setup, Battle Rounds 1–5, every Command / Movement / Shooting / Charge / Fight sub-step
- **Turn display** — e.g. "Battle Round 2 — Vulkan's Zeal Incursion's Turn"
- **Army ability injection** — timed rules appear in the correct step
- **Unit details** — M, T, Sv, W, LD, OC, InSv, FNP on army cards; full modal with weapons tables
- **Scoreboard** — CP · Secondary · Primary · Total
- **Auto-save** — progress saved in browser localStorage

## Army file format

Upload standard roster JSON exports (BattleScribe / New Recruit), e.g. `Vulkan's Zeal Incursion.json`.

## Project layout

```
app/                 Source + runnable guide (after build)
launch-offline.bat   Start here (local, offline)
build.bat            Rebuild bundle + play.html
deploy/              Web hosting setup (GitHub Pages)
.github/workflows/   Auto-deploy on push to main
```

## Web version (GitHub Pages)

**No Git install?** See **[deploy/BROWSER-UPLOAD.md](deploy/BROWSER-UPLOAD.md)** — build, zip, and upload from your browser (Netlify Drop or GitHub web UI).

With Git installed, see **[deploy/GITHUB.md](deploy/GITHUB.md)** for push-to-deploy.

## Develop

```powershell
# Rebuild after editing app/js/ or app/css/
build.bat
```

No Node.js required for the Battle Guide. The `src/` Vite/React tree is legacy and not used by the guide.

## License

Fan project. Warhammer 40,000 © Games Workshop Ltd.
