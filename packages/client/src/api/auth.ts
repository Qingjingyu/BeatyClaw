import { request } from './client'

export interface AuthStatus {
  hasPasswordLogin: boolean
  username: string | null
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/status')
  if (!res.ok) throw new Error('Failed to fetch auth status')
  return res.json()
}

export async function loginWithPassword(username: string, password: string): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err: any = new Error(data.error || 'Login failed')
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.token
}

export interface YoyooUser {
  id: string
  email: string
  username: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  created_at: number
  last_login_at: number | null
}

export interface YoyooSpace {
  user_id: string
  tenant_id: string
  workspace_id: string
  system_path: string
  hermes_home_path: string
  yoyoo_home_path: string
  workspace_path: string
  created_at: number
}

export interface YoyooMe {
  user: YoyooUser
  space: YoyooSpace
}

export async function loginWithYoyoo(email: string, password: string): Promise<YoyooUser> {
  const res = await fetch('/api/yoyoo/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err: any = new Error(data.error || 'Login failed')
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.user
}

export async function fetchYoyooMe(): Promise<YoyooMe> {
  const res = await fetch('/api/yoyoo/me', { credentials: 'include' })
  if (!res.ok) {
    const err: any = new Error('Unauthorized')
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function logoutYoyoo(): Promise<void> {
  await fetch('/api/yoyoo/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function setupPassword(username: string, password: string): Promise<void> {
  return request('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function changeUsername(currentPassword: string, newUsername: string): Promise<void> {
  return request('/api/auth/change-username', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newUsername }),
  })
}

export async function removePassword(): Promise<void> {
  return request('/api/auth/password', {
    method: 'DELETE',
  })
}

export interface LockedIp {
  ip: string
  type: 'password' | 'token'
  failures: number
  lockedUntil: number
}

export async function fetchLockedIps(): Promise<LockedIp[]> {
  const res = await request<{ locks: LockedIp[] }>('/api/auth/locked-ips')
  return res.locks
}

export async function unlockSpecificIp(ip: string): Promise<void> {
  return request(`/api/auth/locked-ips?ip=${encodeURIComponent(ip)}`, {
    method: 'DELETE',
  })
}

export async function unlockAllIps(): Promise<number> {
  const res = await request<{ count: number }>('/api/auth/locked-ips', {
    method: 'DELETE',
  })
  return res.count
}
