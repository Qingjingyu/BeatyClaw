import { getHxaOverview } from '../../services/agentic/hxa-connect'

export async function overview(ctx: any) {
  ctx.body = await getHxaOverview()
}
