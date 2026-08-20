/**
 * astgrep 模块 · 工具注册：ast_search（只读）/ ast_edit（写，经 ctx.fs 审批）。
 * 与 lsp_* 的职责切分：LSP 回答「符号在哪」（语义），ast-grep 回答「按结构批量改」。
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runAstgrep } from './search.ts'
import { applyEditsToFiles, type FsSeam } from './edit.ts'
import { ASTGREP_CATALOG } from './catalog.ts'

export interface ExecLike {
  signal: AbortSignal
  agent?: { session?: { header?: { cwd?: string } } }
}

function sessionCwd(exec: ExecLike): string {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

function resolvePaths(paths: string[] | undefined, cwd: string): string[] {
  if (!paths?.length) return []
  return paths.map((p) => (isAbsolute(p) ? p : resolve(cwd, p)))
}

const LANG_HINT = ASTGREP_CATALOG.map((l) => l.id).join('/')

// ==================== ast_search ====================

export function createSearchTool(ctx: Context) {
  return defineTool({
    name: 'ast_search',
    description:
      'AST 结构化搜索——按代码语法模式而非文本查找（避开注释/字符串噪音，比 grep 精确）。' +
      `pattern 用 ast-grep 模式语法，$A/$B 为通配变量（如 "$A.foo($B)" 匹配任意对象调用 foo）。` +
      `lang 取值：${LANG_HINT} 等 ast-grep 支持的语言。` +
      '返回匹配列表（文件:行:列 + 匹配文本 + 所在行）。',
    parameters: {
      pattern: { type: 'string', required: true, description: 'AST 模式（ast-grep 语法，$A/$B 通配变量）' },
      lang: { type: 'string', required: true, description: `语言（如 ${LANG_HINT}）` },
      paths: { type: 'array', items: { type: 'string' }, description: '搜索路径（相对会话工作区；默认工作区根）' },
      globs: { type: 'array', items: { type: 'string' }, description: 'glob 过滤，如 ["**/*.ts", "!**/test/**"]' },
      limit: { type: 'number', description: '结果上限（默认 50）' },
      timeout: { type: 'number', description: '单次请求超时（秒，默认 20，钳制 5..300）' },
    },
    timeoutMs: 20_000,
    output: { schema: { type: 'string' }, render: (_a, v: string) => [{ type: 'text', text: v }] },
    async execute(args, exec: ExecLike) {
      try {
        const cwd = sessionCwd(exec)
        const matches = await runAstgrep(ctx, {
          pattern: args.pattern,
          lang: args.lang,
          cwd,
          paths: resolvePaths(args.paths, cwd),
          globs: args.globs,
          limit: args.limit ?? 50,
          signal: exec.signal,
        })
        if (matches.length === 0) return `No matches for ${JSON.stringify(args.pattern)} in ${args.lang}`
        const shown = matches.slice(0, args.limit ?? 50)
        const lines = shown.map((m) => {
          const ctxLine = m.lines?.trim() ? `\n      ${m.lines.trim()}` : ''
          return `  ${m.file}:${m.line}:${m.column}  ${m.text}${ctxLine}`
        })
        const truncated = matches.length > shown.length ? `\n（仅显示前 ${shown.length}/${matches.length} 条）` : ''
        return `Found ${matches.length} match${matches.length > 1 ? 'es' : ''} for ${JSON.stringify(args.pattern)} in ${args.lang}:\n${lines.join('\n')}${truncated}`
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
  })
}

// ==================== ast_edit ====================

export function createEditTool(ctx: Context) {
  return defineTool({
    name: 'ast_edit',
    description:
      'AST 结构化批量重写——按语法模式查找并以模板替换（一次改一批，跨文件一致）。' +
      'pattern 同 ast_search；rewrite 为替换模板，$A/$B 引用 pattern 中的通配变量（如 pattern "$A.foo($B)" rewrite "bar($B)"）。' +
      '写操作：默认直接应用（经 DSH 文件审批），改动文件与编辑数会返回；dryRun=true 时只返回预览不写盘。',
    parameters: {
      pattern: { type: 'string', required: true, description: 'AST 模式（ast-grep 语法，$A/$B 通配变量）' },
      rewrite: { type: 'string', required: true, description: '替换模板，$A/$B 引用通配捕获' },
      lang: { type: 'string', required: true, description: `语言（如 ${LANG_HINT}）` },
      paths: { type: 'array', items: { type: 'string' }, description: '重写范围路径（相对会话工作区；默认工作区根）' },
      globs: { type: 'array', items: { type: 'string' }, description: 'glob 过滤，如 ["**/*.ts", "!**/test/**"]' },
      dryRun: { type: 'boolean', description: 'true 时只返回改动预览，不写盘（默认 false）' },
      timeout: { type: 'number', description: '单次请求超时（秒，默认 20，钳制 5..300）' },
    },
    timeoutMs: 20_000,
    output: { schema: { type: 'string' }, render: (_a, v: string) => [{ type: 'text', text: v }] },
    async execute(args, exec: ExecLike) {
      try {
        const cwd = sessionCwd(exec)
        const edits = await runAstgrep(ctx, {
          pattern: args.pattern,
          lang: args.lang,
          cwd,
          paths: resolvePaths(args.paths, cwd),
          globs: args.globs,
          rewrite: args.rewrite,
          limit: 500,
          signal: exec.signal,
        })
        if (edits.length === 0) return `No matches for ${JSON.stringify(args.pattern)} in ${args.lang} — nothing to rewrite`

        // 预览片段（文件:行 + 替换前后）
        const preview = edits.slice(0, 20).map((e) => {
          const before = e.text
          const after = (e as { replacement?: string }).replacement ?? ''
          return `  ${e.file}:${e.line}:${e.column}  ${before} → ${after}`
        })
        const truncated = edits.length > 20 ? `\n  … 共 ${edits.length} 处` : ''
        if (args.dryRun) {
          return `Would rewrite ${edits.length} match${edits.length > 1 ? 'es' : ''} (dry run, not applied):\n${preview.join('\n')}${truncated}`
        }

        // 写盘：ctx.fs seam（沙箱感知 + fs/write-intent 审批钩子，同 lsp_rename）
        const fs = (ctx as Context & { fs?: FsSeam }).fs
        if (!fs) return 'ast_edit requires the filesystem seam (ctx.fs), unavailable'
        const sandboxPolicy = ctx.get?.('sandboxPolicy') as unknown | undefined
        // 过滤出带替换信息的编辑条目（dry-run 输出含 replacement/byteStart/byteEnd）
        const writable = edits.filter(
          (e): e is import('./search.ts').AstgrepEdit =>
            (e as { replacement?: string }).replacement !== undefined
            && (e as { byteStart?: number }).byteStart !== undefined
            && (e as { byteEnd?: number }).byteEnd !== undefined,
        )
        if (writable.length === 0) return 'ast-grep produced no rewrites for this pattern'
        const summary = await applyEditsToFiles(fs, writable, exec.signal, sandboxPolicy)
        if (summary.length === 0) return `No text changes applied (${edits.length} matches, all produced identical text)`
        return `Applied ${edits.length} edits across ${summary.length} file${summary.length > 1 ? 's' : ''}:\n${summary.join('\n')}`
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
  })
}
