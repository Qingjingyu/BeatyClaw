# 022 BeatyClaw 员工隐藏与软删除 V1

## 背景

苏白提出：数字员工列表需要可折叠、可管理，不想用的员工可以隐藏或删除。

产品判断：第一版不能做物理删除，因为每个员工后续会绑定对话、记忆、文件、渠道和独立 runtime 目录。直接删目录风险太高，容易把历史资料和排查证据一起删掉。

## 本轮方案

员工增加两个轻量生命周期字段：

- `visibility`: `visible | hidden`
- `deletedAt`: `string | null`

含义：

- `visible`：显示在侧边栏，可快速切换。
- `hidden`：不显示在侧边栏，但员工管理页还能看到和恢复。
- `deletedAt != null`：软删除。员工从侧边栏消失，状态置为停止，但实例目录、历史数据和文件不物理删除。

## 实现内容

### 后端

- `packages/server/src/services/agentic/employees.ts`
  - 老数据自动补齐 `visibility: visible` 和 `deletedAt: null`。
  - 新增 `hideEmployee()`、`showEmployee()`、`softDeleteEmployee()`、`restoreEmployee()`。
  - 软删除会把员工设为 `hidden`、`status=stopped`、`healthStatus=stopped`。
  - 如果当前员工被软删除，会自动切换到第一个未删除员工。
  - 禁止选择已删除员工。

- `packages/server/src/controllers/agentic/employees.ts`
  - 新增隐藏、显示、软删除、恢复 controller。

- `packages/server/src/routes/agentic/employees.ts`
  - `POST /api/employees/:id/hide`
  - `POST /api/employees/:id/show`
  - `DELETE /api/employees/:id`
  - `POST /api/employees/:id/restore`

### 前端

- `packages/client/src/api/agentic/employees.ts`
  - 补齐员工生命周期字段和 API。

- `packages/client/src/stores/agentic/employees.ts`
  - 新增：
    - `activeEmployees`
    - `sidebarEmployees`
    - `hiddenEmployees`
    - `deletedEmployees`
  - 新增隐藏、显示、删除、恢复 action。

- `packages/client/src/components/layout/AppSidebar.vue`
  - 数字员工区支持折叠/展开。
  - 侧边栏只显示 `visible && !deletedAt` 的员工。
  - 员工 hover 后提供“隐藏 / 删除”快速操作。

- `packages/client/src/views/agentic/EmployeesView.vue`
  - 员工管理页新增筛选：全部、显示中、已隐藏、已删除。
  - 员工卡片显示“已隐藏 / 已删除”标签。
  - 支持隐藏、显示、软删除、恢复。

## 验证

```bash
npm run test -- tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/client/employees-store.test.ts tests/client/sidebar-employees.test.ts tests/client/engine-display.test.ts
```

结果：5 个测试文件通过，17 个测试通过。

```bash
npm run build
```

结果：通过。仍有原本的大 chunk 警告，不是本轮新增问题。

## 当前边界

- 本轮不做物理删除，不删除员工实例目录。
- 不做批量隐藏/删除。
- 不做回收站过期清理。
- 后续如果要“彻底删除”，必须先做实例目录、对话、记忆、渠道绑定和审计记录的删除策略。
