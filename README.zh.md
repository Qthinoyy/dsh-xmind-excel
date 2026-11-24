# XMind 转 Excel（DeepSeek Harness 插件）

[![npm version](https://img.shields.io/npm/v/dsh-xmind-excel.svg)](https://www.npmjs.com/package/dsh-xmind-excel)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

在 DeepSeek Harness（DSH）里把 `.xmind` 思维导图转成 `.xlsx` 工作簿。两个工具、四种视图，无运行时依赖、不联网。

| 工具 | 作用 |
|---|---|
| `xmind_to_excel` | 读 `.xmind` 并写 `.xlsx`：`outline`、`testcase`、`checklist`、`matrix` 或 `all` |
| `xmind_inspect` | 先汇总画布数、节点数、深度分布、优先级标记与各层样例标题，按事实选用例视图和层级，不靠猜 |

## 四种视图

| 模式 | 列 | 适合 |
|---|---|---|
| `outline`（默认） | 层级1…层级N、标题、备注、标签、超链接、标记/优先级、路径、相对深度 | 忠实导全量：每个节点一行，便于筛选、透视、二次加工 |
| `testcase` | 模块、用例标题、优先级、前置条件、步骤、预期结果、标签、超链接、备注 | 用例标题以 `验证`/`校验`/`测试` 开头的导图 |
| `checklist` | 模块、场景、用例标题、优先级、预期结果、标签、超链接、备注 | 结构为「模块 → 场景 → 用例 → 预期」的导图，用例层级由 `caseDepth` 指定 |
| `qa` | **QA 用例表**：模块、子模块、用例场景、优先级、前置条件、操作步骤、预期结果、XMind 来源，另附「分类核对」sheet（判定/得分/依据） | 提测、导入测试平台；导图没有显式「前置/步骤」语义时用启发式拆分并可人工核对 |
| `matrix` | 层级1…层级N，祖先单元格纵向合并 | 打印、评审：每个叶子路径一行，读起来像展开的导图 |
| `all` | `outline` + `testcase` + `matrix` 三个 sheet | 一次全出，让用户挑 |

支持 XMind 2020+/Zen（`content.json`）与 XMind 8（`content.xml`）两种容器；浮动主题按普通子节点展开。

## 安装

**从 npm 安装（推荐）**：

```
plugin_manager { action: "install_bundle", target: "dsh-xmind-excel@1.0.1" }
```

或在侧栏 **Plugins** → **Add plugin** 里填 `dsh-xmind-excel@1.0.1`。

**从本地目录安装**（插件开发/内部分发常用）：

1. 打开侧栏 **Plugins**；
2. 点 **Add plugin**，选中本目录（`dsh-xmind-excel/`）；或用 `plugin_manager` 的 `action: install_bundle`、target 指向本目录；
3. 插件列表出现 **XMind 转 Excel** 一行，两个工具对所有会话生效，随包的 `xmind-to-excel` 技能也会出现在技能目录里。

**从 npm 安装**（发布之后）：

```
plugin_manager { action: "install_bundle", target: "dsh-xmind-excel@1.0.0" }
```

关闭该 bundle 会同时移除两个工具和随包技能，profile 其它内容不受影响。

## 用法

```
xmind_inspect  { input: "D:\\cases\\计算器.xmind" }

xmind_to_excel { input: "D:\\cases\\计算器.xmind",
                 mode: "checklist", caseDepth: "2,3" }
# -> Created: D:\cases\计算器.checklist.xlsx
#    mode=checklist sheets=1 nodes=121 rows=53 cases=53 size=29.9 KB
```

参数要点：

- `caseDepth`（仅 `checklist`）：用例所在层级，如 `"3"` 或 `"2,3"`。指定层上的节点若下方还有更深用例层则是分组，否则是用例；第 2 层以「说明/备注/注意/举例/前提/范围」开头的节点视为整段解释——场景列留空，文字并入备注列。
- `sceneLevel`（仅 `qa`）：哪一层是「用例场景」，默认 3；`levelOffset`：模块/子模块/场景整体下移几层；`preconditionDepth`/`stepDepth`：强制某层算前置/步骤；`unclassified`：判不准的节点放哪——`scene`（默认，追加到用例场景，不会消失）、`steps`、`drop`；`withDetail: false` 不输出「分类核对」表。
- `qa` 判定顺序：显式前缀 → 备注编号/前置措辞 → 括号注释 → 措辞（动词/动作名词 → 步骤；状态词、条件开头 → 前置）；子节点是疑问句（是否/如何/怎么）的节点按「场景」处理；都判不准的节点标为未分类，默认追加到「用例场景」并写入「分类核对」，不会静默丢弃。
- `output` 指定输出路径。不指定时默认写在输入旁边：`<输入>.xlsx`（`outline`/`all`）或 `<输入>.<模式>.xlsx`；同名已存在时自动加时间戳，`overwrite: true` 则覆盖。
- `sheet` 只转匹配的画布；`maxLevel`（1–30，默认 12）控制展开几层层级列；`splitSheets` 把 sheet 命名成「画布.视图」；`explodeSteps` 在 `testcase` 模式下每个步骤一行。

`testcase` 的识别规则写在随包技能与详情文档里；标题不符合约定时工具会退化成「每个叶子都是用例」，并在返回里给出 `cases` 数量，便于发现。

## 限制与隐私

- 只读给定的 `.xmind`（≤ 50 MB），只写一个 `.xlsx`；不联网、不上传、无遥测。
- 只转换文本结构：图片、贴纸、关系线、边界、摘要、布局位置不保留；浮动主题按普通子节点展开。
- 加密、损坏或非 zip 文件直接报错，不做猜测。
- 用例识别基于规则，标题命名不规范时请抽查前几行。
- 矩阵视图只做相邻同值祖先单元格的纵向合并，不还原复杂版式。

## 兼容性

- DSH `>=0.2.0-rc.1 <0.3.0-0`（`dsh.engines.dsh`）；Node.js 22+。
- 纯 Host 插件：无 UI slot、无设置项、无 client bundle。

## 开发

```powershell
node --test        # 34 项测试：解析、四种视图、zip/xlsx 结构、错误路径、打包规范
```

目录结构：

```
index.js            Host 插件：注册两个工具与随包技能
lib/xmind.js        .xmind 容器读取（content.json / content.xml）
lib/xml.js          XMind 8 用的极简 XML 读取
lib/modes.js        outline / testcase / checklist / matrix 四种视图
lib/xlsx.js         XLSX 写入（inline 字符串、样式、合并、冻结、筛选）
lib/zip.js          ZIP 读写（CRC32、stored + deflate）
lib/convert.js      编排：模式选择、输出命名、大小上限
skills/             随包 `xmind-to-excel` 技能
locale/             中英文插件元数据
docs/               详情文档与特性图
test/               node:test 套件，含 XMind 2020 / XMind 8 / 清单型样例
```

## 作者

欧阳秋生（Ouyang Qiusheng）— 维护者。

源码：https://github.com/Qthinoyy/dsh-xmind-excel。

发布、署名与收益说明见 [PUBLISHING.md](PUBLISHING.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。

