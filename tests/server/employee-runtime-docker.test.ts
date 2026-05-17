import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Employee } from '../../packages/server/src/services/agentic/employees'

describe('Employee docker runtime adapter', () => {
  let instanceRoot = ''
  let fakeDockerPath = ''
  let callsPath = ''
  const originalEnv = process.env

  beforeEach(async () => {
    instanceRoot = await mkdtemp(join(tmpdir(), 'beautyclaw-runtime-docker-'))
    callsPath = join(instanceRoot, 'docker-calls.jsonl')
    fakeDockerPath = join(instanceRoot, 'fake-docker.mjs')
    await writeFile(fakeDockerPath, [
      "import { appendFileSync } from 'node:fs'",
      `const callsPath = ${JSON.stringify(callsPath)}`,
      'const args = process.argv.slice(2)',
      'appendFileSync(callsPath, JSON.stringify(args) + "\\n")',
      "if (args[0] === 'inspect') {",
      "  process.stdout.write('true\\n')",
      '  process.exit(0)',
      '}',
      'process.exit(0)',
      '',
    ].join('\n'))
    await chmod(fakeDockerPath, 0o700)
    process.env = {
      ...originalEnv,
      BEATYCLAW_HMS_RUNTIME_MODE: 'docker',
      BEATYCLAW_HMS_DOCKER_IMAGE: 'beautyclaw/hms:test',
      BEATYCLAW_DOCKER_BIN: process.execPath,
      BEATYCLAW_DOCKER_ARGS_PREFIX: fakeDockerPath,
      BEATYCLAW_HMS_PORT: '4581',
      BEATYCLAW_HMS_HEALTH_URL: '',
    }
  })

  afterEach(async () => {
    process.env = originalEnv
    await rm(instanceRoot, { recursive: true, force: true })
  })

  function employee(): Employee {
    return {
      id: 'emp_docker',
      name: '容器员工',
      engineType: 'hms',
      status: 'draft',
      systemRole: '',
      instanceRoot,
      runtimeUrl: '',
      containerName: 'beautyclaw-employee-emp_docker',
      port: null,
      healthStatus: 'unknown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  it('starts an employee runtime in an isolated docker container when docker mode is enabled', async () => {
    const { createEmployeeRuntimeAdapter, getRuntimeStatePath } = await import('../../packages/server/src/services/agentic/employee-runtime')
    const adapter = createEmployeeRuntimeAdapter('hms')
    const target = employee()

    await expect(adapter.deploy(target)).resolves.toMatchObject({
      mode: 'docker',
      status: 'installed',
      port: 4581,
      containerName: target.containerName,
    })
    await expect(adapter.start(target)).resolves.toMatchObject({
      mode: 'docker',
      status: 'running',
      healthStatus: 'healthy',
      port: 4581,
      containerName: target.containerName,
      logPath: join(target.instanceRoot, 'logs', 'runtime.log'),
    })
    await expect(adapter.health(target)).resolves.toMatchObject({
      mode: 'docker',
      status: 'running',
      healthStatus: 'healthy',
    })
    await expect(adapter.stop(target)).resolves.toMatchObject({
      mode: 'docker',
      status: 'stopped',
      healthStatus: 'stopped',
    })

    const calls = (await readFile(callsPath, 'utf-8')).trim().split('\n').map(line => JSON.parse(line))
    expect(calls).toContainEqual(expect.arrayContaining(['rm', '-f', target.containerName]))
    expect(calls).toContainEqual(expect.arrayContaining([
      'run',
      '-d',
      '--name',
      target.containerName,
      '-p',
      '127.0.0.1:4581:4581',
      '-v',
      `${target.instanceRoot}:/home/agent/employee`,
      '-e',
      'BEATYCLAW_EMPLOYEE_PORT=4581',
      '-e',
      'PORT=4581',
      '-e',
      'BEATYCLAW_HMS_PORT=4581',
      'beautyclaw/hms:test',
    ]))
    expect(calls).toContainEqual(expect.arrayContaining(['inspect', '-f', '{{.State.Running}}', target.containerName]))
    expect(JSON.parse(await readFile(getRuntimeStatePath(target), 'utf-8'))).toMatchObject({
      employeeId: target.id,
      mode: 'docker',
      status: 'stopped',
      port: 4581,
      containerName: target.containerName,
      logPath: join(target.instanceRoot, 'logs', 'runtime.log'),
    })
  })
})
