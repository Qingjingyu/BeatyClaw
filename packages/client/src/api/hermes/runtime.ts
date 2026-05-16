import { request } from '../client'

export type RuntimeProvider = 'none' | 'zylos' | 'openai-direct' | 'openclaw' | 'hms'
export type RuntimeMode = 'active' | 'not_configured' | 'unsupported'

export interface RuntimeCheck {
  key: string
  label: string
  ok: boolean
  required: boolean
  detail?: string
}

export interface RuntimeStatus {
  provider: RuntimeProvider
  available: boolean
  mode: RuntimeMode
  detail?: string
  capabilities?: string[]
  missingConfig?: string[]
  checks?: RuntimeCheck[]
}

export interface RuntimeStatusResponse {
  provider: RuntimeProvider
  runtime: RuntimeStatus
}

export async function fetchRuntimeStatus(): Promise<RuntimeStatusResponse> {
  return request<RuntimeStatusResponse>('/api/hermes/runtime/status')
}
