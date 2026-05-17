# 026 BeatyClaw Runtime Self Check

更新时间：2026-05-17 19:15 CST

## 背景

线上曾出现“产品页面正常，但发消息没有真实回复”的问题。排查后发现它不是单点故障，而是产品端、hxa-connect、zylos-main、worker-bot、模型 Key、数据目录任意一环异常都会导致对话降级。

之前只能人工逐层 SSH、看日志、查容器。这个方式不利于交接。

## 本次目标

给 BeatyClaw 增加一套运行自检：

- 在后端输出结构化检查结果。
- 在 AI 引擎页展示红黄绿状态。
- 检查结果必须给出具体问题和修复建议。
- 不做一键修复，避免误操作线上服务。

## 实现

新增后端服务：

```text
packages/server/src/services/agentic/runtime-diagnostics.ts
```

新增接口：

```text
GET /api/hermes/runtime/diagnostics
```

前端展示位置：

```text
AI 引擎 -> 运行自检
```

当前检查项：

1. Runtime SDK 是否安装并可用。
2. hxa-connect 是否在线。
3. zylos-main 是否启用、是否有独立 token、是否有模型 Key。
4. worker-bot 是否可能在线。
5. 模型配置是否存在。
6. Hermes / Kanban / Web UI 数据目录是否可访问。

## 验证

新增测试：

```bash
npm run test -- tests/server/runtime-diagnostics.test.ts tests/server/runtime-controller.test.ts tests/client/runtime-api.test.ts
```

覆盖场景：

- zylos 主链路正常时返回 `ok`。
- 入口 bot 和 zylos-main 共用 token 时返回 `error`。
- 缺少模型 Key 时返回可执行错误。
- 前端 API 调用路径正确。

## 边界

当前自检主要检查“配置和运行状态”，不是完整压测，也不会自动发送真实消息。

后续可以增加：

- 一键冒烟测试：发送一条测试消息并验证返回。
- Worker 具名检查：确认 `zylos-main` 和 `worker-bot` 两个 bot 都在线。
- 运维页一键导出诊断报告。
