import { readFile } from 'fs/promises'
import { getActiveEnvPath } from '../../services/hermes/hermes-profile'
import { getTelegramRuntimeStatus } from '../../services/agentic/telegram-runtime'

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

async function readTelegramEnv(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(envPath(), 'utf-8')
    return parseEnv(raw)
  } catch {
    return {}
  }
}

export async function status(ctx: any) {
  try {
    const env = await readTelegramEnv()
    const token = env.TELEGRAM_BOT_TOKEN
    ctx.body = {
      key: 'telegram',
      name: 'Telegram',
      source: 'agentic-telegram-runtime',
      configured: Boolean(token),
      runtime: getTelegramRuntimeStatus(),
    }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message || 'Failed to read Telegram status' }
  }
}
