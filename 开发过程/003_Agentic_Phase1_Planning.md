# 003 Agentic Phase 1 Planning

## Background

苏白明确了 Agentic 第一期方向：

- 这是苏白自己的 AI 工作台。
- 不先做多租户 SaaS。
- 不让用户填写模型 API key。
- 模型 key、Zylos runtime、hxa-connect 和 Coco 后端能力由平台内置。
- 用户只在“链接 / 频道”里填写外部平台连接信息。
- 页面结构和设计直接沿用 `Yoyoo0.1 / hermes-web-ui`。

## Decision

将 `yoyoo-saas` 定位为 Agentic 主项目。

第一期产品名：Agentic。

第一期模块：

- 登录
- 对话
- 历史
- 任务
- 看板
- 链接 / 频道
- 技能
- 记忆
- 用量

第一期不做：

- 多租户
- 注册
- 邀请
- 支付
- 套餐
- 团队权限
- 用户自带模型 key
- 重做 UI

## Existing Reuse

`Yoyoo0.1 / hermes-web-ui` 已经提供可复用基础：

- Vue 3 + TypeScript + Vite 前端。
- Node.js + Koa + TypeScript 后端。
- 登录页。
- Chat、History、Jobs、Kanban、Channels、Skills、Memory、Usage 页面。
- SQLite / 本地文件存储。
- Hermes API proxy 和 gateway 管理。
- 用量统计、会话存储、技能扫描、记忆读写。

## Required Adaptation

需要新增或整理：

1. Agentic 产品命名和导航收口。
2. 单用户登录体验。
3. Agentic runtime adapter，用来逐步接 Coco / Zylos / hxa-connect 后端。
4. 链接 / 频道页面的用户自助配置流程。
5. 服务端密钥管理，禁止前端暴露模型 key 和 runtime token。
6. 第一阶段文档和验收标准。

## Risks

- 当前代码仍有大量 Hermes 命名，直接发布会让产品定位混乱。
- 频道配置页面存在，但不同渠道是否能完整连接取决于组件安装和凭证流程。
- 用量统计如果无法从真实模型调用层采集，第一期可能只能显示估算。
- 任务和看板都有现成能力，但产品语义需要统一成 Agentic 工作流。

## Verification Plan

文档阶段验收：

```bash
test -f Product-Spec.md
test -f DEV-PLAN.md
test -f 开发过程/003_Agentic_Phase1_Planning.md
npm run build
```

后续开发阶段按 `DEV-PLAN.md` 每个里程碑执行。
