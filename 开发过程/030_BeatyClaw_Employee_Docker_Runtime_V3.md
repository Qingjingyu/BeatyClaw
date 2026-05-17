# 030 BeatyClaw Employee Docker Runtime V3

更新时间：2026-05-17 20:40 CST

## 背景

V2 已经让每个员工可以成为“进程级运行单元”：独立目录、端口、pid、日志、健康检查。但苏白的目标是每个数字员工最终像一套独立系统一样运行，只是统一展示在 BeatyClaw 产品层里。

因此 V3 先接入 Docker runtime adapter。注意：本轮不是直接把线上默认切到 Docker，而是把 Docker 能力作为可配置模式接入，避免破坏现有 process runtime。

## 本轮目标

1. 增加 Docker runtime mode。
2. Docker 模式使用员工自己的 containerName。
3. Docker 模式挂载员工实例目录。
4. Docker 模式写入 runtime state。
5. Docker 模式可启动、健康检查、停止。
6. 默认仍走 process mode。

## 配置

以 HMS 为例：

```env
BEATYCLAW_HMS_RUNTIME_MODE=docker
BEATYCLAW_HMS_DOCKER_IMAGE=your-hms-image
BEATYCLAW_HMS_PORT=4581
```

可选：

```env
BEATYCLAW_HMS_HEALTH_URL=
BEATYCLAW_DOCKER_BIN=docker
```

`BEATYCLAW_HMS_HEALTH_URL` 为空时，只按 Docker container running 状态判断 healthy；不为空时，同时检查 HTTP health。

## 实现

核心文件：

```text
packages/server/src/services/agentic/employee-runtime.ts
packages/server/src/services/agentic/employees.ts
packages/client/src/api/agentic/employees.ts
```

新增：

- `DockerEmployeeRuntimeAdapter`
- `EmployeeRuntimeState.mode = docker`
- `EmployeeRuntimeInstance.mode = docker`

Docker 启动命令结构：

```text
docker run -d
  --name {employee.containerName}
  --restart unless-stopped
  -p 127.0.0.1:{port}:{port}
  -v {employee.instanceRoot}:/home/agent/employee
  -e BEATYCLAW_EMPLOYEE_ID=...
  -e BEATYCLAW_EMPLOYEE_ROOT=/home/agent/employee
  -e BEATYCLAW_EMPLOYEE_ENGINE=...
  {image}
```

停止：

```text
docker rm -f {employee.containerName}
```

健康检查：

```text
docker inspect -f '{{.State.Running}}' {employee.containerName}
```

## 验证

新增测试：

```bash
npm run test -- tests/server/employee-runtime-docker.test.ts tests/server/employee-runtime-process.test.ts tests/server/employee-runtime-installer.test.ts tests/server/employees-service.test.ts tests/server/employees-controller.test.ts
```

结果：

```text
5 个测试文件通过
21 个测试通过
```

覆盖：

- docker mode deploy/start/health/stop。
- docker run 参数包含 containerName、端口、员工目录挂载、镜像。
- runtime-state.json 写入 `mode: docker`。
- process mode 回归不受影响。

## 当前边界

本轮只是接入 Docker adapter，不自动切线上默认。

未包含：

- 真正 HMS/OpenClaw 生产镜像构建。
- 每个员工独立 hxa-connect / worker-bot。
- Docker 网络隔离策略。
- 端口池自动分配。
- 容器日志采集。

下一步建议：做“端口池 + 线上 Docker mode 验收”，先拿一个员工用真实镜像跑通，再推广到多员工。
