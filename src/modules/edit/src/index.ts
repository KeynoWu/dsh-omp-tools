/**
 * dsh-omp-tools · edit 模块（迭代 3：hashline 锚定编辑）。
 * 价值主张：防止「基于过期内容编辑」——锚点不唯一命中即整体拒绝，
 * 补上核心 str-replace（纯 old→new 文本替换）在文件变更场景下的静默错位漏洞。
 * 无外部依赖（纯文本 + ctx.fs）、无配置项、无设置页 tab（纯工具模块）。
 *
 * 模块约定：导出 `setupEditModule(ctx)`（宿主按 config.modules.edit 装配）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { createAnchoredEditTool } from './tools.ts'

/** 模块挂载点：宿主 `config.modules.edit` 为 true 时调用。 */
export function setupEditModule(ctx: Context) {
  console.log('[dsh-omp-tools:edit] setup OK')
  ctx.tools.register(createAnchoredEditTool(ctx))
}
