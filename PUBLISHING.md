# Publishing and attribution

This package is maintained by **欧阳秋生 (Ouyang Qiusheng)**. Everything below is about proving that, publishing it, and keeping the claim intact.

## What currently establishes authorship

| Evidence | Where | What it proves |
|---|---|---|
| Copyright line | `LICENSE` → `Copyright (c) 2026 欧阳秋生 (Ouyang Qiusheng)` | The legal claim: MIT grants use, but copyright stays with you |
| Manifest author | `package.json` → `"author": "欧阳秋生"` | Identity shown on the npm page and in plugin metadata consumers |
| Source history | git commits (after `git init` + first commit) | Who wrote which line, when; commit hashes are the timestamped record |
| npm publisher | npm account that runs `npm publish` | npm records the publisher and time for every version; only that account can publish new versions |
| npm provenance | `.github/workflows/publish.yml` (`--provenance`) | Signed attestation linking the package to this repository and commit, shown on the npm package page |
| Repository link | `package.json` `repository` (after `scripts/set-identity.mjs`) | Points readers and the plugin market back to the canonical source |

What does **not** establish authorship: a local folder, a tarball sent to someone, or a package name that is not yet published.

## One-time setup

1. Fill the identity placeholders once you have the GitHub account:

   ```powershell
   node scripts/set-identity.mjs --github <your-github-user> --email <you@example.com>
   # optional: --npm <your-npm-user> --scope <your-npm-scope> to publish as @scope/dsh-xmind-excel
   ```

   The script updates `package.json` (`repository`, `homepage`, `bugs`, `author.url`), the README repository link, and the local git identity.

2. Initialise the repository and commit in small, meaningful steps:

   ```powershell
   git init
   git add .
   git commit -m "feat: XMind to Excel converter for DeepSeek Harness"
   git branch -M main
   git remote add origin https://github.com/<your-github-user>/dsh-xmind-excel.git
   git push -u origin main
   ```

3. Publish to npm (the marketplace indexes npm packages):

   ```powershell
   npm login
   npm publish --access public
   git tag v1.0.0
   git push --tags      # triggers .github/workflows/publish.yml with provenance
   ```

   The name `dsh-xmind-excel` was free on npm when this was prepared (HTTP 404). Unscoped names are first-come-first-served; register it under your npm account soon, or publish scoped (`@<scope>/dsh-xmind-excel`) if the short name may be contested.

4. Submit to the DSH plugin market. The curated index (`awesome-dsh-plugin.com`, consumed by `dshmarket`) lists packages by name and links their repository; make sure `repository`, `homepage` and the README are filled before submitting. I could not load the index's submission rules while preparing this (the host kept timing out), so check its requirements — licence, description length, screenshots — before sending the entry.

## Before making it public

- **Company policy.** This plugin was developed on a work machine for internal QA work. If it is a work product, your employer may own it; get written confirmation that you may publish it under your own name, or publish it under a company organisation instead.
- **No company data.** The repository contains only synthetic fixtures (`test/fixtures/*.xmind` generated for tests). Real test-case files and internal hostnames stay out of git — `*.xlsx`, `dist/` and scratch folders are ignored.
- **Screenshots and docs.** Keep `docs/preview.svg` and `icon.svg` original (they are); do not paste internal UI screenshots.

## Revenue reality

There is no built-in paid distribution: npm is free, and the DSH plugin market is a free index/browser. Direct income from this plugin is realistically zero. The value is (a) internal efficiency, (b) a public, attributable work sample, and (c) an entry point for paid customisation or support if someone needs it — with no platform taking a cut, because you invoice directly. If you want licensing control, publish under a dual licence (MIT for personal/internal use, commercial licence for companies) and state it in the README before the first public release.