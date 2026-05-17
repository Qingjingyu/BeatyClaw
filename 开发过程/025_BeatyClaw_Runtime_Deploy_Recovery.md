# 025 BeatyClaw Runtime Deploy Recovery

更新时间：2026-05-17 18:39 CST

## 背景

线上新建数字员工后，Web 对话返回：

```text
我收到消息了，但当前 AI 能力端暂时不可用，请稍后再试。
```

这不是单纯的前端问题。线上冒烟测试显示消息已经进入 `conversation-hub`，并且路由到 `zylos`，但 Runtime 返回 `fetch failed`。

## 根因

问题分成两层：

1. 之前部署容器继承了旧环境变量，`BEATYCLAW_RUNTIME_PROVIDER` 一度指向 `hms`，但当前员工不是 HMS 引擎，导致路由错配。
2. 修复路由后继续测试，发现底层 AI 能力端没有完整启动：
   - `hxa-connect` 容器处于 `Exited`。
   - `hxa-worker-bot` 容器处于 `Exited`。
   - 当前 `agentic` 容器缺少 `OPENAI_*` 和 `ZYLOS_MAIN_*` 环境变量。

所以“重新部署”只重新部署了 BeatyClaw 产品端，并没有保证底层 COCO/Zylos/hxa-connect 能力端一起恢复。

## 本次修复

### 1. Runtime 路由修复

已在 `conversation-hub` 中按当前数字员工状态动态选择 Runtime：

- 当前健康 HMS 员工：走 `hms`。
- 当前 COCO/Zylos 员工：走 `zylos`。
- 当前 OpenClaw 员工但 OpenClaw chat adapter 未实现：优先回落到可用 `zylos`。
- 显式传入 `runtimeProvider` 时仍尊重调用方覆盖。

### 2. 部署脚本修复

`scripts/deploy-production.sh` 已允许显式覆盖这些 AI 能力端变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `AGENTIC_DEFAULT_MODEL`
- `AGENTIC_HXA_*`
- `ZYLOS_MAIN_*`

目的：以后线上部署时不会因为只继承当前产品容器环境，导致模型 Key、hxa-connect 地址、zylos-main 开关等能力端变量逐步丢失。

## 验证

本地已通过：

```bash
npm run test -- tests/scripts/deploy-production.test.ts
npm run test -- tests/server/conversation-hub.test.ts tests/server/conversation-hub-web-history.test.ts tests/server/runtime-sdk.test.ts
npm run test
npm run build
```

线上已确认：

- `https://agent.aibosss.com/health` 正常。
- 当前生产容器为 `agentic-yoyoo-saas:prod-20260517182606`。
- 登录后 `/api/hermes/runtime/status` 返回 provider 为 `zylos`。

## 后续要求

修复线上完整能力链路时，需要同时满足：

1. `agentic` 产品容器运行。
2. `hxa-connect` 运行并监听 `127.0.0.1:4800`。
3. `zylos-main` 在 `agentic` 容器内启用。
4. `worker-bot` 容器运行。
5. `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AGENTIC_DEFAULT_MODEL` 配置存在。
6. `AGENTIC_HXA_TOKEN` 和 `ZYLOS_MAIN_HXA_TOKEN` 使用能调用 hxa-connect 的 bot token。

## 结论

BeatyClaw 产品层已经可以接收消息和统一记录会话。当前线上异常的本质是“产品层活着，底层 AI 引擎链路没有完整随部署恢复”。部署脚本已补上能力端变量覆盖口，后续部署必须把产品端和 AI 能力端作为两个独立但相关的服务检查。
