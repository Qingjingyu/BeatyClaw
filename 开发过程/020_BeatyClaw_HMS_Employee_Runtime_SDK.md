# 020 BeatyClaw HMS Employee Runtime SDK

Date: 2026-05-17

## 背景

HMS Gateway Installer V2 已经能为每个员工生成 Hermes gateway 启动清单。本阶段把消息 Runtime SDK 接到当前员工 HMS 实例。

目标链路：

```text
Web / 微信 / Telegram 消息
→ Conversation Hub
→ Runtime SDK provider=hms
→ 当前数字员工
→ 员工自己的 HMS gateway
→ 返回产品会话
```

## 实现

更新：

- `packages/server/src/services/agentic/runtime-sdk.ts`
- `packages/server/src/services/agentic/employee-runtime.ts`
- `packages/server/src/services/agentic/employee-runtime-installer.ts`
- `packages/server/src/services/hermes/chat-run-socket.ts`

新增：

- `createHmsRuntimeAdapter()`
- `readEmployeeRuntimeState()` 导出
- runtime state 记录 `apiKey`
- installer 从员工 `config/hermes-home/.env` 读取 `API_SERVER_KEY`

## 运行方式

启用部署级 HMS provider：

```text
BEATYCLAW_RUNTIME_PROVIDER=hms
```

当前员工必须满足：

- `engineType = hms`
- `status = running`
- `healthStatus = healthy`
- `runtimeUrl` 指向员工 HMS gateway

Runtime SDK 会向：

```text
{employeeRuntimeUrl}/v1/chat/completions
```

发送 OpenAI-compatible chat completions 请求。

如果 runtime state 里有 `apiKey`，会自动加：

```text
Authorization: Bearer {apiKey}
```

## 测试覆盖

- HMS Runtime SDK 会读取当前员工 runtimeUrl/apiKey。
- HMS Runtime SDK 会请求员工 gateway 的 `/v1/chat/completions`。
- Conversation Hub 可以把 provider=hms 的回复写入产品会话和 runtime trace。
- Web 聊天框在 `provider=hms` 时也会进入 Conversation Hub，不再绕回旧 Hermes chat-run gateway。
- HMS installer 能读取员工 hermes-home `.env` 里的 API key。

## 线上验收记录

服务器：`agent.aibosss.com`

已完成：

- 部署镜像：`agentic-yoyoo-saas:prod-20260517123426`
- 部署环境：
  - `BEATYCLAW_RUNTIME_PROVIDER=hms`
  - `BEATYCLAW_HMS_INSTALL_MODE=hermes-gateway`
- 创建 HMS 员工：`emp_7ebbd41a0556b7d4`
- 员工 runtime：
  - `engineType=hms`
  - `status=running`
  - `healthStatus=healthy`
  - `runtimeUrl=http://127.0.0.1:5180/health`
- 直接请求员工 HMS gateway `/v1/chat/completions` 返回 `HMS gateway OK`。

补充配置：

- HMS gateway 需要在员工自己的 `config/hermes-home/config.yaml` 中配置：

```yaml
model:
  default: gpt-5.5
  provider: custom
  base_url: https://key.cosark.com.cn/v1
```

- 员工自己的 `config/hermes-home/.env` 中配置模型密钥。

## 当前边界

- 还没有自动端口池。
- 还没有在 UI 中显示 HMS gateway API key 状态。
- 还没有按会话选择不同员工，目前使用当前员工。
- 还没有把模型 provider 配置自动写入 HMS 员工 installer，目前线上是手动写入员工级 `config.yaml` 和 `.env`。
- 还没有把所有旧 Hermes 页面请求按员工实例 gateway 全部路由。

## 下一步

1. 部署最新 `chat-run-socket` 改动，让 Web 聊天框的 `provider=hms` 正式走 Conversation Hub。
2. 用网页聊天框发送消息，确认 runtime trace 为 `hms`。
3. 把 HMS 员工模型配置沉淀为 installer 自动写入能力，避免以后手工改 `config.yaml`。
