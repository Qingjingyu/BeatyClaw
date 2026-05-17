import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('Employees controller', () => {
  let authHome = ''
  const originalEnv = process.env

  beforeEach(async () => {
    authHome = await mkdtemp(join(tmpdir(), 'beautyclaw-employees-controller-'))
    process.env = {
      ...originalEnv,
      YOYOO_AUTH_HOME: authHome,
    }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(authHome, { recursive: true, force: true })
  })

  it('returns the employee list with the current employee', async () => {
    const ctrl = await import('../../packages/server/src/controllers/agentic/employees')
    const ctx: any = {}

    await ctrl.list(ctx)

    expect(ctx.body).toMatchObject({
      currentEmployeeId: 'default',
      employees: [
        expect.objectContaining({
          id: 'default',
          name: 'BeatyClaw 数字员工',
        }),
      ],
    })
  })

  it('creates an employee from request body', async () => {
    const ctrl = await import('../../packages/server/src/controllers/agentic/employees')
    const ctx: any = {
      request: {
        body: {
          name: '销售小白',
          engineType: 'openclaw',
          systemRole: '你是销售数字员工。',
        },
      },
    }

    await ctrl.create(ctx)

    expect(ctx.status).toBe(201)
    expect(ctx.body).toMatchObject({
      name: '销售小白',
      engineType: 'openclaw',
      status: 'draft',
    })
  })
})
