# Publishing Fortuna to the general public

Working checklist for the free public launch (LinkedIn + GitHub). Ordered by impact.

## 1. The SmartScreen problem (the launch blocker)

An unsigned Windows exe shows **"Windows protected your PC"** on first run. A technical user
clicks *More info → Run anyway*; most LinkedIn viewers will close it and assume it's malware.
Options, cheapest first:

| option | cost | effect |
|---|---|---|
| Ship unsigned + instructions | free | Warning stays; README/post must show the *More info → Run anyway* step with a screenshot. Reputation builds slowly per-file, and **resets on every release**. |
| [SignPath Foundation](https://signpath.org/about) free OSS signing | free (approval process) | Real OV certificate for open-source projects; reputation accrues to the cert across releases. Requires the repo to qualify (license, contributor policy). |
| Microsoft Store | $19 one-time (individual) | Store-signed; **no SmartScreen at all**, plus discoverability and auto-updates. Tauri documents Store packaging. |

**v1 decision:** ship unsigned with clear instructions; apply to SignPath in parallel; consider
the Store once the app has a few releases behind it.

## 2. Distribution channel

- **GitHub Releases** is the download page: tag `v0.1.0`, attach the NSIS installer
  (`Fortuna_x.y.z_x64-setup.exe`) *and* the portable `fortuna.exe`. Link the **release page**
  (not a raw file) from LinkedIn.
- Add release notes per version — screenshots, what changed.
- Later: `tauri-action` GitHub Actions workflow so releases build automatically from a tag, and
  the Tauri **updater plugin** (signs updates with our own keypair, free) so installed apps
  self-update.

## 3. Zero-friction web demo (reach multiplier)

Most feed-scrollers will never download an exe. The same codebase already builds a static site
(`npm run build` → `dist/`), so publish it to **GitHub Pages** as a live demo and make the exe
the "power user" option. One link to try in 5 seconds, one link to install. The desktop app
remains the flagship.

## 4. Product polish before strangers use it

- [ ] **First-run onboarding** — auto-open the profile wizard when no saved data exists, so the
      first screen is "answer 6 questions", not 40 sliders.
- [ ] **Custom app icon** — the default Tauri icon reads as "hobby project"; a simple ◈ mark fixes it.
- [ ] **About panel** — version, "100% local, no accounts, no telemetry, open source" + GitHub link.
      Privacy is the selling point; say it in-app.
- [ ] **Not-financial-advice disclaimer** on first run (already in footer; make it explicit once).
- [ ] **Input resilience** — corrupt/legacy localStorage must never blank-screen the app
      (wrap store hydration in try/catch with a reset path). Verify NaN/extreme inputs clamp.
- [ ] **Plain-language pass** — every field label understandable by a non-finance person;
      tooltips for Sharpe-adjacent jargon (volatility, percentile, real vs nominal).
- [ ] **Windows-only honesty** — README and post say Windows 10/11 x64; macOS/Linux "build from
      source" (Tauri makes them possible later).

## 5. LinkedIn post kit

- 3–4 screenshots (fan chart with a FIRE profile, the Coach panel, the wizard) or a 30s GIF.
- Copy skeleton: what it does (simulate thousands of futures, not one guess) → what makes it
  different (Coach quantifies each suggestion by re-simulating) → free/open-source/local-only →
  two links (live demo / download).
- Pin the repo on the GitHub profile; add repo topics (`finance`, `monte-carlo`, `tauri`,
  `retirement-planning`) and a social-preview image so the link unfurls nicely.

## Sources

- [Microsoft: SmartScreen reputation for app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- [Microsoft: code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Tauri: distribute](https://v2.tauri.app/distribute/) · [Windows signing](https://v2.tauri.app/distribute/sign/windows/) · [updater plugin](https://v2.tauri.app/plugin/updater/) · [GitHub pipeline](https://v2.tauri.app/distribute/pipelines/github/)
