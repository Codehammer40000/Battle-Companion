# GitHub setup — WH40k Battle Guide v1.0

This guide gets the project on GitHub and live on the web. Your local `launch-offline.bat` workflow stays unchanged.

## 1. Install Git (one time)

Git is not on your PATH yet. Install it:

1. Download **Git for Windows**: https://git-scm.com/download/win
2. Run the installer (defaults are fine)
3. Close and reopen Cursor / PowerShell so `git` is recognized

Verify:

```powershell
git --version
```

## 2. Create a GitHub account

1. Sign up at https://github.com/signup
2. Confirm your email

## 3. Create the repository on GitHub

1. Click **New repository** (https://github.com/new)
2. Name: `wh40k-battle-guide` (or any name you like)
3. **Public** (required for free GitHub Pages)
4. Do **not** add README, .gitignore, or license — this project already has them
5. Click **Create repository**

Copy the repo URL, e.g. `https://github.com/YOUR_USERNAME/wh40k-battle-guide.git`

## 4. Push this project (first time)

Open PowerShell in the project folder and run:

```powershell
cd "c:\Users\JonRodriguez\OneDrive - Red Hill Supply\Documents\WH40k APP"

git init
git add .
git commit -m "Release v1.0 — Battle Guide with unit details and GitHub Pages deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wh40k-battle-guide.git
git push -u origin main
```

GitHub will prompt you to sign in (browser or personal access token).

## 5. Enable GitHub Pages

1. Open your repo on GitHub
2. **Settings** → **Pages**
3. Under **Build and deployment** → **Source**, choose **GitHub Actions**
4. After the first push, open **Actions** — the **Deploy to GitHub Pages** workflow should run and turn green

Your live URL will be:

```
https://YOUR_USERNAME.github.io/wh40k-battle-guide/
```

(GitHub shows the exact URL under Settings → Pages once deployed.)

## 6. Updating after changes

Local development stays the same:

1. Edit files in `app/`
2. Run `build.bat` and test with `launch-offline.bat`
3. Commit and push:

```powershell
git add .
git commit -m "Describe your change"
git push
```

GitHub Actions rebuilds and republishes automatically.

## What gets deployed

| Local (unchanged) | Web (automatic) |
|-------------------|-------------------|
| `launch-offline.bat` → `play.html` | `https://…github.io/…/` |
| `build.bat` | CI runs `scripts/build.ps1` |
| `dist/` (gitignored locally) | Built fresh on each push |

## Troubleshooting

**`git` not recognized** — Reinstall Git for Windows and restart the terminal.

**Pages workflow failed** — Repo → **Actions** → click the failed run → read the error log.

**404 on Pages URL** — Wait 2–3 minutes after a green deploy; confirm Pages source is **GitHub Actions**, not “Deploy from branch”.

**Army files** — Players still upload their own `.json` roster files in the browser (same as offline).

**Saves** — Stored in browser `localStorage` per device/browser (not synced to GitHub).

## Optional: tag v1.0

After your first successful push:

```powershell
git tag -a v1.0.0 -m "Battle Guide 1.0"
git push origin v1.0.0
```
