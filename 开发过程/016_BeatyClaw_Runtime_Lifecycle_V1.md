# 016 BeatyClaw Runtime Lifecycle V1

Date: 2026-05-17

## 背景

在确认“每个数字员工都是独立 Runtime Instance”之后，下一步不是马上接真实 HMS / OpenClaw / COCO 容器，而是先把 Control Plane 到 Runtime Instance 的生命周期接口跑通。

本阶段目标是让 deploy/start/stop/health 不再只是修改员工列表 JSON，而是落到员工自己的实例目录里。

## 本阶段实现

新增 Runtime 适配层：

- `packages/server/src/services/agentic/employee-runtime.ts`

核心接口：

```ts
interface EmployeeRuntimeAdapter {
  deploy(employee): Promise<EmployeeRuntimeState>
  start(employee): Promise<EmployeeRuntimeState>
  stop(employee): Promise<EmployeeRuntimeState>
  health(employee): Promise<EmployeeRuntimeState>
}
```

当前实现：

- `LocalEmployeeRuntimeAdapter`
- 不启动真实容器。
- 不安装真实 AI 引擎。
- 通过员工实例目录里的 `config/runtime-state.json` 保存生命周期状态。

状态文件位置：

```text
employees/{employeeId}/config/runtime-state.json
```

## API 变化

新增接口：

```text
POST /api/employees/:id/health
```

用途：

- 读取员工实例状态。
- 更新员工 `healthStatus`。
- 返回员工元数据和 Runtime 状态。

## 前端变化

数字员工卡片新增“刷新健康”动作。

这一步的作用不是为了最终 UI，而是为了让产品端能主动触发 Control Plane 到 Runtime Instance 的健康检查链路。

## 当前边界

本阶段仍然是 Runtime Lifecycle V1：

- deploy/start/stop/health 已经有 adapter 边界。
- 状态已经写入员工实例目录。
- 但没有真实容器。
- 没有真实进程 PID。
- 没有真实端口探活。
- HMS / OpenClaw / COCO 还没有真实安装器。

## 下一步

把 `LocalEmployeeRuntimeAdapter` 替换为真实适配器：

1. `HmsEmployeeRuntimeAdapter`
2. `OpenClawEmployeeRuntimeAdapter`
3. `CocoEmployeeRuntimeAdapter`

真实适配器需要实现：

- 安装代码或镜像到员工实例目录。
- 写入引擎配置。
- 分配端口。
- 启动独立进程或容器。
- 健康检查真实 HTTP endpoint。
- 停止进程或容器。
