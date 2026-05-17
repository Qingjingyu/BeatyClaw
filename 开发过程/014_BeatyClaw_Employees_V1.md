# 014 BeatyClaw Employees V1

Date: 2026-05-17

## 背景

产品方向从“一个数字员工切换 AI 引擎”升级为“多个数字员工，每个员工拥有自己的 AI 引擎和工作区”。本阶段先做最小可运行骨架，不做真实引擎安装，也不做历史数据全量迁移。

## 本阶段目标

- 后端提供员工模型和接口。
- 系统自动创建默认员工 `BeatyClaw 数字员工`。
- 前端提供数字员工列表页。
- 侧边栏显示当前员工，并提供数字员工入口。
- 支持创建员工、选择当前员工、mock 部署、启动、停止。

## 实现

新增后端：

- `packages/server/src/services/agentic/employees.ts`
- `packages/server/src/controllers/agentic/employees.ts`
- `packages/server/src/routes/agentic/employees.ts`

新增前端：

- `packages/client/src/api/agentic/employees.ts`
- `packages/client/src/stores/agentic/employees.ts`
- `packages/client/src/views/agentic/EmployeesView.vue`

更新：

- `packages/server/src/routes/index.ts`
- `packages/client/src/router/index.ts`
- `packages/client/src/components/layout/AppSidebar.vue`

新增测试：

- `tests/server/employees-service.test.ts`
- `tests/server/employees-controller.test.ts`
- `tests/client/employees-api.test.ts`
- `tests/client/employees-store.test.ts`

## 决策

- 第一版员工数据存到 `YOYOO_AUTH_HOME/beautyclaw-employees.json`。
- 默认员工 ID 固定为 `default`，便于后续把旧数据挂到默认员工。
- 员工引擎类型先支持 `openclaw`、`hms`、`coco`、`zylos`。
- 部署动作第一版是 mock：`draft -> installed`。
- 本阶段后来确认：不能把数字员工理解成共享系统里的 `employee_id` 隔离。正确方向是每个员工都是独立 Runtime Instance，`employee_id` 只用于 Control Plane 查找和路由。

## 验证

```bash
npm run test -- tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/client/employees-api.test.ts tests/client/employees-store.test.ts
npm run build
```

结果：

- 员工相关 8 个测试通过。
- 前端构建、server TypeScript 检查、worker-bot 构建通过。

## 剩余风险

- 当前员工选择器已经存在，但对话、历史、任务、看板、频道、记忆、技能、用量还没有真正按员工隔离。
- 真实 HMS / OpenClaw / COCO 安装器未实现。
- 员工数据仍是本地 JSON，后续 SaaS 化需要迁移到 PostgreSQL。
