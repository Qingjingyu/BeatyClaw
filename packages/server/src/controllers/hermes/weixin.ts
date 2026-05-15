import axios from 'axios'
import { readFile, writeFile, chmod } from 'fs/promises'
import { getGatewayManagerInstance } from '../../services/gateway-bootstrap'
import { getActiveEnvPath } from '../../services/hermes/hermes-profile'
import { restartGateway } from '../../services/hermes/hermes-cli'
import { getWeixinRuntimeStatus } from '../../services/agentic/weixin-runtime'

const ILINK_BASE = 'https://ilinkai.weixin.qq.com'
const envPath = () => getActiveEnvPath()

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && val) env[key] = val
  }
  return env
}

async function readWeixinEnv(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(envPath(), 'utf-8')
    return parseEnv(raw)
  } catch {
    return {}
  }
}

export async function status(ctx: any) {
  try {
    const env = await readWeixinEnv()
    const accountId = env.WEIXIN_ACCOUNT_ID
    const token = env.WEIXIN_TOKEN
    let gatewayRunning = false
    let gatewayProfile: string | undefined

    const mgr = getGatewayManagerInstance()
    if (mgr) {
      try {
        gatewayProfile = mgr.getActiveProfile()
        const gatewayStatus = await mgr.detectStatus(gatewayProfile)
        gatewayRunning = !!gatewayStatus.running
      } catch {
        gatewayRunning = false
      }
    }

    ctx.body = {
      key: 'weixin',
      name: 'Weixin',
      source: 'agentic-hermes-weixin',
      configured: Boolean(accountId && token),
      account_id: accountId || undefined,
      base_url: env.WEIXIN_BASE_URL || undefined,
      gateway_profile: gatewayProfile,
      gateway_running: gatewayRunning,
      runtime: getWeixinRuntimeStatus(),
    }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message || 'Failed to read Weixin status' }
  }
}

export async function getQrcode(ctx: any) {
  try {
    const res = await axios.get(`${ILINK_BASE}/ilink/bot/get_bot_qrcode`, { params: { bot_type: 3 }, timeout: 15000 })
    const data = res.data
    if (!data || !data.qrcode) { ctx.status = 500; ctx.body = { error: 'Failed to get QR code' }; return }
    ctx.body = { qrcode: data.qrcode, qrcode_url: data.qrcode_img_content }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message || 'Failed to connect to iLink API' }
  }
}

export async function pollStatus(ctx: any) {
  const qrcode = ctx.query.qrcode as string
  if (!qrcode) { ctx.status = 400; ctx.body = { error: 'Missing qrcode parameter' }; return }
  try {
    const res = await axios.get(`${ILINK_BASE}/ilink/bot/get_qrcode_status`, { params: { qrcode }, timeout: 35000 })
    const data = res.data
    const status = data?.status || 'wait'
    if (status === 'confirmed') {
      ctx.body = { status: 'confirmed', account_id: data.ilink_bot_id, token: data.bot_token, base_url: data.baseurl }
    } else {
      ctx.body = { status }
    }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message || 'Failed to poll QR status' }
  }
}

export async function save(ctx: any) {
  const { account_id, token, base_url } = ctx.request.body as { account_id: string; token: string; base_url?: string }
  if (!account_id || !token) { ctx.status = 400; ctx.body = { error: 'Missing account_id or token' }; return }
  try {
    let raw: string
    try { raw = await readFile(envPath(), 'utf-8') } catch { raw = '' }
    const entries: Record<string, string> = { WEIXIN_ACCOUNT_ID: account_id, WEIXIN_TOKEN: token }
    if (base_url) entries.WEIXIN_BASE_URL = base_url
    const lines = raw.split('\n')
    const existingKeys = new Set<string>()
    const result: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) { result.push(line); continue }
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim()
        if (key in entries) { result.push(`${key}=${entries[key]}`); existingKeys.add(key); continue }
      }
      result.push(line)
    }
    for (const [key, val] of Object.entries(entries)) { if (!existingKeys.has(key)) { result.push(`${key}=${val}`) } }
    let output = result.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '') + '\n'
    const ep = envPath()
    await writeFile(ep, output, 'utf-8')
    try { await chmod(ep, 0o600) } catch { }
    await restartGateway()
    ctx.body = { success: true }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}
