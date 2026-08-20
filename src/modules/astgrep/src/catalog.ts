/**
 * astgrep 模块 · 语言目录（ast-grep CLI 支持的常用子集，按岗位分组）。
 * 语言名 = ast-grep CLI 的 `-l` 参数拼写（官方 languages 列表）。
 * 与 LSP 模块的 16 语言目录对齐（SQL/R 无 ast-grep 支持，不列入）。
 */

export interface AstgrepLanguageEntry {
  /** ast-grep CLI 语言名（-l 参数） */
  id: string
  displayName: string
  group: string
  priority: string
}

export const ASTGREP_CATALOG: AstgrepLanguageEntry[] = [
  // 前端
  { id: 'typescript', displayName: 'TypeScript', group: '前端', priority: 'P0' },
  { id: 'javascript', displayName: 'JavaScript', group: '前端', priority: 'P0' },
  { id: 'tsx', displayName: 'TSX (React)', group: '前端', priority: 'P1' },
  { id: 'jsx', displayName: 'JSX (React)', group: '前端', priority: 'P1' },
  { id: 'html', displayName: 'HTML', group: '前端', priority: 'P2' },
  { id: 'css', displayName: 'CSS/SCSS', group: '前端', priority: 'P2' },
  // 后端
  { id: 'python', displayName: 'Python', group: '后端', priority: 'P0' },
  { id: 'go', displayName: 'Go', group: '后端', priority: 'P1' },
  { id: 'rust', displayName: 'Rust', group: '后端', priority: 'P1' },
  { id: 'java', displayName: 'Java', group: '后端', priority: 'P2' },
  { id: 'csharp', displayName: 'C#', group: '后端', priority: 'P2' },
  { id: 'php', displayName: 'PHP', group: '后端', priority: 'P2' },
  { id: 'ruby', displayName: 'Ruby', group: '后端', priority: 'P2' },
  { id: 'cpp', displayName: 'C/C++', group: '后端', priority: 'P2' },
  // 移动端
  { id: 'swift', displayName: 'Swift', group: 'iOS', priority: 'P1' },
  { id: 'kotlin', displayName: 'Kotlin', group: 'Android', priority: 'P2' },
]

/** 安装模板：npm 全局安装 ast-grep CLI（用户级；`sg` 为旧名别名）。 */
export const ASTGREP_INSTALL = {
  command: 'npm',
  args: ['install', '-g', '@ast-grep/cli'],
  note: 'npm i -g @ast-grep/cli（ast-grep CLI 内置全部语言的 tree-sitter 解析器）',
}

/** 二进制候选：新名优先，旧名 sg 兜底。 */
export const ASTGREP_BINARIES = ['ast-grep', 'sg'] as const
