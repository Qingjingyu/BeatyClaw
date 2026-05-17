# 027 BeatyClaw Runtime Orchestration

更新时间：2026-05-17 19:45 CST

## 背景

BeatyClaw 当前已经拆成“产品层”和“AI 引擎层”。产品层是 `agentic` 容器，AI 引擎层当前线上主要是 `zylos / COCO` 链路：

```text
agentic
→ hxa-connect
→ zylos-main
→ hxa-worker-bot
→ GPT-5.5
```

之前出现过几类问题：

- `agentic` 页面正常，但 worker-bot 掉线。
- worker-bot 读取旧 Hermes 目录，导致新建员工或新消息没有进入真实链路。
- `AGENTIC_HXA_TOKEN`、`ZYLOS_MAIN_HXA_TOKEN`、worker `HXA_TOKEN` 身份边界不清晰。
- 每次恢复都要人工 SSH、查容器、查日志，不利于交接。

## 本次目标

把线上 AI 引擎链路收口成可检查、可恢复、可交接的运维单元：

1. `agentic`、`hxa-connect`、`hxa-worker-bot` 有统一状态检查。
2. worker-bot 明确继承产品容器的数据挂载，避免读旧目录。
3. 三类 bot token 分开检查，避免身份混用。
4. 服务器有一条命令输出 Runtime 链路健康状态。
5. README 记录线上结构和恢复方法。

## 实现

新增脚本：

```text
scripts/runtime-stack.sh
scripts/runtime-healthcheck.sh
```

`runtime-stack.sh` 支持：

```bash
./scripts/runtime-stack.sh status
./scripts/runtime-stack.sh healthcheck
./scripts/runtime-stack.sh recover
./scripts/runtime-stack.sh restart
./scripts/runtime-stack.sh stop
```

关键设计：

- `stop` 只停止 AI 引擎侧车，不关闭 `agentic` 产品容器。
- `recover` 会启动 `hxa-connect`，并用当前 `agentic` 镜像重建 `hxa-worker-bot`。
- worker-bot 使用 `--volumes-from agentic`，跟随产品容器当前挂载，不再单独写死旧数据路径。
- `runtime-healthcheck.sh` 会检查 worker-bot 和 agentic 是否都挂载：
  - `/home/ubuntu/agent-stack/agentic-hermes -> /home/agent/.hermes`
  - `/home/ubuntu/agent-stack/agentic-webui -> /home/agent/.hermes-web-ui`

token 分工：

```text
AGENTIC_HXA_TOKEN       产品入口 bot
ZYLOS_MAIN_HXA_TOKEN    zylos-main bot
hxa-worker-bot HXA_TOKEN worker-bot bot
```

健康检查会在 token 相同的时候直接失败。

## 验证

新增测试：

```bash
npm run test -- tests/scripts/runtime-stack.test.ts tests/scripts/deploy-production.test.ts
```

覆盖：

- worker-bot 使用产品容器 volumes。
- 健康检查会检查产品容器和 worker-bot 的共享目录。
- 健康检查会验证三个 bot token 不混用。
- 健康检查支持带登录态调用 `/api/hermes/runtime/diagnostics`。

上线后需要在服务器执行：

```bash
cd /home/ubuntu/agent-stack/agentic-build-current
./scripts/runtime-stack.sh healthcheck
```

带完整登录态诊断：

```bash
AGENTIC_DEPLOY_VERIFY_EMAIL=... \
AGENTIC_DEPLOY_VERIFY_PASSWORD=... \
./scripts/runtime-stack.sh healthcheck
```

## 边界

本次只解决 Runtime 链路“能被编排、能被检查、能被恢复”。

暂不包含：

- HMS / OpenClaw 的真实安装器。
- 多员工独立文件夹级完整部署。
- 多 worker 并行调度策略。
- 图形化一键恢复按钮。

这些应在后续“员工实例 Runtime 生命周期”里继续做。
