import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('Yoyoo Auth service', () => {
  let authHome = ''
  const originalEnv = process.env

  beforeEach(async () => {
    authHome = await mkdtemp(join(tmpdir(), 'yoyoo-auth-'))
    process.env = {
      ...originalEnv,
      YOYOO_AUTH_HOME: authHome,
      AGENTIC_OWNER_EMAIL: 'owner@agentic.local',
      AGENTIC_OWNER_PASSWORD: 'owner-password',
      AGENTIC_OWNER_NAME: '苏白',
    }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(authHome, { recursive: true, force: true })
  })

  it('logs in seeded admin and resolves the issued session', async () => {
    const auth = await import('../../packages/server/src/services/yoyoo-auth')

    const result = await auth.loginYoyooUser('owner@agentic.local', 'owner-password')

    expect(result.user.email).toBe('owner@agentic.local')
    expect(result.user.username).toBe('苏白')
    expect(result.user.role).toBe('admin')
    expect(result.sessionToken).toMatch(/^[a-f0-9]{64}$/)

    const resolved = await auth.getYoyooUserBySession(result.sessionToken)
    expect(resolved?.email).toBe('owner@agentic.local')
  })

  it('creates stable isolated space directories for the seeded admin', async () => {
    const auth = await import('../../packages/server/src/services/yoyoo-auth')
    const result = await auth.loginYoyooUser('owner@agentic.local', 'owner-password')

    const space = await auth.getYoyooSpaceForUser(result.user.id)

    expect(space.user_id).toBe(result.user.id)
    expect(space.tenant_id).toMatch(/^tenant_/)
    expect(space.workspace_id).toMatch(/^workspace_/)
    expect(space.system_path).toContain(result.user.id)
    expect(space.hermes_home_path).toContain(result.user.id)
    expect(space.hermes_home_path).toContain('/system/hermes-home')
    expect(space.yoyoo_home_path).toContain(result.user.id)
    expect(space.workspace_path).toContain(result.user.id)

    await expect(stat(space.system_path)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
    await expect(stat(space.hermes_home_path)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
    await expect(stat(space.yoyoo_home_path)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
    await expect(stat(space.workspace_path)).resolves.toMatchObject({ isDirectory: expect.any(Function) })

    await expect(auth.getYoyooHermesHomeForUser(result.user.id)).resolves.toBe(space.yoyoo_home_path)
  })

  it('rejects wrong password', async () => {
    const auth = await import('../../packages/server/src/services/yoyoo-auth')

    await expect(auth.loginYoyooUser('owner@agentic.local', 'wrong-password')).rejects.toThrow('Invalid email or password')
  })

  it('destroys session on logout', async () => {
    const auth = await import('../../packages/server/src/services/yoyoo-auth')
    const result = await auth.loginYoyooUser('owner@agentic.local', 'owner-password')

    await auth.destroyYoyooSession(result.sessionToken)

    await expect(auth.getYoyooUserBySession(result.sessionToken)).resolves.toBeNull()
  })
})
