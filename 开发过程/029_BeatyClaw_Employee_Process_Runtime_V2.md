# 029 BeatyClaw Employee Process Runtime V2

更新时间：2026-05-17 20:25 CST

## 背景

V1 已经完成目录级实例：每个员工都有独立目录、manifest 和状态文件。但苏白确认后，下一步目标是让新建员工不只是“有文件夹”，而是能成为服务器上真实可管理的运行单元。

本轮先做进程级生命周期，不直接上 Docker 多容器。原因：

- 当前代码已有 `ProcessEmployeeRuntimeAdapter` 基础。
- 进程级能先证明每个员工有独立 pid、端口、日志和健康检查。
- Docker 多容器还涉及镜像、网络、端口、安全回收，适合下一轮做。

## 本轮目标

1. 每个员工 runtime 进程有自己的日志文件。
2. runtime state 记录 `pid`、`port`、`logPath`。
3. health 检查不只打 HTTP，也确认 pid 仍然存活。
4. 进程退出后状态落为 `failed / unhealthy`。
5. 测试证明两个员工可以同时运行，且端口、pid、日志互不混用。

## 实现

核心文件：

```text
packages/server/src/services/agentic/employee-runtime.ts
packages/server/src/services/agentic/employee-runtime-installer.ts
packages/server/src/services/agentic/employees.ts
packages/client/src/api/agentic/employees.ts
```

主要变化：

- `EmployeeRuntimeState` 增加 `logPath`。
- `ProcessEmployeeRuntimeAdapter.start()`：
  - 自动创建 `logs/runtime.log`。
  - 将子进程 stdout/stderr 写入员工自己的 runtime log。
  - state 写入 pid、port、logPath。
- `ProcessEmployeeRuntimeAdapter.health()`：
  - 先检查 pid 是否还活着。
  - pid 不存在时，状态改为 `failed / unhealthy`。
  - pid 存活但 HTTP health 失败时，状态为 `running / unhealthy`。
- placeholder launcher 启动时写一条 `runtime_started` 日志，便于排查。
- `runtimeInstance` 同步暴露 `logPath`。

## 验证

测试命令：

```bash
npm run test -- tests/server/employee-runtime-process.test.ts tests/server/employee-runtime-installer.test.ts tests/server/employees-service.test.ts tests/server/employees-controller.test.ts
```

结果：

```text
4 个测试文件通过
20 个测试通过
```

新增覆盖：

- runtime 子进程退出后，health 会变成 `failed / unhealthy`。
- `runtime-state.json` 会记录 `logPath`。
- 两个员工 runtime 可同时运行在不同端口。
- 两个员工拥有不同 pid 和不同 `logs/runtime.log`。

## 当前边界

本轮完成“进程级真实运行单元”，但还不是“容器级独立系统”。

未包含：

- 每个员工独立 Docker 容器。
- 每个员工独立 hxa-connect。
- 每个员工独立 worker-bot。
- 跨进程崩溃后的自动重启守护。
- 端口冲突的全局分配器。

下一步建议：

1. 做员工 runtime 端口分配器，避免未来真实 HMS/OpenClaw 多实例端口冲突。
2. 做 Docker adapter，把 process adapter 升级为可选容器模式。
3. 在员工管理页展示 runtime pid、port、logPath、lastError。
