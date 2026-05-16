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

把 `ChatRunSocket` 中直接调用 `createHxaMainAgentRun()` 的地方，改为调用 Runtime SDK：

```ts
createConfiguredRuntimeAdapter().sendMessage(...)
```

验收：

- 普通聊天仍可用。
- 任务型聊天仍能进入 hxa/zylos-main。
- 现有 hxa runtime 测试通过。

本轮已完成：

- `ChatRunSocket` 不再直接 import / 调用 `createHxaMainAgentRun()`。
- Web 对话入口改为调用 `createConfiguredRuntimeAdapter().sendMessage(...)`，实际 provider 由部署环境决定。
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

- 微信已迁移到 Conversation Hub。
- Telegram 已按同样模式迁移到 Conversation Hub；飞书后续按同样模式迁移。
- 不做联系人系统。
- 不做多租户 runtime 选择。
- Web 流式对话已在 2026-05-16 迁移到 Conversation Hub，同时保留原有 Socket.IO 事件体验。

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

## 2026-05-16 Weixin Runtime Diagnostics

### 背景

线上微信 runtime 已配置并持续轮询，但真实验收时一直没有生成产品会话：

- `running=true`
- `configured=true`
- `cursor_ready=true`
- `primed=true`
- `messages_received=0`
- Web 会话列表为空

检查 `/home/agent/.hermes/weixin-runtime-state.json` 发现历史状态里存在多个微信 message id，说明 iLink 曾返回过消息，但当时没有足够运行时诊断区分：

- 没收到新消息
- priming 阶段跳过历史消息
- recent id 去重跳过
- 缺 `from_user_id` / `context_token` / 文本内容被过滤

### 实现

给 `packages/server/src/services/agentic/weixin-runtime.ts` 增加只读诊断字段：

- `messages_seen`
- `last_seen_message_at`
- `last_skipped_reason`
- `messages_skipped_recent`
- `messages_skipped_unhandled`

并新增 `getWeixinSkipReason()`，用于解释不处理某条消息的原因。

### 验证

已通过：

```bash
npm run test -- tests/server/weixin-runtime.test.ts tests/server/conversation-hub.test.ts tests/server/conversation-hub-web-history.test.ts
npm run build
```

线上诊断版部署后，连续观察约 1 分钟：

- `last_poll_at` 持续更新
- `messages_seen=0`
- `messages_received=0`
- `messages_forwarded=0`
- `replies_sent=0`
- Web 会话列表仍为空

当前判断：Conversation Hub 链路代码已就绪，但真实微信闭环还缺新的 iLink 入站事件作为验收样本。下一步需要在微信端重新发送新消息，再通过诊断字段确认消息是否被 iLink 返回、是否被处理、是否写入 Web 历史。

## 2026-05-16 Deployment Runtime Provider

### 背景

苏白明确产品边界：BeatyClaw 不是让终端用户在页面里切换底层 AI，而是作为独立产品层，可以部署到不同 AI Runtime 底座上。

目标结构：

```text
用户 / 渠道
↓
BeatyClaw 产品层
↓
Conversation Hub / Runtime SDK
↓
部署级 Runtime provider
  - zylos
  - openai-direct
  - hms（预留）
  - openclaw（预留）
```

### 决策

第一版用环境变量控制底层 Runtime：

```env
BEATYCLAW_RUNTIME_PROVIDER=zylos
```

默认继续使用 `zylos`，不破坏已跑通的微信和 Web 链路。

新增 `openai-direct` provider，用 OpenAI-compatible `/v1/chat/completions` 证明 BeatyClaw 可以脱离 Zylos 单独运行：

```env
BEATYCLAW_RUNTIME_PROVIDER=openai-direct
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=...
AGENTIC_DEFAULT_MODEL=gpt-5.5
```

### 实现

- Runtime SDK 增加：
  - `getConfiguredRuntimeProvider()`
  - `createConfiguredRuntimeAdapter()`
  - `getConfiguredRuntimeStatus()`
  - `createOpenAiDirectRuntimeAdapter()`
- Web 对话入口改为调用部署级 provider。
- 微信 Conversation Hub 默认读取部署级 provider，不再写死 `zylos`。
- Telegram runtime 入站消息也进入 Conversation Hub，不再直接调用 hxa/zylos-main。
- 新增状态接口：

```text
GET /api/hermes/runtime/status
```

### 当前边界

- 这不是用户可见的 Runtime 切换器。
- 不做多租户 Runtime 隔离。
- HMS / OpenClaw 仍是预留 provider，后续单独实现。
- `openai-direct` 只提供基础聊天能力，不等价于 Zylos/HXA 多 Agent。

## 2026-05-16 Runtime Status Visualization

### 背景

Runtime provider 已经可以通过部署环境切换，但产品层还需要让管理员看到当前到底接了哪个底座、能不能用、缺什么配置。否则换底座时只能看日志，不利于交接和运维。

### 实现

- `/api/hermes/runtime/status` 增强返回：
  - `runtime.available`
  - `runtime.mode`
  - `runtime.missingConfig`
  - `runtime.checks`
- `zylos` provider 会检查：
  - `AGENTIC_HXA_RUNTIME_ENABLED`
  - `AGENTIC_HXA_TOKEN`
  - `AGENTIC_HXA_BASE_URL`
- `openai-direct` provider 会检查：
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`
- 前端 `链接 / 频道` 页面新增 `AI Runtime` 状态卡片，显示 provider、状态、缺失配置、能力列表和逐项检查结果。

### 验收记录

已通过：

```bash
npm run test -- tests/server/runtime-sdk.test.ts tests/server/runtime-controller.test.ts tests/client/runtime-api.test.ts tests/client/channels-runtime-status.test.ts tests/server/conversation-hub.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts
npm run build
```

真实 provider 检查：

- `BEATYCLAW_RUNTIME_PROVIDER=openai-direct` 时，状态接口可识别为 `active`，说明配置读取和 provider 选择链路有效。
- 本机当前 shell 中的 `OPENAI_API_KEY` 调用 `https://key.cosark.com.cn/v1/chat/completions` 返回 `INVALID_API_KEY`。
- 服务器 `agentic` 容器中使用已有 `OPENAI_API_KEY` / `OPENAI_BASE_URL` 完成 openai-direct 真实调用，返回：`BeatyClaw openai-direct 服务器验收通过。`
- `BEATYCLAW_RUNTIME_PROVIDER=zylos` 时，状态检查可正确指出缺失 `AGENTIC_HXA_RUNTIME_ENABLED` 和 `AGENTIC_HXA_TOKEN`，说明默认 zylos 回归诊断有效。
- 服务器 `agentic` 容器中使用已有 HXA runtime 环境完成 zylos 真实调用，返回：`BeatyClaw zylos 回归验收通过`。

### 下一步

- 服务器部署更新后，在浏览器打开 `#/hermes/channels` 检查 `AI Runtime` 卡片。
- Web 页面级真实对话仍建议在部署更新后用浏览器再发一条消息确认 UI 流程。

## 2026-05-16 First Real Message Loop

### 背景

苏白明确第一版必须先证明真实消息闭环，而不是继续堆更多平台入口。

目标闭环：

```text
Web / 微信
↓
BeatyClaw 产品消息层
↓
Conversation Hub
↓
Runtime SDK
↓
部署级 Runtime provider
↓
Web / 微信回复
↓
Web 历史可追踪
```

### 本轮实现

Web 对话入口完成迁移：

- `ChatRunSocket` 不再直接调用 Runtime adapter 完成 Web 回复。
- Web 消息改为调用 `receiveConversationMessage()`。
- Web 仍复用前端会话 `session_id`，避免产生隐藏的 `bc_web_*` 影子会话。
- Conversation Hub 统一写入：
  - user message
  - assistant reply
  - usage
  - runtime trace
- Socket.IO 继续向前端发送：
  - `run.started`
  - `message.delta`
  - `run.completed`
  - `run.failed`
- 为避免重复落库，Conversation Hub 已持久化的 Web run 不再由 `flushResponseRunToDb()` 重复写 assistant 消息。

新增 runtime trace：

```json
{
  "channel": "web",
  "runtime_provider": "zylos",
  "runtime_model": "hxa:zylos-main",
  "runtime_run_id": "hxa_...",
  "hxa_channel_id": "channel-...",
  "hxa_message_id": "message-...",
  "worker_dispatched": true,
  "worker_bot": "worker-bot",
  "status": "ok"
}
```

失败时也会写入 assistant fallback 和 trace：

```json
{
  "channel": "weixin",
  "runtime_provider": "openai-direct",
  "status": "failed",
  "error": "bad gateway"
}
```

这解决的是“用户发消息没反应，前端/历史/后台都看不出发生了什么”的问题。

### 前端可见性

`ConversationMonitorPane` 已显示 assistant message 的 runtime trace：

- `channel: web / weixin`
- `runtime: zylos / openai-direct`
- `model: ...`
- `worker: worker-bot` 或 `worker: 未派发`
- `status: ok / failed / empty`

### 修改文件

- `packages/server/src/services/agentic/conversation-hub.ts`
- `packages/server/src/services/agentic/runtime-sdk.ts`
- `packages/server/src/services/hermes/chat-run-socket.ts`
- `packages/server/src/controllers/hermes/sessions.ts`
- `packages/client/src/api/hermes/conversations.ts`
- `packages/client/src/components/hermes/chat/ConversationMonitorPane.vue`
- `tests/server/conversation-hub.test.ts`
- `tests/server/conversation-hub-web-history.test.ts`
- `tests/client/conversation-monitor-pane.test.ts`

### 验证

已通过：

```bash
npm run test -- tests/server/conversation-hub.test.ts tests/server/conversation-hub-web-history.test.ts tests/server/runtime-sdk.test.ts tests/server/runtime-controller.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts tests/client/runtime-api.test.ts tests/client/channels-runtime-status.test.ts tests/client/conversations-api.test.ts tests/client/conversation-monitor-pane.test.ts
```

结果：

- 10 个测试文件通过。
- 36 个测试通过。

已通过：

```bash
npm run build
```

结果：

- 前端生产构建通过。
- server TypeScript 检查通过。
- worker-bot TypeScript 检查通过。
- server / worker-bot bundle 构建通过。

### 线上部署记录

本地代码完成后，首次同步服务器时命令：

```bash
rsync -az --delete --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude 'hermes_data' --exclude '.env' --exclude '.DS_Store' ./ ubuntu@43.160.215.230:/home/ubuntu/agent-stack/agentic-src/
```

返回：

```text
Permission denied (publickey,password).
```

随后确认密码登录可用，已完成：

1. 同步代码到 `/home/ubuntu/agent-stack/agentic-src/`。
2. 构建新 Docker 镜像：`agentic-yoyoo-saas:message-loop-20260516224412`。
3. 临时容器健康检查通过。
4. 温和替换线上 `agentic` 容器。
5. 旧容器备份为：`agentic-prev-20260516224722`。

线上健康检查：

```text
http://127.0.0.1:3457/health
```

返回 Web 服务可用；`gateway=stopped` 是当前 Agentic 部署模式下的既有状态。

### Dockerfile 启动命令修正

部署验收时发现 Dockerfile 末尾同时存在：

```dockerfile
CMD ["dist/server/index.js"]
CMD []
```

Docker 只会保留最后一个 `CMD`，导致镜像默认命令为空；当容器没有显式传入 `dist/server/index.js` 时会直接退出。

已修正为：

```dockerfile
ENTRYPOINT ["node"]
CMD ["dist/server/index.js"]
```

修正后重新构建并部署镜像：

```text
agentic-yoyoo-saas:message-loop-cmdfix-20260516230751
```

验证记录：

- 临时容器不显式传入启动命令，容器保持运行。
- 临时容器第 8 秒健康检查通过。
- 线上 `agentic` 已切换到该镜像。
- 线上 `http://127.0.0.1:3457/health` 返回 `status=ok`。

后续同事按镜像默认方式启动时，不需要再额外补命令。

### 线上 Web 验收

浏览器打开：

```text
https://agent.aibosss.com/#/hermes/chat
```

发送：

```text
线上闭环验收：请回复 BeatyClaw Web loop ok，并简单说明当前 channel 和 runtime。
```

页面收到回复：

```text
BeatyClaw Web loop ok

当前 channel：web inbound
当前 runtime：agentic-client API 对话运行环境
```

随后读取历史接口：

```text
GET /api/hermes/sessions/conversations/{session_id}/messages?humanOnly=false
```

证据：

- session `workspace=channel:web`
- `message_count=2`
- assistant `runtime_trace.channel=web`
- assistant `runtime_trace.runtime_provider=zylos`
- assistant `runtime_trace.runtime_model=hxa:zylos-main`
- assistant `runtime_trace.hxa_channel_id` 有值
- assistant `runtime_trace.hxa_message_id` 有值
- assistant `runtime_trace.worker_dispatched=false`
- assistant `runtime_trace.status=ok`

结论：Web 真实消息闭环已通过线上验收。

### 线上微信状态

部署后发现当前挂载目录 `/home/agent/.hermes` 缺 `.env`，导致微信显示未配置。已从旧目录恢复：

```text
/home/ubuntu/agent-stack/agentic/data/hermes/.env
→ /home/ubuntu/agent-stack/agentic-hermes/.env
```

恢复后曾出现两个线上配置问题：

1. 微信旧 iLink token 返回 `session timeout`，需要重新扫码绑定。
2. HXA runtime 一度使用 admin secret 调 `/api/send`，hxa-connect 返回 `Invalid token`。`/api/send` 需要 bot token，不是 admin secret。

已修正：

- 微信重新扫码绑定，当前账号为新 `account_id`。
- `AGENTIC_HXA_RUNTIME_ENABLED` 固化为代码实际识别的 `1`。
- `AGENTIC_HXA_TOKEN` 改为 `agentic-client` bot token。
- `BEATYCLAW_RUNTIME_PROVIDER=zylos` 已写入线上 `.env`。

### 线上微信真实验收

苏白重新发送微信消息后，线上状态：

- `messages_seen=1`
- `messages_received=1`
- `messages_forwarded=1`
- `replies_sent=1`

Web 历史会话：

- session id：`bc_weixin_d3524c90a28ee09f3227206c`
- `workspace=channel:weixin`
- `model=runtime:zylos`
- `message_count=6`

最新 assistant message：

```text
你好，我在。你想让我帮你做什么？
```

最新 runtime trace：

```json
{
  "channel": "weixin",
  "runtime_provider": "zylos",
  "runtime_model": "hxa:zylos-main",
  "runtime_run_id": "hxa_b39302ac-05cb-4d89-adeb-008101704710_38c4764d-b867-44fa-9225-0394b105ea51",
  "hxa_channel_id": "b39302ac-05cb-4d89-adeb-008101704710",
  "hxa_message_id": "38c4764d-b867-44fa-9225-0394b105ea51",
  "worker_dispatched": false,
  "status": "ok"
}
```

结论：第一版真实消息闭环已通过线上验收。

当前已验证：

- Web → Conversation Hub → Runtime SDK → zylos → Web 回复。
- 微信 → Conversation Hub → Runtime SDK → zylos → 微信回复。
- Web 历史可看到微信会话。
- Runtime trace 可展示 channel / runtime / worker-bot 状态。
- 失败会写入 fallback 回复和 trace，前端和历史可追踪。
