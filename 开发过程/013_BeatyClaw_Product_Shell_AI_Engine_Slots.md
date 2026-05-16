# 013 BeatyClaw Product Shell and AI Engine Slots

Date: 2026-05-17

## 背景

苏白确认 BeatyClaw 要先成为独立产品端，而不是默认绑定 Zylos / hxa-connect。产品层负责登录、工作台、频道、历史、任务、用量和 AI 引擎卡槽；底层 AI 能力通过 HMS、COCO、OpenClaw 或其他 Runtime adapter 安装接入。

## 决策

- 默认 Runtime provider 改为 `none`。
- `none` 表示 BeatyClaw 只运行产品端，没有已安装 AI 引擎。
- 没有 AI 引擎时，Conversation Hub 仍写入用户消息和助手提示，但不调用 Zylos / hxa-connect。
- `zylos` 不再是产品端基础设施，而是一个可安装 AI 引擎包。
- 服务启动时只有 provider 为 `zylos` 才启动 `zylos-main-runtime`。
- 频道页隐藏 hxa-connect 内部状态，除非当前 provider 是 `zylos`。
- 部署脚本默认只验收产品端健康和 Runtime status；HXA / Weixin 深度验收改为 opt-in。

## 实现

关键文件：

- `packages/server/src/services/agentic/runtime-sdk.ts`
- `packages/server/src/services/agentic/conversation-hub.ts`
- `packages/server/src/index.ts`
- `packages/client/src/views/hermes/AIEnginesView.vue`
- `packages/client/src/views/hermes/ChannelsView.vue`
- `scripts/deploy-production.sh`
- `docs/beautyclaw-deployment.md`

## 当前产品状态

```text
BeatyClaw 产品端
→ Conversation Hub
→ Runtime SDK
→ none
→ 返回“请先安装 AI 引擎”
```

AI 引擎页当前卡槽：

- COCO：可安装，产品能力包
- HMS：可安装，AI 能力端
- OpenClaw：可安装，AI 能力端

安装按钮和真实安装器尚未实现。

## 验收

需要跑：

```bash
npm run test -- tests/server/runtime-sdk.test.ts tests/server/conversation-hub.test.ts tests/server/runtime-controller.test.ts tests/client/runtime-api.test.ts tests/client/channels-runtime-status.test.ts
npm run build
```

上线后检查：

```bash
GET /api/hermes/runtime/status
```

期望：

- `provider = none`
- `runtime.available = false`
- `runtime.mode = not_configured`
- `runtime.missingConfig` 包含 `AI_ENGINE`
- 登录和前端页面仍正常

## 后续

下一阶段应该做“AI 引擎安装协议”：

- 产品端展示安装 / 卸载 / 启动 / 停止状态。
- HMS 本地端或服务器安装器负责真实安装。
- Runtime SDK adapter 接入 HMS / OpenClaw / COCO。
- 安装成功后把 provider 从 `none` 切换为对应引擎。
