/**
 * read 模块 · 摘要与选择器核心（迭代 3）。
 * 价值：读大文件不 dump 全文——先给结构化摘要（符号索引 + 规模），
 * 命中片段才用行选择器取局部内容，省 token、防上下文稀释。
 * 符号提取为跨语言轻量正则（迭代 3 基线；后续可升级 ast-grep kind 提取）。
 */

import { basename, extname } from 'node:path'

/** 一个符号索引条目 */
export interface SymbolEntry {
  kind: 'function' | 'class' | 'method' | 'const' | 'type' | 'unknown'
  line: number
  name: string
  /** 去缩进的签名行（截断） */
  signature: string
}

/** 语言推断：扩展名 → 显示名（符号提取不区分语言，统一正则基线） */
const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TSX', '.js': 'JavaScript', '.jsx': 'JSX', '.mjs': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.c': 'C', '.h': 'C',
  '.cpp': 'C++', '.cc': 'C++', '.hpp': 'C++', '.cs': 'C#', '.php': 'PHP', '.rb': 'Ruby',
  '.swift': 'Swift', '.kt': 'Kotlin', '.kts': 'Kotlin', '.vue': 'Vue', '.html': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.json': 'JSON', '.yml': 'YAML', '.yaml': 'YAML',
  '.sh': 'Shell', '.md': 'Markdown', '.sql': 'SQL', '.r': 'R',
}

export function languageOf(file: string): string {
  return LANG_BY_EXT[extname(file).toLowerCase()] ?? 'unknown'
}

/** 跨语言定义行正则（按顺序匹配，取首个命中） */
const DEFINITION_PATTERNS: Array<{ kind: SymbolEntry['kind']; re: RegExp }> = [
  { kind: 'function', re: /\b(?:function|def|func|fun|fn|sub)\s+([A-Za-z_$][\w$]*)\s*\(/ },
  { kind: 'class', re: /\b(?:class|struct|interface|trait|enum)\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /\b(?:type|impl)\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'const', re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: 'method', re: /^\s*(?:public|private|protected|static|async|export\s+(?:default\s+)?)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/ },
]

/** 判断一行是否像定义（排除明显注释/字符串引导行） */
function looksLikeCode(line: string): boolean {
  const trimmed = line.trimStart()
  if (!trimmed) return false
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) return false
  if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('`')) return false
  return true
}

/** 提取符号索引：逐行匹配定义模式。 */
export function extractSymbols(source: string, limit = 100): SymbolEntry[] {
  const lines = source.split('\n')
  const symbols: SymbolEntry[] = []
  for (let i = 0; i < lines.length && symbols.length < limit; i += 1) {
    const line = lines[i]
    if (!looksLikeCode(line)) continue
    for (const { kind, re } of DEFINITION_PATTERNS) {
      const m = re.exec(line)
      if (m) {
        symbols.push({
          kind,
          line: i + 1,
          name: m[1],
          signature: line.trim().replace(/\s+/g, ' ').slice(0, 100),
        })
        break
      }
    }
  }
  return symbols
}

/** 解析行选择器：'50-100' / '50-' / '-100' / '50' → [start, end]（1-based 闭区间）。 */
export function parseLineSelector(selector: string | undefined, totalLines: number): [number, number] | null {
  if (!selector) return null
  const s = selector.trim()
  if (!s) return null
  const m = /^(\d*)\s*-\s*(\d*)$/.exec(s)
  if (m) {
    const start = m[1] ? Math.max(1, Number(m[1])) : 1
    const end = m[2] ? Math.min(totalLines, Number(m[2])) : totalLines
    if (start > end) return null
    return [start, end]
  }
  if (/^\d+$/.test(s)) {
    const line = Number(s)
    if (line < 1 || line > totalLines) return null
    return [line, line]
  }
  return null
}

/** 取指定行的片段（带行号前缀）。 */
export function sliceLines(source: string, start: number, end: number, maxWidth = 200): string {
  const lines = source.split('\n')
  const out: string[] = []
  for (let i = start; i <= end && i <= lines.length; i += 1) {
    const text = lines[i - 1] ?? ''
    const shown = text.length > maxWidth ? text.slice(0, maxWidth) + '…' : text
    out.push(`${String(i).padStart(5)}| ${shown}`)
  }
  return out.join('\n')
}

/** 摘要主体：规模 + 符号索引。大文件（> maxIndexLines）只给符号索引并提示选择器。 */
export interface SummaryResult {
  lines: number
  bytes: number
  language: string
  symbols: SymbolEntry[]
  /** 是否因文件过大截断了符号索引 */
  truncated: boolean
}

export function summarize(source: string, file: string): SummaryResult {
  const lines = source.split('\n').length
  const bytes = Buffer.byteLength(source, 'utf8')
  const language = languageOf(file)
  // 大文件（>2000 行）符号索引上限放宽但提示用选择器
  const limit = lines > 2000 ? 150 : 100
  const symbols = extractSymbols(source, limit)
  return { lines, bytes, language, symbols, truncated: symbols.length >= limit }
}
