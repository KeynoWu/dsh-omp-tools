/**
 * dsh-omp-tools client 壳：OMP Tools 设置 section（tabs 组织能力模块子页）。
 *
 * 模式对齐官方 Plugins 设置页（dsh-client-ui-settings-plugins）：
 * - 注册 `settings.section`（id: 'omp-tools'），内容区渲染 tablist；
 * - 声明 `omp-tools.tab` slot（kind: list）——每个能力模块注册一个 tab
 *   （LSP 模块 → 'lsp' tab，后续 astgrep/edit/read/memory 各一个 tab）；
 * - 壳只投影 tab ledger（id/order/label）并 renderSlot，不感知任何模块内容。
 *
 * 模块 tab 的注册函数由本文件静态 import（单 bundle 装配）：
 * `registerLspTab(ctx)` 在 modules/lsp/src/client/ 内，含该模块的 $mount
 * 与 tab 注册。新增模块时在此 import + 调用其 register 函数。
 */
import { useState, useEffect, useRef, useId } from 'react'
import type { Context } from '@deepseek-ai/cordis'
// 触发 client 端包的 cordis Context 类型增强（slots/locale/settingsScope/remote）
import '@deepseek-ai/dsh-client-runtime/client'
import '@deepseek-ai/dsh-client-locale/client'
import '@deepseek-ai/dsh-client-ui-settings/client'
import '@deepseek-ai/dsh-api-remotes/client'
import { resolveSlotLabel, type TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { registerLspTab } from '../modules/lsp/src/client/index.tsx'
import { registerAstgrepTab } from '../modules/astgrep/src/client/index.tsx'

// 壳声明的子 slot：每个能力模块一个 tab（对齐 settings.plugins.tab 声明模式）
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'omp-tools.tab': {
      kind: 'list'
      scope: 'root'
      owner: OmpToolsTabOwnerProps
    }
  }
}

/** Owner share of an OMP Tools tab (the shell supplies nothing). */
export interface OmpToolsTabOwnerProps {
  /** Marker field: tab owner props are intentionally empty. */
  children?: never
}

// 增强 LocaleNamespaceMap：注册壳自己的 locale namespace（值取字典键集合）
type OmpToolsLocaleKey =
  | 'nav' | 'title' | 'intro' | 'empty' | 'tabs'

const zh = {
  nav: 'OMP Tools',
  title: 'OMP Tools',
  intro: '参考 oh-my-pi 的 coding 能力增强工具集，按模块分组配置。',
  empty: '暂无可配置模块（在 profile 的 cordis 组合中挂载 dsh-omp-tools 后出现）。',
  tabs: 'OMP Tools 能力模块',
}

const en = {
  nav: 'OMP Tools',
  title: 'OMP Tools',
  intro: 'Coding capability toolkit modeled on oh-my-pi, grouped by module.',
  empty: 'No configurable modules yet (mount dsh-omp-tools in the profile composition).',
  tabs: 'OMP Tools capability modules',
}

const dictionaries = { zh, en } as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'omp-tools': OmpToolsLocaleKey
  }
}

/** 一个 tab 的投影（来自 omp-tools.tab ledger） */
interface OmpToolsTabEntry {
  id: string
  order: number
  label: string
}

interface SectionProps {
  close: () => void
  t: TranslateNS<'omp-tools'>
  useTabs: <S>(sel: (s: readonly OmpToolsTabEntry[]) => S, eq?: (a: S, b: S) => boolean) => S
  renderSlot: (name: 'omp-tools.tab', options: Record<string, unknown>, filters: { only: string }) => React.ReactNode
}

/** OMP Tools section：tablist 导航 + 每个能力模块一个 tabpanel（抄官方 Plugins 模式，内联样式版）。 */
function OmpToolsSection({ t, useTabs, renderSlot }: SectionProps) {
  const tabsId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rows = useTabs((value) => value)
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [visitedIds, setVisitedIds] = useState<Set<string>>(() => new Set())
  const active = rows.find((row) => row.id === activeId)?.id ?? rows[0]?.id

  useEffect(() => {
    if (active === undefined) return
    setVisitedIds((previous) => {
      if (previous.has(active)) return previous
      return new Set([...previous, active])
    })
  }, [active])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('title')}</h2>
      <p style={{ margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>
        {t('intro')}
      </p>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('empty')}</p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t('tabs')}
            style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--dsw-alias-border-l2, #eee)', paddingBottom: 8 }}
          >
            {rows.map((row, index) => {
              const selected = row.id === active
              return (
                <button
                  key={row.id}
                  ref={(el) => { tabRefs.current[index] = el }}
                  id={`${tabsId}-tab-${row.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${tabsId}-panel-${row.id}`}
                  data-active={selected ? 'true' : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(row.id)}
                  onKeyDown={(event) => {
                    let nextIndex: number | undefined
                    switch (event.key) {
                      case 'ArrowRight': nextIndex = (index + 1) % rows.length; break
                      case 'ArrowLeft': nextIndex = (index - 1 + rows.length) % rows.length; break
                      case 'Home': nextIndex = 0; break
                      case 'End': nextIndex = rows.length - 1; break
                      default: return
                    }
                    event.preventDefault()
                    const nextRow = rows[nextIndex]
                    setActiveId(nextRow.id)
                    tabRefs.current[nextIndex]?.focus()
                  }}
                  style={{
                    padding: '4px 12px',
                    fontSize: 13,
                    border: 'none',
                    background: selected ? 'var(--dsw-alias-bg-module-platform, #f0f0f0)' : 'transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {row.label}
                </button>
              )
            })}
          </div>
          {rows.filter((row) => row.id === active || visitedIds.has(row.id)).map((row) => {
            const selected = row.id === active
            return (
              <div
                key={row.id}
                id={`${tabsId}-panel-${row.id}`}
                role="tabpanel"
                aria-labelledby={`${tabsId}-tab-${row.id}`}
                hidden={!selected}
              >
                {renderSlot('omp-tools.tab', {}, { only: row.id })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

const NS = 'omp-tools'

export function apply(ctx: Context) {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-omp-tools: shell dictionaries')

  // tabs ledger：从 omp-tools.tab slot entries 投影（含 locale 变更重投影）
  let tabsVersion = -1
  let tabsRevision = -1
  let tabs: readonly OmpToolsTabEntry[] = []
  const sectionInjected = () => ({
    hooks: {
      tabs: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('omp-tools.tab')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== tabsVersion || revision !== tabsRevision) {
            tabsVersion = version
            tabsRevision = revision
            tabs = ctx.slots.entries('omp-tools.tab')
              .map((entry) => ({
                id: entry.options.id ?? '',
                order: entry.options.order ?? 0,
                label: resolveSlotLabel(entry.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return tabs
        },
        subscribe: (listener: () => void) => {
          const offLedger = ctx.slots.subscribe('omp-tools.tab', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => { offLedger(); offLocale() }
        },
      },
    },
  })

  // OMP Tools 主 section（导航出现一项，内部 tabs 组织能力模块）
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'omp-tools',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: sectionInjected,
    children: { 'omp-tools.tab': { kind: 'list', scope: 'root' } },
  }, OmpToolsSection))

  // 能力模块 tab：迭代 1 = LSP 语言，迭代 2 = AST 搜索
  registerLspTab(ctx)
  registerAstgrepTab(ctx)
}

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope'] as const
