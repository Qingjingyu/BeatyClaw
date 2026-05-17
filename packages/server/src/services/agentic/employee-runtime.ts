import { mkdir, open, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
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
  mode: 'local' | 'process' | 'docker'
  pid: number | null
  lastError: string
  apiKey: string
  logPath: string
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
    apiKey: '',
    logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
  }
}

export async function readEmployeeRuntimeState(employee: Employee): Promise<EmployeeRuntimeState> {
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
      mode: parsed.mode === 'docker' ? 'docker' : (parsed.mode === 'process' ? 'process' : 'local'),
      pid: typeof parsed.pid === 'number' ? parsed.pid : null,
      lastError: String(parsed.lastError || parsed.last_error || ''),
      apiKey: String(parsed.apiKey || parsed.api_key || ''),
      logPath: String(parsed.logPath || parsed.log_path || join(employee.instanceRoot, 'logs', 'runtime.log')),
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
  const previous = await readEmployeeRuntimeState(employee)
  return writeRuntimeState(employee, {
    ...previous,
    ...patch,
    employeeId: employee.id,
    engineType: employee.engineType,
    containerName: employee.containerName,
    logPath: patch.logPath || previous.logPath || join(employee.instanceRoot, 'logs', 'runtime.log'),
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
      apiKey: '',
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'running',
      healthStatus: 'healthy',
      mode: 'local',
      pid: null,
      lastError: '',
      apiKey: '',
    })
  }

  async stop(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'stopped',
      healthStatus: 'stopped',
      mode: 'local',
      pid: null,
      lastError: '',
      apiKey: '',
    })
  }

  async health(employee: Employee): Promise<EmployeeRuntimeState> {
    const state = await readEmployeeRuntimeState(employee)
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
  env: Record<string, string>
  apiKey: string
}

interface DockerRuntimeConfig {
  enabled: boolean
  dockerBin: string
  dockerArgsPrefix: string[]
  image: string
  port: number | null
  healthUrl: string
  env: Record<string, string>
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
    env: {},
    apiKey: '',
  }
}

function runtimeMode(engineType: EmployeeEngineType): string {
  return String(process.env[envKey(engineType, 'RUNTIME_MODE')] || '').trim().toLowerCase()
}

function getDockerRuntimeConfig(engineType: EmployeeEngineType): DockerRuntimeConfig {
  const portValue = Number(process.env[envKey(engineType, 'PORT')] || '')
  const port = Number.isInteger(portValue) && portValue > 0 && portValue <= 65535 ? portValue : null
  const healthUrlKey = envKey(engineType, 'HEALTH_URL')
  const healthUrl = Object.prototype.hasOwnProperty.call(process.env, healthUrlKey)
    ? String(process.env[healthUrlKey] || '').trim()
    : (port ? `http://127.0.0.1:${port}/health` : '')
  return {
    enabled: runtimeMode(engineType) === 'docker',
    dockerBin: String(process.env.BEATYCLAW_DOCKER_BIN || 'docker').trim() || 'docker',
    dockerArgsPrefix: splitCommandArgs(String(process.env.BEATYCLAW_DOCKER_ARGS_PREFIX || '')),
    image: String(process.env[envKey(engineType, 'DOCKER_IMAGE')] || '').trim(),
    port,
    healthUrl,
    env: {},
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
    env: { ...envConfig.env, ...manifest.env },
    apiKey: manifest.apiKey || envConfig.apiKey,
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

function pidIsAlive(pid: number | null): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function registeredProcessIsAlive(employeeId: string, pid: number | null): boolean {
  const child = processRegistry.get(employeeId)
  if (!child) return pidIsAlive(pid)
  if (pid && child.pid !== pid) return pidIsAlive(pid)
  return child.exitCode === null && !child.killed
}

async function openRuntimeLog(employee: Employee): Promise<{ fd: number; close: () => Promise<void>; logPath: string }> {
  await mkdir(join(employee.instanceRoot, 'logs'), { recursive: true })
  const logPath = join(employee.instanceRoot, 'logs', 'runtime.log')
  const handle = await open(logPath, 'a')
  return {
    fd: handle.fd,
    close: () => handle.close(),
    logPath,
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
      apiKey: manifest.apiKey || config.apiKey,
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    if (!config.enabled) return this.fallback.start(employee)

    const existing = processRegistry.get(employee.id)
    if (existing && existing.exitCode === null && !existing.killed) {
      return updateRuntimeState(employee, {
        status: 'running',
        healthStatus: 'healthy',
        runtimeUrl: config.healthUrl,
        port: config.port,
        mode: 'process',
        pid: existing.pid || null,
        lastError: '',
        apiKey: config.apiKey,
        logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
      })
    }
    if (existing) processRegistry.delete(employee.id)

    try {
      const runtimeLog = await openRuntimeLog(employee)
      const child = spawn(config.command, config.args, {
        cwd: employee.instanceRoot,
        detached: true,
        stdio: ['ignore', runtimeLog.fd, runtimeLog.fd],
        env: {
          ...process.env,
          ...config.env,
          BEATYCLAW_EMPLOYEE_ID: employee.id,
          BEATYCLAW_EMPLOYEE_ROOT: employee.instanceRoot,
          BEATYCLAW_EMPLOYEE_ENGINE: employee.engineType,
          BEATYCLAW_HMS_PORT: config.port ? String(config.port) : '',
        },
      })
      child.on('close', () => {
        const current = processRegistry.get(employee.id)
        if (current === child) processRegistry.delete(employee.id)
        runtimeLog.close().catch(() => {})
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
        apiKey: config.apiKey,
        logPath: runtimeLog.logPath,
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
        apiKey: config.apiKey,
        logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
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
      apiKey: config.apiKey,
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }

  async health(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = await getRuntimeLaunchConfig(employee, this.engineType)
    if (!config.enabled) return this.fallback.health(employee)

    const state = await readEmployeeRuntimeState(employee)
    if (state.status !== 'running') {
      return updateRuntimeState(employee, {
        status: state.status,
        healthStatus: state.status === 'stopped' || state.status === 'installed' ? 'stopped' : 'unknown',
        mode: 'process',
        apiKey: config.apiKey,
        logPath: state.logPath,
      })
    }

    const alive = registeredProcessIsAlive(employee.id, state.pid)
    const healthy = alive && await probeHealth(config.healthUrl)
    return updateRuntimeState(employee, {
      status: alive ? 'running' : 'failed',
      healthStatus: healthy ? 'healthy' : 'unhealthy',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'process',
      pid: alive ? state.pid : null,
      lastError: healthy ? '' : (alive ? 'Health check failed' : 'Runtime process is not running'),
      apiKey: config.apiKey,
      logPath: state.logPath,
    })
  }
}

export class DockerEmployeeRuntimeAdapter implements EmployeeRuntimeAdapter {
  constructor(
    private readonly engineType: EmployeeEngineType,
    private readonly fallback = new ProcessEmployeeRuntimeAdapter(engineType),
  ) {}

  async deploy(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = getDockerRuntimeConfig(this.engineType)
    if (!config.enabled) return this.fallback.deploy(employee)
    if (!config.image) {
      return updateRuntimeState(employee, {
        status: 'failed',
        healthStatus: 'unhealthy',
        mode: 'docker',
        pid: null,
        lastError: `${envKey(this.engineType, 'DOCKER_IMAGE')} is required for docker runtime`,
      })
    }
    return updateRuntimeState(employee, {
      status: 'installed',
      healthStatus: 'stopped',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'docker',
      pid: null,
      lastError: '',
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = getDockerRuntimeConfig(this.engineType)
    if (!config.enabled) return this.fallback.start(employee)
    if (!config.image) {
      return updateRuntimeState(employee, {
        status: 'failed',
        healthStatus: 'unhealthy',
        mode: 'docker',
        pid: null,
        lastError: `${envKey(this.engineType, 'DOCKER_IMAGE')} is required for docker runtime`,
      })
    }

    await mkdir(join(employee.instanceRoot, 'logs'), { recursive: true })
    const runArgs = [
      ...config.dockerArgsPrefix,
      'run',
      '-d',
      '--name',
      employee.containerName,
      '--restart',
      'unless-stopped',
      '-p',
      `127.0.0.1:${config.port || 0}:${config.port || 0}`,
      '-v',
      `${employee.instanceRoot}:/home/agent/employee`,
      '-e',
      `BEATYCLAW_EMPLOYEE_ID=${employee.id}`,
      '-e',
      `BEATYCLAW_EMPLOYEE_ROOT=/home/agent/employee`,
      '-e',
      `BEATYCLAW_EMPLOYEE_ENGINE=${employee.engineType}`,
      '-e',
      `BEATYCLAW_EMPLOYEE_PORT=${config.port || ''}`,
      '-e',
      `PORT=${config.port || ''}`,
      '-e',
      `${envKey(this.engineType, 'PORT')}=${config.port || ''}`,
      config.image,
    ]
    const rm = spawnSync(config.dockerBin, [...config.dockerArgsPrefix, 'rm', '-f', employee.containerName], { encoding: 'utf-8' })
    if (rm.error) {
      return updateRuntimeState(employee, {
        status: 'failed',
        healthStatus: 'unhealthy',
        mode: 'docker',
        pid: null,
        lastError: rm.error.message,
      })
    }
    const run = spawnSync(config.dockerBin, runArgs, { encoding: 'utf-8' })
    if (run.error || run.status !== 0) {
      return updateRuntimeState(employee, {
        status: 'failed',
        healthStatus: 'unhealthy',
        runtimeUrl: config.healthUrl,
        port: config.port,
        mode: 'docker',
        pid: null,
        lastError: run.error?.message || run.stderr || run.stdout || 'Docker run failed',
        logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
      })
    }
    return updateRuntimeState(employee, {
      status: 'running',
      healthStatus: config.healthUrl ? 'unknown' : 'healthy',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'docker',
      pid: null,
      lastError: '',
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }

  async stop(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = getDockerRuntimeConfig(this.engineType)
    if (!config.enabled) return this.fallback.stop(employee)
    const rm = spawnSync(config.dockerBin, [...config.dockerArgsPrefix, 'rm', '-f', employee.containerName], { encoding: 'utf-8' })
    return updateRuntimeState(employee, {
      status: rm.error ? 'failed' : 'stopped',
      healthStatus: rm.error ? 'unhealthy' : 'stopped',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'docker',
      pid: null,
      lastError: rm.error?.message || '',
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }

  async health(employee: Employee): Promise<EmployeeRuntimeState> {
    const config = getDockerRuntimeConfig(this.engineType)
    if (!config.enabled) return this.fallback.health(employee)
    const inspect = spawnSync(
      config.dockerBin,
      [...config.dockerArgsPrefix, 'inspect', '-f', '{{.State.Running}}', employee.containerName],
      { encoding: 'utf-8' },
    )
    const running = !inspect.error && inspect.status === 0 && inspect.stdout.trim() === 'true'
    const healthy = running && await probeHealth(config.healthUrl)
    return updateRuntimeState(employee, {
      status: running ? 'running' : 'failed',
      healthStatus: healthy ? 'healthy' : 'unhealthy',
      runtimeUrl: config.healthUrl,
      port: config.port,
      mode: 'docker',
      pid: null,
      lastError: running ? (healthy ? '' : 'Health check failed') : (inspect.error?.message || inspect.stderr || 'Docker container is not running'),
      logPath: join(employee.instanceRoot, 'logs', 'runtime.log'),
    })
  }
}

export function createEmployeeRuntimeAdapter(engineType: EmployeeEngineType): EmployeeRuntimeAdapter {
  if (engineType === 'hms' || engineType === 'openclaw' || engineType === 'coco') {
    if (runtimeMode(engineType) === 'docker') return new DockerEmployeeRuntimeAdapter(engineType)
    return new ProcessEmployeeRuntimeAdapter(engineType)
  }
  return new LocalEmployeeRuntimeAdapter()
}
