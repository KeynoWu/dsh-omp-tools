# dsh-omp-tools

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)

**给 DeepSeek Harness 的 coding 能力增强工具集**——参考 oh-my-pi（omp）的 LSP 封装与工具设计，按能力模块分批迭代。**模块 1（LSP 语义导航/诊断）+ 模块 2（AST 结构化搜索/批量重写）已完成**。

> 状态：迭代 1（LSP）+ 迭代 2（astgrep）已实现并通过验证；迭代 3+（hashline 编辑 / read 摘要 / memory）规划中
> 设计文档：[docs/lsp-module-design.md](./docs/lsp-module-design.md) v2

---

## 模块化架构

一个插件包 = 宿主装配层（`src/index.ts`）+ 能力模块（`src/modules/<id>/`）。模块间零依赖，`config.modules.<id>` 开关控制挂载；未启用的模块不注册任何工具、不加载依赖。

| 模块 | 能力 | 状态 |
|---|---|---|
| **lsp** | 语言服务器池 + 语义工具（诊断/定义/引用/hover/rename） | ✅ 已完成（迭代 1） |
| **astgrep** | AST 结构化搜索/批量重写（语法感知，避开注释/字符串噪音） | ✅ 已完成（迭代 2） |
| edit | hashline 锚定编辑（防过期内容编辑） | 📋 规划（迭代 3） |
| read | 大文件摘要 + 选择器（省 token） | 📋 规划（迭代 3） |
| memory | learn/checkpoint（跨会话沉淀） | 📋 规划（迭代 4） |

---

## 模块 1：LSP 语义导航/诊断

**给 DSH 装上真正的语言智能**：内置语言服务器检测与进程池，让 agent 在 coding 时拥有语义级的「查错 / 找定义 / 找引用 / 看类型」能力——不再靠猜。

没有 LSP 时，agent 在代码库里只能做「文本级近似」：

| 想做的事 | 没有 LSP（现状） | 有了 LSP（本模块） |
|---|---|---|
| **写完代码查错** | 手动跑编译器/测试——慢、要搭命令、输出噪音大 | `lsp_diagnostics`：**毫秒级增量诊断，精确到行**，改完 A 立刻知道有没有破坏 B |
| **找定义 / 引用** | `grep` 字符串匹配——漏别名/重导出/动态分发，混进注释和字符串噪音 | `lsp_definition` / `lsp_references`：**语义精确匹配**，穿透 `import` 别名、重导出、动态分发，不含噪音 |
| **理解类型签名** | read 文件自己推断 | `lsp_hover`：**直接给出类型签名与文档** |
| **大代码库导航** | 凭文件名和 grep 猜位置 | 按语言服务器解析的**真实符号表**定位，跨文件引用一次到位 |

核心区别一句话：**没有 LSP 的 agent 在「猜」代码，有 LSP 的 agent 在「读」代码。** 语义分析是每种语言的重活，不该由 LLM 猜测，也不该让 grep 硬凑——交给专业语言服务器（tsserver / pyright / gopls / rust-analyzer…），agent 只负责「问」和「用答案」。

**它最值钱的使用场景**：agent 在长会话、大代码库里「行动前先验证、行动后先查错」——这正是当前 coding agent 最常出错、最需要精确信息的地方。

### 工具

**五个工具**（四个只读 + 一个写操作，全部基于 LSP 语义分析，非文本搜索）：

| 工具 | 作用 |
|---|---|
| `lsp_diagnostics` | 文件级语言诊断（增量分析，按 severity 排序）——**收益最大**，写完先查错 |
| `lsp_definition` | 符号定义位置（穿透别名/重导出/动态分发） |
| `lsp_references` | 全部引用（含声明，语义精确，不含注释/字符串噪音） |
| `lsp_hover` | 类型签名/文档（Markdown 扁平化） |
| `lsp_rename` | **语义重命名**（跨文件引用同步，WorkspaceEdit 经 DSH 文件 seam 应用，走写审批） |

**内置 16 种语言目录**（前端/后端/Android/iOS/数据岗位全覆盖）：TypeScript、Vue、HTML、CSS、Python(pyright)、Go、Rust、Java、C#、PHP、Ruby、C/C++、Kotlin、Swift、SQL、R。

- **默认全部不启用**——在设置页勾选你要用的岗位语言即可，零资源浪费
- 勾选后**当前会话即时生效**，无需重启
- 语言服务器**不随插件安装**：检测本机已有二进制（`node_modules/.bin` → `$PATH`）；缺失时设置页显示状态，**可一键安装引导**（每语言内置安装命令，用户级目录安装）

**工程化生命周期**：懒启动（不勾选不 spawn）、`command:projectRoot` 进程池（同一项目共享一个服务器实例）、就绪等待独立预算（重语言如 rust-analyzer/sourcekit-lsp 首启不卡工具超时，实测独立超时生效）、idle 回收（空闲自动释放，in-flight 不打断）、崩溃自动重启（上限 1，避免打转）、**并发上限**（`maxConcurrentServers` 默认 4，超限明确拒绝）。

---

## 模块 2：AST 结构化搜索/批量重写

**语法感知的搜索与变换**（ast-grep）：按代码结构模式查找/替换一批代码，**避开注释和字符串噪音**——比 grep 精确，跨文件一致改写。与 LSP 互补：LSP 回答「符号在哪」（语义导航），ast-grep 回答「按结构找一批 / 按结构改一批」（变换）。

### 工具

| 工具 | 作用 |
|---|---|
| `ast_search` | AST 结构化搜索：`pattern` 用 ast-grep 模式语法（`$A`/`$B` 通配变量，如 `"$A.foo($B)"` 匹配任意对象调用 `foo`），返回文件:行:列 + 匹配文本 |
| `ast_edit` | AST 批量重写：`pattern` + `rewrite`（`$A` 引用捕获），一次改一批；**写操作经 DSH 文件审批**；`dryRun: true` 只预览不写盘 |

**支持 16 种常用语言**（前端/后端/iOS/Android）：TypeScript、JavaScript、TSX、JSX、HTML、CSS、Python、Go、Rust、Java、C#、PHP、Ruby、C/C++、Swift、Kotlin（ast-grep CLI 内置全部 tree-sitter 解析器）。

**实现要点**：
- 无长驻进程——每次调用 spawn `ast-grep run --json=stream`（纯静态分析）
- 二进制**不随插件安装**：检测 `ast-grep`（旧名 `sg` 兜底）；缺失时设置页显示状态 + 一键安装引导（`npm i -g @ast-grep/cli`）
- 写盘不走 CLI `--update-all`（那会绕过沙箱），而是 CLI dry-run 产出的**字节区间编辑经 `ctx.fs` 应用**——审批/沙箱与 `lsp_rename` 同层

---

## 快速开始

```bash
# 1. 克隆本仓库，链接插件到目标 profile（以 web profile 为例）
mkdir -p ~/.dsh/profiles/web/node_modules
ln -s "$(pwd)" ~/.dsh/profiles/web/node_modules/dsh-omp-tools

# 2. 在 ~/.dsh/profiles/web/cordis.patch.yml 挂载：
# - insert:
#     - id: dsh-omp-tools
#       name: dsh-omp-tools
#       config:
#         modules:
#           lsp: true
#           astgrep: true

# 3. 重启 dsh web，开始享受语义级 coding
```

**建议先装好常用语言的服务器**（插件负责检测与启动，安装交给包管理器）：

```bash
npm i -g typescript-language-server pyright   # TS/JS + Python（P0，最成熟）
npm i -g @ast-grep/cli                        # AST 结构化搜索/批量重写（迭代 2）
# 其他语言：gopls / rust-analyzer / clangd / sourcekit-lsp 等按需安装
```

## 设置

设置 → **OMP Tools**：tabs 组织能力模块（**LSP 语言** / **AST 搜索**）。

- **LSP 语言** 页：按岗位分组的 16 语言勾选 + 空闲回收超时 + 并发上限；每行显示状态徽标（可用 ✓版本 / 缺失 ⚠ + 安装按钮）。也可直接编辑 `~/.dsh/settings.yaml`（外部编辑自动生效）：

```yaml
lsp:
  enabled:
    typescript: true
    python: true
  idleTimeoutMs: 300000
  maxConcurrentServers: 4
```

- **AST 搜索** 页：ast-grep 二进制状态（可用 ✓版本 / 缺失 ⚠ + 安装按钮）+ 支持语言列表（只读，工具按需指定语言，无配置项）。

## 开发与验证

```bash
npm run build          # build:status（host remote 装饰器转译）+ build:client（ModuleLoader bundle）
npx tsc --noEmit       # 类型检查
```

各里程碑的验证结论（沙箱 spawn、双向 JSON-RPC、五工具 TS/Python 9/9、崩溃重试、settings 接线、慢启动独立预算、并发上限、pyright 噪音修复）记录在设计文档 [docs/lsp-module-design.md](./docs/lsp-module-design.md) §11.3；开发期验证脚本依赖本机 DSH 安装，保存在仓库历史中，需要时从 git 历史找回。

## 版本与更新

当前版本：**v0.2.0**（Git tag 对应每个发布点，`git checkout v0.2.0` 可回滚到任意版本）。

| 版本 | 内容 |
|---|---|
| v0.2.0 | 迭代 2：astgrep 模块（`ast_search` / `ast_edit`）+ OMP Tools 设置页 tabs + 多 remote 约束链修复 |
| v0.1.0 | 融合仓库建立：LSP 模块（M1–M4 全部能力）迁入 `modules/lsp` |

**别人如何更新**：

```bash
# 源码安装者（git clone + symlink）：
git pull && npm run build        # 拉到最新代码后重建产物

# 或回滚到指定版本：
git checkout v0.1.0 && npm run build

# 市场（dsh-plugin topic）用户：每日 06:00 自动抓取默认分支最新代码，无需手动操作
```

> 插件当前以源码形式分发（未发布 npm）；`package.json version` 与 git tag 同步维护（每个迭代 bump + tag）。若未来发布 npm，用户可用 `dsh plugin --profile <name> add dsh-omp-tools` 安装、`pnpm update` 更新。

## 里程碑

- **M0** ✅ 风险验证（沙箱可 spawn 外部二进制、双向 JSON-RPC、环境 scrub）
- **M1** ✅ 端到端最小（`lsp_definition`，agent 实测返回正确定义位置）
- **M2** ✅ 四工具 + 生命周期 + 全量目录（9/9 + 崩溃重试 PASS）
- **M3** ✅ host settings 接线 + client 设置页（esbuild ModuleLoader bundle，浏览器验收通过）
- **M4** ✅ host remote 状态数据源 + 安装引导 + `lsp_rename`（ctx.fs 写审批）+ pyright 噪音修复 + 慢启动实测 + 并发上限（workspace 诊断按需）
- **迭代 2** ✅ astgrep 模块：`ast_search` / `ast_edit`（AST 搜索 + 批量重写，dry-run 预览 + ctx.fs 审批写盘）+ AST 搜索设置页 tab（二进制状态 + 一键安装引导）+ 多 remote 约束链 4 层坑全记录（§11.3 7–10）

## License

MIT
