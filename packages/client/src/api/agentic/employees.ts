import { request } from '../client'

export type EmployeeStatus = 'draft' | 'deploying' | 'installed' | 'running' | 'stopped' | 'failed'
export type EmployeeHealthStatus = 'unknown' | 'provisioning' | 'healthy' | 'stopped' | 'unhealthy'
export type EmployeeEngineType = 'openclaw' | 'hms' | 'coco' | 'zylos'

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
  createdAt: string
  updatedAt: string
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

export function checkEmployeeHealth(id: string): Promise<EmployeeHealthCheckResponse> {
  return request<EmployeeHealthCheckResponse>(`/api/employees/${encodeURIComponent(id)}/health`, {
    method: 'POST',
  })
}
