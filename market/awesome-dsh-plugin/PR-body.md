Add Qthinoyy/dsh-xmind-excel

## What it is

`dsh-xmind-excel` is a Host-only DSH bundle that exposes two tools:

- `xmind_to_excel` — converts a `.xmind` file into `.xlsx` in five views (`outline`, `testcase`, `checklist`, `qa`, `matrix`) or all at once. The `qa` view writes a fixed 模块/子模块/用例场景/优先级/前置条件/操作步骤/预期结果/XMind 来源 table plus a 分类核对 review sheet for the inferred precondition/step decisions.
- `xmind_inspect` — summarizes canvases, depth distribution, markers, per-level samples and a dialect profile so the view and case levels fit the map.

It ships a bundled `xmind-to-excel` skill, English/Chinese metadata, and has no runtime dependencies (its own ZIP reader/writer and XLSX writer). Everything runs locally: no network requests, no uploads.

## Submission checklist

- [x] `package.json` declares `dsh.bundle.patch` pointing at `cordis.patch.yml`
- [x] Real, working code: 36 `node:test` cases, exercised on real maps in a DSH profile
- [x] Published on npm: `dsh-xmind-excel@1.0.6`, installed from the registry in a DSH profile
- [x] Repository is at least one day old at submission time
- [x] `dsh-plugin` topic on the repository
- [x] Description states only implemented behaviour and matches the code

## Category

`tools` — the bundle provides two model-facing tools and no UI.