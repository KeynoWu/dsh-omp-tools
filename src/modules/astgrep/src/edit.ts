/**
 * astgrep 模块 · 编辑应用：CLI dry-run 产出的字节区间编辑 → ctx.fs 写盘。
 * 审批/沙箱与 lsp_rename 同层（writeText 带 sandboxPolicy + fs/write-intent 钩子）。
 */

export interface ByteEdit {
  byteStart: number
  byteEnd: number
  replacement: string
}

/**
 * 按 UTF-8 字节区间从后往前应用替换（ast-grep 的 byteOffset 是 UTF-8 字节，
 * 中文等多字节字符安全；从后往前避免偏移错位）。
 */
export function applyByteEdits(source: string, edits: ByteEdit[]): string {
  if (edits.length === 0) return source
  const buf = Buffer.from(source, 'utf8')
  const sorted = [...edits].sort((a, b) => b.byteStart - a.byteStart)
  const parts: Buffer[] = []
  let tail = buf.length
  for (const e of sorted) {
    // 越界/重叠防御：丢弃非法区间
    if (e.byteStart < 0 || e.byteEnd > buf.length || e.byteStart > e.byteEnd || e.byteEnd > tail) continue
    parts.unshift(Buffer.from(e.replacement, 'utf8'), buf.subarray(e.byteEnd, tail))
    tail = e.byteStart
  }
  return Buffer.concat([buf.subarray(0, tail), ...parts]).toString('utf8')
}

/** ctx.fs seam 最小类型（与 lsp_rename 一致）。 */
export interface FsSeam {
  resolve(path: string, opts?: { signal?: AbortSignal }): Promise<{ displayPath: string }>
  readText(target: { displayPath: string }, signal?: AbortSignal): Promise<string>
  writeText(target: { displayPath: string }, content: string, intent?: unknown, signal?: AbortSignal, sandboxPolicy?: unknown): Promise<unknown>
  sandboxMode?: string
}

/** 把编辑列表按文件分组应用，返回改动摘要（未变化的文件跳过）。 */
export async function applyEditsToFiles(
  fs: FsSeam,
  edits: Array<{ file: string } & ByteEdit>,
  signal?: AbortSignal,
  sandboxPolicy?: unknown,
): Promise<string[]> {
  const byFile = new Map<string, Array<{ file: string } & ByteEdit>>()
  for (const e of edits) {
    const list = byFile.get(e.file)
    if (list) list.push(e)
    else byFile.set(e.file, [e])
  }
  const summary: string[] = []
  for (const [path, list] of byFile) {
    const target = await fs.resolve(path, { signal })
    const before = await fs.readText(target, signal)
    const after = applyByteEdits(before, list)
    if (after === before) continue
    await fs.writeText(target, after, undefined, signal, sandboxPolicy)
    summary.push(`  ${target.displayPath} (${list.length} edit${list.length > 1 ? 's' : ''})`)
  }
  return summary
}
