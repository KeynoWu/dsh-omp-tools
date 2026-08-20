/**
 * astgrep 模块 · ast-grep CLI 封装：二进制检测 + `run --json=stream` 调用与解析。
 * 写盘不做（CLI 仅分析），改写由 edit.ts 经 ctx.fs 应用（审批/沙箱在 DSH 层）。
 */
import { execFileSync } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import { ASTGREP_BINARIES } from './catalog.ts'

/** 二进制检测结果（设置页状态徽标数据源）。 */
export interface AstgrepDetectResult {
  found: boolean
  version?: string
  path?: string
  reason?: string
}

/** 检测 ast-grep 二进制（新名 ast-grep 优先，旧名 sg 兜底；stderr 静默——同 pyright 噪音修复）。 */
export function detectAstgrep(cwd: string): AstgrepDetectResult {
  for (const bin of ASTGREP_BINARIES) {
    try {
      const out = execFileSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], cwd })
      return { found: true, version: out.toString().trim(), path: bin }
    } catch {
      // 尝试下一个候选
    }
  }
  return { found: false, reason: 'ast-grep 未在 PATH 中找到（npm i -g @ast-grep/cli）' }
}

/** 一个匹配（搜索模式）。行/列已转 1-based。 */
export interface AstgrepMatch {
  file: string
  /** 1-based 行号（CLI 输出 0-based，转换） */
  line: number
  /** 1-based 列号（CLI 输出为 UTF-8 字节列，转换） */
  column: number
  text: string
  /** 匹配所在整行（上下文展示） */
  lines: string
}

/** 一个编辑（重写模式）：在原文件中的字节区间 + 替换文本。 */
export interface AstgrepEdit extends AstgrepMatch {
  replacement: string
  byteStart: number
  byteEnd: number
}

export interface RunAstgrepOptions {
  pattern: string
  lang: string
  cwd: string
  paths?: string[]
  globs?: string[]
  rewrite?: string
  limit?: number
  signal?: AbortSignal
}

interface CliMatch {
  text?: string
  file?: string
  lines?: string
  replacement?: string
  range?: {
    byteOffset?: { start?: number; end?: number }
    start?: { line?: number; column?: number }
  }
}

/** 最小 subprocess 句柄类型（来自 ctx.subprocess.spawn）。 */
interface SubprocessHandle {
  stdout?: NodeJS.ReadableStream & { on(event: 'data', cb: (chunk: Buffer) => void): unknown }
  done: Promise<{ exitCode: number | null }>
  terminate(): void
}

/**
 * 运行 ast-grep run（--json=stream），返回解析后的 match/edit 列表。
 * 命中 limit 时中止读取（避免大输出）；CLI 退出非 0 且无输出时抛错。
 */
export async function runAstgrep(ctx: Context, opts: RunAstgrepOptions): Promise<Array<AstgrepMatch & Partial<AstgrepEdit>>> {
  const subprocess = (ctx as Context & { subprocess?: { spawn(spec: {
    argv: readonly string[]; cwd: string
    stdio: { stdin: 'ignore' | 'pipe'; stdout: 'pipe' | { maxBytes: number }; stderr: { maxBytes: number } }
    graceMs: number; signal?: AbortSignal
  }): SubprocessHandle } }).subprocess
  if (!subprocess) throw new Error('subprocess seam unavailable')

  // 二进制名（ast-grep 优先，sg 兜底）作为 argv[0]；未安装时给出引导提示
  const bin = detectAstgrep(opts.cwd)
  if (!bin.found || !bin.path) {
    throw new Error(`ast-grep 未安装（npm install -g @ast-grep/cli）：${bin.reason ?? ''}`)
  }
  const argv: string[] = [bin.path, 'run', '-p', opts.pattern]
  if (opts.rewrite !== undefined) argv.push('-r', opts.rewrite)
  argv.push('-l', opts.lang, '--json=stream')
  if (opts.globs?.length) for (const g of opts.globs) argv.push('--globs', g)
  if (opts.paths?.length) argv.push(...opts.paths)

  const handle = subprocess.spawn({
    argv,
    cwd: opts.cwd,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 128 * 1024 } },
    graceMs: 5000,
    signal: opts.signal,
  })
  if (!handle.stdout) throw new Error('ast-grep did not expose stdout pipe')

  const limit = opts.limit ?? 200
  const matches: Array<AstgrepMatch & Partial<AstgrepEdit>> = []
  let stopped = false
  let stderr = ''

  const outcome = await new Promise<{ exitCode: number | null }>((resolve, reject) => {
    handle.done.then(resolve, reject)
    handle.stdout!.on('data', (chunk: Buffer) => {
      if (stopped) return
      const text = chunk.toString('utf8')
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const m = JSON.parse(trimmed) as CliMatch
          if (typeof m.file !== 'string' || typeof m.range?.start?.line !== 'number') continue
          matches.push({
            file: m.file,
            line: m.range.start.line + 1,
            column: (m.range.start.column ?? 0) + 1,
            text: m.text ?? '',
            lines: m.lines ?? '',
            ...(m.replacement !== undefined && m.range.byteOffset
              ? {
                  replacement: m.replacement,
                  byteStart: m.range.byteOffset.start ?? 0,
                  byteEnd: m.range.byteOffset.end ?? 0,
                }
              : {}),
          })
          if (limit > 0 && matches.length >= limit) {
            stopped = true
            handle.terminate()
            break
          }
        } catch {
          // 非 JSON 行（警告等）忽略
        }
      }
    })
  })

  if (outcome.exitCode !== 0 && matches.length === 0) {
    throw new Error(`ast-grep failed (exit ${outcome.exitCode})${stderr ? `: ${stderr.slice(0, 300)}` : ''}`)
  }
  return matches
}
