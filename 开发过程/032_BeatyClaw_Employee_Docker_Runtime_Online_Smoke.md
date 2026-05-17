# 032 BeatyClaw Employee Docker Runtime Online Smoke

更新时间：2026-05-17 21:15 CST

## 背景

上一轮已经完成 Docker runtime adapter 和端口池，但还缺三件运维必需能力：

1. 端口池要避开真实被占用的本机端口。
2. 并发创建员工时要有轻量锁，减少抢同一端口的风险。
3. 服务器上要有一个明确的 Docker mode smoke 脚本，能验证 docker run / inspect / rm。

## 本轮目标

- 端口池支持 TCP 探测。
- 端口池支持 `.runtime-port-locks/{port}.lock`。
- 增加 `scripts/employee-docker-smoke.sh`。
- 本地测试覆盖端口探测、锁文件、Docker smoke 脚本结构。

## 实现

核心文件：

```text
packages/server/src/services/agentic/employee-runtime-installer.ts
scripts/employee-docker-smoke.sh
tests/server/employee-runtime-installer.test.ts
tests/scripts/runtime-stack.test.ts
```

端口分配逻辑：

```text
固定 BEATYCLAW_HMS_PORT
→ 扫描 runtime-install.json 已用端口
→ 扫描 .runtime-port-locks 已锁端口
→ TCP 探测 127.0.0.1:{port}
→ 创建 {port}.lock
→ 返回端口
```

Docker smoke 脚本：

```bash
./scripts/employee-docker-smoke.sh
```

默认行为：

- 从 `agentic` 容器读取当前镜像。
- 使用 `beautyclaw-employee-smoke` 临时容器名。
- 挂载 `/home/ubuntu/agent-stack/employee-docker-smoke` 到 `/home/agent/employee`。
- 绑定 `127.0.0.1:4899:4899`。
- `docker inspect` 确认 running。
- 最后 `docker rm -f` 清理容器。

## 验证

测试命令：

```bash
npm run test -- tests/server/employee-runtime-installer.test.ts tests/server/employee-runtime-docker.test.ts tests/server/employee-runtime-process.test.ts tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/scripts/runtime-stack.test.ts
```

结果：

```text
6 个测试文件通过
28 个测试通过
```

新增覆盖：

- 已被本机进程监听的端口会被跳过。
- `.runtime-port-locks/{port}.lock` 会被识别为已占用。
- 新分配的端口会写 lock 文件。
- Docker smoke 脚本包含 run / inspect / cleanup。

## 当前边界

锁文件是轻量锁，不是分布式锁。单机部署够用；未来多机器部署需要数据库锁或集中调度器。

Docker smoke 脚本验证容器生命周期，不代表已经有 HMS/OpenClaw 生产镜像。真实 AI 引擎镜像仍需单独构建或接入。
