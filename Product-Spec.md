# BeatyClaw Product Spec

## Goal

BeatyClaw 要从“一个数字员工工作台”升级为“多数字员工实例管理系统”。

产品的主体不再是全局对话框或全局 AI 引擎，而是一个个独立的数字员工实例。每个数字员工都有自己的名字、头像、系统角色、文件夹、代码目录、配置、数据、日志、工作区和底层 AI 引擎。

核心目标：

```text
BeatyClaw Control Plane
→ 管理多个 Employee Runtime Instance
→ 每个员工实例选择自己的 AI 引擎
→ 每个员工实例拥有独立目录、配置、数据、日志和工作区
```

第一期不再把重点放在“给同一个员工换大脑”，而是放在“雇佣一个新员工，并为这个员工创建一套独立运行实例”。

## Architecture Principle

BeatyClaw 必须分成两层：

```text
BeatyClaw Control Plane
→ 负责登录、员工列表、创建、选择、状态展示、实例目录登记

Employee Runtime Instance
→ 每个员工独立一套目录 / 配置 / 数据 / 日志 / 工作区 / AI 引擎
```

这不是一个共享后端里只加 `employee_id` 的隔离模型。`employee_id` 只用于 Control Plane 查找和路由；真正的员工数据边界应该落在实例目录和后续独立进程 / 容器上。

服务器上的目标形态应该接近：

```text
system/
  control-plane/
    beatyclaw/
  employees/
    emp_sales/
      config/
      data/
      logs/
      workspace/
    emp_support/
      config/
      data/
      logs/
      workspace/
```

V1 先不真正启动多个容器，但创建员工时必须预留独立实例目录。后续 deploy/start/stop 再把这些目录挂载给对应 AI 引擎容器或进程。

## Target Users

第一阶段仍然服务苏白自己，后续再扩展为对外 SaaS 用户。

目标用户需要：

- 创建多个不同职责的数字员工。
- 给每个数字员工选择不同 AI 引擎，例如 OpenClaw、HMS、COCO 或 Zylos。
- 让每个员工拥有独立实例目录、资料和工作区。
- 在同一个产品里管理所有员工，而不是管理一堆技术模块。

典型用户心智：

```text
我不是在切换 Runtime。
我是在雇佣销售员工、客服员工、运营员工、助理员工。
```

## Problem

之前的设计是：

```text
一个数字员工
→ 切换 AI 引擎
```

这个思路会带来几个问题：

- 用户会担心切换引擎后历史、文件、系统角色、记忆是否丢失。
- 不同引擎能力不同，强行迁移会有兼容风险。
- 产品解释成本高：同一个员工换了引擎后，到底还是不是原来的员工。
- 多个业务角色无法同时存在，例如销售、客服、运营不能自然分开。

新的产品设计应该是：

```text
一个 BeatyClaw 工作台
→ 多个数字员工
→ 每个员工是一套独立 Employee Runtime Instance
→ 每个员工有自己的 AI 引擎、实例目录和工作资料
```

这样用户更容易理解，也更适合 SaaS 化。

## MVP Scope

### 1. 数字员工管理

新增全局“数字员工”能力，用来查看、创建和管理员工。

MVP 必须支持：

- 查看员工列表。
- 默认员工：`BeatyClaw 数字员工`。
- 新增员工。
- 编辑员工基础信息。
- 选择员工底层 AI 引擎。
- 查看员工部署状态。
- 查看员工实例目录、容器名、端口和健康状态。
- 切换当前员工。

员工基础字段：

- `id`
- `name`
- `avatar`
- `engine_type`
- `status`
- `system_role`
- `instance_root`
- `runtime_url`
- `container_name`
- `port`
- `health_status`
- `created_at`
- `updated_at`

员工状态：

```text
draft        草稿
deploying    部署中
installed    已安装
running      运行中
stopped      已停止
failed       失败
```

员工健康状态：

```text
unknown       未检查
provisioning  预留目录中
healthy       健康
stopped       已停止
unhealthy     异常
```

### 2. 默认员工

系统必须创建一个默认员工：

```text
name: BeatyClaw 数字员工
engine_type: openclaw
status: draft 或 installed，取决于部署阶段
```

默认员工用于承接现有对话、历史、任务、看板、频道、技能、记忆和用量页面。

第一版迁移可以先不搬历史数据，但默认员工也必须拥有独立实例目录，避免继续强化共享后端模型。

### 3. 员工选择器

侧边栏顶部新增当前员工选择器。

结构建议：

```text
BeatyClaw 数字员工 ▼
```

切换员工后，下面所有工作区页面都切到这个员工的数据。

### 4. 员工自己的工作台

这些页面从全局页面下沉为“当前员工”的页面：

```text
工作台
- 对话
- 历史
- 任务
- 看板

能力
- 频道
- AI 引擎
- 技能
- 记忆
- 用量
```

也就是说，用户在“销售员工”里看到的是销售员工实例里的对话、历史、任务、看板、记忆和用量；切到“客服员工”后，看到客服员工实例自己的数据。

### 5. AI 引擎作为员工配置

AI 引擎不再是全局配置，而是员工的一个属性。

MVP 支持的引擎选项：

- OpenClaw
- HMS
- COCO
- Zylos，作为历史兼容和可选引擎

第一版只做 mock 部署状态和实例目录预留，不真安装外部项目、不真启动多个容器。

流程：

```text
新增员工
→ 选择引擎
→ 保存员工并创建实例目录
→ 状态进入 deploying
→ mock 完成后进入 installed
→ 当前员工可以进入自己的工作台
```

### 6. 员工实例目录

创建员工时，Control Plane 必须给该员工预留独立目录：

```text
employees/{employeeId}/config
employees/{employeeId}/data
employees/{employeeId}/logs
employees/{employeeId}/workspace
```

目录职责：

- `config`：系统角色、引擎配置、频道配置、技能配置。
- `data`：对话历史、任务、看板、记忆、用量、索引数据库。
- `logs`：运行日志、部署日志、错误日志。
- `workspace`：用户工作文件、员工产出文件、临时任务文件。

V1 可以先只创建目录和写入员工元数据。真正的 AI 引擎代码、容器镜像、数据库实例可以后续接入。

### 7. Runtime SDK 边界

BeatyClaw Control Plane 只负责把请求路由到当前员工实例，不把所有智能行为写死在产品后端。

目标调用链：

```text
用户 / 渠道消息
→ BeatyClaw Control Plane
→ 找到当前 Employee Runtime Instance
→ Runtime SDK / Adapter
→ 对应 AI 引擎实例执行
→ 结果回到 Control Plane 展示
```

### 8. Context Pack 边界

如果后续需要复制员工或迁移员工，可以由实例目录生成 Context Pack。Context Pack 不是 V1 主存储模型，而是迁移和备份格式。

Context Pack 第一版字段：

- `employee_id`
- `system_role`
- `conversation_summary`
- `recent_messages`
- `files_manifest`
- `memory_items`
- `task_state`
- `enabled_skills`
- `channel_identity`

MVP 不要求完全实现复杂迁移，但接口和数据结构要预留这个边界。

## V2 / Later

后续再做：

- 真实安装 HMS / OpenClaw / COCO。
- 员工市场 / 员工模板。
- 员工复制。
- 员工切换引擎的迁移报告。
- 员工之间协作。
- 多用户 / 多租户。
- 团队空间。
- 权限管理。
- 支付套餐。
- 运营后台。
- PostgreSQL 生产迁移。
- 引擎能力兼容矩阵。
- 真实文件索引和向量检索。

## User Stories

- 作为苏白，我想看到所有数字员工，这样我知道当前系统里有哪些员工。
- 作为苏白，我想新增一个数字员工，这样我可以让不同员工负责不同工作。
- 作为苏白，我想给新员工选择 OpenClaw / HMS / COCO 作为引擎，这样我可以试不同底层能力。
- 作为苏白，我想切换当前员工，这样我可以进入这个员工自己的对话、任务、记忆和技能。
- 作为苏白，我想每个员工有独立系统角色，这样销售员工和客服员工不会混在一起。
- 作为苏白，我想每个员工有自己的文件和记忆，这样切换员工不会污染上下文。
- 作为苏白，我想看到员工部署状态，这样我知道这个员工是否能工作。

## Core Flows

### Flow 1: 查看员工列表

1. 打开 BeatyClaw。
2. 进入“数字员工”页面。
3. 查看当前已有员工。
4. 默认能看到 `BeatyClaw 数字员工`。

### Flow 2: 新增员工

1. 点击“新增数字员工”。
2. 输入员工名称。
3. 选择头像。
4. 选择 AI 引擎，例如 HMS。
5. 填写系统角色。
6. 保存。
7. 页面显示员工状态为 `部署中`。
8. mock 部署完成后显示 `已安装`。

### Flow 3: 进入员工工作台

1. 在员工列表选择某个员工。
2. 进入该员工工作区。
3. 侧边栏顶部显示当前员工。
4. 对话、历史、任务、看板、频道、AI 引擎、技能、记忆、用量都显示该员工的数据。

### Flow 4: 员工调用 AI 引擎

1. 用户在某员工的对话页发送消息。
2. BeatyClaw 根据 `employee_id` 找到员工实例元数据。
3. BeatyClaw 根据 `instanceRoot` / `runtimeUrl` 路由到该员工实例。
4. Runtime SDK 根据员工 `engine_type` 选择 adapter。
5. adapter 调用该员工自己的引擎实例。
6. 结果回写到该员工实例的数据目录，并在 Control Plane 展示。

### Flow 5: 无引擎或未部署

1. 用户进入未部署员工。
2. 页面显示该员工尚未运行。
3. 用户发送消息时，系统返回清晰提示。
4. 提示用户先完成部署或启动员工。

## Functional Requirements

### Employee Model

必须新增数字员工模型。

最小字段：

```ts
type EmployeeStatus = 'draft' | 'deploying' | 'installed' | 'running' | 'stopped' | 'failed'
type EmployeeHealthStatus = 'unknown' | 'provisioning' | 'healthy' | 'stopped' | 'unhealthy'
type EngineType = 'openclaw' | 'hms' | 'coco' | 'zylos'

interface Employee {
  id: string
  name: string
  avatar?: string
  engineType: EngineType
  status: EmployeeStatus
  systemRole: string
  instanceRoot: string
  runtimeUrl: string
  containerName: string
  port: number | null
  healthStatus: EmployeeHealthStatus
  createdAt: string
  updatedAt: string
}
```

### API Requirements

MVP API：

```text
GET    /api/employees
POST   /api/employees
GET    /api/employees/:id
PATCH  /api/employees/:id
POST   /api/employees/:id/deploy
POST   /api/employees/:id/start
POST   /api/employees/:id/stop
POST   /api/employees/:id/select
GET    /api/employees/current
```

第一版 deploy/start/stop 可以是 mock 状态流转，但 deploy 必须确保实例目录存在。

### Routing Requirements

当前工作台页面需要支持当前员工实例上下文。

可以先用全局当前员工状态：

```text
current_employee_id
```

后续再升级为 URL：

```text
/employees/:employeeId/chat
/employees/:employeeId/history
/employees/:employeeId/tasks
```

MVP 为降低改动量，可以先保留现有路由，但所有页面读取 `current_employee_id`，再由 Control Plane 映射到员工实例。

### UI Requirements

侧边栏结构建议：

```text
当前员工选择器
  BeatyClaw 数字员工 ▼

工作台
  对话
  历史
  任务
  看板

能力
  频道
  AI 引擎
  技能
  记忆
  用量

系统
  数字员工
  设置
```

“数字员工”页面：

- 员工卡片列表。
- 新增员工按钮。
- 每张卡显示：
  - 头像
  - 名字
  - 引擎
  - 状态
  - 实例目录
  - 容器名
  - 端口
  - 健康状态
  - 最近活动
  - 进入工作台

新增员工弹窗：

- 名称
- 头像
- 引擎选择
- 系统角色

### Instance Ownership Requirements

所有新增员工必须拥有独立实例目录。后续新增数据优先写入员工实例自己的目录 / 数据库，而不是写进一个共享大库后只靠 `employee_id` 区分。

`employee_id` 仍然需要保留，用于：

- Control Plane 员工列表。
- 当前员工选择。
- 路由和 API 查找。
- 审计和日志关联。

员工实例数据包括：

- session
- message
- task
- kanban board / card
- memory
- skill config
- channel binding
- usage
- file manifest

第一版可以先只创建目录，不迁移旧数据。旧数据保留兼容读取，并默认归入默认员工。

## Non-Functional Requirements

- 不把密钥暴露到前端。
- 员工数据必须可迁移到 PostgreSQL。
- 员工 ID 必须稳定，不能依赖员工名称。
- 员工实例目录必须稳定，不能依赖员工名称。
- AI 引擎失败不能影响产品端登录和页面访问。
- 没有安装引擎时，产品端仍然可用。
- 状态必须清楚，不允许让用户误以为未部署员工已经可工作。
- 现有页面风格沿用 BeatyClaw / Yoyoo0.1，不做大规模视觉重设计。

## Out of Scope for V1

V1 不做：

- 真实安装 HMS / OpenClaw / COCO。
- 真正启动多个员工容器。
- 真正多租户。
- 付费套餐。
- 员工市场。
- 员工之间自动协作。
- 完整文件向量检索。
- 跨引擎无损迁移。
- 复杂权限系统。

## Open Questions

- 默认员工的默认引擎是否固定为 OpenClaw，还是保持待安装？
- 员工实例的第一版存储继续使用本地目录，还是直接设计 PostgreSQL + 文件存储边界？
- 频道绑定是跟员工绑定，还是允许一个外部渠道分发给多个员工？
- 对话历史是否需要立即按员工隔离旧数据，还是新数据先隔离、旧数据作为默认员工历史？
- AI 引擎页是保留在每个员工下面，还是拆成“全局引擎市场 + 员工当前引擎”两层？

## Acceptance Criteria

- 文档明确 BeatyClaw 的主体从“单个员工”改为“多数字员工实例”。
- 文档明确 BeatyClaw 是 Control Plane，每个员工是 Employee Runtime Instance。
- 文档明确现有工作台页面下沉到当前员工。
- 文档明确每个员工拥有自己的实例目录、引擎、系统角色、文件、记忆、技能、任务、频道、历史和用量。
- 文档明确 AI 引擎不再是全局唯一配置，而是员工属性。
- 文档明确 V1 只做 mock 部署和目录预留，不真实安装外部引擎。
- 技术同事可以基于本 spec 写 DEV-PLAN。
