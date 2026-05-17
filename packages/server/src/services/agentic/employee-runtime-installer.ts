import { chmod, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Employee, EmployeeEngineType } from './employees'

export interface EmployeeRuntimeInstallManifest {
  employeeId: string
  engineType: EmployeeEngineType
  runtimeUrl: string
  port: number
  startCommand: string
  startArgs: string[]
  healthUrl: string
  installedAt: string
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
    healthUrl,
    installedAt: nowIso(),
  })
}

async function installHmsRuntime(employee: Employee): Promise<EmployeeRuntimeInstallManifest> {
  const port = parsePort(process.env.BEATYCLAW_HMS_PORT, defaultPort(employee))
  const healthUrl = String(process.env.BEATYCLAW_HMS_HEALTH_URL || `http://127.0.0.1:${port}/health`)
  const command = String(process.env.BEATYCLAW_HMS_START_COMMAND || process.execPath)
  const configuredArgs = splitArgs(String(process.env.BEATYCLAW_HMS_START_ARGS || ''))
  const launcherPath = configuredArgs.length > 0 ? '' : await writeHmsPlaceholderLauncher(employee, port)
  const startArgs = configuredArgs.length > 0 ? configuredArgs : [launcherPath]

  return writeInstallManifest(employee, {
    employeeId: employee.id,
    engineType: 'hms',
    runtimeUrl: healthUrl,
    port,
    startCommand: command,
    startArgs,
    healthUrl,
    installedAt: nowIso(),
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
    return {
      employeeId: String(parsed.employeeId || parsed.employee_id || employee.id),
      engineType: String(parsed.engineType || parsed.engine_type || employee.engineType) as EmployeeEngineType,
      runtimeUrl: String(parsed.runtimeUrl || parsed.runtime_url || ''),
      port: parsePort(parsed.port, defaultPort(employee)),
      startCommand: String(parsed.startCommand || parsed.start_command || ''),
      startArgs: Array.isArray(parsed.startArgs || parsed.start_args) ? (parsed.startArgs || parsed.start_args).map(String) : [],
      healthUrl: String(parsed.healthUrl || parsed.health_url || ''),
      installedAt: String(parsed.installedAt || parsed.installed_at || ''),
    }
  } catch {
    return null
  }
}
