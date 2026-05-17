import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Employee, EmployeeEngineType, EmployeeHealthStatus, EmployeeStatus } from './employees'

export interface EmployeeRuntimeState {
  employeeId: string
  engineType: EmployeeEngineType
  status: EmployeeStatus
  healthStatus: EmployeeHealthStatus
  runtimeUrl: string
  port: number | null
  containerName: string
  updatedAt: string
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
    })
  }

  async start(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'running',
      healthStatus: 'healthy',
    })
  }

  async stop(employee: Employee): Promise<EmployeeRuntimeState> {
    return updateRuntimeState(employee, {
      status: 'stopped',
      healthStatus: 'stopped',
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

export function createEmployeeRuntimeAdapter(_engineType: EmployeeEngineType): EmployeeRuntimeAdapter {
  return new LocalEmployeeRuntimeAdapter()
}
