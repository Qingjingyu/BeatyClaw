# 008 Agentic HXA Overview

## Background

Agentic 已完成公网部署和 GPT-5.5 对话。下一步开始把 hxa-connect 接入 Agentic，而不是只把 hxa-connect 放在 `/hxa/` 独立页面。

## Scope

本次只做第一块地基：频道页读取 hxa-connect 状态和概览。

包含：

- hxa-connect 健康状态
- hxa-connect 版本
- 平台统计：组织、Bots、在线 Bots、Threads、消息、活跃 Threads
- 组织概览

不包含：

- 创建频道
- 配置微信 / 飞书
- 读取具体 channel/thread 明细
- 外部消息回流 Agentic 对话
- 多 Agent 分发

原因：hxa-connect 的真实频道和线程接口依赖具体 bot/session 权限，不能在第一步硬造“全局频道列表”。

## Implementation

新增后端代理：

```text
GET /api/agentic/hxa/overview
```

后端使用服务器环境变量访问 hxa-connect：

```text
HXA_CONNECT_BASE_URL=
HXA_CONNECT_ADMIN_SECRET=
```

前端只访问 Agentic 自己的 API，不接触 hxa secret。

频道页新增 hxa-connect 面板，并保留原平台连接配置区域。

## Verification

已运行：

```bash
npm run test -- tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts tests/server/agentic-runtime.test.ts tests/server/auth.test.ts tests/server/yoyoo-auth.test.ts tests/client/login-view.test.ts tests/client/api.test.ts
npm run build
```

结果：通过。

## Next

下一步需要基于 hxa 的 bot/session 权限做：

1. 选择或创建 Agentic bot。
2. 读取该 bot 的 channels 和 threads。
3. 将外部消息流接入 Agentic 对话或任务。
