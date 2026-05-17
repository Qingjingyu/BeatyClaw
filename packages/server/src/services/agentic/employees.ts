import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'node:crypto'

export type EmployeeStatus = 'draft' | 'deploying' | 'installed' | 'running' | 'stopped' | 'failed'
export type EmployeeEngineType = 'openclaw' | 'hms' | 'coco' | 'zylos'

export interface Employee {
  id: string
  name: string
  avatar?: string
  engineType: EmployeeEngineType
  status: EmployeeStatus
  systemRole: string
  createdAt: string
  updatedAt: string
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
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeEngine(value: unknown): EmployeeEngineType {
  const engine = String(value || '').trim().toLowerCase()
  if (VALID_ENGINES.includes(engine as EmployeeEngineType)) return engine as EmployeeEngineType
  return 'openclaw'
}

function normalizeStore(parsed: any): EmployeeStore {
  const employees = Array.isArray(parsed?.employees) ? parsed.employees : []
  const normalized = employees
    .filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map((item: any) => ({
      id: item.id,
      name: item.name,
      avatar: item.avatar || undefined,
      engineType: normalizeEngine(item.engineType || item.engine_type),
      status: normalizeStatus(item.status),
      systemRole: String(item.systemRole || item.system_role || ''),
      createdAt: String(item.createdAt || item.created_at || nowIso()),
      updatedAt: String(item.updatedAt || item.updated_at || nowIso()),
    }))

  if (!normalized.some((item: Employee) => item.id === DEFAULT_EMPLOYEE_ID)) {
    normalized.unshift(defaultEmployee())
  }

  const currentEmployeeId = normalized.some((item: Employee) => item.id === parsed?.currentEmployeeId)
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
  await writeFile(getStorePath(), JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
  return store
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
  return writeStore(store)
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
    createdAt: now,
    updatedAt: now,
  }
  store.employees.push(employee)
  await writeStore(store)
  return employee
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const store = await listEmployees()
  const employee = findEmployeeOrThrow(store, id)
  if (input.name !== undefined) employee.name = requireName(input.name)
  if (input.avatar !== undefined) employee.avatar = input.avatar.trim() || undefined
  if (input.engineType !== undefined) employee.engineType = normalizeEngine(input.engineType)
  if (input.systemRole !== undefined) employee.systemRole = String(input.systemRole || '').trim()
  if (input.status !== undefined) employee.status = normalizeStatus(input.status)
  employee.updatedAt = nowIso()
  await writeStore(store)
  return employee
}

export async function selectEmployee(id: string): Promise<EmployeeStore> {
  const store = await listEmployees()
  findEmployeeOrThrow(store, id)
  store.currentEmployeeId = id
  return writeStore(store)
}

export async function deployEmployee(id: string): Promise<Employee> {
  await updateEmployee(id, { status: 'deploying' })
  return updateEmployee(id, { status: 'installed' })
}

export async function startEmployee(id: string): Promise<Employee> {
  return updateEmployee(id, { status: 'running' })
}

export async function stopEmployee(id: string): Promise<Employee> {
  return updateEmployee(id, { status: 'stopped' })
}
