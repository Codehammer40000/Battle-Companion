# Deploy without installing Git

You can publish the Battle Guide from your browser only. Local play (`launch-offline.bat`) stays the same.

## Option A — Netlify Drop (easiest, no GitHub)

Best if you only want a **live URL** and do not care about storing source code on GitHub.

1. Run **`build.bat`** on your PC (double-click).
2. Run **`deploy\zip-for-upload.bat`** — creates `deploy\wh40k-battle-guide-web.zip`.
3. Open https://app.netlify.com/drop (free account optional; sign up to keep the same URL).
4. Drag **`deploy\wh40k-battle-guide-web.zip`** onto the page (or drag the **`dist`** folder after running `deploy\prepare-pages.ps1`).

You get a URL like `https://random-name.netlify.app`. Rename it in Netlify settings if you create an account.

**Updates:** Re-run build + zip, drag the new zip again (or use Netlify’s dashboard to replace files).

---

## Option B — GitHub website only (no Git install)

Use GitHub to host the app **without** Git on your PC. Two sub-options:

### B1 — Upload only the built site (recommended for browser-only)

Smallest upload, no GitHub Actions required.

1. Run **`build.bat`**
2. Run **`deploy\prepare-pages.ps1`** (or **`deploy\zip-for-upload.bat`**)
3. On https://github.com → **New repository** → name it e.g. `wh40k-battle-guide` → **Public** → Create
4. Click **Add file** → **Upload files**
5. Drag everything inside **`dist\`** (not the `dist` folder itself — open it and select all files inside):
   - `index.html`
   - `play.html`
   - `css\` folder
   - `js\` folder
   - `.nojekyll`
6. Commit with **Commit changes**
7. **Settings** → **Pages** → **Build and deployment** → **Source: Deploy from a branch**
8. Branch: **main**, Folder: **/ (root)** → Save

Live URL (after 1–2 minutes):

`https://YOUR_USERNAME.github.io/wh40k-battle-guide/`

**Updates:** Upload changed files again via **Add file** → **Upload files**, or edit `index.html` in the browser editor.

You do **not** need the full `app/` source on GitHub for this to work.

### B2 — Upload the full project via browser

If you want source + auto-deploy on GitHub:

1. Create an empty repo on GitHub (no README).
2. **Add file** → **Upload files**
3. Drag the **entire project folder** from File Explorer (Chrome/Edge preserve folder structure when you drag a folder).

Include at least:

- `app/`
- `scripts/`
- `deploy/`
- `.github/`
- `build.bat`, `launch-offline.bat`, `README.md`, `.gitignore`

Do **not** upload `node_modules/` or `dist/` (they are rebuilt in the cloud).

4. **Settings** → **Pages** → **Source: GitHub Actions**

The workflow in `.github/workflows/pages.yml` runs on GitHub’s servers when you commit via the website — no local Git needed.

**Caveat:** Uploading 50+ files by drag-and-drop is slower than B1 or Netlify Drop.

---

## Option C — GitHub in-browser editor only (after first upload)

Once files are on GitHub, you can edit text files on github.com (**Edit** pencil) and commit without Git. Good for small fixes; use `build.bat` locally for bigger changes, then re-upload `dist/` (B1) or changed `app/` files (B2).

---

## Quick comparison

| Method | Git install? | What you upload | Auto-rebuild on change? |
|--------|--------------|-----------------|-------------------------|
| **Netlify Drop** | No | Built `dist/` zip | No — re-upload after build |
| **GitHub B1** (built site only) | No | Built `dist/` files | No — re-upload after build |
| **GitHub B2** (full repo, web upload) | No | Whole project once | Yes — Actions on each web commit |
| **Git + push** (deploy/GITHUB.md) | Yes | `git push` | Yes |

---

## Recommended for you

- **Just want a link to share at the table:** **Netlify Drop** or **GitHub B1** + `deploy\zip-for-upload.bat`
- **Want version history and source on GitHub without Git:** **GitHub B2** (one-time folder upload)
- **Comfortable installing Git later:** `deploy/GITHUB.md`

---

## After upload — what players do

Same as offline: open the URL, load two army `.json` files, play. Saves stay in the browser on that device.
