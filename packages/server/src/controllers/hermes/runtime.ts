import { getConfiguredRuntimeProvider, getConfiguredRuntimeStatus } from '../../services/agentic/runtime-sdk'

export async function status(ctx: any) {
  try {
    ctx.body = {
      provider: getConfiguredRuntimeProvider(),
      runtime: getConfiguredRuntimeStatus(),
    }
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message || 'Failed to read runtime status' }
  }
}
