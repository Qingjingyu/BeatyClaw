import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { Employee, EmployeeEngineType, EmployeeHealthStatus, EmployeeStatus } from './employees'
import { installEmployeeRuntime, readEmployeeRuntimeInstallManifest } from './employee-runtime-installer'

export interface EmployeeRuntimeState {
  employeeId: string
  engineType: EmployeeEngineType
  status: EmployeeStatus
  healthStatus: EmployeeHealthStatus
  runtimeUrl: string
  port: number | null
  containerName: string
  updatedAt: string
  mode: 'local' | 'process'
  pid: number | null
  lastError: string
}

export interface EmployeeRuntimeAdapter {
  deploy(employee: Employee): Promise<EmployeeRuntimeState>
  start(employee: Employee): Promise<EmployeeRuntimeState>
  stop(employee: Employee): Promise<EmployeeRuntimeState>
  health(employee: Employee): Promise<EmployeeRuntimeState>
}

export function getRuntimeStatePath(employee: Employee): string {
  return join(employee.instanceRoot, 'config', 'runtime-state.json')
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultRuntimeState(employee: Employee): EmployeeRuntimeState {
  return {
    employeeId: employee.id,
    engineType: employee.engineType,
    status: employee.status,
    healthStatus: employee.healthStatus,
    runtimeUrl: employee.runtimeUrl,
    port: employee.port,
    containerName: employee.containerName,
    updatedAt: nowIso(),
    mode: 'local',
    pid: null,
    lastError: '',
  }
}

async function readRuntimeState(employee: Employee): Promise<EmployeeRuntimeState> {
  try {
    const parsed = JSON.parse(await readFile(getRuntimeStatePath(employee), 'utf-8'))
    return {
      ...defaultRuntimeState(employee),
      employeeId: String(parsed.employeeId || parsed.employee_id || employee.id),
      engineType: employee.engineType,
      status: parsed.status || employee.status,
      healthStatus: parsed.healthStatus || parsed.health_status || employee.healthStatus,
      runtimeUrl: String(parsed.runtimeUrl || parsed.runtime_url || employee.runtimeUrl || ''),
      port: parsed.port ?? employee.port,
      containerName: String(parsed.containerName || parsed.container_name || employee.containerName),
      updatedAt: String(parsed.updatedAt || parsed.updated_at || nowIso()),
      mode: parsed.mode === 'process' ? 'process' : 'local',
      pid: typeof parsed.pid === 'number' ? parsed.pid : null,
      lastError: String(parsed.lastError || parsed.last_error || ''),
    }
  } catch {
    return defaultRuntimeState(employee)
  }
}

async function writeRuntimeState(employee: Employee, state: EmployeeRuntimeState): Promise<EmployeeRuntimeState> {
  await mkdir(join(employee.instanceRoot, 'config'), { recursive: true })
  await writeFile(getRuntimeStatePath(employee), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  return state
}

async function updateRuntimeState(employee: Employee, patch: Partial<EmployeeRuntimeState>): Promise<EmployeeRuntimeState> {
  const previous = await readRuntimeState(employee)
  return writeRuntimeState(employee, {
    ...previous,
    ...patch,
    employeeId: employee.id,
    engineType: employee.engineType,
    containerName: employee.containerName,
    updatedAt: nowIso(),
  })
}

export class LocalEmployeeRuntimeAdapter implements EmployeeRuntimeAdapter {
  async deploy(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'installed',
      healthStatus: 'stopped',
      runtimeUrl: '',
      port: null,
      mode: 'local',
      pid: null,
      lastError: '',
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'running',
      healthStatus: 'healthy',
      mode: 'local',
      pid: null,
      lastError: '',
    })
  }

  async stop(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'stopped',
      healthStatus: 'stopped',
      mode: 'local',
      pid: null,
      lastError: '',
    })
  }

  async health(employee: Employee): Promise<EmployeeRuntimeState> {
    const state = await readRuntimeState(employee)
    if (state.status === 'running') {
      return updateRuntimeState(employee, { healthStatus: 'healthy', status: 'running' })
    }
    if (state.status === 'installed' || state.status === 'stopped') {
      return updateRuntimeState(employee, { healthStatus: 'stopped', status: state.status })
    }
    return updateRuntimeState(employee, { healthStatus: 'unknown', status: employee.status })
  }
}

interface ProcessRuntimeConfig {
  enabled: boolean
  command: string
  args: string[]
  healthUrl: string
  port: number | null
}

const processRegistry = new Map<string, ChildProcess>()

function envKey(engineType: EmployeeEngineType, suffix: string): string {
  return `BEATYCLAW_${engineType.toUpperCase()}_${suffix}`
}

function splitCommandArgs(raw: string): string[] {
  return raw
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
}

function getProcessRuntimeConfig(engineType: EmployeeEngineType): ProcessRuntimeConfig {
  const command = String(process.env[envKey(engineType, 'START_COMMAND')] || '').trim()
  const healthUrl = String(process.env[envKey(engineType, 'HEALTH_URL')] || '').trim()
  const portValue = Number(process.env[envKey(engineType, 'PORT')] || '')
  return {
    enabled: process.env[envKey(engineType, 'ENABLED')] === '1' && Boolean(command),
    command,
    args: splitCommandArgs(String(process.env[envKey(engineType, 'START_ARGS')] || '')),
    healthUrl,
    port: Number.isInteger(portValue) && portValue > 0 && portValue <= 65535 ? portValue : null,
  }
}

async function getRuntimeLaunchConfig(employee: Employee, engineType: EmployeeEngineType): Promise<ProcessRuntimeConfig> {
  const envConfig = getProcessRuntimeConfig(engineType)
  const manifest = await readEmployeeRuntimeInstallManifest(employee)
  if (!manifest) return envConfig
  return {
    enabled: true,
    command: manifest.startCommand || envConfig.command,
    args: manifest.startArgs.length > 0 ? manifest.startArgs : envConfig.args,
    healthUrl: manifest.healthUrl || envConfig.healthUrl,
    port: manifest.port || envConfig.port,
  }
}

async function probeHealth(url: string): Promise<boolean> {
  if (!url) return true
  try {
    const response = await fetch(url, { method: 'GET' })
    return response.ok
  } catch {
    return false
  }
}

export class ProcessEmployeeRuntimeAdapter implements EmployeeRuntimeAdapter {
  constructor(
    private readonly engineType: EmployeeEngineType,
    private readonly fallback = new LocalEmployeeRuntimeAdapter(),
  ) {}

  async deploy(employee: Employee): Promise<EmployeeRuntimeState> {
    const manifest = await installEmployeeRuntime(employee)
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    return updateRuntimeState(employee, {
      status: 'installed',
      healthStatus: 'stopped',
      runtimeUrl: manifest.runtimeUrl || config.healthUrl,
      port: manifest.port || config.port,
      mode: 'process',
      pid: null,
      lastError: '',
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    if (!config.enabled) return this.fallback.start(employee)

    const existing = processRegistry.get(employee.id)
    if (existing && existing.exitCode === null) {
      return updateRuntimeState(employee, {
        status: 'running',
        healthStatus: 'healthy',
        runtimeUrl: config.healthUrl,
        port: config.port,
        mode: 'process',
        pid: existing.pid || null,
        lastError: '',
      })
    }

    try {
      const child = spawn(config.command, config.args, {
        cwd: employee.instanceRoot,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          BEATYCLAW_EMPLOYEE_ID: employee.id,
          BEATYCLAW_EMPLOYEE_ROOT: employee.instanceRoot,
          BEATYCLAW_EMPLOYEE_ENGINE: employee.engineType,
          BEATYCLAW_HMS_PORT: config.port ? String(config.port) : '',
        },
      })
      child.unref()
      processRegistry.set(employee.id, child)
      return updateRuntimeState(employee, {
        status: 'running',
        healthStatus: config.healthUrl ? 'unknown' : 'healthy',
        runtimeUrl: config.healthUrl,
        port: config.port,
        mode: 'process',
        pid: child.pid || null,
        lastError: '',
      })
    } catch (err) {
      return updateRuntimeState(employee, {
        status: 'failed',
        healthStatus: 'unhealthy',
        runtimeUrl: config.healthUrl,
        port: config.port,
        mode: 'process',
        pid: null,
        lastError: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async stop(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    if (!config.enabled) return this.fallback.stop(employee)

    const child = processRegistry.get(employee.id)
    if (child && child.exitCode === null) child.kill('SIGTERM')
    processRegistry.delete(employee.id)
    return updateRuntimeState(employee, {
      status: 'stopped',
      healthStatus: 'stopped',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'process',
      pid: null,
      lastError: '',
    })
  }

  async health(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    if (!config.enabled) return this.fallback.health(employee)

    const state = await readRuntimeState(employee)
    if (state.status !== 'running') {
      return updateRuntimeState(employee, {
        status: state.status,
        healthStatus: state.status === 'stopped' || state.status === 'installed' ? 'stopped' : 'unknown',
        mode: 'process',
      })
    }

    const healthy = await probeHealth(config.healthUrl)
    return updateRuntimeState(employee, {
      status: 'running',
      healthStatus: healthy ? 'healthy' : 'unhealthy',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'process',
      lastError: healthy ? '' : 'Health check failed',
    })
  }
}

export function createEmployeeRuntimeAdapter(engineType: EmployeeEngineType): EmployeeRuntimeAdapter {
  if (engineType === 'hms' || engineType === 'openclaw' || engineType === 'coco') {
    return new ProcessEmployeeRuntimeAdapter(engineType)
  }
  return new LocalEmployeeRuntimeAdapter()
}
