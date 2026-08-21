/**
 * edit 模块 · 锚定编辑核心（hashline 思路，迭代 3）。
 * 价值：防止「基于过期内容编辑」——每个替换以原文精确锚定，
 * 锚点不存在（文件已被修改/从未存在）或歧义（多处出现）时**拒绝整个操作**，
 * 而不是像 str-replace 那样静默替换或替换错位置。
 */

export interface AnchoredEdit {
  /** 预期当前文件中的原文（锚定）——必须精确匹配且唯一 */
  oldText: string
  /** 替换后的新文本 */
  newText: string
}

export interface AnchoredEditResult {
  ok: boolean
  /** 成功时的完整新文本 */
  text?: string
  /** 失败原因列表（锚点 not found / ambiguous） */
  errors: string[]
  /** 每个 edit 的锚点起始偏移（成功时，按传入顺序） */
  positions: number[]
}

/** 定位所有出现的锚点位置。 */
function findAllOccurrences(source: string, needle: string): number[] {
  const hits: number[] = []
  let at = source.indexOf(needle)
  while (at !== -1) {
    hits.push(at)
    at = source.indexOf(needle, at + needle.length)
  }
  return hits
}

/**
 * 应用锚定编辑：全部锚点必须唯一命中，否则整体拒绝（不产生部分应用）。
 * 成功时按锚点在原文中的位置从后往前替换（避免偏移错位）。
 */
export function applyAnchoredEdits(source: string, edits: AnchoredEdit[]): AnchoredEditResult {
  if (edits.length === 0) return { ok: false, errors: ['no edits provided'], positions: [] }

  // 第一阶段：定位所有锚点（全部通过才允许应用）
  const located: Array<{ index: number; start: number; end: number }> = []
  const errors: string[] = []
  for (let i = 0; i < edits.length; i += 1) {
    const e = edits[i]
    if (!e.oldText) {
      errors.push(`edit ${i + 1}: empty anchor (oldText)`)
      continue
    }
    const hits = findAllOccurrences(source, e.oldText)
    if (hits.length === 0) {
      errors.push(`edit ${i + 1}: anchor not found——文件内容可能已变更，请先 read 最新内容再编辑`)
    } else if (hits.length > 1) {
      errors.push(`edit ${i + 1}: anchor ambiguous（出现 ${hits.length} 次），请包含更多上下文`)
    } else {
      located.push({ index: i, start: hits[0], end: hits[0] + e.oldText.length })
    }
  }
  if (errors.length > 0) return { ok: false, errors, positions: [] }

  // 第二阶段：从后往前应用（锚点基于编辑前的原文）
  const sorted = [...located].sort((a, b) => b.start - a.start)
  let text = source
  for (const loc of sorted) {
    const e = edits[loc.index]
    text = text.slice(0, loc.start) + e.newText + text.slice(loc.end)
  }
  const positions = located.sort((a, b) => a.index - b.index).map((l) => l.start)
  return { ok: true, text, errors: [], positions }
}

/** 计算锚点所在行号（1-based，用于摘要展示）。 */
export function lineOfOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
}
