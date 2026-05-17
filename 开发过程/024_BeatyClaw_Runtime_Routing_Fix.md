# 024 BeatyClaw Runtime 路由错配修复

## 背景

上线“新建数字员工即自动部署上岗”后，苏白在新建 OpenClaw 员工并发消息时，仍收到：

```text
我收到消息了，但当前 AI 能力端暂时不可用，请稍后再试。
```

## 根因

新员工自动上岗只保证员工实例目录、Runtime 进程和 `/health` 检查通过。线上当时仍继承旧环境变量：

```text
BEATYCLAW_RUNTIME_PROVIDER=hms
```

所以 Web / 微信 / Telegram 进入 `conversation-hub` 后，会按全局 HMS provider 调用 HMS 对话适配器。

但苏白新建的当前员工是：

```text
engineType=openclaw
status=running
healthStatus=healthy
```

这导致：

- 员工健康状态是好的。
- 全局聊天 provider 是 HMS。
- 当前员工不是 HMS。
- HMS 对话适配器报错。
- `conversation-hub` 返回兜底文案“AI 能力端暂时不可用”。

本质问题：**员工 Runtime 健康检查** 和 **真实对话能力路由** 没有统一。

## 修复策略

在 `packages/server/src/services/agentic/conversation-hub.ts` 增加 runtime provider 解析层：

1. 如果调用方显式传入 `runtimeProvider`，尊重显式指定。
2. 读取当前员工：
   - 当前员工是健康 HMS：可走 `hms`。
   - 当前员工是健康 COCO / zylos：可走 `zylos`。
   - 当前员工是健康 OpenClaw：当前阶段不直接走 OpenClaw，因为 OpenClaw adapter 尚未实现真实 chat。
3. 如果全局配置是 `hms`，但当前员工不是健康 HMS，则优先回退到可用的 COCO / zylos。
4. 如果全局配置是 `none`，不创建 runtime adapter，保留“未安装 AI 引擎”的明确提示。

## 实现内容

- `conversation-hub.ts`
  - 新增 `getCurrentEmployee` 依赖。
  - 新增 `runtimeProviderFromEmployee()`。
  - 新增 `resolveRuntimeProvider()`。
  - 统一 Web、微信、Telegram 的消息入口 runtime 选择逻辑。

- `tests/server/conversation-hub.test.ts`
  - 新增回归测试：
    - 全局 HMS + 当前 OpenClaw 员工时，回退到 COCO / zylos。
    - 当前 HMS 员工时，仍然走 HMS。
    - `none` 状态不误创建 runtime adapter。

## 验证

```bash
npm run test -- tests/server/conversation-hub.test.ts tests/server/conversation-hub-web-history.test.ts tests/server/runtime-sdk.test.ts
```

结果：3 个测试文件通过，20 个测试通过。

```bash
npm run test
```

结果：90 个测试文件通过，592 个测试通过，2 个跳过。

```bash
npm run build
```

结果：通过。仍有既有大 chunk 警告，不是本轮新增问题。

## 当前边界

- OpenClaw 当前仍不是完整真实 chat adapter。它可以安装和健康检查，但不应被当作已具备完整对话能力。
- COCO / zylos 目前作为可用兜底对话能力端。
- 后续需要把员工卡片状态拆成：
  - Runtime 健康状态
  - Chat 能力状态
  - Channel 可用状态

