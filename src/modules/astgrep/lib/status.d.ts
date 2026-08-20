/**
 * lib/status.js 的类型声明（手写，与 src/status.ts 的 gateway 对齐）。
 * 运行时实现由 esbuild 转译 src/status.ts 生成（装饰器需转译，源码不能直接加载）。
 */
import type { Context } from '@deepseek-ai/cordis'

export interface AstgrepLanguageEntry {
  id: string
  displayName: string
  group: string
  priority: string
}

export interface AstgrepStatusDescribe {
  languages: AstgrepLanguageEntry[]
  binary: { found: boolean; version?: string; path?: string; reason?: string }
  installCommand: string
}

export interface AstgrepInstallResult {
  ok: boolean
  binary?: { found: boolean; version?: string; path?: string; reason?: string }
  message?: string
  command?: string
}

export class AstgrepStatusGateway {
  constructor(ctx: Context)
  describe(): AstgrepStatusDescribe
  installBinary(): Promise<AstgrepInstallResult>
}
