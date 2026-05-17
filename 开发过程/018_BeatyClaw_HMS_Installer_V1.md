# 018 BeatyClaw HMS Installer V1

Date: 2026-05-17

## 背景

BeatyClaw 已经具备数字员工实例目录、Runtime 生命周期和 process runtime adapter。本阶段继续推进 HMS 安装器 V1。

这里的“安装器 V1”不是完整安装原版 HMS，而是先把安装链路打通：

```text
员工 deploy
→ installer 准备员工实例目录
→ 写 runtime-install.json
→ 生成启动脚本
→ process adapter 根据安装清单启动
→ health check 探活
```

## 实现

新增：

- `packages/server/src/services/agentic/employee-runtime-installer.ts`
- `tests/server/employee-runtime-installer.test.ts`

安装清单：

```text
employees/{employeeId}/config/runtime-install.json
```

HMS V1 会写入：

- `employeeId`
- `engineType`
- `runtimeUrl`
- `port`
- `startCommand`
- `startArgs`
- `healthUrl`
- `installedAt`

如果没有显式配置 HMS 启动命令，安装器会在员工目录生成占位启动脚本：

```text
employees/{employeeId}/bin/start-hms-placeholder.mjs
```

这个脚本只提供 `/health`，用于证明 Control Plane 到 Runtime Instance 的安装、启动、探活链路是通的。

## 环境变量

可选配置：

```text
BEATYCLAW_HMS_PORT=4611
BEATYCLAW_HMS_HEALTH_URL=http://127.0.0.1:4611/health
BEATYCLAW_HMS_START_COMMAND=node
BEATYCLAW_HMS_START_ARGS=server.js
```

如果 `START_ARGS` 为空，使用占位 HMS health 脚本。

## 当前边界

- 还没有下载或复制真实 HMS 代码。
- 还没有生成真实 HMS 配置。
- 还没有隔离多员工端口冲突。
- 还没有接入聊天消息 Runtime SDK。
- 还没有持久进程守护，服务重启后进程 registry 会丢失。

## 下一步

HMS Installer V2 应该做：

1. 从本地 reference-code 或 Git 仓库准备真实 HMS 代码。
2. 给每个员工实例生成 HMS 配置。
3. 分配不冲突端口。
4. start 后由真实 HMS `/health` 探活。
5. 把对话 Runtime SDK 从部署级 provider 逐步改为当前员工实例 provider。
