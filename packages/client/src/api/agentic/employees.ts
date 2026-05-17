import { request } from '../client'

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

export interface EmployeeListResponse {
  currentEmployeeId: string
  employees: Employee[]
}

export interface EmployeeHealthCheckResponse {
  employee: Employee
  runtime: {
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
    logPath: string
  }
}

export interface CreateEmployeePayload {
  name: string
  avatar?: string
  engineType: EmployeeEngineType
  systemRole?: string
}

export function fetchEmployees(): Promise<EmployeeListResponse> {
  return request<EmployeeListResponse>('/api/employees')
}

export function createEmployee(payload: CreateEmployeePayload): Promise<Employee> {
  return request<Employee>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function selectEmployee(id: string): Promise<EmployeeListResponse> {
  return request<EmployeeListResponse>(`/api/employees/${encodeURIComponent(id)}/select`, {
    method: 'POST',
  })
}

export function deployEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/deploy`, {
    method: 'POST',
  })
}

export function startEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/start`, {
    method: 'POST',
  })
}

export function stopEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
  })
}

export function hideEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
  })
}

export function showEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/show`, {
    method: 'POST',
  })
}

export function deleteEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function restoreEmployee(id: string): Promise<Employee> {
  return request<Employee>(`/api/employees/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  })
}

export function checkEmployeeHealth(id: string): Promise<EmployeeHealthCheckResponse> {
  return request<EmployeeHealthCheckResponse>(`/api/employees/${encodeURIComponent(id)}/health`, {
    method: 'POST',
  })
}
