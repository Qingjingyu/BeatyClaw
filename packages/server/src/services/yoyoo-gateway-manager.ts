import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { mkdir } from 'fs/promises'
import { createServer } from 'net'
import { join } from 'path'
import yaml from 'js-yaml'
import { logger } from './logger'
import { getHermesBin } from './hermes/hermes-path'
import { getYoyooSpaceForUser, type YoyooUser } from './yoyoo-auth'

interface YoyooGateway {
  userId: string
  pid: number
  port: number
  host: string
  upstream: string
  apiKey: string | null
  process?: ChildProcess
}

export interface YoyooGatewayEndpoint {
  upstream: string
  apiKey: string | null
  profile: string
}

const gateways = new Map<string, YoyooGateway>()
const allocatedPorts = new Set<number>()

function buildUrl(host: string, port: number): string {
  const safeHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${safeHost}:${port}`
}

function getBasePort(): number {
  const raw = Number(process.env.YOYOO_GATEWAY_BASE_PORT || 9642)
  return Number.isFinite(raw) && raw > 0 && raw <= 65535 ? raw : 9642
}

function getGatewayHost(): string {
  return process.env.GATEWAY_HOST || '127.0.0.1'
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err?.code === 'EPERM'
  }
}

async function checkHealth(upstream: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${upstream}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}

function readApiKey(hermesHome: string): string | null {
  try {
    const envPath = join(hermesHome, '.env')
    if (!existsSync(envPath)) return null
    const content = readFileSync(envPath, 'utf-8')
    const match = content.match(/^API_SERVER_KEY\s*=\s*"?([^"\n]+)"?/m)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

async function findFreePort(base: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > 65535) {
        reject(new Error(`No free port found in range ${base}-65535`))
        return
      }
      if (allocatedPorts.has(port)) {
        tryPort(port + 1)
        return
      }
      const server = createServer()
      server.once('error', () => {
        server.close()
        tryPort(port + 1)
      })
      server.once('listening', () => {
        server.close()
        allocatedPorts.add(port)
        resolve(port)
      })
      server.listen(port, host)
    }
    tryPort(base)
  })
}

function writeGatewayConfig(hermesHome: string, port: number, host: string): void {
  const configPath = join(hermesHome, 'config.yaml')
  const content = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''
  const cfg = (yaml.load(content, { json: true }) as any) || {}

  if (!cfg.platforms) cfg.platforms = {}
  if (!cfg.platforms.api_server) cfg.platforms.api_server = {}
  if (!cfg.platforms.api_server.extra) cfg.platforms.api_server.extra = {}

  cfg.platforms.api_server.enabled = true
  cfg.platforms.api_server.key = cfg.platforms.api_server.key || ''
  cfg.platforms.api_server.cors_origins = '*'
  cfg.platforms.api_server.extra.port = port
  cfg.platforms.api_server.extra.host = host

  delete cfg.platforms.api_server.port
  delete cfg.platforms.api_server.host

  writeFileSync(configPath, yaml.dump(cfg, { lineWidth: -1 }), 'utf-8')
}

async function waitForReady(userId: string, pid: number, upstream: string): Promise<void> {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (pid && !isProcessAlive(pid)) {
      throw new Error(`Yoyoo HMS gateway exited unexpectedly for user ${userId}`)
    }
    if (await checkHealth(upstream, 1500)) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Yoyoo HMS gateway health check timed out for user ${userId}`)
}

export async function resolveYoyooGatewayForUser(user: YoyooUser): Promise<YoyooGatewayEndpoint> {
  const existing = gateways.get(user.id)
  if (existing && isProcessAlive(existing.pid) && await checkHealth(existing.upstream, 800)) {
    return {
      upstream: existing.upstream,
      apiKey: existing.apiKey,
      profile: `yoyoo_${user.id}`,
    }
  }

  const space = await getYoyooSpaceForUser(user.id)
  const hermesHome = space.hermes_home_path
  await mkdir(hermesHome, { recursive: true })

  const host = getGatewayHost()
  const port = await findFreePort(getBasePort(), host)
  const upstream = buildUrl(host, port)
  writeGatewayConfig(hermesHome, port, host)

  const child = spawn(getHermesBin(), ['gateway', 'run', '--replace'], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
    env: {
      ...process.env,
      HERMES_HOME: hermesHome,
      YOYOO_HOME: space.yoyoo_home_path,
      YOYOO_WORKSPACE: space.workspace_path,
      YOYOO_USER_ID: user.id,
      YOYOO_TENANT_ID: space.tenant_id,
      YOYOO_WORKSPACE_ID: space.workspace_id,
    },
  })
  child.unref()

  const pid = child.pid ?? 0
  const gateway: YoyooGateway = {
    userId: user.id,
    pid,
    port,
    host,
    upstream,
    apiKey: readApiKey(hermesHome),
    process: child,
  }
  gateways.set(user.id, gateway)

  logger.info('Starting Yoyoo HMS gateway for user "%s" (PID: %d, port: %d)', user.id, pid, port)
  await waitForReady(user.id, pid, upstream)

  return {
    upstream,
    apiKey: gateway.apiKey,
    profile: `yoyoo_${user.id}`,
  }
}

