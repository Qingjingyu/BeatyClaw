# 015 BeatyClaw Employee Runtime Instances

Date: 2026-05-17

## 背景

苏白明确修正产品理解：BeatyClaw 不是“一个共享系统里靠 employee_id 隔离多个员工”，而是“每个数字员工本身就是一套独立系统，只是放在同一个产品前台展示和管理”。

正确心智：

```text
BeatyClaw Control Plane
→ 数字员工 1 Runtime Instance
→ 数字员工 2 Runtime Instance
→ 数字员工 3 Runtime Instance
```

服务器目标形态：

```text
system/
  control-plane/
  employees/
    {employeeId}/
      config/
      data/
      logs/
      workspace/
```

## 本阶段目标

- 在 `Product-Spec.md` 中明确 Control Plane / Employee Runtime Instance 架构。
- 扩展员工模型，记录实例目录、Runtime URL、容器名、端口和健康状态。
- 创建员工时预留独立目录。
- mock deploy 时确保目录存在，并把健康状态改成可理解的状态。
- 前端数字员工卡片展示实例状态。

## 实现

后端：

- `packages/server/src/services/agentic/employees.ts`
  - 新增 `EmployeeHealthStatus`。
  - 新增 `instanceRoot`、`runtimeUrl`、`containerName`、`port`、`healthStatus`。
  - 新增 `getEmployeeInstancePaths()`。
  - `listEmployees()`、`createEmployee()`、`updateEmployee()` 都会确保实例目录存在。
  - `deploy/start/stop` 同步更新健康状态。

前端：

- `packages/client/src/api/agentic/employees.ts`
  - 同步员工实例字段类型。
- `packages/client/src/views/agentic/EmployeesView.vue`
  - 员工卡片展示实例目录、容器名、端口、Runtime、健康状态。

测试：

- `tests/server/employees-service.test.ts`
  - 验证默认员工和新增员工都会创建 `config/data/logs/workspace`。
  - 验证 deploy/start/stop 的健康状态变化。
- `tests/server/employees-controller.test.ts`
  - 验证 API 返回实例字段。
- `tests/client/employees-store.test.ts`
  - 验证前端 store 能承接实例字段。

## 当前边界

V1 只做实例目录和状态骨架：

- 不启动多个容器。
- 不安装真实 HMS / OpenClaw / COCO。
- 不复制完整 AI 引擎代码到员工目录。
- 不迁移旧聊天、任务、频道数据。

这一步的价值是先把架构地基摆正：后续安装 HMS / OpenClaw / COCO 时，可以把它们挂到某个员工实例下面，而不是继续污染全局产品后端。

## 后续建议

下一阶段做真实实例生命周期：

1. 定义 `EmployeeRuntimeAdapter` 接口。
2. 为 HMS / OpenClaw / COCO 分别实现安装器。
3. deploy 时在员工目录写入配置。
4. start 时启动独立进程或容器。
5. health check 从 mock 状态升级为真实探活。
