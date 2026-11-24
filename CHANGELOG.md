# Changelog

## 1.0.5 — 2026-11-24

- **Result wording becomes 预期结果**: nodes with assertion wording (不变/跟随/同步/生效/更新/显示/展示/出现/提示/弹窗/置灰/高亮/消失/成功/失败/可查看/查看所有…, and no imperative verb at the start) are now chained into 预期结果 as `过程结果 → 最终结果` instead of being counted as 操作步骤. Example: `pad选择同步到cat → 形象跟随切换 → 查看所有形象点位`.
- **Default `unclassified` policy is now `steps`** (the 操作优先 behaviour), with `scene` and `drop` still available.
- 分类核对 records the new `预期→结果` placement.

## 1.0.4 — 2026-11-24

- **Nothing is dropped silently any more**: undecided nodes default to the 用例场景 column (append with ` / `), configurable through `unclassified: "scene" | "steps" | "drop"`. The 分类核对 sheet records 未分类→场景 / 未分类→步骤 for every such decision.
- **Scene detection**: a node whose child is a question (是否/如何/怎么) is treated as 场景 instead of a step or precondition.
- **Action nouns** (孵化/变身/切换/升级/刷新/抽卡/兑换/发送/删除/解锁…) count as 操作步骤.

## 1.0.3 — 2026-11-24

- **Classifier coverage**: navigation and confirmation actions (下一步/继续/确认/确定/取消/退出/完成/重试) now count as 操作步骤; condition openers (根据/按照/针对/当/若/如果/需要) and device/network/system wording (机型/设备/网络/系统/通道/权限/条件/场景/情况/开关) count as 前置条件.
- Keeps the review sheet as the source of truth: undecided nodes are still reported as 未分类 instead of being guessed.

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


