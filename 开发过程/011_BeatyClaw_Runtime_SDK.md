# 011 BeatyClaw Runtime SDK

## 背景

BeatyClaw 不应该和某一个 AI 内核绑死。

产品层应该独立负责：

- 登录和用户入口
- 工作台页面
- 对话和历史
- 任务和看板
- 频道配置
- 技能、记忆、用量展示
- 产品状态和运营体验

AI 能力层应该可以替换：

- Zylos
- OpenClaw
- HMS / Hermes
- hxa-connect + worker-bot
- 未来其他 runtime

## 架构边界

目标结构：

```text
BeatyClaw 前端
↓
BeatyClaw 产品后端
↓
BeatyClaw Runtime SDK / Adapter
↓
Zylos / OpenClaw / HMS
↓
模型、工具、连接器、Agent 执行
```

产品层不能直接关心某个 runtime 的内部协议，例如：

- hxa channel 怎么建
- zylos-main bot 叫什么
- worker-bot 如何返回
- HMS gateway 如何启动
- OpenClaw 的内部任务格式

这些细节应该藏在 Runtime Adapter 里。

## 第一版接口

当前先建立最小接口，不做大而全插件系统。

第一版能力：

```ts
interface BeatyClawRuntime {
  provider: 'zylos' | 'openclaw' | 'hms'
  sendMessage(input): Promise<RuntimeMessageResult>
  getStatus(): RuntimeStatus
}
```

后续再扩展：

- `createTask`
- `updateTask`
- `runSkill`
- `listMemories`
- `saveMemory`
- `getUsage`
- `connectChannel`

## 本轮实现

新增：

- `packages/server/src/services/agentic/runtime-sdk.ts`
- `tests/server/runtime-sdk.test.ts`

当前实现：

- `createZylosRuntimeAdapter()`
  - 对产品层暴露 `sendMessage()`
  - 底层仍复用当前 `createHxaMainAgentRun()`
  - 返回统一的 `RuntimeMessageResult`
- `createRuntimeAdapter('openclaw')`
  - 当前返回 unsupported adapter
  - 明确标记 OpenClaw 是计划支持，不让产品层误以为已经可用
- `createRuntimeAdapter('hms')`
  - 同上，当前是 planned / unsupported

## 设计原则

1. 产品层稳定，AI 层可换。
2. 第一版只抽真实需要的接口，避免过早做复杂插件市场。
3. 当前线上能力不推翻，只把边界立起来。
4. 迁移采用小步替换：先新增 SDK，再逐步让聊天、微信、Telegram 入口调用 SDK。
5. 每个 provider 必须有明确状态：active / not_configured / unsupported。

## 当前不做

- 不一次性接完整 OpenClaw。
- 不一次性接完整 HMS。
- 不改前端页面结构。
- 不迁移所有连接器。
- 不做多租户 runtime 选择。
- 不做收费套餐。

## 下一步建议

### Phase 1：聊天入口接 SDK

把 `ChatRunSocket` 中直接调用 `createHxaMainAgentRun()` 的地方，改为调用：

```ts
createRuntimeAdapter('zylos').sendMessage(...)
```

验收：

- 普通聊天仍可用。
- 任务型聊天仍能进入 hxa/zylos-main。
- 现有 hxa runtime 测试通过。

本轮已完成：

- `ChatRunSocket` 不再直接 import / 调用 `createHxaMainAgentRun()`。
- Web 对话入口改为调用 `createRuntimeAdapter('zylos').sendMessage(...)`。
- `ZylosRuntimeAdapter.sendMessage()` 在 hxa/zylos 未配置时返回 `null`，保留原有 GPT-5.5 直连 fallback。
- 产品层开始面向 Runtime SDK，而不是直接依赖 hxa/zylos 细节。

### Phase 2：连接器入口接 SDK

把微信、Telegram 入站消息统一改成：

```ts
runtime.sendMessage({
  channel: 'weixin',
  text,
  metadata,
})
```

验收：

- 微信真实消息仍能回复。
- Telegram 保存 token 后仍能进入相同链路。

## 2026-05-16 Product Conversation Hub

### 背景

Runtime SDK 只是 AI 能力边界，但产品还需要自己的统一消息层。

正确产品路径应该是：

```text
微信 / Telegram / 飞书 / Web
↓
BeatyClaw Product Conversation Hub
↓
产品 session / messages / usage
↓
Runtime SDK
↓
产品 session / messages / usage
↓
原渠道回复
```

这样 Web 端不再只是一个单独聊天框，而是所有渠道对话的总工作台。

### 本轮实现

新增：

- `packages/server/src/services/agentic/conversation-hub.ts`
- `tests/server/conversation-hub.test.ts`

改动：

- 微信 runtime 收到入站消息后不再直接调用 hxa/zylos。
- 微信 runtime 改为调用 `receiveConversationMessage()`。
- Conversation Hub 负责：
  - 按 `channel + externalUserId` 创建稳定产品 session。
  - 写入用户消息。
  - 调用 Runtime SDK。
  - 写入 AI 回复。
  - 更新 session stats。
  - 更新 usage。
  - 把回复文本返回给渠道 runtime。

### 当前会话策略

第一版不改数据库结构，先复用现有 `sessions` / `messages` / `session_usage`：

```text
session_id = bc_{channel}_{sha256(channel:externalUserId).slice(0, 24)}
workspace = channel:{channel}
title = {ChannelLabel} {externalUserId}
```

这能保证同一个微信用户持续进入同一个 Web 可见会话。

### 当前边界

- 只迁移微信。
- Telegram / 飞书后续按同样模式迁移。
- 不做联系人系统。
- 不改历史页 UI。
- 不做多租户 runtime 选择。
- Web 流式对话暂时保留现有路径，避免破坏在线体验。

### Phase 3：OpenClaw / HMS Provider 设计

等 Zylos provider 稳定后，再分别设计：

- `OpenClawRuntimeAdapter`
- `HmsRuntimeAdapter`

每个 provider 先实现 `sendMessage` 和 `getStatus`，不要一开始做全能力。

## 验证

本轮验证命令：

```bash
npm run test -- tests/server/runtime-sdk.test.ts tests/server/agentic-runtime.test.ts
npm run build
```

目标：

- SDK 测试通过。
- 现有 Agentic runtime 测试不受影响。
- 整体构建通过。
