/**
 * astgrep 模块 · host remote：二进制检测状态 + 安装引导（迭代 2）。
 * 通过 Typert Remote 暴露给 client 设置页（`ctx.remote.astgrepStatus.describe()`）。
 * 模式与 LSP 模块的 LspStatusGateway 一致（@Remote + TypertRemoteService）。
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import { ASTGREP_CATALOG, ASTGREP_INSTALL, type AstgrepLanguageEntry } from './catalog.ts'
import { detectAstgrep } from './search.ts'

export interface AstgrepStatusDescribe {
  languages: AstgrepLanguageEntry[]
  /** ast-grep 二进制检测结果 */
  binary: { found: boolean; version?: string; path?: string; reason?: string }
  installCommand: string
}

export interface AstgrepInstallResult {
  ok: boolean
  binary?: { found: boolean; version?: string; path?: string; reason?: string }
  message?: string
  command?: string
}

/**
 * JSON 安全化：删除对象中的 undefined 字段值。
 * typert 的边界校验（assertJsonValue 遍历 ownKeys）会拒绝 undefined——
 * zod parse 不删除已声明 optional 字段的 undefined 键，wire 层会报
 * "business result failed boundary validation"。
 */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class AstgrepStatusGateway extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'astgrepStatus')
  }

  /** 设置页所需全部状态：语言目录 + 二进制检测 + 安装命令。 */
  @Remote('describe')
  describe(): AstgrepStatusDescribe {
    const cwd = process.cwd()
    return jsonSafe({
      languages: ASTGREP_CATALOG,
      binary: detectAstgrep(cwd),
      installCommand: `${ASTGREP_INSTALL.command} ${ASTGREP_INSTALL.args.join(' ')}`,
    })
  }

  /** 安装引导：npm 全局安装 @ast-grep/cli（用户显式触发）。
   *  方法名必须与 @Remote 参数一致且避开保留名 `install`（typert M4 踩坑）。 */
  @Remote('installBinary')
  async installBinary(): Promise<AstgrepInstallResult> {
    const cwd = process.cwd()
    const argv = [ASTGREP_INSTALL.command, ...ASTGREP_INSTALL.args]
    try {
      const subprocess = (this.ctx as Context & { subprocess?: { spawn(spec: {
        argv: readonly string[]; cwd: string
        stdio: { stdin: 'ignore' | 'pipe'; stdout: { maxBytes: number }; stderr: { maxBytes: number } }
        graceMs: number
      }): { done: Promise<{ exitCode: number | null }>; terminate(): void } } }).subprocess
      if (!subprocess) return { ok: false, message: 'subprocess seam unavailable' }
      const handle = subprocess.spawn({
        argv,
        cwd,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 128 * 1024 }, stderr: { maxBytes: 128 * 1024 } },
        graceMs: 5000,
      })
      const outcome = await handle.done
      if (outcome.exitCode !== 0) {
        return jsonSafe({ ok: false, message: `Install failed (exit ${outcome.exitCode})`, command: argv.join(' ') })
      }
      const binary = detectAstgrep(cwd)
      if (binary.found) {
        return jsonSafe({ ok: true, binary, command: argv.join(' ') })
      }
      return jsonSafe({
        ok: false,
        binary,
        message: 'Install ran but ast-grep still not detected; check PATH',
        command: argv.join(' '),
      })
    } catch (error) {
      return jsonSafe({ ok: false, message: `Install error: ${error instanceof Error ? error.message : String(error)}`, command: argv.join(' ') })
    }
  }
}
