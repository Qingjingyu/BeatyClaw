# 010 Agentic Connectors Runtime

## 背景

本阶段目标不是重新发明 COCO 的全部能力，而是把 Agentic 从“本地工作台”推进到“可以连接外部渠道的产品工作台”。

第一期关注三个渠道：

- 微信
- 飞书
- Telegram

判断标准：

1. 现有代码是否已经有可复用实现。
2. 是否能接进当前 Agentic / Hermes / hxa / zylos-main 链路。
3. 是否能做出用户可见、可配置、可验证的闭环。

## 当前代码来源

### 1. Agentic / Yoyoo 当前项目

当前项目已经有微信 iLink 的后端接口：

- `packages/server/src/controllers/hermes/weixin.ts`
- `packages/server/src/routes/hermes/weixin.ts`

已存在能力：

- 获取微信二维码：`GET /api/hermes/weixin/qrcode`
- 轮询二维码状态：`GET /api/hermes/weixin/qrcode/status?qrcode=...`
- 保存微信账号配置：`POST /api/hermes/weixin/save`
- 保存后会写入当前环境文件中的 `WEIXIN_ACCOUNT_ID`、`WEIXIN_TOKEN`、`WEIXIN_BASE_URL`
- 保存后会触发 `restartGateway()`

不足：

- 前端还没有把微信做成清晰的“连接器卡片”。
- 当前 `GatewaysView.vue` 只展示 Hermes gateway profile 的启动、停止、健康检查。
- 还没有统一的连接器 registry/status API。
- 还没有在 Agentic 页面里完成“扫码 - 保存 - 启动 - 状态确认 - 外部消息进入 Agentic”的完整产品闭环。

结论：

微信是当前项目里最接近可产品化的连接器入口。

### 2. Hermes gateway

当前 Hermes gateway 管理层已有：

- `packages/server/src/services/hermes/gateway-manager.ts`
- `packages/server/src/services/gateway-bootstrap.ts`
- `packages/server/src/controllers/hermes/gateways.ts`
- `packages/server/src/routes/hermes/gateways.ts`
- `packages/client/src/api/hermes/gateways.ts`
- `packages/client/src/stores/hermes/gateways.ts`

已存在能力：

- 列出 gateway profiles
- 启动 profile
- 停止 profile
- 检查 profile 健康状态

不足：

- 它管理的是 Hermes gateway 进程，不是微信/飞书/Telegram 这种外部平台连接器。
- 它不能直接说明某个微信账号、飞书应用、Telegram bot 是否已连上。

结论：

Hermes gateway 可以作为运行承载层，但还不是连接器产品层。

### 3. hxa-connect

`reference-code/hxa-connect` 是协议和 Hub 服务端。

它的定位：

- Protocol：定义 API / WebSocket / B2B 协议。
- SDK：封装通用能力。
- Connector：由具体 runtime 自己实现策略。

本地规范明确写了分层：

- `hxa-connect` 定义协议。
- `hxa-connect-sdk` 提供能力。
- `openclaw-hxa-connect` / `zylos-hxa-connect` 负责把 runtime 接进去。

当前发现：

- hxa-connect 没有内置微信、飞书、Telegram 平台连接器。
- 它提供的是 agent 和 agent 之间的消息网络，不是微信/飞书/Telegram 平台适配器。

结论：

hxa-connect 是底层消息总线，不是外部渠道连接器仓库。

### 4. zylos-hxa-connect

`reference-code/zylos-hxa-connect` 是 Zylos 接入 hxa-connect 的适配器。

已存在能力：

- 通过 WebSocket 连接 hxa-connect hub。
- 支持多 org。
- 支持 DM、thread、artifact。
- 使用 hxa-connect-sdk。
- 将 hxa 消息桥接到 C4 comm-bridge。

不足：

- 它是 Zylos <-> hxa-connect 的适配器。
- 它不是微信/飞书/Telegram 连接器。
- 当前实现仍然偏 C4 comm-bridge，不是直接接 Agentic 的 UI/API。

结论：

它能帮助恢复“hxa 多 agent 协作”，但不能直接替代微信/飞书/Telegram 连接器。

### 5. zylos-wechat

`reference-code/zylos-wechat` 是真正的微信组件。

已存在能力：

- 微信 API transport。
- QR 登录相关逻辑。
- 长轮询接收消息。
- 出站文本发送。
- account state 隔离。
- contextToken 存储。
- typing indicator。
- 媒体相关处理。

接口契约里说明：

- 入站消息格式是 WeChat -> C4。
- 出站发送需要 `contextToken`。
- 当前 v0.1 不做群聊语义。

不足：

- 当前组件默认桥接到 C4 comm-bridge。
- 不能原样接进 Agentic / hxa / zylos-main。
- 需要把 `sendToC4` 这一段改造成“发送到 Agentic/hxa/zylos-main 的入口”。

结论：

微信连接器底层能力有参考代码，可以复用大量逻辑，但第一期不应该大改 hxa 协议，应该做适配层。

### 6. zylos-feishu

`reference-code/zylos-feishu` 是真正的飞书组件。

已存在能力：

- 飞书 SDK。
- WebSocket 模式。
- Webhook 模式。
- 私聊、群聊、智能群监听。
- 文档、表格、日历相关能力。
- 媒体和去重逻辑。

不足：

- 需要飞书 App ID、App Secret、Verification Token 等平台配置。
- 当前默认也是进入 C4 comm-bridge。
- Agentic 当前没有飞书连接器 UI 和保存配置 API。

结论：

飞书能力比较完整，但配置和平台侧准备成本比 Telegram 高，不建议作为第一个 MVP。

### 7. zylos-telegram

`reference-code/zylos-telegram` 是真正的 Telegram bot 组件。

已存在能力：

- Telegraf bot。
- 私聊、群聊、智能群监听。
- owner / allowlist。
- 媒体处理。
- typing indicator。
- 语音 ASR 入口。

不足：

- 需要 Telegram Bot Token。
- 当前默认进入 C4 comm-bridge。
- Agentic 当前没有 Telegram 连接器 UI 和保存配置 API。

结论：

Telegram 技术复杂度低于飞书。如果有 Bot Token，它适合做第二个连接器。

## 复用决策表

| 连接器 | 现有代码来源 | 可复用程度 | 主要缺口 | 第一阶段建议 |
| --- | --- | --- | --- | --- |
| 微信 | Agentic 已有 `hermes/weixin` + `zylos-wechat` | 高 | 前端连接器卡片、统一状态、入站消息适配 Agentic/hxa | 第一优先级 |
| 飞书 | `zylos-feishu` | 中高 | 平台凭证、Webhook/WS 配置、Agentic 适配层 | 第三优先级 |
| Telegram | `zylos-telegram` | 中高 | Bot Token、Agentic 保存配置 API、入站消息适配 | 第二优先级 |
| hxa-connect | `hxa-connect` + `zylos-hxa-connect` | 高，但不是外部渠道 | 它负责 agent 协作，不负责微信/飞书/Telegram 平台接入 | 作为消息总线保留 |

## 第一连接器选择

第一期建议先做微信。

原因：

1. 当前 Agentic 项目已经有微信二维码和保存配置接口。
2. 用户体验更像 COCO：打开连接页，扫码，保存，看到连接状态。
3. 可以先做最小闭环，不需要先改 hxa 协议。
4. `zylos-wechat` 后续可以作为入站消息和出站回复的底层参考。

第二候选建议 Telegram。

原因：

1. Bot Token 模式比飞书应用配置更简单。
2. 适合快速验证“外部消息进入 Agentic，然后走 zylos-main / worker-bot / GPT-5.5 回复”的链路。

飞书放第三。

原因：

1. 企业应用配置项多。
2. Webhook/WS 模式和权限审核容易卡住。
3. 更适合在微信或 Telegram 闭环稳定后再接。

## 最小可运行闭环设计

第一期微信闭环：

1. 前端“链接 / 频道”页面展示微信连接器卡片。
2. 用户点击连接微信。
3. 后端调用现有 `/api/hermes/weixin/qrcode` 返回二维码。
4. 前端轮询 `/api/hermes/weixin/qrcode/status`。
5. 扫码确认后，前端调用 `/api/hermes/weixin/save` 保存账号配置。
6. 后端重启 Hermes gateway。
7. 前端展示微信连接状态。
8. 如果有真实微信消息进入，则进入 Agentic / hxa / zylos-main 回复链路。

如果第 8 步受限于微信真实账号或上游 API，第一期验收至少要做到：

- QR 可获取。
- 扫码状态可轮询。
- 配置可保存。
- gateway 可重启。
- 状态可显示。
- 不影响现有聊天、看板、记忆、任务执行。

## 不改动边界

本阶段不做：

- 不改 hxa-connect 协议。
- 不改 Kanban 数据结构。
- 不删除当前聊天、记忆、任务能力。
- 不把 C4 comm-bridge 全量迁进 Agentic。
- 不一次性接完微信、飞书、Telegram。

## 风险点

1. 微信真实入站消息可能依赖 iLink 上游账号状态。
2. 微信出站回复需要 `contextToken`，不是普通 token 就能随便发。
3. 飞书和 Telegram 需要外部平台凭证，不能在本地凭空验证。
4. zylos 组件大量代码默认面向 C4，需要做轻适配，不能原样复制进 Agentic。

## 本轮实现结果

已完成第一期微信连接器 MVP。

改动范围：

1. 后端新增连接器 registry/status 层。
   - 文件：`packages/server/src/controllers/hermes/weixin.ts`
   - 新增：`GET /api/hermes/weixin/status`
   - 作用：读取当前 active profile 的 `.env`，判断 `WEIXIN_ACCOUNT_ID`、`WEIXIN_TOKEN` 是否存在，并读取 Hermes gateway 运行状态。
2. 后端复用现有微信接口。
   - 文件：`packages/server/src/routes/hermes/weixin.ts`
   - 保留：`/api/hermes/weixin/qrcode`、`/api/hermes/weixin/qrcode/status`、`/api/hermes/weixin/save`
   - 新增：`/api/hermes/weixin/status`
3. 前端链接页面新增连接器卡片。
   - 文件：`packages/client/src/views/hermes/ChannelsView.vue`
   - 左侧“频道”入口打开后，第一屏展示 Agentic 外部连接器模块。
   - 展示微信、Telegram、飞书三个连接器。
   - 微信支持弹窗扫码、轮询状态、保存配置、刷新状态。
   - Telegram 支持保存 Bot Token。
   - 飞书支持保存 App ID 和 App Secret。
   - 文件：`packages/client/src/views/hermes/GatewaysView.vue`
   - 保留 Hermes gateway profile 的启动、停止、健康检查视图，并增加同一套连接器入口作为兼容管理页。
4. 前端 API 增加连接器状态调用。
   - 文件：`packages/client/src/api/hermes/config.ts`
   - 新增：`ConnectorStatus`
   - 新增：`fetchWeixinStatus()`
5. 文档更新。
   - 文件：`开发过程/010_Connectors_Runtime.md`

## 验证结果

本地构建：

```bash
npm run build
```

结果：

- `vue-tsc -b` 通过。
- `vite build` 通过。
- `tsc --noEmit -p packages/server/tsconfig.json` 通过。
- `tsc --noEmit -p packages/worker-bot/tsconfig.json` 通过。
- server bundle 构建通过。
- worker-bot bundle 构建通过。

回归测试：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
```

结果：

- 5 个测试文件通过。
- 44 个测试通过。
- 覆盖 Agentic runtime、hxa-main、Hermes Kanban service、hxa-connect API、前端 hxa API。

本地隔离服务验证：

```bash
mkdir -p /tmp/agentic-connectors-home/.hermes
touch /tmp/agentic-connectors-home/.hermes/config.yaml
HOME=/tmp/agentic-connectors-home AUTH_DISABLED=1 PORT=8765 node dist/server/index.js
```

结果：

- 服务启动成功：`http://localhost:8765`
- 前端首页：`GET /` 返回 `200`
- 健康检查：`GET /health` 返回 `status: ok`
- 微信状态接口：`GET /api/hermes/weixin/status` 返回：

```json
{
  "key": "weixin",
  "name": "Weixin",
  "source": "agentic-hermes-weixin",
  "configured": false,
  "gateway_profile": "default",
  "gateway_running": true
}
```

微信上游连通性验证：

```bash
curl -sS --max-time 25 http://127.0.0.1:8765/api/hermes/weixin/qrcode
```

结果：

- 成功返回 `qrcode`
- 成功返回 `qrcode_url`
- 说明 Agentic 后端可以真实连通微信 iLink 二维码接口。

临时服务停止方式：

- 使用 `Ctrl-C / SIGINT` 温和停止，没有使用 `kill -9`。

本地保存配置验证：

```bash
HOME=/tmp/agentic-connectors-save-home AUTH_DISABLED=1 PORT=8766 node dist/server/index.js
curl -X POST http://127.0.0.1:8766/api/hermes/weixin/save ...
curl -X PUT http://127.0.0.1:8766/api/hermes/config/credentials ...
```

结果：

- 微信保存接口返回 `{"success":true}`。
- 微信状态接口变为 `configured: true`。
- 临时 `.env` 写入：
  - `WEIXIN_ACCOUNT_ID`
  - `WEIXIN_TOKEN`
  - `WEIXIN_BASE_URL`
  - `TELEGRAM_BOT_TOKEN`
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`

浏览器页面验证：

- 使用 Playwright 打开本地服务并登录。
- 点击左侧“频道”。
- 页面第一屏出现：
  - “外部连接器”
  - “微信”
  - “Telegram”
  - “飞书”
  - “Telegram Bot Token”
  - “飞书应用凭证”

线上部署验证：

- 已同步代码到服务器。
- 已在服务器构建 `agentic-yoyoo-saas:latest` 镜像。
- 已重建 `agentic` 容器。
- 已重建 `hxa-worker-bot` 容器。
- 未改 DNS。
- 未改 Caddy。
- 未新增端口。
- 正式公网验证：
  - `https://agent.aibosss.com/` 返回 `200`
  - `https://agent.aibosss.com/health` 返回 `200`
- 线上 smoke 验证：
  - 使用同一新镜像启动临时本机端口容器。
  - `GET /api/hermes/weixin/status` 返回微信连接器状态。
  - `GET /api/hermes/weixin/qrcode` 成功返回真实 `qrcode` 和 `qrcode_url`。
  - 验证后已删除临时 smoke 容器。

## 当前状态

Building 已完成第一版 MVP。

已做到：

- 前端“链接 / 频道”页能看到连接器。
- 左侧“频道”入口实际可见微信、Telegram、飞书连接器。
- 用户能扫码配置微信。
- 用户能填写 Telegram Bot Token。
- 用户能填写飞书 App ID / App Secret。
- 后端能保存微信配置。
- 后端能保存 Telegram / 飞书凭证到现有 Hermes 配置体系。
- 微信连接器能校验状态。
- 微信二维码上游连通性已验证。
- 没有改 hxa-connect 协议。
- 没有改 Hermes Kanban 数据结构。
- 没有改现有聊天、Kanban、memory.write、execute_all 运行路径。

仍未做到：

- 没有完成“真实外部消息进入 Agentic / hxa / zylos-main”的端到端验证。
- 原因：需要真实微信扫码确认，或提供 Telegram Bot Token / 飞书应用凭证。这属于外部平台账号凭证，按本 Goal 的暂停边界，需要单独确认后继续。

下一步建议：

1. 用微信扫码完成真实账号绑定。
2. 验证 iLink 是否能产生真实入站消息。
3. 如果入站消息无法直接进入 Agentic，则开始适配 `zylos-wechat` 的 polling/runtime，把 `sendToC4` 改成 Agentic/hxa/zylos-main 入口。

## 2026-05-16 微信消息 Runtime

### 背景

微信扫码绑定已经成功，线上状态能读到：

- `WEIXIN_ACCOUNT_ID`
- `WEIXIN_TOKEN`
- `WEIXIN_BASE_URL`

但这只代表“账号已绑定”，还不代表“微信消息会进入 Agentic 并回复用户”。

### 决策

复用 `zylos-wechat` 的 iLink 协议思路，但不直接搬它的 C4 runtime：

- 使用 iLink `getupdates` 长轮询收微信消息。
- 使用 iLink `sendmessage` 回复微信消息。
- 把入站消息转到现有 `createHxaMainAgentRun()`。
- 继续沿用现有链路：

```text
微信
→ Agentic weixin-runtime
→ hxa-connect / zylos-main
→ worker-bot / GPT-5.5
→ Agentic weixin-runtime
→ 微信回复
```

### 实现

新增：

- `packages/server/src/services/agentic/weixin-runtime.ts`
  - 读取当前 Hermes profile 的 `.env` 微信凭证。
  - 调用 iLink `getupdates` 拉取消息。
  - 调用 iLink `sendmessage` 回发文本。
  - 首次启动只保存 cursor 并跳过旧消息，避免历史消息被批量自动回复。
  - 使用 `weixin-runtime-state.json` 持久化 cursor 和最近消息 ID。
  - 只处理文本消息。
  - 过滤机器人自己发出的消息，避免回环。
- `packages/server/src/index.ts`
  - 服务启动后自动启动微信 runtime。
- `packages/server/src/controllers/hermes/weixin.ts`
  - 状态接口返回 `runtime` 状态，不暴露 token。
- `tests/server/weixin-runtime.test.ts`
  - 覆盖文本提取、消息过滤、hxa 输入构造、状态安全性。

### 验证

本地测试：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts tests/server/weixin-runtime.test.ts
```

结果：

- 6 个测试文件通过。
- 48 个测试通过。

本地构建：

```bash
npm run build
```

结果：

- Vue 类型检查通过。
- 前端生产构建通过。
- server TypeScript 检查通过。
- worker-bot TypeScript 检查通过。
- server / worker-bot bundle 构建通过。

### 当前边界

已经完成：

- 微信账号绑定状态读取。
- 微信 runtime 代码接入。
- 微信消息进入 hxa/zylos-main 的本地代码路径。
- 微信回复发送代码路径。

还需要线上真实消息验证：

- 部署新镜像后，确认 `/api/hermes/weixin/status` 中 `runtime.running=true`。
- 由苏白在微信里发一条真实消息。
- 查看容器日志和微信端是否收到回复。

### 线上部署验证

已完成：

- 已同步代码到服务器。
- 已重建 `agentic-yoyoo-saas:latest` 镜像。
- 已重建 `agentic` 容器。
- 已重建 `hxa-worker-bot` 容器。
- 已把线上 owner 登录密码重新设置为苏白指定的邮箱密码。
- `https://agent.aibosss.com/` 返回 `200`。
- `https://agent.aibosss.com/health` 返回 `200`。
- 线上登录接口返回 `200`。
- 线上微信状态接口返回 `200`。

微信状态接口关键信息：

```json
{
  "configured": true,
  "gateway_running": false,
  "runtime": {
    "running": true,
    "configured": true,
    "cursor_ready": true,
    "primed": true,
    "messages_received": 0,
    "messages_forwarded": 0,
    "replies_sent": 0
  }
}
```

说明：

- `gateway_running=false` 是预期状态，因为本项目当前不用 Hermes 原生 gateway 接微信。
- 真正负责微信入站的是 `runtime.running=true` 的 Agentic 微信 runtime。
- 已连续轮询约 2 分钟，`last_poll_at` 正常更新，说明 iLink polling 没死。
- 但 `messages_received=0`，说明这段时间 iLink 没给服务器返回新的微信入站消息。

当前待验证：

- 苏白需要在微信里给刚绑定的 bot 发送一条新消息。
- 如果 `messages_received` 增加，说明微信入站已通，再看 `messages_forwarded` 和 `replies_sent`。
- 如果仍为 0，需要排查 iLink bot 的会话入口、消息发送对象、账号权限或 iLink 消息类型。

## 2026-05-16 频道页顶部概览

### 背景

“频道 / 链接”页面原来同时存在 hxa 概览、连接器卡片、底部 Hermes 平台配置。

问题：

- 顶部和底部都在展示状态，信息层级容易重复。
- 用户想判断“系统现在能不能用”时，需要看多个卡片。
- 后续接 Telegram / 飞书时，如果没有总览，页面会继续堆叠。

### 设计决策

顶部概览只回答整体问题：

- 整体状态：正常 / 部分异常 / 未连接。
- 已连接渠道：当前配置了几个渠道。
- 运行中渠道：有几个真实 runtime 正在工作。
- 最近活动：最近一次外部入站消息。
- 消息链路：微信入口 → Agentic → hxa-connect → zylos-main → worker-bot → GPT-5.5。
- 问题提示：只提示需要处理的系统级问题。

底部细分卡片继续负责：

- 微信扫码和账号管理。
- Telegram Token 保存。
- 飞书 App ID / App Secret 保存。
- 原有 Hermes 平台配置。

### 实现

修改：

- `packages/client/src/api/hermes/config.ts`
  - `ConnectorStatus` 增加 `runtime` 类型。
- `packages/client/src/views/hermes/ChannelsView.vue`
  - 新增顶部 `overview-panel`。
  - 新增整体状态、已连接渠道、运行中渠道、最近活动。
  - 新增链路状态条。
  - 新增问题提示条。
  - 微信卡片从 gateway 状态改成 runtime 状态。

未修改：

- 微信扫码保存逻辑。
- Telegram Token 保存逻辑。
- 飞书凭证保存逻辑。
- 原有 Hermes 平台配置组件。
- hxa-connect / weixin-runtime 后端协议。

### 验证

本地构建：

```bash
npm run build
```

结果：

- Vue 类型检查通过。
- 前端生产构建通过。
- server TypeScript 检查通过。
- worker-bot TypeScript 检查通过。

本地 smoke：

- Vite 页面可访问。
- 后端 `/api/hermes/weixin/status` 可访问。

待线上验证：

- 部署后打开 `https://agent.aibosss.com/#/channels`。
- 顶部出现“外部连接器概览”。
- 底部 Telegram / 飞书 / Hermes 平台配置仍然存在。

## 2026-05-16 Telegram Runtime MVP

### 背景

微信闭环已经跑通后，第二个外部入口选择 Telegram。

原因：

- Telegram 技术链路比飞书轻。
- 现有页面已经支持保存 `TELEGRAM_BOT_TOKEN`。
- Telegram Bot API 支持 `getUpdates` 长轮询和 `sendMessage` 回复，适合复制微信 runtime 模式。

### 实现

新增：

- `packages/server/src/services/agentic/telegram-runtime.ts`
  - 读取当前 Hermes profile `.env` 中的 `TELEGRAM_BOT_TOKEN`。
  - 使用 Telegram Bot API `getUpdates` 长轮询。
  - 首次启动只保存 offset 并跳过历史更新，避免批量回复旧消息。
  - 新消息进入现有 `createHxaMainAgentRun()`。
  - 使用 Telegram `sendMessage` 回发回复。
  - 支持私聊、群聊、forum thread 的 `message_thread_id`。
  - 持久化 `telegram-runtime-state.json`。
- `packages/server/src/controllers/hermes/telegram.ts`
  - 新增 Telegram 状态接口。
- `packages/server/src/routes/hermes/telegram.ts`
  - 新增 `GET /api/hermes/telegram/status`。
- `packages/server/src/index.ts`
  - Agentic 启动时自动启动 Telegram runtime。
- `packages/client/src/api/hermes/config.ts`
  - 新增 `fetchTelegramStatus()`。
  - `ConnectorStatus.runtime` 增加 Telegram 的 `bot_username` / `offset_ready` 字段。
  - 将微信专属 `cursor_ready` 改为可选，避免 Telegram runtime 被迫伪造微信字段。
- `packages/client/src/views/hermes/ChannelsView.vue`
  - Telegram 卡片显示 runtime 运行状态。
  - 顶部概览的运行中渠道、最近活动、问题提示纳入 Telegram。
- `packages/server/src/controllers/hermes/config.ts`
  - 保存 Telegram Token 后热启动 Telegram runtime，不需要用户手动重启容器。
- `tests/server/telegram-runtime.test.ts`
  - 覆盖文本提取、消息过滤、hxa 输入构造、状态不泄露 token。

### 验证

本地测试：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts
```

结果：

- 7 个测试文件通过。
- 52 个测试通过。

本地构建：

```bash
npm run build
```

结果：

- Vue 类型检查通过。
- 前端生产构建通过。
- server TypeScript 检查通过。
- worker-bot TypeScript 检查通过。

### 当前边界

已完成：

- 使用现有 `TELEGRAM_BOT_TOKEN` 配置。
- Agentic 启动时读取 token。
- Telegram runtime 代码路径接入 hxa/zylos-main。
- Telegram 回复发送代码路径。
- Telegram 状态接口。
- 频道页 Telegram runtime 状态展示。

待线上验证：

- 2026-05-16 已部署到线上镜像 `agentic-yoyoo-saas:latest`，并重建 `agentic` / `hxa-worker-bot` 容器。
- 线上 `GET /api/hermes/telegram/status` 可访问，当前返回 `configured=false`、`runtime.running=false`。
- 服务器当前没有保存 `TELEGRAM_BOT_TOKEN`，因此还不能验证真实 Telegram 收发闭环。
- 已用假 Token 做负向验证：
  - `PUT /api/hermes/config/credentials` 保存 Telegram Token 返回 `success=true`。
  - 保存后 runtime 热启动，状态变为 `configured=true` / `runtime.running=true`。
  - 假 Token 被 Telegram API 返回 `401 Unauthorized`，错误能进入 runtime 状态。
  - 清空 Token 后状态恢复 `configured=false` / `runtime.running=false`。
  - 服务器 `.env` 确认没有残留 `TELEGRAM_BOT_TOKEN`。
- 下一步需要先在频道页 Telegram 卡片保存 Bot Token；保存后 runtime 会热启动。
- 由苏白向 Telegram bot 发送真实消息。
- 检查 `messages_received` / `messages_forwarded` / `replies_sent` 是否增加。

### Telegram 真实闭环验收步骤

拿到真实 Telegram Bot Token 后按下面步骤验收：

1. 打开 `https://agent.aibosss.com/#/hermes/channels`。
2. 点击 Telegram 卡片。
3. 在 `Bot Token` 输入框保存真实 token。
4. 调用状态接口确认：

   ```bash
   GET /api/hermes/telegram/status
   ```

   期望：

   - `configured=true`
   - `runtime.running=true`
   - `runtime.bot_username` 有值
   - `runtime.last_error` 为空

5. 用 Telegram 给该 bot 发送一条测试消息。
6. 再次调用状态接口，确认：

   - `messages_received` 增加。
   - `messages_forwarded` 增加。
   - `replies_sent` 增加。

7. 检查 Telegram 客户端收到 Agentic 回复。
8. 打开频道页确认 Telegram 卡片显示 `已连接，runtime 运行中`。

只有上述 8 步全部通过，Telegram runtime MVP 才能标记完成。

## 2026-05-16 BeatyClaw Branding Deployment

### 背景

频道页 `https://agent.aibosss.com/#/hermes/channels` 仍显示旧的 `Agentic` 标题和旧头像。排查后确认本地代码已改成 `BeatyClaw 数字员工`，但线上仍在运行旧 Docker 构建。

### 处理

- 同步本地最新源码到服务器 `/home/ubuntu/agent-stack/agentic-src`。
- 重新构建 Docker 镜像 `agentic-yoyoo-saas:latest`。
- 先启动临时验证容器 `agentic-verify` 到 `127.0.0.1:3458`。
- 验证通过后，温和停止旧 `agentic` 容器并改名备份。
- 使用新镜像启动正式 `agentic` 容器。
- 同步滚动 `hxa-worker-bot` 到同一版镜像，避免主服务和 worker 代码版本不一致。
- 清理临时验证容器。

### 验证

公网验证通过：

```text
https://agent.aibosss.com/ -> <title>BeatyClaw 数字员工</title>
https://agent.aibosss.com/logo.png -> PNG image data, 1254 x 1254
public asset -> /assets/js/index-CxsTSyS_.js
```

容器验证通过：

```text
agentic        agentic-yoyoo-saas:latest   Up
hxa-worker-bot agentic-yoyoo-saas:latest   Up
hxa-connect    hxa-connect-hxa-connect     Up
```

### 结论

线上频道页没有换头像和名字的原因不是页面代码遗漏，而是代码只提交到了 GitHub，没有重新部署到服务器。现在公网已更新到 BeatyClaw 品牌版本。

## 2026-05-16 微信绑定后无回复修复

### 现象

用户在频道页完成微信绑定后，`/api/hermes/weixin/status` 显示微信已经配置：

```text
configured=true
account_id=aaa9ce74b7fc@im.bot
runtime.configured=true
runtime.running=false
```

但微信端发消息没有收到回复。

### 根因

服务启动时 `.env` 里还没有微信凭证，因此启动日志出现：

```text
[weixin-runtime] disabled or missing account/token
```

后来用户扫码绑定成功，后端只把 `WEIXIN_ACCOUNT_ID` / `WEIXIN_TOKEN` 写入 `.env`，没有同步启动微信消息轮询 runtime。

这导致状态上“已配置”，但真实负责收消息、转发到 hxa/zylos-main、再发回微信的 `weixin-runtime` 没有运行。

### 修复

- `POST /api/hermes/weixin/save` 保存微信配置后，立即调用 `startWeixinRuntime()`。
- 保存接口返回最新 `runtime` 状态，方便前端和排查确认。
- 服务启动后增加微信 runtime 看门狗：
  - 每 30 秒检查一次。
  - 如果检测到 `configured=true` 且 `running=false`，自动重新启动微信 runtime。
  - 默认间隔可通过 `WEIXIN_RUNTIME_WATCHDOG_MS` 调整；设置为 `0` 可关闭。

### 验证

本地验证：

```bash
npm run test -- tests/server/weixin-runtime.test.ts tests/server/hxa-main-runtime.test.ts
npm run build
```

结果：

```text
26 tests passed
production build passed
```

线上验收重点：

- `/api/hermes/weixin/status` 中 `runtime.running=true`。
- 微信发新消息后：
  - `messages_received` 增加。
  - `messages_forwarded` 增加。
  - `replies_sent` 增加。
- 微信客户端收到 BeatyClaw 数字员工回复。
