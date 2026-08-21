/**
 * edit 模块 · 工具注册：edit_anchored（hashline 锚定编辑）。
 * 与核心 str-replace 的差异：锚点必须精确匹配且唯一，否则整体拒绝——
 * 防止「基于过期内容编辑」（文件已被其他操作改动后，旧锚点静默错位）。
 * 写操作经 ctx.fs seam 应用（沙箱感知 + fs/write-intent 审批钩子，同 lsp_rename/ast_edit）。
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { applyAnchoredEdits, lineOfOffset, type AnchoredEdit } from './apply.ts'

export interface ExecLike {
  signal: AbortSignal
  agent?: { session?: { header?: { cwd?: string } } }
}

function sessionCwd(exec: ExecLike): string {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

/** ctx.fs seam 最小类型（与 lsp_rename/ast_edit 一致）。 */
export interface FsSeam {
  resolve(path: string, opts?: { signal?: AbortSignal }): Promise<{ displayPath: string }>
  readText(target: { displayPath: string }, signal?: AbortSignal): Promise<string>
  writeText(target: { displayPath: string }, content: string, intent?: unknown, signal?: AbortSignal, sandboxPolicy?: unknown): Promise<unknown>
  sandboxMode?: string
}

export function createAnchoredEditTool(ctx: Context) {
  return defineTool({
    name: 'edit_anchored',
    description:
      '锚定编辑（hashline 思路）——基于当前文件内容的精确锚点做替换，防止基于过期内容编辑。' +
      '每个 edit 用 oldText（预期当前文件中的原文）做锚定：锚点不存在（文件已被改动）或出现多次（歧义）时**整体拒绝**，' +
      '不会像 str-replace 那样静默替换或替换错位置。' +
      '**使用时机**：修改已有代码时优先用本工具而非 str-replace——锚点精确匹配保证不会改错位置；' +
      '修改前先 read_summary 或 read 拿到最新内容，再基于最新锚点构造 edits（可批量）。' +
      '返回每个锚点的应用位置（行号）；写操作经 DSH 文件审批。',
    parameters: {
      file: { type: 'string', required: true, description: '目标文件路径（绝对，或相对会话工作区）' },
      edits: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            oldText: { type: 'string', required: true, description: '预期当前文件中的原文（锚定，需唯一匹配）' },
            newText: { type: 'string', required: true, description: '替换为的新文本' },
          },
        },
        description: '替换列表（可批量）；任一锚点不唯一命中则整体拒绝',
      },
      timeout: { type: 'number', description: '单次请求超时（秒，默认 20，钳制 5..300）' },
    },
    timeoutMs: 20_000,
    output: { schema: { type: 'string' }, render: (_a, v: string) => [{ type: 'text', text: v }] },
    async execute(args, exec: ExecLike) {
      try {
        const cwd = sessionCwd(exec)
        const file = isAbsolute(args.file) ? args.file : resolve(cwd, args.file)

        const fs = (ctx as Context & { fs?: FsSeam }).fs
        if (!fs) return 'edit_anchored requires the filesystem seam (ctx.fs), unavailable'
        const sandboxPolicy = ctx.get?.('sandboxPolicy') as unknown | undefined

        const target = await fs.resolve(file, { signal: exec.signal })
        const before = await fs.readText(target, exec.signal)

        const edits = (Array.isArray(args.edits) ? args.edits : []) as AnchoredEdit[]
        const result = applyAnchoredEdits(before, edits)
        if (!result.ok || result.text === undefined) {
          // 锚定失败 = 防过期保护触发：拒绝应用，明确指引
          return `edit_anchored rejected (${result.errors.length} anchor failure${result.errors.length > 1 ? 's' : ''}):\n` +
            result.errors.map((e) => `  - ${e}`).join('\n') +
            `\n文件当前状态可能与调用时不一致——请先 read ${target.displayPath} 获取最新内容，再基于最新锚点重试。`
        }
        if (result.text === before) {
          return `No change applied (anchors matched but replacements produced identical text)`
        }

        await fs.writeText(target, result.text, undefined, exec.signal, sandboxPolicy)

        const summary = edits.map((e, i) => {
          const line = lineOfOffset(before, result.positions[i] ?? 0)
          return `  ${target.displayPath}:${line}  ${e.oldText.length > 40 ? e.oldText.slice(0, 40) + '…' : e.oldText} → ${e.newText.length > 40 ? e.newText.slice(0, 40) + '…' : e.newText}`
        })
        return `Applied ${edits.length} anchored edit${edits.length > 1 ? 's' : ''} to ${target.displayPath}:\n${summary.join('\n')}`
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
  })
}
