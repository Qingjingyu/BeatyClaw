# 012 BeatyClaw Product Stability V1

## 目标

本阶段目标是把 BeatyClaw 从“功能能跑”推进到“同事能接手、线上状态能看懂、外部消息能追踪”的产品化稳定层。

完成条件：

1. 频道页能准确显示微信 / Runtime / HXA 的真实状态。
2. Web 历史默认能看到微信会话。
3. Runtime trace 在 UI 上可读，不只是在接口里。
4. 线上部署配置固化，不再靠手动补 env。
5. README 和开发过程文档更新一版交接说明。

## 本轮实现

### 1. Runtime trace 稳定返回

之前 Conversation Hub 已经把 runtime trace 写入 assistant message 的 `reasoning_details`，但 DB-backed conversation detail 查询没有读取这个字段。

本轮修复：

- `packages/server/src/db/hermes/conversations-db.ts`
  - detail 查询增加 `reasoning_details`。
  - 将 JSON trace 解析为 `runtime_trace`。
- `packages/server/src/services/hermes/conversations.ts`
  - `ConversationMessage` 类型增加 `runtime_trace`。

### 2. UI 文案产品化

之前前端显示类似：

```text
channel: weixin · runtime: zylos · model: hxa:zylos-main
```

本轮改成更适合产品交接和运营排查的文案：

```text
来源：微信 · AI 层：zylos · 模型：hxa:zylos-main · Worker：worker-bot · 状态：成功
```

影响文件：

- `packages/client/src/components/hermes/chat/ConversationMonitorPane.vue`

### 3. 默认历史可见性

当前微信消息通过 Conversation Hub 写入产品 session：

```text
session_id = bc_weixin_{hash}
workspace = channel:weixin
model = runtime:zylos
```

测试已覆盖默认 Web history controller 可在不传 `humanOnly=false` 的情况下看到微信会话。

覆盖测试：

- `tests/server/conversation-hub-web-history.test.ts`
- `tests/server/conversations-db.test.ts`

### 4. 部署配置交接

新增：

- `docs/beautyclaw-deployment.md`

更新：

- `.env.example`
- `README.md`

核心原则：

- 不提交真实 token / 密码。
- `AGENTIC_HXA_TOKEN` 必须使用可调用 `/api/send` 的 hxa bot/client token。
- `HXA_CONNECT_ADMIN_SECRET` 只用于 admin overview，不用于 Runtime SDK send。
- 微信凭证只放服务器环境或挂载 env 文件。

## 验证

已执行：

```bash
npm run test -- tests/server/conversations-db.test.ts tests/server/conversation-hub-web-history.test.ts tests/client/conversation-monitor-pane.test.ts
```

结果：

```text
Test Files  3 passed
Tests       13 passed
```

## 当前边界

- 微信闭环已验证。
- Runtime provider 当前线上以 `zylos` 为主。
- Telegram 需要真实 Bot Token 才能做完整生产验收。
- 飞书目前仍是配置入口，完整 runtime 后续接。
- 本阶段没有引入多租户，也没有改变用户登录模型。
