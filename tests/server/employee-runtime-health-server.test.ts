import { afterEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { join } from 'path'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate test port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function waitForHealth(port: number): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return response
      lastError = new Error(`Unexpected status ${response.status}`)
    } catch (err) {
      lastError = err
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

describe('employee runtime health server', () => {
  let child: ChildProcess | null = null

  afterEach(() => {
    if (child && child.exitCode === null) child.kill('SIGTERM')
    child = null
  })

  it('exposes employee engine health over the assigned runtime port', async () => {
    const port = await freePort()
    child = spawn(process.execPath, [join(process.cwd(), 'packages/employee-runtime/health-server.mjs')], {
      env: {
        ...process.env,
        BEATYCLAW_EMPLOYEE_ID: 'emp_health',
        BEATYCLAW_EMPLOYEE_ENGINE: 'hms',
        BEATYCLAW_EMPLOYEE_ROOT: '/home/agent/employee',
        BEATYCLAW_EMPLOYEE_PORT: String(port),
      },
      stdio: 'ignore',
    })

    const response = await waitForHealth(port)
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'beautyclaw-employee-runtime',
      employeeId: 'emp_health',
      engine: 'hms',
      root: '/home/agent/employee',
      port,
    })
  })
})
