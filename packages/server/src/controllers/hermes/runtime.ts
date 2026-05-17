import { getConfiguredRuntimeProvider, getConfiguredRuntimeStatus } from '../../services/agentic/runtime-sdk'
import { getRuntimeDiagnostics } from '../../services/agentic/runtime-diagnostics'

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

export async function diagnostics(ctx: any) {
  try {
    ctx.body = await getRuntimeDiagnostics()
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err.message || 'Failed to read runtime diagnostics' }
  }
}
