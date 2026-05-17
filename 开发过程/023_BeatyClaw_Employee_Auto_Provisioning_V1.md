# 023 BeatyClaw 员工自动上岗 V1

## 背景

苏白提出：现在新建数字员工后，还需要手动点部署和启动，这不像正式产品。第一版应该做到“创建员工即自动部署上岗”，用户新增员工后，系统自动准备实例目录、安装 Runtime、启动并做健康检查。

产品判断：员工是 BeatyClaw 的主体。用户点“新增数字员工”时，不应该只得到一张草稿卡片，而应该得到一个已经尝试运行的独立员工实例。

## 本轮目标

- 创建员工后自动部署。
- 部署后自动启动。
- 启动后自动健康检查。
- 成功进入 `running / healthy`。
- 失败进入 `failed / unhealthy`，不影响其他员工，不删除员工目录。
- 保留手动部署、启动、停止、刷新健康，方便排障。

## 实现内容

### 后端

- `packages/server/src/services/agentic/employees.ts`
  - 新增 `createProvisionedEmployee()`。
  - 流程为：
    1. `createEmployee()` 创建员工记录和独立实例目录。
    2. `deployEmployee()` 写入 Runtime install/runtime state。
    3. `startEmployee()` 启动 Runtime。
    4. `checkEmployeeHealth()` 轮询健康状态。
    5. 成功返回最终员工；失败标记为 `failed / unhealthy`。
  - 失败时只更新当前新员工状态，不删除目录，也不影响其他员工。

- `packages/server/src/controllers/agentic/employees.ts`
  - `POST /api/employees` 从单纯创建改为调用 `createProvisionedEmployee()`。
  - 前端原有创建接口不需要换 URL。

- `packages/server/src/services/agentic/employee-runtime-installer.ts`
  - 通用引擎 `openclaw / coco / zylos` 补齐 placeholder launcher。
  - 这样非 HMS 引擎在没有真实外部 Runtime 时，也能走完整部署、启动、健康检查闭环。
  - HMS 仍沿用既有 placeholder / hermes-gateway 安装逻辑。

### 前端

- `packages/client/src/stores/agentic/employees.ts`
  - 创建员工时先插入一个本地 pending 员工卡片。
  - pending 卡片状态为 `deploying / provisioning`。
  - 后端返回真实员工后，删除 pending 卡片并插入真实员工。
  - 如果请求失败，pending 卡片变成 `failed / unhealthy`。

- `packages/client/src/views/agentic/EmployeesView.vue`
  - 创建按钮文案从“创建”改为“创建并启动”。
  - 创建中显示“创建并启动中”。
  - 成功提示“数字员工已创建并启动”。
  - 自动启动失败时，保留员工卡片并提示查看卡片状态。
  - 原“模拟部署”按钮改为“部署”，作为排障手动动作保留。

## 验证

相关测试：

```bash
npm run test -- tests/server/employees-service.test.ts tests/server/employees-controller.test.ts tests/client/employees-store.test.ts
```

结果：3 个测试文件通过，13 个测试通过。

其中覆盖：

- service 创建员工后自动部署、启动、健康检查。
- controller 创建接口返回已运行员工。
- 自动启动失败时，只标记新员工失败，不影响已有员工，不删除目录。
- 前端 store 创建时先显示部署中卡片，成功后替换为真实运行员工。

## 当前边界

- 本轮没有做真实多引擎安装市场，只补齐了可闭环的 Runtime 安装/启动占位流程。
- 如果某个引擎配置了真实启动命令，会优先使用真实命令。
- 如果真实 Runtime 起不来，员工会进入 `failed / unhealthy`，目录会保留用于排查。
- 本轮不做公网域名、端口开放、Nginx 或防火墙调整。

