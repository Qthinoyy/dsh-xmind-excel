# Changelog

## 1.0.2 — 2026-11-24

- **New `qa` mode**: writes the fixed header 模块 / 子模块 / 用例场景 / 优先级 / 前置条件 / 操作步骤 / 预期结果 / XMind 来源, plus a 分类核对 review sheet listing every inferred decision with its score and the rule that fired.
- **Precondition vs step split**: explicit prefixes (前置：/步骤：/预期：) first, then numbered notes and 前置 wording, then bracket annotations, then wording (verbs → steps, state words → preconditions, action wins when both appear). Undecided nodes are marked 未分类 and stay out of both columns instead of being guessed.
- **Parameters**: `sceneLevel`, `levelOffset`, `preconditionDepth`, `stepDepth`, `withDetail`.
- **Dialect profile**: `xmind_inspect` now reports per-depth verb/state/bracket/numbered-notes ratios and suggests prefix / notes / structure parsing.

## 1.0.1 — 2026-11-24

- Publish through npm **Trusted Publishing (OIDC)**: the release workflow no longer reads NPM_TOKEN; provenance is generated for every tagged release.
- README gains the npm version badge and install-from-registry instructions.

## 1.0.0 — 2026-11-24

First release.

- **Tools**: `xmind_to_excel` (outline / testcase / checklist / matrix / all) and `xmind_inspect` (canvases, node counts, depth distribution, markers, per-level samples).
- **Formats**: XMind 2020+/Zen `content.json` and XMind 8 `content.xml`; floating topics become ordinary children.
- **Excel writer**: inline strings, header styling with frozen panes and auto filter, column widths, wrapped text, merged ancestor cells in the matrix view. No runtime dependencies, no network access.
- **Cases**: `testcase` recognizes 验证/校验/测试 prefixes, splits `步骤 => 预期` pairs and fills missing expectations from notes; `checklist` selects cases by tree level (`caseDepth`) and treats 说明/备注/注意/举例/前提/范围 nodes as annotations.
- **Packaging**: localized metadata (English, Chinese), detail documents with one feature image, original icon, bundled `xmind-to-excel` skill, MIT license, 25 `node:test` cases covering conversion, structure, packaging and attribution.
- **Attribution and release**: `Copyright (c) 2026 欧阳秋生` in the MIT licence, `author` in the manifest, `PUBLISHING.md` with the evidence chain, `scripts/set-identity.mjs` to fill the GitHub/npm identity in one pass, and a tag-triggered GitHub Actions workflow that publishes with npm provenance.
- **Limits**: input up to 50 MB; text structure only; rule-based case extraction.


