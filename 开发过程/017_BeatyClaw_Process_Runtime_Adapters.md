# 017 BeatyClaw Process Runtime Adapters

Date: 2026-05-17

## 背景

上一阶段已经让员工实例生命周期写入 `config/runtime-state.json`。本阶段把适配器从纯 local/mock 扩展到 process runtime，让 HMS / OpenClaw / COCO 可以通过命令配置方式被 BeatyClaw 启动、停止和探活。

这一步仍然不是“完整安装 HMS/OpenClaw”，而是把真实进程适配边界打通。

## 实现

更新文件：

- `packages/server/src/services/agentic/employee-runtime.ts`

新增能力：

- `ProcessEmployeeRuntimeAdapter`
- HMS / OpenClaw / COCO 优先走 process adapter。
- 未配置时自动回退 `LocalEmployeeRuntimeAdapter`。
- start 时使用员工实例目录作为进程 `cwd`。
- 注入环境变量：
  - `BEATYCLAW_EMPLOYEE_ID`
  - `BEATYCLAW_EMPLOYEE_ROOT`
  - `BEATYCLAW_EMPLOYEE_ENGINE`
- stop 使用 `SIGTERM`，不使用 `kill -9`。
- health 可以请求配置的 HTTP health URL。

## 环境变量

每个引擎按统一规则配置：

```text
BEATYCLAW_HMS_ENABLED=1
BEATYCLAW_HMS_START_COMMAND=node
BEATYCLAW_HMS_START_ARGS=server.js
BEATYCLAW_HMS_HEALTH_URL=http://127.0.0.1:4601/health
BEATYCLAW_HMS_PORT=4601

BEATYCLAW_OPENCLAW_ENABLED=1
BEATYCLAW_OPENCLAW_START_COMMAND=node
BEATYCLAW_OPENCLAW_START_ARGS=server.js
BEATYCLAW_OPENCLAW_HEALTH_URL=http://127.0.0.1:4701/health
BEATYCLAW_OPENCLAW_PORT=4701

BEATYCLAW_COCO_ENABLED=1
BEATYCLAW_COCO_START_COMMAND=node
BEATYCLAW_COCO_START_ARGS=server.js
BEATYCLAW_COCO_HEALTH_URL=http://127.0.0.1:4801/health
BEATYCLAW_COCO_PORT=4801
```

## 当前边界

- 目前没有自动下载代码。
- 目前没有自动分配端口。
- 目前没有容器隔离。
- 目前没有进程重启守护。
- 目前 `START_ARGS` 是简单空格切分，不支持复杂 shell 语法。

如果需要复杂启动命令，建议写成员工实例目录里的脚本，再让 `START_COMMAND` 指向该脚本。

## 下一步

真实 HMS / OpenClaw 接入应该分两步：

1. 安装器：
   - 把目标引擎代码或镜像准备到员工实例目录。
   - 生成配置文件。
   - 分配端口。

2. 运行器：
   - 使用本阶段 process adapter 或容器 adapter 启动。
   - health check 请求真实 `/health`。
   - 把真实 runtimeUrl / pid / lastError 写入 `runtime-state.json`。
