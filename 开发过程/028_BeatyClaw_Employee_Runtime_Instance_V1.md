# 028 BeatyClaw Employee Runtime Instance V1

更新时间：2026-05-17 20:10 CST

## 背景

当前产品思路已经从“给一个数字员工换大脑”转成“可以雇佣多个数字员工”。这意味着员工必须成为一级主体：

```text
BeatyClaw 产品层
→ 员工 A
  → 员工 A 的文件夹 / 配置 / runtime 状态
→ 员工 B
  → 员工 B 的文件夹 / 配置 / runtime 状态
```

之前新建员工已经会自动部署和启动，但接口里缺少一个清晰的 `runtimeInstance` 结构，老员工也只是保证目录存在，不一定有产品层实例 manifest。这样开发同事接手时，很难判断“这个员工背后到底是哪套目录和哪套 AI 引擎实例”。

## 本轮目标

本轮先完成目录级真实实例闭环：

1. 每个员工都有独立实例目录。
2. 每个员工都有产品层实例 manifest。
3. 员工接口返回 runtime instance 信息。
4. 默认员工和老员工在读取列表时自动补齐 manifest。
5. 不做真实多 Docker 容器部署，避免一次改动过大。

## 实现

员工实例目录：

```text
{YOYOO_AUTH_HOME}/employees/{employee_id}/
  config/
    runtime-instance.json
    runtime-install.json
    runtime-state.json
  data/
  logs/
  workspace/
```

新增类型：

```text
EmployeeRuntimeInstance
```

返回字段包括：

- `employeeId`
- `engineType`
- `instanceRoot`
- `configDir`
- `dataDir`
- `logsDir`
- `workspaceDir`
- `manifestPath`
- `installManifestPath`
- `statePath`
- `containerName`
- `runtimeUrl`
- `port`
- `status`
- `healthStatus`
- `mode`
- `pid`
- `lastError`
- `installMode`
- `installedAt`
- `updatedAt`

关键实现：

- `packages/server/src/services/agentic/employees.ts`
  - `listEmployees()` 会为所有员工补齐实例目录和 `runtime-instance.json`。
  - 返回 employee 时附带 `runtimeInstance`。
  - 写入员工 store 时不保存派生字段，避免 store 被运行时细节污染。

- `packages/client/src/api/agentic/employees.ts`
  - 补齐前端 Employee 类型里的 `runtimeInstance`。

## 验证

测试命令：

```bash
npm run test -- tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/server/employee-runtime-installer.test.ts tests/server/employee-runtime-process.test.ts tests/client/employees-store.test.ts
```

结果：

```text
5 个测试文件通过
23 个测试通过
```

覆盖内容：

- 默认员工会生成实例目录和 `runtime-instance.json`。
- 新建并自动上岗员工会生成 `runtime-install.json`、`runtime-state.json`、`runtime-instance.json`。
- 员工返回体包含 runtime instance。
- 旧的部署、启动、停止、健康检查流程不受影响。

## 当前边界

本轮是 V1，不包含：

- 每个员工独立 Docker 容器。
- 每个员工独立 hxa-connect sidecar。
- HMS / OpenClaw 真实安装器完善。
- 员工之间文件/记忆迁移。
- 员工级计费和资源配额。

下一步建议是做“员工实例进程/容器生命周期 V2”：把目录级实例和真实进程/容器启动严格绑定起来，做到用户新建员工时服务器上真的出现对应的可管理运行单元。
