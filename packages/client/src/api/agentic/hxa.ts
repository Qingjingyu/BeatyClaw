import { request } from '@/api/client'

export interface HxaOverview {
  configured: boolean
  online: boolean
  baseUrl: string
  version?: {
    version?: string
    server?: string
  }
  health?: Record<string, unknown>
  stats?: {
    org_count?: number
    bot_count?: number
    online_bot_count?: number
    thread_count?: number
    message_count?: number
    active_thread_count?: number
  }
  orgs?: Array<{
    id: string
    name: string
    status?: string
    bot_count?: number
    created_at?: number
  }>
  error?: string
}

export async function fetchHxaOverview(): Promise<HxaOverview> {
  return request<HxaOverview>('/api/agentic/hxa/overview')
}
