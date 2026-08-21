/**
 * dsh-omp-tools · read 模块（迭代 3：大文件摘要 + 选择器）。
 * 价值主张：省 token、防上下文稀释——先结构化摘要（符号索引）定位，
 * 再按行选择器取局部片段。无外部依赖、无配置项、无设置页 tab（纯工具模块）。
 *
 * 模块约定：导出 `setupReadModule(ctx)`（宿主按 config.modules.read 装配）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { createReadSummaryTool } from './tools.ts'

/** 模块挂载点：宿主 `config.modules.read` 为 true 时调用。 */
export function setupReadModule(ctx: Context) {
  console.log('[dsh-omp-tools:read] setup OK')
  ctx.tools.register(createReadSummaryTool(ctx))
}
