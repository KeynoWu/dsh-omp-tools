/**
 * dsh-omp-tools 宿主装配层（模块化插件入口）。
 *
 * 架构（lsp-plugin-design.md 融合蓝图 v2）：
 * - 一个包、一个 settings 入口、一个 client 设置页（按能力分组）；
 * - 每个能力是一个独立模块（src/modules/<id>/），模块间零依赖，只通过
 *   宿主 apply 的 `config.modules` 开关决定是否挂载；
 * - 未启用的模块不注册任何工具、不加载其依赖（lazy 装配）；
 * - 模块内部自管 settings section（namespace 各自独立，如 `lsp`），
 *   已存用户配置零迁移。
 *
 * 模块清单（迭代路线）：
 * - modules/lsp   迭代 1：语言服务器池 + 语义工具（已完成 M1–M4）
 * - modules/astgrep  迭代 2：AST 结构化搜索/编辑（规划）
 * - modules/edit     迭代 3：hashline 锚定编辑（规划）
 * - modules/read     迭代 3：大文件摘要 + 选择器（规划）
 * - modules/memory   迭代 4：learn/checkpoint（规划）
 */
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-subprocess' // 触发 Context.subprocess 类型增强
import { setupLspModule } from './modules/lsp/src/index.ts'

export const name = 'dsh-omp-tools'

export const inject = ['tools', 'subprocess', 'fs'] as const

/** 宿主配置：模块开关（modules.<id> → 是否挂载该模块） */
export interface Config {
  modules: Record<string, boolean>
}

export const Config: z<Config> = z.object({
  modules: z.dict(z.boolean()).default({}),
})

export function apply(ctx: Context, config: Config) {
  console.log(`[dsh-omp-tools] apply OK, modules=${JSON.stringify(config.modules)}`)
  if (config.modules?.lsp) {
    setupLspModule(ctx)
  }
}
