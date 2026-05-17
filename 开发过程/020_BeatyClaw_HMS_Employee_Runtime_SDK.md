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
- HMS installer 能读取员工 hermes-home `.env` 里的 API key。

## 当前边界

- 还没有真实线上 HMS gateway 端到端验收。
- 还没有自动端口池。
- 还没有在 UI 中显示 HMS gateway API key 状态。
- 还没有按会话选择不同员工，目前使用当前员工。
- 还没有把旧 Hermes 页面请求按员工实例 gateway 全部路由。

## 下一步

1. 在服务器上启用 `BEATYCLAW_HMS_INSTALL_MODE=hermes-gateway`。
2. 创建 HMS 员工并 deploy/start/health。
3. 确认真实 Hermes gateway 写出 `.env` API key。
4. 设置 `BEATYCLAW_RUNTIME_PROVIDER=hms`。
5. 发送 Web/微信消息，验证回复来自当前员工 HMS gateway。
