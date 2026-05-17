import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Employee } from '../../packages/server/src/services/agentic/employees'

describe('Employee runtime installer', () => {
  let instanceRoot = ''
  const originalEnv = process.env

  beforeEach(async () => {
    instanceRoot = await mkdtemp(join(tmpdir(), 'beautyclaw-runtime-installer-'))
    process.env = { ...originalEnv }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(instanceRoot, { recursive: true, force: true })
  })

  function employee(portSeed = 'emp_hms'): Employee {
    return {
      id: portSeed,
      name: 'HMS 员工',
      engineType: 'hms',
      status: 'draft',
      systemRole: '',
      instanceRoot,
      runtimeUrl: '',
      containerName: `beautyclaw-employee-${portSeed}`,
      port: null,
      healthStatus: 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  async function waitForHealthy(adapter: Awaited<ReturnType<typeof import('../../packages/server/src/services/agentic/employee-runtime')>>['EmployeeRuntimeAdapter'], target: Employee) {
    let latest
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await adapter.health(target)
      if (latest.healthStatus === 'healthy') return latest
      await new Promise(resolve => setTimeout(resolve, 80))
    }
    return latest
  }

  it('writes an HMS install manifest and placeholder launcher', async () => {
    process.env.BEATYCLAW_HMS_PORT = '4611'
    const { getInstallManifestPath, installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const target = employee()

    const manifest = await installEmployeeRuntime(target)

    expect(manifest).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      port: 4611,
      runtimeUrl: 'http://127.0.0.1:4611/health',
      startCommand: process.execPath,
    })
    expect(manifest.startArgs[0]).toContain('start-hms-placeholder.mjs')
    await expect(stat(manifest.startArgs[0])).resolves.toBeTruthy()
    expect(JSON.parse(await readFile(getInstallManifestPath(target), 'utf-8'))).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      port: 4611,
      installMode: 'placeholder',
    })
  })

  it('allocates the next free port from a configured engine port range', async () => {
    process.env.BEATYCLAW_HMS_PORT_RANGE = '4800-4802'
    const { installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const first = {
      ...employee('emp_hms_port_a'),
      instanceRoot: join(instanceRoot, 'first'),
    }
    const second = {
      ...employee('emp_hms_port_b'),
      instanceRoot: join(instanceRoot, 'second'),
    }

    await mkdir(join(first.instanceRoot, 'config'), { recursive: true })
    await writeFile(join(first.instanceRoot, 'config', 'runtime-install.json'), JSON.stringify({
      employeeId: first.id,
      engineType: 'hms',
      runtimeUrl: 'http://127.0.0.1:4800/health',
      port: 4800,
      startCommand: process.execPath,
      startArgs: [],
      env: {},
      healthUrl: 'http://127.0.0.1:4800/health',
      apiKey: '',
      installedAt: new Date().toISOString(),
      installMode: 'placeholder',
    }, null, 2))

    const manifest = await installEmployeeRuntime(second)

    expect(manifest).toMatchObject({
      employeeId: second.id,
      port: 4801,
      runtimeUrl: 'http://127.0.0.1:4801/health',
      healthUrl: 'http://127.0.0.1:4801/health',
    })
  })

  it('writes a Hermes gateway install manifest when requested', async () => {
    process.env.BEATYCLAW_HMS_INSTALL_MODE = 'hermes-gateway'
    process.env.BEATYCLAW_HMS_PORT = '4621'
    process.env.HERMES_BIN = '/usr/local/bin/hermes-test'
    const { getInstallManifestPath, installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const target = employee('emp_hms_gateway')

    const manifest = await installEmployeeRuntime(target)

    expect(manifest).toMatchObject({
      employeeId: target.id,
      engineType: 'hms',
      installMode: 'hermes-gateway',
      port: 4621,
      runtimeUrl: 'http://127.0.0.1:4621/health',
      startCommand: '/usr/local/bin/hermes-test',
      startArgs: ['gateway', 'run', '--replace'],
      env: {
        HERMES_HOME: join(target.instanceRoot, 'config', 'hermes-home'),
        YOYOO_HOME: join(target.instanceRoot, 'data', 'yoyoo-home'),
        YOYOO_WORKSPACE: join(target.instanceRoot, 'workspace'),
        YOYOO_USER_ID: target.id,
      },
    })
    await expect(stat(join(target.instanceRoot, 'config', 'hermes-home', 'config.yaml'))).resolves.toBeTruthy()
    expect(await readFile(join(target.instanceRoot, 'config', 'hermes-home', 'config.yaml'), 'utf-8')).toContain('api_server')
    expect(JSON.parse(await readFile(getInstallManifestPath(target), 'utf-8'))).toMatchObject({
      installMode: 'hermes-gateway',
      startArgs: ['gateway', 'run', '--replace'],
    })
  })

  it('writes HMS gateway model config from deployment env', async () => {
    process.env.BEATYCLAW_HMS_INSTALL_MODE = 'hermes-gateway'
    process.env.BEATYCLAW_HMS_MODEL = 'gpt-5.5'
    process.env.BEATYCLAW_HMS_MODEL_PROVIDER = 'custom'
    process.env.BEATYCLAW_HMS_MODEL_BASE_URL = 'https://key.cosark.com.cn/v1'
    process.env.BEATYCLAW_HMS_MODEL_API_KEY = 'model-secret'
    const { installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')
    const target = employee('emp_hms_model')

    await installEmployeeRuntime(target)

    const config = await readFile(join(target.instanceRoot, 'config', 'hermes-home', 'config.yaml'), 'utf-8')
    expect(config).toContain('model:')
    expect(config).toContain("default: 'gpt-5.5'")
    expect(config).toContain("provider: 'custom'")
    expect(config).toContain("base_url: 'https://key.cosark.com.cn/v1'")
    const env = await readFile(join(target.instanceRoot, 'config', 'hermes-home', '.env'), 'utf-8')
    expect(env).toContain('OPENAI_API_KEY="model-secret"')
    expect(env).toContain('OPENAI_BASE_URL="https://key.cosark.com.cn/v1"')
    expect(env).toContain('HERMES_MODEL="gpt-5.5"')
    expect(env).toContain('GATEWAY_ALLOW_ALL_USERS=true')
  })

  it('reads HMS gateway API key from the employee hermes home when present', async () => {
    process.env.BEATYCLAW_HMS_INSTALL_MODE = 'hermes-gateway'
    const target = employee('emp_hms_key')
    await mkdir(join(target.instanceRoot, 'config', 'hermes-home'), { recursive: true })
    await writeFile(
      join(target.instanceRoot, 'config', 'hermes-home', '.env'),
      'API_SERVER_KEY="employee-secret"\n',
    )
    const { installEmployeeRuntime } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')

    await expect(installEmployeeRuntime(target)).resolves.toMatchObject({
      apiKey: 'employee-secret',
      installMode: 'hermes-gateway',
    })
  })

  it('refreshes HMS gateway API key from hermes home after the manifest exists', async () => {
    process.env.BEATYCLAW_HMS_INSTALL_MODE = 'hermes-gateway'
    const target = employee('emp_hms_key_refresh')
    const {
      installEmployeeRuntime,
      readEmployeeRuntimeInstallManifest,
    } = await import('../../packages/server/src/services/agentic/employee-runtime-installer')

    await expect(installEmployeeRuntime(target)).resolves.toMatchObject({ apiKey: '' })
    await writeFile(
      join(target.instanceRoot, 'config', 'hermes-home', '.env'),
      'API_SERVER_KEY="employee-secret-after-start"\n',
    )

    await expect(readEmployeeRuntimeInstallManifest(target)).resolves.toMatchObject({
      apiKey: 'employee-secret-after-start',
      installMode: 'hermes-gateway',
    })
  })

  it('deploys and health-checks the placeholder HMS runtime through the process adapter', async () => {
    process.env.BEATYCLAW_HMS_PORT = '4612'
    const { createEmployeeRuntimeAdapter } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee('emp_hms_process')

    await expect(adapter.deploy(target)).resolves.toMatchObject({
      mode: 'process',
      status: 'installed',
      port: 4612,
      runtimeUrl: 'http://127.0.0.1:4612/health',
    })
    await expect(adapter.start(target)).resolves.toMatchObject({ mode: 'process', status: 'running' })
    await expect(waitForHealthy(adapter, target)).resolves.toMatchObject({ status: 'running', healthStatus: 'healthy' })
    await expect(adapter.stop(target)).resolves.toMatchObject({ status: 'stopped', healthStatus: 'stopped' })
  })
})
