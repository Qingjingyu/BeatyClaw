# BeatyClaw Product Spec

## Goal

BeatyClaw 要从“一个数字员工工作台”升级为“多数字员工管理系统”。

产品的主体不再是全局对话框或全局 AI 引擎，而是一个个数字员工。每个数字员工都有自己的名字、头像、系统角色、文件、记忆、技能、任务、频道、对话历史、用量和底层 AI 引擎。

核心目标：

```text
BeatyClaw 产品层
→ 管理多个数字员工
→ 每个员工选择自己的 AI 引擎
→ 每个员工拥有自己的工作资料和能力面板
```

第一期不再把重点放在“给同一个员工换大脑”，而是放在“雇佣一个新员工，并给这个员工选择合适的大脑”。

## Target Users

第一阶段仍然服务苏白自己，后续再扩展为对外 SaaS 用户。

目标用户需要：

- 创建多个不同职责的数字员工。
- 给每个数字员工选择不同 AI 引擎，例如 OpenClaw、HMS、COCO 或 Zylos。
- 让每个员工拥有独立资料和工作区。
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
→ 每个员工有自己的 AI 引擎和工作资料
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
- 切换当前员工。

员工基础字段：

- `id`
- `name`
- `avatar`
- `engine_type`
- `status`
- `system_role`
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

### 2. 默认员工

系统必须创建一个默认员工：

```text
name: BeatyClaw 数字员工
engine_type: openclaw
status: draft 或 installed，取决于部署阶段
```

默认员工用于承接现有对话、历史、任务、看板、频道、技能、记忆和用量页面。

第一版迁移可以先不搬历史数据，只要新数据都能归属到默认员工。

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

也就是说，用户在“销售员工”里看到的是销售员工的对话、历史、任务、看板、记忆和用量；切到“客服员工”后，看到客服员工自己的数据。

### 5. AI 引擎作为员工配置

AI 引擎不再是全局配置，而是员工的一个属性。

MVP 支持的引擎选项：

- OpenClaw
- HMS
- COCO
- Zylos，作为历史兼容和可选引擎

第一版只做 mock 部署状态，不真安装外部项目。

流程：

```text
新增员工
→ 选择引擎
→ 保存员工
→ 状态进入 deploying
→ mock 完成后进入 installed
→ 当前员工可以进入自己的工作台
```

### 6. 产品层保存资料

员工资料必须保存在 BeatyClaw 产品层，而不是只存在某个 AI 引擎里。

员工归属数据：

- 系统角色 / system role
- 对话历史
- 工作文件
- 任务
- 看板
- 记忆
- 技能配置
- 频道绑定
- 用量记录

AI 引擎只负责执行：

```text
BeatyClaw 生成 Context Pack
→ Runtime Adapter 转成目标引擎格式
→ 引擎执行
→ 返回结果
→ BeatyClaw 保存历史和状态
```

### 7. Context Pack 边界

为了以后员工切换引擎或复制员工，产品层需要形成统一上下文包。

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
2. BeatyClaw 根据 `employee_id` 读取员工资料。
3. BeatyClaw 生成 Context Pack。
4. Runtime SDK 根据员工 `engine_type` 选择 adapter。
5. adapter 调用对应引擎。
6. 结果回写到该员工历史和用量。

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
type EngineType = 'openclaw' | 'hms' | 'coco' | 'zylos'

interface Employee {
  id: string
  name: string
  avatar?: string
  engineType: EngineType
  status: EmployeeStatus
  systemRole: string
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

第一版 deploy/start/stop 可以是 mock 状态流转。

### Routing Requirements

当前工作台页面需要支持当前员工上下文。

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

MVP 为降低改动量，可以先保留现有路由，但所有页面读取 `current_employee_id`。

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
  - 最近活动
  - 进入工作台

新增员工弹窗：

- 名称
- 头像
- 引擎选择
- 系统角色

### Data Ownership Requirements

所有新增数据必须带 `employee_id`，包括：

- session
- message
- task
- kanban board / card
- memory
- skill config
- channel binding
- usage
- file manifest

第一版可以只把新数据写入员工维度，旧数据保留兼容读取。

## Non-Functional Requirements

- 不把密钥暴露到前端。
- 员工数据必须可迁移到 PostgreSQL。
- 员工 ID 必须稳定，不能依赖员工名称。
- AI 引擎失败不能影响产品端登录和页面访问。
- 没有安装引擎时，产品端仍然可用。
- 状态必须清楚，不允许让用户误以为未部署员工已经可工作。
- 现有页面风格沿用 BeatyClaw / Yoyoo0.1，不做大规模视觉重设计。

## Out of Scope for V1

V1 不做：

- 真实安装 HMS / OpenClaw / COCO。
- 真正多租户。
- 付费套餐。
- 员工市场。
- 员工之间自动协作。
- 完整文件向量检索。
- 跨引擎无损迁移。
- 复杂权限系统。

## Open Questions

- 默认员工的默认引擎是否固定为 OpenClaw，还是保持 `none` 等用户安装？
- 员工数据的第一版存储继续用 SQLite，还是直接设计 PostgreSQL schema？
- 频道绑定是跟员工绑定，还是允许一个外部渠道分发给多个员工？
- 对话历史是否需要立即按员工隔离旧数据，还是新数据先隔离、旧数据作为默认员工历史？
- AI 引擎页是保留在每个员工下面，还是拆成“全局引擎市场 + 员工当前引擎”两层？

## Acceptance Criteria

- 文档明确 BeatyClaw 的主体从“单个员工”改为“多数字员工”。
- 文档明确现有工作台页面下沉到当前员工。
- 文档明确每个员工拥有自己的引擎、系统角色、文件、记忆、技能、任务、频道、历史和用量。
- 文档明确 AI 引擎不再是全局唯一配置，而是员工属性。
- 文档明确 V1 只做 mock 部署，不真实安装外部引擎。
- 技术同事可以基于本 spec 写 DEV-PLAN。
