# 006 Agentic Chat Runtime

## Background

Agentic 壳子和 owner 登录已经收口，下一步需要让对话页能真正接到模型回复。

现有聊天页已经有完整流式 UI、会话保存、历史恢复和用量记录能力。最小风险方案是保留前端和 Socket.IO 流式事件协议，在服务端增加 Agentic runtime 适配层。

## Decision

本次新增 OpenAI-compatible runtime：

- 如果服务端配置了 `OPENAI_API_KEY`，`/chat-run` 会直接调用 `OPENAI_BASE_URL/v1/chat/completions`。
- 如果没有配置 `OPENAI_API_KEY`，继续走原 Hermes gateway `/v1/responses`。
- 前端聊天 UI 不重写，仍复用现有 `message.delta`、`run.completed`、`run.failed` 事件。
- OpenAI chat-completions SSE chunk 会在服务端转换为现有 response-style 事件。
- Socket.IO `/chat-run` 认证补上 owner cookie 校验；无 cookie 时才允许显式开启的 legacy token。

## Runtime Env

服务端配置：

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=
AGENTIC_DEFAULT_MODEL=gpt-5.5
AGENTIC_DISABLE_HERMES_GATEWAY=1
```

说明：

- `OPENAI_API_KEY` 只在服务端使用。
- `OPENAI_BASE_URL` 可接 OpenAI 官方或 OpenAI-compatible 中转地址。
- `AGENTIC_DEFAULT_MODEL` 是前端没有指定模型时的默认模型。
- `AGENTIC_DISABLE_HERMES_GATEWAY=1` 用于 Agentic SaaS 部署：对话直连 OpenAI-compatible runtime，不再要求容器里存在 Hermes CLI。
- 本地真实验证发现 `https://key.cosark.com.cn` 上 `gpt-4o-mini` 返回 503，`gpt-5.4-mini` 可正常返回；产品默认按苏白要求改为 `gpt-5.5`。

## Verification

已运行：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/auth.test.ts tests/server/yoyoo-auth.test.ts tests/client/login-view.test.ts tests/client/api.test.ts
npm run build
```

结果：通过。

真实通道验证：

```text
OPENAI_BASE_URL=https://key.cosark.com.cn
AGENTIC_DEFAULT_MODEL=gpt-5.4-mini
Socket.IO /chat-run 返回：Agentic 对话通道验证成功。
```

默认模型决策：

```text
AGENTIC_DEFAULT_MODEL=gpt-5.5
```

## Remaining Work

- 还没有做页面内的“当前 runtime 状态”展示。
- 还没有把 Zylos / Coco / hxa-connect 状态展示接进 UI。
- 上线时需要在服务器环境变量配置有效 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`，不要写入仓库。
