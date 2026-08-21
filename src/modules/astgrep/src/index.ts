/**
 * dsh-omp-tools · astgrep 模块（迭代 2：AST 结构化搜索/批量重写）。
 * 职责与 LSP 互补：LSP 回答「符号在哪」（语义导航/诊断），ast-grep 回答
 * 「按结构找一批 / 按结构改一批」（变换）。纯静态分析，无长驻进程：
 * 每次工具调用 spawn `ast-grep run --json=stream`（CLI 内置全部语言）。
 * 写操作（ast_edit）经 ctx.fs seam 应用（沙箱感知 + fs/write-intent 审批钩子）。
 *
 * 模块约定：导出 `setupAstgrepModule(ctx)`（宿主按 config.modules.astgrep 装配）；
 * 无用户配置项（语言由工具参数指定），故不注册 settings section，仅 host remote
 * 状态（二进制检测 + 安装引导）供设置页 tab 展示。
 */
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-subprocess' // 触发 Context.subprocess 类型增强
import { AstgrepStatusGateway } from '../lib/status.js' // 构建产物（装饰器需转译）
import { createSearchTool, createEditTool } from './tools.ts'

/** 模块挂载点：宿主 `config.modules.astgrep` 为 true 时调用。 */
export function setupAstgrepModule(ctx: Context) {
  console.log('[dsh-omp-tools:astgrep] setup OK')

  // host remote：设置页状态（二进制检测 + 安装引导）
  new AstgrepStatusGateway(ctx)

  // 工具注册：ast_search（只读）+ ast_edit（写，经 ctx.fs 审批）
  ctx.tools.register(createSearchTool(ctx))
  ctx.tools.register(createEditTool(ctx))
}
