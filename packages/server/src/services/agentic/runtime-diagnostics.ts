import { existsSync } from 'fs'
import { getHxaOverview, type HxaOverview } from './hxa-connect'
import { getConfiguredRuntimeProvider, getConfiguredRuntimeStatus, type RuntimeStatus } from './runtime-sdk'

export type RuntimeDiagnosticStatus = 'ok' | 'warning' | 'error'

export interface RuntimeDiagnosticItem {
  key: string
  label: string
  status: RuntimeDiagnosticStatus
  detail: string
  action?: string
}

export interface RuntimeDiagnostics {
  status: RuntimeDiagnosticStatus
  provider: string
  generatedAt: string
  checks: RuntimeDiagnosticItem[]
}

export interface RuntimeDiagnosticsDeps {
  getConfiguredRuntimeProvider?: typeof getConfiguredRuntimeProvider
  getConfiguredRuntimeStatus?: typeof getConfiguredRuntimeStatus
  getHxaOverview?: typeof getHxaOverview
  env?: NodeJS.ProcessEnv
  existsSync?: typeof existsSync
  now?: () => Date
}

function item(status: RuntimeDiagnosticStatus, key: string, label: string, detail: string, action?: string): RuntimeDiagnosticItem {
  return { key, label, status, detail, action }
}

function overallStatus(checks: RuntimeDiagnosticItem[]): RuntimeDiagnosticStatus {
  if (checks.some(check => check.status === 'error')) return 'error'
  if (checks.some(check => check.status === 'warning')) return 'warning'
  return 'ok'
}

function checkRuntime(runtime: RuntimeStatus): RuntimeDiagnosticItem {
  if (runtime.provider === 'none') {
    return item('warning', 'runtime', 'Runtime SDK', '当前产品端没有安装 AI 引擎。', '安装或启用一个 AI 引擎。')
  }
  if (!runtime.available) {
    return item('error', 'runtime', 'Runtime SDK', runtime.detail || '当前 Runtime 不可用。', `补齐缺失配置：${runtime.missingConfig?.join('、') || '未知配置'}`)
  }
  return item('ok', 'runtime', 'Runtime SDK', `${runtime.provider} 已启用，能力：${runtime.capabilities?.join('、') || '未声明'}`)
}

function checkHxa(provider: string, overview: HxaOverview | null): RuntimeDiagnosticItem {
  if (provider !== 'zylos') {
    return item('warning', 'hxa-connect', 'hxa-connect', '当前 Runtime 不是 COCO/Zylos，hxa-connect 不参与主链路。')
  }
  if (!overview) {
    return item('error', 'hxa-connect', 'hxa-connect', '无法读取 hxa-connect 状态。', '确认 HXA_CONNECT_BASE_URL 和 hxa-connect 服务。')
  }
  if (!overview.online) {
    return item('error', 'hxa-connect', 'hxa-connect', overview.error || 'hxa-connect 离线。', '启动 hxa-connect，并确认 4800 端口可访问。')
  }
  const onlineBots = overview.stats?.online_bot_count
  return item('ok', 'hxa-connect', 'hxa-connect', `已连接${typeof onlineBots === 'number' ? `，在线 bot ${onlineBots} 个` : ''}。`)
}

function checkZylosMain(provider: string, env: NodeJS.ProcessEnv): RuntimeDiagnosticItem {
  if (provider !== 'zylos') {
    return item('warning', 'zylos-main', 'zylos-main', '当前 Runtime 不是 COCO/Zylos，zylos-main 不参与主链路。')
  }
  const enabled = env.ZYLOS_MAIN_RUNTIME_ENABLED === '1'
  const hasToken = Boolean(env.ZYLOS_MAIN_HXA_TOKEN?.trim())
  const hasModelKey = Boolean(env.OPENAI_API_KEY?.trim())
  if (!enabled || !hasToken || !hasModelKey) {
    const missing = [
      !enabled ? 'ZYLOS_MAIN_RUNTIME_ENABLED=1' : '',
      !hasToken ? 'ZYLOS_MAIN_HXA_TOKEN' : '',
      !hasModelKey ? 'OPENAI_API_KEY' : '',
    ].filter(Boolean)
    return item('error', 'zylos-main', 'zylos-main', `主 Agent 配置不完整：${missing.join('、')}`, '补齐 zylos-main 运行环境后重启产品容器。')
  }
  if (env.AGENTIC_HXA_TOKEN && env.ZYLOS_MAIN_HXA_TOKEN && env.AGENTIC_HXA_TOKEN === env.ZYLOS_MAIN_HXA_TOKEN) {
    return item('error', 'zylos-main', 'zylos-main', '入口 bot 和 zylos-main 使用了同一个 token。', '给 AGENTIC_HXA_TOKEN 和 ZYLOS_MAIN_HXA_TOKEN 使用不同 bot 身份。')
  }
  return item('ok', 'zylos-main', 'zylos-main', `已启用，模型 ${env.ZYLOS_MAIN_MODEL || env.AGENTIC_DEFAULT_MODEL || '默认模型'}。`)
}

function checkWorkerBot(provider: string, overview: HxaOverview | null): RuntimeDiagnosticItem {
  if (provider !== 'zylos') {
    return item('warning', 'worker-bot', 'worker-bot', '当前 Runtime 不是 COCO/Zylos，worker-bot 不参与主链路。')
  }
  const onlineBots = overview?.stats?.online_bot_count
  if (typeof onlineBots === 'number' && onlineBots < 2) {
    return item('warning', 'worker-bot', 'worker-bot', `hxa-connect 当前在线 bot ${onlineBots} 个，可能缺少 worker-bot。`, '启动 hxa-worker-bot，并确认它连接到同一个 hxa-connect。')
  }
  return item('ok', 'worker-bot', 'worker-bot', typeof onlineBots === 'number' ? `hxa-connect 在线 bot ${onlineBots} 个。` : 'worker-bot 状态无法按名称确认，但 hxa-connect 已在线。')
}

function checkModel(env: NodeJS.ProcessEnv): RuntimeDiagnosticItem {
  if (!env.OPENAI_API_KEY?.trim()) {
    return item('error', 'model', '模型配置', '缺少 OPENAI_API_KEY。', '在服务端配置 OpenAI-compatible API Key。')
  }
  return item('ok', 'model', '模型配置', `Base URL：${env.OPENAI_BASE_URL || 'https://api.openai.com'}，默认模型：${env.AGENTIC_DEFAULT_MODEL || env.ZYLOS_MAIN_MODEL || '默认'}`)
}

function checkDataPaths(exists: typeof existsSync): RuntimeDiagnosticItem {
  const requiredPaths = [
    '/home/agent/.hermes',
    '/home/agent/.hermes/kanban.db',
    '/home/agent/.hermes-web-ui',
  ]
  const missing = requiredPaths.filter(path => !exists(path))
  if (missing.length) {
    return item('error', 'data-paths', '数据目录', `缺少数据路径：${missing.join('、')}`, '确认产品容器和 worker-bot 挂载同一份 Hermes 数据目录。')
  }
  return item('ok', 'data-paths', '数据目录', 'Hermes、Kanban、Web UI 数据目录可访问。')
}

export async function getRuntimeDiagnostics(deps: RuntimeDiagnosticsDeps = {}): Promise<RuntimeDiagnostics> {
  const provider = (deps.getConfiguredRuntimeProvider || getConfiguredRuntimeProvider)()
  const runtime = (deps.getConfiguredRuntimeStatus || getConfiguredRuntimeStatus)()
  const env = deps.env || process.env
  const exists = deps.existsSync || existsSync
  const now = deps.now || (() => new Date())
  const hxaOverview = provider === 'zylos'
    ? await (deps.getHxaOverview || getHxaOverview)().catch(() => null)
    : null

  const checks = [
    checkRuntime(runtime),
    checkHxa(provider, hxaOverview),
    checkZylosMain(provider, env),
    checkWorkerBot(provider, hxaOverview),
    checkModel(env),
    checkDataPaths(exists),
  ]

  return {
    status: overallStatus(checks),
    provider,
    generatedAt: now().toISOString(),
    checks,
  }
}
