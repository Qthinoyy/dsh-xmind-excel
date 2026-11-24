---
name: xmind-to-excel
description: Convert .xmind mind maps into .xlsx workbooks with the xmind_to_excel tool (outline, testcase, checklist, matrix, all) and use xmind_inspect first to choose the view and case levels.
whenToUse: Use when the user asks to turn an XMind file into Excel, a spreadsheet, a test case sheet, or a printable outline.
---

# XMind to Excel

Two tools do the work; everything runs on the local machine and writes one `.xlsx` file.

## Workflow

1. Call `xmind_inspect` with the absolute `.xmind` path. It returns the canvases, node count, the depth distribution (`0:1 1:7 2:22 …`), priority markers, and sample titles per level.
2. Pick the view from the map's shape:

   | Map shape | Mode |
   |---|---|
   | Any map, faithful dump | `outline` (default) — one row per node, level columns, notes, labels, links, full path |
   | Case titles start with 验证 / 校验 / 测试 | `testcase` — module, case title, priority, precondition, steps, expected results |
   | 模块 → 场景 → 用例 → 预期 | `checklist` with `caseDepth` (e.g. `2,3`) — module, scene, case, expectations from child nodes |
   | QA table with 模块/子模块/用例场景/优先级/前置条件/操作步骤/预期结果/XMind 来源 | `qa` with `sceneLevel` (default 3) and `levelOffset` when the first level is a version or device |
   | Printable / diagram-like | `matrix` — one row per leaf, ancestor cells merged |
   | User is unsure | `all` — outline + testcase + matrix in one workbook |

3. Call `xmind_to_excel` with that mode. Output defaults to `<input>.xlsx` (or `<input>.<mode>.xlsx`), with a timestamp suffix when the name is taken; pass `output` to choose the path and `overwrite: true` to replace an existing default file.
4. Verify before reporting: read the workbook back (openpyxl, Excel, or any reader) and check the sheet count, the row count, and the first rows. Never claim success from the tool text alone.

## Parameters that matter

- `caseDepth` (`checklist` only): tree levels that hold cases, for example `"3"` or `"2,3"`. A node on one of those levels is a case unless a deeper case level exists below it; anything above is treated as module/scene. Level 2 nodes starting with 说明/备注/注意/举例/前提/范围 are treated as annotations: the scene column stays empty and the text moves to the notes column.
- `sceneLevel` (`qa` only): the 用例场景 level, default 3. `levelOffset` shifts module/submodule/scene down by N levels (use 1 when level 1 is a version or a device). `preconditionDepth` / `stepDepth` force levels to count as 前置条件 / 操作步骤. `withDetail: false` skips the review sheet.
- `sheet`: convert only the canvas whose title matches (exact first, then substring).
- `maxLevel`: level columns to expand, 1–30, default 12. Deeper nodes keep their full path in the path column.
- `splitSheets`: name worksheets `<canvas>.<view>` instead of sharing the canvas title.
- `explodeSteps` (`testcase`): one row per step instead of one row per case.

## QA classification rules (`qa`)

XMind does not encode "precondition" vs "step"; the map only has titles, notes, markers and position. The tool therefore applies signals strongest first and writes every decision into the 分类核对 sheet:

1. Explicit prefix — `前置：`/`前提：`/`环境：` → 前置条件; `步骤：`/`操作：`/`流程：` → 操作步骤; `预期：`/`结果：` → not put in either column.
2. Notes — a numbered list (2+ lines) → 操作步骤; 前置/前提/环境/账号 wording → 前置条件.
3. Bracket annotation — text in （…) → 前置条件, priority markers `(P1)` and `(锚定)` exceptions excluded.
4. Wording — verb-initial → 操作步骤; a verb word plus a state word → 操作步骤 (the condition stays inside the step text); state words 已/未/当前/断网/默认/安装… → 前置条件.

Nothing decisive (or a question like 是否/如何/怎么) → undecided: by default it is appended to 操作步骤 (never dropped), recorded in 分类核对 as 未分类→步骤, and its full path stays in XMind 来源. Pass `unclassified: "scene"` to append undecided nodes to 用例场景 instead, or `"drop"` to keep them only in the review sheet. Tell the user to scan 分类核对 before importing the table; that review is the intended workflow, not a defect.

Result wording wins over action words: a node containing 不变/跟随/同步/生效/更新/显示/展示/出现/提示/弹窗/置灰/高亮/消失/成功/失败/可查看/查看所有 (and not starting with an imperative) is a 预期, chained into the 预期结果 column as `过程结果 → 最终结果`.

Note: maps written in a decision-tree style have almost no real steps — most nodes are conditions expectations. In that case prefer reporting that 操作步骤 is mostly empty rather than accepting a guessed split.

## Test case extraction rules (`testcase`)

- A case node's title starts with 验证 / 校验 / 测试; descendants of a case are steps, not cases (`验证码…` never matches the prefix).
- Steps are the case's children; `=>`, `→`, `->`, `预期：` split step from expected; a child's notes fill a missing expected result.
- Module = the first two non-case ancestors joined with ` / `.
- Precondition = the nearest bracketed text in an ancestor title, else a child named 前置/前提.
- Priority = XMind priority markers (`P1`–`P4`) or `（P0）` in a title.
- When no title matches the convention, the tool falls back to "every leaf is a case" — check the `cases` count against expectations.

## Limits to state honestly

- Only the text structure is converted: images, stickers, relationship lines, boundaries, summaries and layout positions are dropped; floating topics become ordinary children.
- Encrypted, corrupt or non-zip files fail with an error instead of a best guess.
- Input is capped at 50 MB; files must be `.xmind` containers with `content.json` (XMind 2020+) or `content.xml` (XMind 8).
- Conversion is rule-based, so review the first rows when titles are not written in a recognizable style.
- Matrix merging only joins vertically adjacent equal ancestor cells; it does not reproduce complex layouts.

## Reporting

Report the output path, the view, and the numbers from the tool text (`nodes`, `rows`, `cases`). If the result is a case sheet, mention the recognition rule and whether the map matched it. If anything could not be verified (for example the workbook was not opened), say so explicitly.