/**
 * dsh-omp-tools · astgrep 模块 client 端：OMP Tools 设置页的「AST 搜索」tab（迭代 2）。
 * 由根壳（src/client/index.tsx）的 registerAstgrepTab 装配：注册 `omp-tools.tab`
 * 贡献（id: 'astgrep', order 1）。内容：ast-grep 二进制状态（可用✓/缺失⚠+安装）
 * + 支持语言列表（只读展示，无配置项——语言由工具参数指定）。
 */
import { useState, useEffect } from 'react'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
// 触发 client 端包的 cordis Context 类型增强（slots/locale/settingsScope/remote）
import '@deepseek-ai/dsh-client-runtime/client'
import '@deepseek-ai/dsh-client-locale/client'
import '@deepseek-ai/dsh-client-ui-settings/client'
import '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

// 增强 LocaleNamespaceMap：注册本模块的 locale namespace
type AstgrepLocaleKey =
  | 'nav' | 'summary' | 'statusAvailable' | 'statusMissing' | 'statusUnknown' | 'statusFailed'
  | 'install' | 'installing' | 'installError' | 'languagesTitle'

const zh = {
  nav: 'AST 搜索',
  summary: 'AST 结构化搜索与批量重写（ast-grep）：按代码语法模式查找/替换，避开注释与字符串噪音。',
  statusAvailable: '可用',
  statusMissing: '缺失',
  statusUnknown: '…',
  statusFailed: '状态加载失败',
  install: '安装',
  installing: '…',
  installError: '安装失败',
  languagesTitle: '支持的语言（无需配置，工具按需指定）',
}

const en = {
  nav: 'AST Search',
  summary: 'AST structural search & batch rewrite (ast-grep): pattern-based find/replace on syntax, no comment/string noise.',
  statusAvailable: 'available',
  statusMissing: 'missing',
  statusUnknown: '…',
  statusFailed: 'status load failed',
  install: 'Install',
  installing: '…',
  installError: 'Install failed',
  languagesTitle: 'Supported languages (no config; tools take lang per call)',
}

const dictionaries = { zh, en } as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    astgrep: AstgrepLocaleKey
  }
}

/** host remote 返回的状态结构（与 src/status.ts 的 AstgrepStatusDescribe 对齐） */
interface AstgrepStatusDescribe {
  languages: Array<{ id: string; displayName: string; group: string; priority: string }>
  binary: { found: boolean; version?: string; path?: string; reason?: string }
  installCommand: string
}

/** fallback 语言列表：仅当 host remote 不可用时使用（保证 tab 永不空白） */
const FALLBACK_LANGUAGES: AstgrepStatusDescribe['languages'] = [
  { id: 'typescript', displayName: 'TypeScript', group: '前端', priority: 'P0' },
  { id: 'javascript', displayName: 'JavaScript', group: '前端', priority: 'P0' },
  { id: 'tsx', displayName: 'TSX (React)', group: '前端', priority: 'P1' },
  { id: 'jsx', displayName: 'JSX (React)', group: '前端', priority: 'P1' },
  { id: 'html', displayName: 'HTML', group: '前端', priority: 'P2' },
  { id: 'css', displayName: 'CSS/SCSS', group: '前端', priority: 'P2' },
  { id: 'python', displayName: 'Python', group: '后端', priority: 'P0' },
  { id: 'go', displayName: 'Go', group: '后端', priority: 'P1' },
  { id: 'rust', displayName: 'Rust', group: '后端', priority: 'P1' },
  { id: 'java', displayName: 'Java', group: '后端', priority: 'P2' },
  { id: 'csharp', displayName: 'C#', group: '后端', priority: 'P2' },
  { id: 'php', displayName: 'PHP', group: '后端', priority: 'P2' },
  { id: 'ruby', displayName: 'Ruby', group: '后端', priority: 'P2' },
  { id: 'cpp', displayName: 'C/C++', group: '后端', priority: 'P2' },
  { id: 'swift', displayName: 'Swift', group: 'iOS', priority: 'P1' },
  { id: 'kotlin', displayName: 'Kotlin', group: 'Android', priority: 'P2' },
]

// client 端 remote 类型增强：`ctx.remote.astgrepStatus.describe() / installBinary()`
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    astgrepStatus: {
      describe(): Promise<AstgrepStatusDescribe>
      installBinary(): Promise<{ ok: boolean; binary?: AstgrepStatusDescribe['binary']; message?: string; command?: string }>
    }
  }
}

const NS = 'astgrep'

/**
 * host remote 贡献描述符（astgrepStatus.describe/installBinary）——codec 必须
 * strict + zod schema（与 host manifest 对称）。由根壳统一 $mount：
 * typert RemoteStore 按 package 名注册、只允许一次，多模块必须合并 descriptors。
 */
export const astgrepRemoteDescriptors: InvocationDescriptor[] = [{
  id: 'astgrepStatus.describe',
  service: 'astgrepStatus',
  namespace: 'astgrepStatus',
  method: 'describe',
  invocation: { kind: 'direct' } as const,
  parameters: [],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-omp-tools/types#AstgrepStatusDescribe',
    schema: z.object({
      languages: z.array(z.object({
        id: z.string(), displayName: z.string(), group: z.string(), priority: z.string(),
      })),
      binary: z.object({
        found: z.boolean(), version: z.string().optional(), path: z.string().optional(), reason: z.string().optional(),
      }),
      installCommand: z.string(),
    }),
  },
}, {
  id: 'astgrepStatus.installBinary',
  service: 'astgrepStatus',
  namespace: 'astgrepStatus',
  method: 'installBinary',
  invocation: { kind: 'direct' } as const,
  parameters: [],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-omp-tools/types#AstgrepInstallResult',
    schema: z.object({
      ok: z.boolean(),
      binary: z.object({
        found: z.boolean(), version: z.string().optional(), path: z.string().optional(), reason: z.string().optional(),
      }).optional(),
      message: z.string().optional(),
      command: z.string().optional(),
    }),
  },
}]

interface TabProps {
  /** slots 系统注入的 translate（按注册时 locale: NS） */
  t: TranslateNS<'astgrep'>
  /** 直接 props（来自 inject 返回的额外键） */
  loadStatus: () => Promise<AstgrepStatusDescribe>
  installBinary: () => Promise<{ ok: boolean; message?: string }>
}

function AstgrepSettingsTab({ t, loadStatus, installBinary }: TabProps) {
  const [status, setStatus] = useState<AstgrepStatusDescribe | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | undefined>(undefined)

  const refresh = () => {
    loadStatus()
      .then((s) => { setStatus(s); setLoadFailed(false); setLoadError(undefined) })
      .catch((e: unknown) => { setLoadFailed(true); setLoadError(e instanceof Error ? e.message : String(e)) })
  }

  useEffect(() => {
    let alive = true
    loadStatus()
      .then((s) => { if (alive) { setStatus(s); setLoadFailed(false); setLoadError(undefined) } })
      .catch((e: unknown) => { if (alive) { setLoadFailed(true); setLoadError(e instanceof Error ? e.message : String(e)) } })
    return () => { alive = false }
  }, [loadStatus])

  const onInstall = async () => {
    setInstalling(true)
    setInstallError(undefined)
    try {
      const res = await installBinary()
      if (!res.ok) setInstallError(`${res.message ?? 'install failed'}`)
      refresh()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  const binary = status?.binary
  const badge = binary
    ? binary.found
      ? { text: binary.version ? `✓ ${binary.version}` : t('statusAvailable'), color: 'var(--dsw-alias-bg-success, #16a34a)' }
      : { text: `${t('statusMissing')} ⚠`, color: 'var(--dsw-alias-bg-warning, #d97706)' }
    : { text: t('statusUnknown'), color: 'var(--dsw-alias-label-tertiary)' }
  const languages = status?.languages?.length ? status.languages : FALLBACK_LANGUAGES
  const groups = [...new Set(languages.map((l) => l.group))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>
        {t('summary')}
      </p>
      {loadFailed && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
          （状态暂不可用：{loadError ?? '未知错误'}——语言列表为内置默认）
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span>ast-grep</span>
        <span style={{ fontSize: 11, color: badge.color, minWidth: 56, textAlign: 'right' }}>
          {badge.text}
        </span>
        {binary && !binary.found && (
          <button
            type="button"
            disabled={installing}
            onClick={() => void onInstall()}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              cursor: installing ? 'wait' : 'pointer',
              background: 'var(--dsw-alias-bg-module-platform, #f0f0f0)',
              border: '1px solid var(--dsw-alias-border-l2, #ddd)',
              borderRadius: 4,
            }}
          >
            {installing ? t('installing') : t('install')}
          </button>
        )}
      </div>
      {installError && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-error, #dc2626)' }}>
          {t('installError')}: {installError}
        </p>
      )}
      <h3 style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600 }}>{t('languagesTitle')}</h3>
      {groups.map((group) => (
        <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h4 style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{group}</h4>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.8 }}>
            {languages.filter((l) => l.group === group).map((l) => l.displayName).join(' · ')}
          </p>
        </div>
      ))}
    </div>
  )
}

/** OMP Tools 设置页的「AST 搜索」tab（根壳渲染 tablist，本模块注册贡献）。 */
export function registerAstgrepTab(ctx: Context) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-omp-tools:astgrep tab dictionaries')

  ctx.slots.inject('omp-tools.tab', () => ctx.slots.register({
    name: 'omp-tools.tab',
    id: 'astgrep',
    order: 1,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({
      loadStatus: () => {
        const svc = ctx.get?.('remote.astgrepStatus') as { describe(): Promise<AstgrepStatusDescribe> } | undefined
        return svc ? svc.describe() : Promise.reject(new Error('astgrep status remote not ready yet'))
      },
      installBinary: () => {
        const svc = ctx.get?.('remote.astgrepStatus') as { installBinary(): Promise<{ ok: boolean; message?: string }> } | undefined
        return svc ? svc.installBinary() : Promise.reject(new Error('astgrep status remote not ready yet'))
      },
    }),
  }, AstgrepSettingsTab))
}
