import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { homedir } from 'os'
import { checkToken, recordTokenFailure, extractIp } from './login-limiter'
import { getYoyooSessionCookieName, getYoyooUserBySession } from './yoyoo-auth'

const APP_HOME = join(homedir(), '.hermes-web-ui')
const TOKEN_FILE = join(APP_HOME, '.token')

function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === '1' || process.env.AUTH_DISABLED === 'true'
}

function isLegacyTokenAuthEnabled(): boolean {
  return process.env.AGENTIC_ALLOW_TOKEN_AUTH === '1' || process.env.AGENTIC_ALLOW_TOKEN_AUTH === 'true'
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Get or create the auth token. Returns null if auth is disabled.
 */
export async function getToken(): Promise<string | null> {
  if (isAuthDisabled() || !isLegacyTokenAuthEnabled()) {
    return null
  }

  if (process.env.AUTH_TOKEN) {
    return process.env.AUTH_TOKEN
  }

  try {
    const token = await readFile(TOKEN_FILE, 'utf-8')
    return token.trim()
  } catch {
    const token = generateToken()
    await mkdir(APP_HOME, { recursive: true })
    // Only set mode on Unix systems (Windows ignores this)
    const options: any = {}
    if (process.platform !== 'win32') {
      options.mode = 0o600
    }
    await writeFile(TOKEN_FILE, token + '\n', options)
    return token
  }
}

/**
 * Koa middleware: check Authorization header or query token.
 * No path whitelisting — applied globally after public routes.
 */
export function requireAuth(token: string | null) {
  return async (ctx: any, next: () => Promise<void>) => {
    if (isAuthDisabled()) {
      await next()
      return
    }

    const yoyooSession = ctx.cookies?.get?.(getYoyooSessionCookieName())
    const yoyooUser = await getYoyooUserBySession(yoyooSession)
    if (yoyooUser) {
      ctx.state.yoyooUser = yoyooUser
      await next()
      return
    }

    const legacyTokenAuthEnabled = isLegacyTokenAuthEnabled()
    const lowerPath = ctx.path.toLowerCase()
    const isProtectedPath = lowerPath.startsWith('/api') || lowerPath.startsWith('/v1') || lowerPath.startsWith('/upload')

    if (!legacyTokenAuthEnabled || !token) {
      if (!isProtectedPath) {
        await next()
        return
      }
      ctx.status = 401
      ctx.set('Content-Type', 'application/json')
      ctx.body = { error: 'Unauthorized' }
      return
    }

    if (!token) {
      await next()
      return
    }

    const auth = ctx.headers.authorization || ''
    const provided = auth.startsWith('Bearer ')
      ? auth.slice(7)
      : (ctx.query.token as string) || ''

    if (!provided || provided !== token) {
      // Skip auth for non-API paths (SPA static files)
      if (!isProtectedPath) {
        await next()
        return
      }

      // Check rate limiter for token auth failures (separate IP counters from password login)
      const ip = extractIp(ctx)
      const result = checkToken(ip)
      if (!result.allowed) {
        ctx.status = result.status
        ctx.set('Content-Type', 'application/json')
        ctx.body = { error: 'Too many login attempts, please try again later' }
        return
      }

      recordTokenFailure(ip)
      ctx.status = 401
      ctx.set('Content-Type', 'application/json')
      ctx.body = { error: 'Unauthorized' }
      return
    }

    await next()
  }
}
