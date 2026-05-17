# 033 BeatyClaw Employee Runtime Image V1

## 背景

苏白确认下一步要把“新建员工”从产品端目录和进程占位，继续推进到真实可运行的 AI 引擎容器。之前 Docker mode 已经能 `docker run / inspect / rm`，但 smoke 只是启动一个空 Node 进程，不能证明员工 runtime 真有服务入口。

## 本次目标

把员工 AI 引擎容器的最小契约补齐：

- 有独立 `Dockerfile.employee-runtime`。
- 容器里有真实 `/health` 服务。
- Docker adapter 启动容器时传入员工 id、引擎类型、员工根目录和端口。
- 服务器 smoke 能访问容器 `/health`，而不是只检查容器 Running。

## 实现

新增：

- `packages/employee-runtime/health-server.mjs`
- `Dockerfile.employee-runtime`
- `tests/server/employee-runtime-health-server.test.ts`

更新：

- `packages/server/src/services/agentic/employee-runtime.ts`
- `scripts/employee-docker-smoke.sh`
- `tests/server/employee-runtime-docker.test.ts`
- `tests/scripts/runtime-stack.test.ts`
- `README.md`

员工容器启动时接收：

```text
BEATYCLAW_EMPLOYEE_ID
BEATYCLAW_EMPLOYEE_ROOT=/home/agent/employee
BEATYCLAW_EMPLOYEE_ENGINE
BEATYCLAW_EMPLOYEE_PORT
PORT
BEATYCLAW_HMS_PORT / BEATYCLAW_OPENCLAW_PORT / BEATYCLAW_COCO_PORT
```

`/health` 返回：

```json
{
  "status": "ok",
  "service": "beautyclaw-employee-runtime",
  "employeeId": "emp_xxx",
  "engine": "hms",
  "root": "/home/agent/employee",
  "port": 4581
}
```

## 当前边界

这一步不是完整 HMS / OpenClaw 智能恢复。它完成的是“真实 AI 引擎容器接入协议”的第一版。

后续只要把 `Dockerfile.employee-runtime` 替换为真实 HMS / OpenClaw 镜像，并保持 `/health` 和端口环境变量约定，BeatyClaw 产品层就可以继续复用当前安装、启动、健康检查和清理流程。

## 验证

本地验证：

```bash
npm run test -- tests/server/employee-runtime-health-server.test.ts tests/server/employee-runtime-docker.test.ts tests/scripts/runtime-stack.test.ts
npm run test -- tests/server/employee-runtime-installer.test.ts tests/server/employee-runtime-docker.test.ts tests/server/employee-runtime-process.test.ts tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/scripts/runtime-stack.test.ts
npm run build
```

服务器验证：

```bash
cd /home/ubuntu/agent-stack/agentic-build-current
./scripts/employee-docker-smoke.sh
```

预期输出包含：

```text
building image=beautyclaw-employee-runtime:smoke
container running
container cleanup ok
```
