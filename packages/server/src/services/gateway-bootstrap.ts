let gatewayManager: any = null

export function getGatewayManagerInstance(): any {
  return gatewayManager
}

export async function initGatewayManager(): Promise<void> {
  const { GatewayManager } = await import('./hermes/gateway-manager')
  const { getActiveProfileName } = await import('./hermes/hermes-profile')
  const activeProfile = getActiveProfileName()
  gatewayManager = new GatewayManager(activeProfile)

  if (process.env.AGENTIC_DISABLE_HERMES_GATEWAY === '1' || process.env.AGENTIC_DISABLE_HERMES_GATEWAY === 'true') {
    console.log('[bootstrap] Hermes gateway startup disabled for Agentic runtime')
    return
  }

  await gatewayManager.detectAllOnStartup()
  await gatewayManager.startAll()
  console.log("startall")
}
