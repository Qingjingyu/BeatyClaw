import http from 'node:http'

const rawPort = process.env.BEATYCLAW_EMPLOYEE_PORT || process.env.PORT || process.env.BEATYCLAW_HMS_PORT || '4581'
const port = Number(rawPort)
const host = process.env.BEATYCLAW_EMPLOYEE_HOST || '0.0.0.0'
const employeeId = process.env.BEATYCLAW_EMPLOYEE_ID || 'unknown'
const engine = process.env.BEATYCLAW_EMPLOYEE_ENGINE || 'hms'
const root = process.env.BEATYCLAW_EMPLOYEE_ROOT || '/home/agent/employee'

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(JSON.stringify({ level: 'error', message: 'invalid_port', rawPort }))
  process.exit(1)
}

const startedAt = new Date().toISOString()

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    writeJson(res, 200, {
      status: 'ok',
      service: 'beautyclaw-employee-runtime',
      employeeId,
      engine,
      root,
      port,
      startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    })
    return
  }

  writeJson(res, 404, {
    status: 'not_found',
    service: 'beautyclaw-employee-runtime',
  })
})

server.listen(port, host, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'employee_runtime_started',
    employeeId,
    engine,
    root,
    host,
    port,
  }))
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
