import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'node:crypto'
import {
  createEmployeeRuntimeAdapter,
  getRuntimeStatePath,
  readEmployeeRuntimeState,
  type EmployeeRuntimeState,
} from './employee-runtime'
import {
  getInstallManifestPath,
  readEmployeeRuntimeInstallManifest,
} from './employee-runtime-installer'

export type EmployeeStatus = 'draft' | 'deploying' | 'installed' | 'running' | 'stopped' | 'failed'
export type EmployeeHealthStatus = 'unknown' | 'provisioning' | 'healthy' | 'stopped' | 'unhealthy'
export type EmployeeEngineType = 'openclaw' | 'hms' | 'coco' | 'zylos'
export type EmployeeVisibility = 'visible' | 'hidden'

export interface EmployeeRuntimeInstance {
  employeeId: string
  engineType: EmployeeEngineType
  instanceRoot: string
  configDir: string
  dataDir: string
  logsDir: string
  workspaceDir: string
  manifestPath: string
  installManifestPath: string
  statePath: string
  containerName: string
  runtimeUrl: string
  port: number | null
  status: EmployeeStatus
  healthStatus: EmployeeHealthStatus
  mode: 'local' | 'process'
  pid: number | null
  lastError: string
  logPath: string
  installMode: 'none' | 'placeholder' | 'hermes-gateway' | 'custom'
  installedAt: string
  updatedAt: string
}

export interface Employee {
  id: string
  name: string
  avatar?: string
  engineType: EmployeeEngineType
  status: EmployeeStatus
  systemRole: string
  instanceRoot: string
  runtimeUrl: string
  containerName: string
  port: number | null
  healthStatus: EmployeeHealthStatus
  visibility: EmployeeVisibility
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  runtimeInstance?: EmployeeRuntimeInstance
}

export interface EmployeeStore {
  currentEmployeeId: string
  employees: Employee[]
}

export interface CreateEmployeeInput {
  name: string
  avatar?: string
  engineType: EmployeeEngineType
  systemRole?: string
}

export interface UpdateEmployeeInput {
  name?: string
  avatar?: string
  engineType?: EmployeeEngineType
  systemRole?: string
  status?: EmployeeStatus
  healthStatus?: EmployeeHealthStatus
  runtimeUrl?: string
  port?: number | null
  visibility?: EmployeeVisibility
  deletedAt?: string | null
}

export interface EmployeeHealthCheckResult {
  employee: Employee
  runtime: EmployeeRuntimeState
}

export interface ProvisionEmployeeOptions {
  healthAttempts?: number
  healthIntervalMs?: number
}

const DEFAULT_EMPLOYEE_ID = 'default'
const DEFAULT_SYSTEM_ROLE = '你是 BeatyClaw 数字员工，负责帮助用户整理信息、推进任务和完成工作。'
const VALID_ENGINES: EmployeeEngineType[] = ['openclaw', 'hms', 'coco', 'zylos']

function getEmployeeHome(): string {
  return process.env.YOYOO_AUTH_HOME || join(homedir(), '.hermes-web-ui')
}

function getStorePath(): string {
  return join(getEmployeeHome(), 'beautyclaw-employees.json')
}

function getEmployeeInstancesRoot(): string {
  return process.env.BEATYCLAW_EMPLOYEES_ROOT || join(getEmployeeHome(), 'employees')
}

function getEmployeeInstanceRoot(id: string): string {
  return join(getEmployeeInstancesRoot(), id)
}

function getEmployeeRuntimeInstanceManifestPath(employee: Employee): string {
  return join(employee.instanceRoot, 'config', 'runtime-instance.json')
}

function getEmployeeContainerName(id: string): string {
  return `beautyclaw-employee-${id.replace(/[^a-zA-Z0-9_.-]/g, '-')}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultEmployee(): Employee {
  const now = nowIso()
  return {
    id: DEFAULT_EMPLOYEE_ID,
    name: 'BeatyClaw 数字员工',
    avatar: '/logo.png',
    engineType: 'openclaw',
    status: 'draft',
    systemRole: DEFAULT_SYSTEM_ROLE,
    instanceRoot: getEmployeeInstanceRoot(DEFAULT_EMPLOYEE_ID),
    runtimeUrl: '',
    containerName: getEmployeeContainerName(DEFAULT_EMPLOYEE_ID),
    port: null,
    healthStatus: 'unknown',
    visibility: 'visible',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeEngine(value: unknown): EmployeeEngineType {
  const engine = String(value || '').trim().toLowerCase()
  if (VALID_ENGINES.includes(engine as EmployeeEngineType)) return engine as EmployeeEngineType
  return 'openclaw'
}

function normalizeHealthStatus(value: unknown): EmployeeHealthStatus {
  const status = String(value || '').trim()
  if (status === 'unknown' || status === 'provisioning' || status === 'healthy' || status === 'stopped' || status === 'unhealthy') {
    return status
  }
  return 'unknown'
}

function normalizeVisibility(value: unknown): EmployeeVisibility {
  return value === 'hidden' ? 'hidden' : 'visible'
}

function normalizeDeletedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizePort(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return port
}

function normalizeEmployee(item: any): Employee | null {
  if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return null
  return {
    id: item.id,
    name: item.name,
    avatar: item.avatar || undefined,
    engineType: normalizeEngine(item.engineType || item.engine_type),
    status: normalizeStatus(item.status),
    systemRole: String(item.systemRole || item.system_role || ''),
    instanceRoot: String(item.instanceRoot || item.instance_root || getEmployeeInstanceRoot(item.id)),
    runtimeUrl: String(item.runtimeUrl || item.runtime_url || ''),
    containerName: String(item.containerName || item.container_name || getEmployeeContainerName(item.id)),
    port: normalizePort(item.port),
    healthStatus: normalizeHealthStatus(item.healthStatus || item.health_status),
    visibility: normalizeVisibility(item.visibility),
    deletedAt: normalizeDeletedAt(item.deletedAt || item.deleted_at),
    createdAt: String(item.createdAt || item.created_at || nowIso()),
    updatedAt: String(item.updatedAt || item.updated_at || nowIso()),
  }
}

function normalizeStore(parsed: any): EmployeeStore {
  const employees = Array.isArray(parsed?.employees) ? parsed.employees : []
  const normalized = employees
    .map(normalizeEmployee)
    .filter((item: Employee | null): item is Employee => Boolean(item))

  if (!normalized.some((item: Employee) => item.id === DEFAULT_EMPLOYEE_ID)) {
    normalized.unshift(defaultEmployee())
  }

  const selectable = normalized.filter((item: Employee) => !item.deletedAt)
  const currentEmployeeId = selectable.some((item: Employee) => item.id === parsed?.currentEmployeeId)
    ? parsed.currentEmployeeId
    : DEFAULT_EMPLOYEE_ID

  return { currentEmployeeId, employees: normalized }
}

function normalizeStatus(value: unknown): EmployeeStatus {
  const status = String(value || '').trim()
  if (status === 'draft' || status === 'deploying' || status === 'installed' || status === 'running' || status === 'stopped' || status === 'failed') {
    return status
  }
  return 'draft'
}

async function readStore(): Promise<EmployeeStore> {
  try {
    return normalizeStore(JSON.parse(await readFile(getStorePath(), 'utf-8')))
  } catch {
    return { currentEmployeeId: DEFAULT_EMPLOYEE_ID, employees: [defaultEmployee()] }
  }
}

async function writeStore(store: EmployeeStore): Promise<EmployeeStore> {
  await mkdir(getEmployeeHome(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(toStoredStore(store), null, 2) + '\n', { mode: 0o600 })
  return store
}

export function getEmployeeInstancePaths(employee: Employee): string[] {
  return ['config', 'data', 'logs', 'workspace'].map(name => join(employee.instanceRoot, name))
}

function toStoredEmployee(employee: Employee): Employee {
  const { runtimeInstance: _runtimeInstance, ...stored } = employee
  return stored
}

function toStoredStore(store: EmployeeStore): EmployeeStore {
  return {
    currentEmployeeId: store.currentEmployeeId,
    employees: store.employees.map(toStoredEmployee),
  }
}

async function ensureEmployeeInstanceDirs(employee: Employee): Promise<void> {
  await Promise.all(getEmployeeInstancePaths(employee).map(path => mkdir(path, { recursive: true })))
}

async function buildEmployeeRuntimeInstance(employee: Employee): Promise<EmployeeRuntimeInstance> {
  await ensureEmployeeInstanceDirs(employee)
  const runtimeState = await readEmployeeRuntimeState(employee)
  const installManifest = await readEmployeeRuntimeInstallManifest(employee)
  const runtimeInstance: EmployeeRuntimeInstance = {
    employeeId: employee.id,
    engineType: employee.engineType,
    instanceRoot: employee.instanceRoot,
    configDir: join(employee.instanceRoot, 'config'),
    dataDir: join(employee.instanceRoot, 'data'),
    logsDir: join(employee.instanceRoot, 'logs'),
    workspaceDir: join(employee.instanceRoot, 'workspace'),
    manifestPath: getEmployeeRuntimeInstanceManifestPath(employee),
    installManifestPath: getInstallManifestPath(employee),
    statePath: getRuntimeStatePath(employee),
    containerName: employee.containerName,
    runtimeUrl: runtimeState.runtimeUrl || employee.runtimeUrl,
    port: runtimeState.port ?? employee.port,
    status: runtimeState.status || employee.status,
    healthStatus: runtimeState.healthStatus || employee.healthStatus,
    mode: runtimeState.mode,
    pid: runtimeState.pid,
    lastError: runtimeState.lastError,
    logPath: runtimeState.logPath,
    installMode: installManifest?.installMode || 'none',
    installedAt: installManifest?.installedAt || '',
    updatedAt: nowIso(),
  }
  await writeFile(
    runtimeInstance.manifestPath,
    JSON.stringify({
      employeeId: runtimeInstance.employeeId,
      engineType: runtimeInstance.engineType,
      instanceRoot: runtimeInstance.instanceRoot,
      configDir: runtimeInstance.configDir,
      dataDir: runtimeInstance.dataDir,
      logsDir: runtimeInstance.logsDir,
      workspaceDir: runtimeInstance.workspaceDir,
      installManifestPath: runtimeInstance.installManifestPath,
      statePath: runtimeInstance.statePath,
      containerName: runtimeInstance.containerName,
      runtimeUrl: runtimeInstance.runtimeUrl,
      port: runtimeInstance.port,
      status: runtimeInstance.status,
      healthStatus: runtimeInstance.healthStatus,
      mode: runtimeInstance.mode,
      logPath: runtimeInstance.logPath,
      installMode: runtimeInstance.installMode,
      installedAt: runtimeInstance.installedAt,
      updatedAt: runtimeInstance.updatedAt,
    }, null, 2) + '\n',
    { mode: 0o600 },
  )
  return runtimeInstance
}

async function enrichEmployee(employee: Employee): Promise<Employee> {
  return {
    ...employee,
    runtimeInstance: await buildEmployeeRuntimeInstance(employee),
  }
}

async function enrichStore(store: EmployeeStore): Promise<EmployeeStore> {
  return {
    currentEmployeeId: store.currentEmployeeId,
    employees: await Promise.all(store.employees.map(enrichEmployee)),
  }
}

function requireName(name: unknown): string {
  const value = String(name || '').trim()
  if (!value) throw new Error('Employee name is required')
  return value.slice(0, 80)
}

function createId(): string {
  return `emp_${randomBytes(8).toString('hex')}`
}

function findEmployeeOrThrow(store: EmployeeStore, id: string): Employee {
  const employee = store.employees.find(item => item.id === id)
  if (!employee) throw new Error('Employee not found')
  return employee
}

export async function listEmployees(): Promise<EmployeeStore> {
  const store = await readStore()
  const enriched = await enrichStore(store)
  return writeStore(enriched)
}

export async function getCurrentEmployee(): Promise<Employee> {
  const store = await listEmployees()
  return findEmployeeOrThrow(store, store.currentEmployeeId)
}

export async function getEmployee(id: string): Promise<Employee> {
  const store = await listEmployees()
  return findEmployeeOrThrow(store, id)
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const store = await listEmployees()
  const now = nowIso()
  const employee: Employee = {
    id: createId(),
    name: requireName(input.name),
    avatar: input.avatar?.trim() || undefined,
    engineType: normalizeEngine(input.engineType),
    status: 'draft',
    systemRole: String(input.systemRole || '').trim(),
    instanceRoot: '',
    runtimeUrl: '',
    containerName: '',
    port: null,
    healthStatus: 'unknown',
    visibility: 'visible',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  employee.instanceRoot = getEmployeeInstanceRoot(employee.id)
  employee.containerName = getEmployeeContainerName(employee.id)
  await ensureEmployeeInstanceDirs(employee)
  store.employees.push(employee)
  await writeStore(store)
  return employee
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function markEmployeeProvisionFailed(id: string): Promise<Employee> {
  return updateEmployee(id, { status: 'failed', healthStatus: 'unhealthy' })
}

export async function createProvisionedEmployee(input: CreateEmployeeInput, options: ProvisionEmployeeOptions = {}): Promise<Employee> {
  const employee = await createEmployee(input)
  const healthAttempts = Math.max(1, options.healthAttempts ?? 10)
  const healthIntervalMs = Math.max(0, options.healthIntervalMs ?? 80)

  try {
    await deployEmployee(employee.id)
    const started = await startEmployee(employee.id)
    if (started.status !== 'running') return markEmployeeProvisionFailed(employee.id)

    let latest: EmployeeHealthCheckResult | null = null
    for (let attempt = 0; attempt < healthAttempts; attempt += 1) {
      latest = await checkEmployeeHealth(employee.id)
      if (latest.employee.status === 'running' && latest.employee.healthStatus === 'healthy') {
        return latest.employee
      }
      if (attempt < healthAttempts - 1 && healthIntervalMs > 0) await sleep(healthIntervalMs)
    }
    return latest?.employee.status === 'running' && latest.employee.healthStatus === 'healthy'
      ? latest.employee
      : markEmployeeProvisionFailed(employee.id)
  } catch {
    return markEmployeeProvisionFailed(employee.id)
  }
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const store = await listEmployees()
  const employee = findEmployeeOrThrow(store, id)
  if (input.name !== undefined) employee.name = requireName(input.name)
  if (input.avatar !== undefined) employee.avatar = input.avatar.trim() || undefined
  if (input.engineType !== undefined) employee.engineType = normalizeEngine(input.engineType)
  if (input.systemRole !== undefined) employee.systemRole = String(input.systemRole || '').trim()
  if (input.status !== undefined) employee.status = normalizeStatus(input.status)
  if (input.healthStatus !== undefined) employee.healthStatus = normalizeHealthStatus(input.healthStatus)
  if (input.runtimeUrl !== undefined) employee.runtimeUrl = String(input.runtimeUrl || '').trim()
  if (input.port !== undefined) employee.port = normalizePort(input.port)
  if (input.visibility !== undefined) employee.visibility = normalizeVisibility(input.visibility)
  if (input.deletedAt !== undefined) employee.deletedAt = normalizeDeletedAt(input.deletedAt)
  employee.updatedAt = nowIso()
  await ensureEmployeeInstanceDirs(employee)
  await writeStore(store)
  return employee
}

export async function selectEmployee(id: string): Promise<EmployeeStore> {
  const store = await listEmployees()
  const employee = findEmployeeOrThrow(store, id)
  if (employee.deletedAt) throw new Error('Employee is deleted')
  store.currentEmployeeId = id
  return writeStore(store)
}

function firstActiveEmployee(store: EmployeeStore): Employee {
  return store.employees.find(item => !item.deletedAt) || store.employees[0]
}

export async function hideEmployee(id: string): Promise<Employee> {
  return updateEmployee(id, { visibility: 'hidden' })
}

export async function showEmployee(id: string): Promise<Employee> {
  return updateEmployee(id, { visibility: 'visible', deletedAt: null })
}

export async function softDeleteEmployee(id: string): Promise<Employee> {
  const store = await listEmployees()
  const employee = findEmployeeOrThrow(store, id)
  employee.visibility = 'hidden'
  employee.deletedAt = nowIso()
  employee.status = 'stopped'
  employee.healthStatus = 'stopped'
  employee.updatedAt = nowIso()
  if (store.currentEmployeeId === id) {
    store.currentEmployeeId = firstActiveEmployee(store).id
  }
  await writeStore(store)
  return employee
}

export async function restoreEmployee(id: string): Promise<Employee> {
  return updateEmployee(id, { visibility: 'visible', deletedAt: null })
}

export async function deployEmployee(id: string): Promise<Employee> {
  const deploying = await updateEmployee(id, { status: 'deploying', healthStatus: 'provisioning' })
  const runtime = await createEmployeeRuntimeAdapter(deploying.engineType).deploy(deploying)
  return updateEmployee(id, {
    status: runtime.status,
    healthStatus: runtime.healthStatus,
    runtimeUrl: runtime.runtimeUrl,
    port: runtime.port,
  })
}

export async function startEmployee(id: string): Promise<Employee> {
  const employee = await getEmployee(id)
  const runtime = await createEmployeeRuntimeAdapter(employee.engineType).start(employee)
  return updateEmployee(id, {
    status: runtime.status,
    healthStatus: runtime.healthStatus,
    runtimeUrl: runtime.runtimeUrl,
    port: runtime.port,
  })
}

export async function stopEmployee(id: string): Promise<Employee> {
  const employee = await getEmployee(id)
  const runtime = await createEmployeeRuntimeAdapter(employee.engineType).stop(employee)
  return updateEmployee(id, {
    status: runtime.status,
    healthStatus: runtime.healthStatus,
    runtimeUrl: runtime.runtimeUrl,
    port: runtime.port,
  })
}

export async function checkEmployeeHealth(id: string): Promise<EmployeeHealthCheckResult> {
  const employee = await getEmployee(id)
  const runtime = await createEmployeeRuntimeAdapter(employee.engineType).health(employee)
  const updated = await updateEmployee(id, {
    status: runtime.status,
    healthStatus: runtime.healthStatus,
    runtimeUrl: runtime.runtimeUrl,
    port: runtime.port,
  })
  return { employee: updated, runtime }
}
