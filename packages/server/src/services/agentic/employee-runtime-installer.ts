import { chmod, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Employee, EmployeeEngineType } from './employees'
import { getHermesBin } from '../hermes/hermes-path'

export interface EmployeeRuntimeInstallManifest {
  employeeId: string
  engineType: EmployeeEngineType
  runtimeUrl: string
  port: number
  startCommand: string
  startArgs: string[]
  env: Record<string, string>
  healthUrl: string
  apiKey: string
  installedAt: string
  installMode: 'placeholder' | 'hermes-gateway' | 'custom'
}

export function getInstallManifestPath(employee: Employee): string {
  return join(employee.instanceRoot, 'config', 'runtime-install.json')
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultPort(employee: Employee): number {
  let hash = 0
  for (const char of employee.id) hash = (hash + char.charCodeAt(0)) % 1000
  return 4600 + hash
}

function parsePort(value: unknown, fallback: number): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback
  return port
}

function getInstallerEnvKey(engineType: EmployeeEngineType, suffix: string): string {
  return `BEATYCLAW_${engineType.toUpperCase()}_${suffix}`
}

function splitArgs(raw: string): string[] {
  return raw
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
}

function readEnvApiKey(content: string): string {
  const match = content.match(/^API_SERVER_KEY\s*=\s*"?([^"\n]+)"?/m)
  return match?.[1]?.trim() || ''
}

async function readHermesApiKey(hermesHome: string): Promise<string> {
  try {
    return readEnvApiKey(await readFile(join(hermesHome, '.env'), 'utf-8'))
  } catch {
    return ''
  }
}

function buildUrl(host: string, port: number): string {
  const safeHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${safeHost}:${port}`
}

function getHmsHost(): string {
  return process.env.BEATYCLAW_HMS_HOST || '127.0.0.1'
}

function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function envQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/)
    if (!match) continue
    entries.set(match[1], match[2].trim())
  }
  return entries
}

async function readEnvFile(path: string): Promise<Map<string, string>> {
  try {
    return parseEnvFile(await readFile(path, 'utf-8'))
  } catch {
    return new Map()
  }
}

function getHmsModelConfig() {
  const model = String(process.env.BEATYCLAW_HMS_MODEL || process.env.AGENTIC_DEFAULT_MODEL || '').trim()
  const baseUrl = String(process.env.BEATYCLAW_HMS_MODEL_BASE_URL || process.env.OPENAI_BASE_URL || '').trim()
  const provider = String(process.env.BEATYCLAW_HMS_MODEL_PROVIDER || (baseUrl ? 'custom' : '')).trim()
  const apiKey = String(process.env.BEATYCLAW_HMS_MODEL_API_KEY || process.env.OPENAI_API_KEY || '').trim()
  return { model, baseUrl, provider, apiKey }
}

async function writeHermesGatewayConfig(hermesHome: string, port: number, host: string): Promise<void> {
  await mkdir(hermesHome, { recursive: true })
  const modelConfig = getHmsModelConfig()
  const lines: string[] = []
  if (modelConfig.model || modelConfig.provider || modelConfig.baseUrl) {
    lines.push('model:')
    if (modelConfig.model) lines.push(`  default: ${yamlQuote(modelConfig.model)}`)
    if (modelConfig.provider) lines.push(`  provider: ${yamlQuote(modelConfig.provider)}`)
    if (modelConfig.baseUrl) lines.push(`  base_url: ${yamlQuote(modelConfig.baseUrl)}`)
  }
  lines.push(
    'platforms:',
    '  api_server:',
    '    enabled: true',
    "    key: ''",
    "    cors_origins: '*'",
    '    extra:',
    `      port: ${port}`,
    `      host: ${host}`,
    '',
  )
  await writeFile(
    join(hermesHome, 'config.yaml'),
    lines.join('\n'),
    { mode: 0o600 },
  )
  const envPath = join(hermesHome, '.env')
  const envEntries = await readEnvFile(envPath)
  if (modelConfig.apiKey) envEntries.set('OPENAI_API_KEY', envQuote(modelConfig.apiKey))
  if (modelConfig.baseUrl) envEntries.set('OPENAI_BASE_URL', envQuote(modelConfig.baseUrl))
  if (modelConfig.model) envEntries.set('HERMES_MODEL', envQuote(modelConfig.model))
  const hasModelEnv = Boolean(modelConfig.apiKey || modelConfig.baseUrl || modelConfig.model)
  if (hasModelEnv) {
    envEntries.set('GATEWAY_ALLOW_ALL_USERS', 'true')
  }
  if (envEntries.size > 0) {
    const envLines = Array.from(envEntries.entries()).map(([key, value]) => `${key}=${value}`)
    await writeFile(envPath, envLines.join('\n') + '\n', { mode: 0o600 })
  }
}

async function writeHmsPlaceholderLauncher(employee: Employee, port: number): Promise<string> {
  const binDir = join(employee.instanceRoot, 'bin')
  await mkdir(binDir, { recursive: true })
  const launcherPath = join(binDir, 'start-hms-placeholder.mjs')
  await writeFile(
    launcherPath,
    [
      "import http from 'node:http'",
      `const port = Number(process.env.BEATYCLAW_HMS_PORT || ${port})`,
      "const server = http.createServer((req, res) => {",
      "  if (req.url === '/health') {",
      "    res.writeHead(200, { 'content-type': 'application/json' })",
      "    res.end(JSON.stringify({ status: 'ok', engine: 'hms', employeeId: process.env.BEATYCLAW_EMPLOYEE_ID || '' }))",
      '    return',
      '  }',
      "  res.writeHead(404, { 'content-type': 'application/json' })",
      "  res.end(JSON.stringify({ error: 'not_found' }))",
      '})',
      "server.listen(port, '127.0.0.1')",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)))",
      '',
    ].join('\n'),
    { mode: 0o700 },
  )
  await chmod(launcherPath, 0o700)
  return launcherPath
}

export async function installEmployeeRuntime(employee: Employee): Promise<EmployeeRuntimeInstallManifest> {
  if (employee.engineType !== 'hms') {
    return installGenericRuntime(employee)
  }
  return installHmsRuntime(employee)
}

async function installGenericRuntime(employee: Employee): Promise<EmployeeRuntimeInstallManifest> {
  const port = parsePort(process.env[getInstallerEnvKey(employee.engineType, 'PORT')], defaultPort(employee))
  const healthUrl = String(process.env[getInstallerEnvKey(employee.engineType, 'HEALTH_URL')] || `http://127.0.0.1:${port}/health`)
  const startCommand = String(process.env[getInstallerEnvKey(employee.engineType, 'START_COMMAND')] || process.execPath)
  const startArgs = splitArgs(String(process.env[getInstallerEnvKey(employee.engineType, 'START_ARGS')] || ''))
  return writeInstallManifest(employee, {
    employeeId: employee.id,
    engineType: employee.engineType,
    runtimeUrl: healthUrl,
    port,
    startCommand,
    startArgs,
    env: {},
    healthUrl,
    apiKey: '',
    installedAt: nowIso(),
    installMode: startArgs.length > 0 ? 'custom' : 'placeholder',
  })
}

async function installHmsRuntime(employee: Employee): Promise<EmployeeRuntimeInstallManifest> {
  const port = parsePort(process.env.BEATYCLAW_HMS_PORT, defaultPort(employee))
  const host = getHmsHost()
  const healthUrl = String(process.env.BEATYCLAW_HMS_HEALTH_URL || `${buildUrl(host, port)}/health`)
  const command = String(process.env.BEATYCLAW_HMS_START_COMMAND || process.execPath)
  const configuredArgs = splitArgs(String(process.env.BEATYCLAW_HMS_START_ARGS || ''))
  const installMode = String(process.env.BEATYCLAW_HMS_INSTALL_MODE || '').trim()

  if (installMode === 'hermes-gateway') {
    return installHmsGatewayRuntime(employee, port, host, healthUrl)
  }

  const launcherPath = configuredArgs.length > 0 ? '' : await writeHmsPlaceholderLauncher(employee, port)
  const startArgs = configuredArgs.length > 0 ? configuredArgs : [launcherPath]

  return writeInstallManifest(employee, {
    employeeId: employee.id,
    engineType: 'hms',
    runtimeUrl: healthUrl,
    port,
    startCommand: command,
    startArgs,
    env: {},
    healthUrl,
    apiKey: '',
    installedAt: nowIso(),
    installMode: configuredArgs.length > 0 ? 'custom' : 'placeholder',
  })
}

async function installHmsGatewayRuntime(employee: Employee, port: number, host: string, healthUrl: string): Promise<EmployeeRuntimeInstallManifest> {
  const hermesHome = join(employee.instanceRoot, 'config', 'hermes-home')
  const yoyooHome = join(employee.instanceRoot, 'data', 'yoyoo-home')
  const workspace = join(employee.instanceRoot, 'workspace')
  await mkdir(yoyooHome, { recursive: true })
  await mkdir(workspace, { recursive: true })
  await writeHermesGatewayConfig(hermesHome, port, host)

  return writeInstallManifest(employee, {
    employeeId: employee.id,
    engineType: 'hms',
    runtimeUrl: healthUrl,
    port,
    startCommand: getHermesBin(process.env.BEATYCLAW_HMS_START_COMMAND),
    startArgs: ['gateway', 'run', '--replace'],
    env: {
      HERMES_HOME: hermesHome,
      YOYOO_HOME: yoyooHome,
      YOYOO_WORKSPACE: workspace,
      YOYOO_USER_ID: employee.id,
      YOYOO_TENANT_ID: 'single-user',
      YOYOO_WORKSPACE_ID: employee.id,
    },
    healthUrl,
    apiKey: await readHermesApiKey(hermesHome),
    installedAt: nowIso(),
    installMode: 'hermes-gateway',
  })
}

async function writeInstallManifest(employee: Employee, manifest: EmployeeRuntimeInstallManifest): Promise<EmployeeRuntimeInstallManifest> {
  await mkdir(join(employee.instanceRoot, 'config'), { recursive: true })
  await writeFile(getInstallManifestPath(employee), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  return manifest
}

export async function readEmployeeRuntimeInstallManifest(employee: Employee): Promise<EmployeeRuntimeInstallManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(getInstallManifestPath(employee), 'utf-8'))
    const manifest: EmployeeRuntimeInstallManifest = {
      employeeId: String(parsed.employeeId || parsed.employee_id || employee.id),
      engineType: String(parsed.engineType || parsed.engine_type || employee.engineType) as EmployeeEngineType,
      runtimeUrl: String(parsed.runtimeUrl || parsed.runtime_url || ''),
      port: parsePort(parsed.port, defaultPort(employee)),
      startCommand: String(parsed.startCommand || parsed.start_command || ''),
      startArgs: Array.isArray(parsed.startArgs || parsed.start_args) ? (parsed.startArgs || parsed.start_args).map(String) : [],
      env: parsed.env && typeof parsed.env === 'object'
        ? Object.fromEntries(Object.entries(parsed.env).map(([key, value]) => [key, String(value)]))
        : {},
      healthUrl: String(parsed.healthUrl || parsed.health_url || ''),
      apiKey: String(parsed.apiKey || parsed.api_key || ''),
      installedAt: String(parsed.installedAt || parsed.installed_at || ''),
      installMode: parsed.installMode === 'hermes-gateway' || parsed.install_mode === 'hermes-gateway'
        ? 'hermes-gateway'
        : (parsed.installMode === 'custom' || parsed.install_mode === 'custom' ? 'custom' : 'placeholder'),
    }
    if (!manifest.apiKey && manifest.env.HERMES_HOME) {
      manifest.apiKey = await readHermesApiKey(manifest.env.HERMES_HOME)
    }
    return manifest
  } catch {
    return null
  }
}
