/**
 * read 模块 · 工具注册：read_summary（大文件摘要 + 行选择器）。
 * 与核心 read 的差异：不 dump 全文——先给结构化摘要（规模 + 符号索引），
 * 需要局部内容时用 lines 选择器取片段。省 token、防上下文稀释。
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { summarize, parseLineSelector, sliceLines, languageOf, type SymbolEntry } from './summarize.ts'

export interface ExecLike {
  signal: AbortSignal
  agent?: { session?: { header?: { cwd?: string } } }
}

function sessionCwd(exec: ExecLike): string {
  return exec.agent?.session?.header?.cwd ?? process.cwd()
}

/** ctx.fs seam 最小类型。 */
export interface FsSeam {
  resolve(path: string, opts?: { signal?: AbortSignal }): Promise<{ displayPath: string }>
  readText(target: { displayPath: string }, signal?: AbortSignal): Promise<string>
}

const KIND_LABEL: Record<SymbolEntry['kind'], string> = {
  function: 'fn',
  method: 'method',
  class: 'class',
  type: 'type',
  const: 'const',
  unknown: '?',
}

export function createReadSummaryTool(ctx: Context) {
  return defineTool({
    name: 'read_summary',
    description:
      '大文件摘要读取——不 dump 全文，先给结构化摘要：文件规模（行数/字节/语言）+ 符号索引（函数/类/方法/常量，按行号定位）。' +
      '需要局部内容时用 lines 参数取片段（如 "50-100" / "50-" / "-100" / "50"）。' +
      '**使用时机**：读取超过约 100 行的文件、或修改代码前需要定位目标符号时，优先用本工具而非 read——省 token、防上下文稀释；' +
      '先用摘要定位目标行号，再按需取片段；修改场景可配合 edit_anchored（read_summary 定位 → edit_anchored 精确修改）。' +
      '小文件（<50 行）直接用 read 更省事。',
    parameters: {
      file: { type: 'string', required: true, description: '目标文件路径（绝对，或相对会话工作区）' },
      lines: { type: 'string', description: '行选择器（1-based）："50-100" 区间、"50-" 到末尾、"-100" 开头到 100、"50" 单行' },
      maxSymbols: { type: 'number', description: '符号索引上限（默认 100，大文件 150）' },
      timeout: { type: 'number', description: '单次请求超时（秒，默认 20，钳制 5..300）' },
    },
    timeoutMs: 20_000,
    output: { schema: { type: 'string' }, render: (_a, v: string) => [{ type: 'text', text: v }] },
    async execute(args, exec: ExecLike) {
      try {
        const cwd = sessionCwd(exec)
        const file = isAbsolute(args.file) ? args.file : resolve(cwd, args.file)

        const fs = (ctx as Context & { fs?: FsSeam }).fs
        if (!fs) return 'read_summary requires the filesystem seam (ctx.fs), unavailable'

        const target = await fs.resolve(file, { signal: exec.signal })
        const source = await fs.readText(target, exec.signal)
        const summary = summarize(source, file)
        const lang = languageOf(file)

        const head = `${target.displayPath} · ${summary.lines} 行 · ${summary.bytes} B · ${lang}`
        const symbolLines = summary.symbols.map(
          (s) => `  :${String(s.line).padStart(5)}  ${KIND_LABEL[s.kind].padEnd(6)} ${s.name}  —  ${s.signature}`,
        )
        const symbolBlock = symbolLines.length > 0
          ? `符号索引（${summary.symbols.length}${summary.truncated ? '+，已达上限，用 lines 取片段' : ''}）:\n${symbolLines.join('\n')}`
          : '（未识别到符号——可能是数据/配置文件或语言模式未覆盖）'

        const range = parseLineSelector(args.lines, summary.lines)
        if (range) {
          const [start, end] = range
          return `${head}\n\n${symbolBlock}\n\n行 ${start}-${end}:\n${sliceLines(source, start, end)}`
        }

        // 大文件提示
        const tip = summary.lines > 2000
          ? `\n（文件较大：${summary.lines} 行。用 lines 参数取片段，如 lines: "1-100"）`
          : ''
        return `${head}\n\n${symbolBlock}${tip}`
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
  })
}
