import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

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

interface StoredUser extends YoyooUser {
  password_hash: string
  salt: string
}

interface StoredSession {
  token_hash: string
  user_id: string
  created_at: number
  expires_at: number
}

interface AuthStore {
  users: StoredUser[]
  sessions: StoredSession[]
  spaces: YoyooSpace[]
}

export interface YoyooLoginResult {
  user: YoyooUser
  sessionToken: string
}

const SESSION_COOKIE = 'yoyoo_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function getAuthHome(): string {
  return process.env.YOYOO_AUTH_HOME || join(homedir(), '.hermes-web-ui')
}

function getStorePath(): string {
  return join(getAuthHome(), 'yoyoo-auth.json')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString('hex')
}

function hashToken(token: string): string {
  return scryptSync(token, 'yoyoo-session-v1', 64, SCRYPT_OPTIONS).toString('hex')
}

function publicUser(user: StoredUser): YoyooUser {
  const { password_hash: _passwordHash, salt: _salt, ...safe } = user
  return safe
}

async function readStore(): Promise<AuthStore> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      spaces: Array.isArray(parsed.spaces) ? parsed.spaces : [],
    }
  } catch {
    return { users: [], sessions: [], spaces: [] }
  }
}

async function writeStore(store: AuthStore): Promise<void> {
  await mkdir(getAuthHome(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
}

function createUser(email: string, password: string, username: string, role: 'admin' | 'user'): StoredUser {
  const salt = randomBytes(16).toString('hex')
  const now = Date.now()
  return {
    id: randomBytes(16).toString('hex'),
    email: normalizeEmail(email),
    username,
    role,
    status: 'active',
    created_at: now,
    last_login_at: null,
    password_hash: hashPassword(password, salt),
    salt,
  }
}

function getSpacesRoot(): string {
  return process.env.YOYOO_SPACES_ROOT || join(getAuthHome(), 'users')
}

function createSpace(userId: string): YoyooSpace {
  const tenantId = `tenant_${userId.slice(0, 12)}`
  const workspaceId = `workspace_${userId.slice(0, 12)}`
  const userRoot = join(getSpacesRoot(), userId)
  return {
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    system_path: join(userRoot, 'system'),
    hermes_home_path: join(userRoot, 'system', 'hermes-home'),
    yoyoo_home_path: join(userRoot, 'yoyoo-home'),
    workspace_path: join(userRoot, 'workspace'),
    created_at: Date.now(),
  }
}

async function ensureSpaceDirs(space: YoyooSpace): Promise<void> {
  await mkdir(space.system_path, { recursive: true })
  if (!space.hermes_home_path) {
    space.hermes_home_path = join(space.system_path, 'hermes-home')
  }
  await mkdir(space.hermes_home_path, { recursive: true })
  await mkdir(space.yoyoo_home_path, { recursive: true })
  await mkdir(space.workspace_path, { recursive: true })
}

async function ensureSpaceForUser(store: AuthStore, userId: string): Promise<YoyooSpace> {
  let space = store.spaces.find(item => item.user_id === userId)
  if (!space) {
    space = createSpace(userId)
    store.spaces.push(space)
    await writeStore(store)
  } else if (!space.hermes_home_path) {
    space.hermes_home_path = join(space.system_path, 'hermes-home')
    await writeStore(store)
  }
  await ensureSpaceDirs(space)
  return space
}

async function ensureSeedAdmin(store: AuthStore): Promise<boolean> {
  const email = normalizeEmail(process.env.AGENTIC_OWNER_EMAIL || process.env.YOYOO_ADMIN_EMAIL || '')
  const password = process.env.AGENTIC_OWNER_PASSWORD || process.env.YOYOO_ADMIN_PASSWORD || ''
  const username = process.env.AGENTIC_OWNER_NAME || process.env.YOYOO_ADMIN_USERNAME || 'Owner'
  if (!email || !password) return false
  if (store.users.some(user => user.email === email)) return false
  store.users.push(createUser(email, password, username, 'admin'))
  return true
}

async function loadStoreWithSeed(): Promise<AuthStore> {
  const store = await readStore()
  const changed = await ensureSeedAdmin(store)
  if (changed) await writeStore(store)
  return store
}

function isPasswordMatch(user: StoredUser, password: string): boolean {
  const expected = Buffer.from(user.password_hash, 'hex')
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function loginYoyooUser(email: string, password: string): Promise<YoyooLoginResult> {
  const store = await loadStoreWithSeed()
  const user = store.users.find(item => item.email === normalizeEmail(email))
  if (!user || user.status !== 'active' || !isPasswordMatch(user, password)) {
    throw new Error('Invalid email or password')
  }

  const sessionToken = randomBytes(32).toString('hex')
  const now = Date.now()
  user.last_login_at = now
  store.sessions = store.sessions.filter(session => session.expires_at > now)
  store.sessions.push({
    token_hash: hashToken(sessionToken),
    user_id: user.id,
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
  })
  await writeStore(store)
  await ensureSpaceForUser(store, user.id)
  return { user: publicUser(user), sessionToken }
}

export async function getYoyooUserBySession(sessionToken: string | undefined | null): Promise<YoyooUser | null> {
  if (!sessionToken) return null
  const store = await loadStoreWithSeed()
  const now = Date.now()
  const tokenHash = hashToken(sessionToken)
  const session = store.sessions.find(item => item.token_hash === tokenHash && item.expires_at > now)
  if (!session) return null
  const user = store.users.find(item => item.id === session.user_id && item.status === 'active')
  return user ? publicUser(user) : null
}

export async function getYoyooSpaceForUser(userId: string): Promise<YoyooSpace> {
  const store = await loadStoreWithSeed()
  const user = store.users.find(item => item.id === userId && item.status === 'active')
  if (!user) throw new Error('User not found')
  return ensureSpaceForUser(store, user.id)
}

export async function getYoyooHermesHomeForUser(userId: string): Promise<string> {
  const space = await getYoyooSpaceForUser(userId)
  return space.yoyoo_home_path
}

export async function destroyYoyooSession(sessionToken: string | undefined | null): Promise<void> {
  if (!sessionToken) return
  const store = await readStore()
  const tokenHash = hashToken(sessionToken)
  store.sessions = store.sessions.filter(item => item.token_hash !== tokenHash)
  await writeStore(store)
}

export function getYoyooSessionCookieName(): string {
  return SESSION_COOKIE
}

export function buildYoyooSessionCookie(sessionToken: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
}

export function buildYoyooClearCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
}
