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

  async function waitForHealthy(ctrl: typeof import('../../packages/server/src/controllers/agentic/employees'), id: string) {
    let ctx: any = { params: { id } }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      ctx = { params: { id } }
      await ctrl.health(ctx)
      if (ctx.body?.employee?.healthStatus === 'healthy') return ctx
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    return ctx
  }

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
          instanceRoot: join(authHome, 'employees', 'default'),
          containerName: 'beautyclaw-employee-default',
          healthStatus: 'unknown',
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
      instanceRoot: expect.stringContaining('/employees/emp_'),
      containerName: expect.stringContaining('beautyclaw-employee-emp_'),
      healthStatus: 'unknown',
    })
  })

  it('checks employee runtime health', async () => {
    const ctrl = await import('../../packages/server/src/controllers/agentic/employees')
    const createCtx: any = {
      request: {
        body: {
          name: '运营小白',
          engineType: 'hms',
        },
      },
    }

    await ctrl.create(createCtx)
    await ctrl.deploy({ params: { id: createCtx.body.id } } as any)
    await ctrl.start({ params: { id: createCtx.body.id } } as any)

    const healthCtx = await waitForHealthy(ctrl, createCtx.body.id)

    expect(healthCtx.body).toMatchObject({
      employee: {
        id: createCtx.body.id,
        status: 'running',
        healthStatus: 'healthy',
      },
      runtime: {
        employeeId: createCtx.body.id,
        status: 'running',
        healthStatus: 'healthy',
      },
    })
  })
})
