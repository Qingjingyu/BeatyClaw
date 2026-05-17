# BeatyClaw 数字员工

BeatyClaw 数字员工是基于 `Yoyoo0.1 / hermes-web-ui` 改造出来的单用户 AI 工作台。当前目标是先把 BeatyClaw 产品端独立出来：登录、对话、历史、任务、看板、频道连接、技能、记忆、用量和 AI 引擎卡槽先稳定运行，底层 AI 能力通过 HMS / COCO / OpenClaw / Zylos 等引擎安装接入。

当前线上入口：`https://agent.aibosss.com`

## 项目定位

第一期产品形态：

- 单用户工作台，不做注册、不做多租户、不做套餐支付。
- 默认不内置 AI 引擎。模型 API Key、hxa-connect、zylos-main、worker-bot、GPT-5.5 等能力属于可安装的底层 AI 引擎。
- 用户只在“频道 / 链接”里填写外部平台连接信息，例如微信、Telegram、飞书。
- 前端沿用 Yoyoo0.1 的工作台结构，但品牌和产品语义收口到 BeatyClaw 数字员工。

我们当前不是简单部署原版 Hermes Web UI，而是在它的 UI 和基础能力上形成 BeatyClaw 产品端，再通过 Runtime SDK 接入外部 AI 引擎。

## 当前架构

```text
外部入口：Web / 微信 / Telegram / 飞书
        ↓
BeatyClaw 数字员工产品层
        ↓
Conversation Hub / Runtime SDK
        ↓
部署级 Runtime provider
        ├─ none：仅产品端，等待安装 AI 引擎
        ├─ zylos：hxa-connect → zylos-main → worker-bot / GPT-5.5
        ├─ hms：计划接入
        ├─ openclaw：计划接入
        └─ openai-direct：OpenAI-compatible API
        ↓
返回到工作台或外部渠道，并写入产品会话历史
```

当前线上容器：

- `agentic`：Web UI + Koa BFF + 产品端服务。
- `hxa-connect` / `zylos` / `hxa-worker-bot`：历史 AI 能力端，产品端模式下不再要求运行。

## 技术栈

- Frontend：Vue 3 + TypeScript + Vite + Naive UI。
- Backend：Node.js + Koa + TypeScript。
- Runtime：BeatyClaw Runtime SDK + 部署级 Runtime provider。默认 `none`，表示只运行产品端；安装引擎后可切到 `zylos`、`hms`、`openclaw` 或其他 adapter。
- Storage：当前沿用本地 SQLite / Hermes profile 文件体系。
- Build：`npm run build` 输出到 `dist/`。
- Deploy：Docker 镜像 `agentic-yoyoo-saas:latest`。

生产部署交接见：

- `docs/beautyclaw-deployment.md`

## 已完成的阶段性成果

### 1. 工作台产品边界

已明确第一期范围：

- 登录
- 对话
- 历史
- 任务
- 看板
- 频道 / 链接
- 技能
- 记忆
- 用量

暂不做：

- 多租户
- 注册邀请
- 支付套餐
- 团队管理后台
- 用户自带模型 Key
- 完整 Skill 市场
- PostgreSQL 生产迁移

详细背景见：

- `Product-Spec.md`
- `DEV-PLAN.md`
- `开发过程/000_Roadmap.md`

### 2. 品牌替换

当前前端品牌已改成：

```text
BeatyClaw 数字员工
```

已替换位置：

- 页面标题
- 登录页标题
- 侧边栏品牌名
- 主头像资源 `/logo.png`
- 聊天助手头像
- 空会话头像
- 中文 / 英文基础 i18n 标题文案

头像来源：`/Users/subai/A/A_subai/AIcode/Test/Agent/Test0.02coco/中转/6b1403cc-79ae-44f0-83ed-227bc3fe0433.png`

### 3. 登录

已完成单用户登录：

- 登录接口：`/api/yoyoo/auth/login`
- 当前线上账号由 owner 配置控制。
- 未登录不能进入工作台。
- 登录后默认进入对话页。
- 登出后清理本地状态并回到登录页。

### 4. 对话 / 历史

保留现有 Hermes-compatible 聊天与历史能力，同时逐步接入 Agentic runtime。

当前状态：

- 工作台对话页可用。
- 历史会话可查看。
- 会话搜索可用。
- 对话接口已通过 Runtime SDK 调用部署级 Runtime provider。默认仍是 `zylos-main -> worker-bot -> GPT-5.5`，也可部署为 `openai-direct` 直连 OpenAI-compatible API。

### 5. 任务 / 看板

已保留并验证 Kanban / task 能力。

当前能力：

- 看板页面可用。
- Kanban service 有测试覆盖。
- hxa-main 能创建和驱动任务。
- worker-bot 能消费任务并返回执行结果。

### 6. hxa-connect / zylos-main / worker-bot 链路

已从最小主 Agent 推进到多 Agent 执行链路：

```text
BeatyClaw / Agentic
→ zylos-main
→ hxa-connect
→ worker-bot
→ GPT-5.5
→ 返回
```

阶段性完成：

- `zylos-main` 不再只是直接 GPT 回复。
- 已接入 worker-bot 执行路径。
- 已有 hxa-main runtime 测试。
- 已有 hxa-connect API 测试。

## 频道 / 连接器进度

频道页是当前产品最重要的外部入口。当前页面顶部有“外部连接器概览”，底部保留详细平台配置。

### Web 对话：已接入统一 Conversation Hub

当前状态：本地代码、构建和线上 Web 页面级验收已完成。

已完成：

- Web 聊天框不再绕过产品消息层。
- Web 入站消息进入 BeatyClaw Conversation Hub。
- Conversation Hub 复用前端传入的 `session_id`，避免 Web 历史产生另一套隐藏会话。
- Conversation Hub 写入用户消息、AI 回复、usage 和 runtime trace。
- Socket.IO 仍向前端发送 `run.started`、`message.delta`、`run.completed` / `run.failed`，保持聊天 UI 的即时反馈。
- 历史 / 监控详情接口返回 `runtime_trace`，前端可看到：
  - 来源渠道，例如 Web / 微信 / Telegram / 飞书
  - AI 层 provider，例如 zylos
  - Runtime model，例如 hxa:zylos-main
  - 是否派发 worker-bot
  - 调用状态 / 错误

2026-05-17 稳定层补强：

- DB-backed conversation detail 会稳定返回 `runtime_trace`。
- Conversation Monitor 里不再只显示技术字段，而是显示“来源 / AI 层 / 模型 / Worker / 状态”的产品化文案。
- 默认 Web 历史接口已经覆盖微信渠道会话，真实微信消息会进入同一套产品历史。

正式流程：

```text
Web Chat
→ ChatRunSocket
→ BeatyClaw Conversation Hub
→ Runtime SDK
→ 部署级 Runtime provider
→ ChatRunSocket events
→ Web 回复 + Web 历史追踪
```

关键实现：

- `packages/server/src/services/hermes/chat-run-socket.ts`
- `packages/server/src/services/agentic/conversation-hub.ts`
- `packages/server/src/controllers/hermes/sessions.ts`
- `packages/client/src/components/hermes/chat/ConversationMonitorPane.vue`

### 微信：已跑通真实闭环

当前状态：已配置，runtime 运行中。

已完成：

- 微信扫码绑定。
- 微信账号配置保存。
- Agentic 微信 runtime 长轮询。
- 微信消息进入 BeatyClaw Conversation Hub。
- Conversation Hub 写入产品会话，再通过 Runtime SDK 调用部署级 Runtime provider。
- Agentic 把回复发回微信。
- 用户已经在微信里看到回复。

正式流程：

```text
微信
→ Agentic weixin-runtime
→ BeatyClaw Conversation Hub
→ Runtime SDK
→ 部署级 Runtime provider
→ Agentic weixin-runtime
→ 微信回复
```

关键实现：

- `packages/server/src/services/agentic/weixin-runtime.ts`
- `packages/server/src/controllers/hermes/weixin.ts`
- `packages/server/src/routes/hermes/weixin.ts`
- `packages/client/src/views/hermes/ChannelsView.vue`

## Runtime Provider 部署配置

BeatyClaw 的定位是产品层，不把 AI 能力层写死在产品代码里。底部 AI Runtime 由部署配置决定，终端用户不在页面里切换 Runtime。

当前支持：

```env
BEATYCLAW_RUNTIME_PROVIDER=none
# 默认：只运行 BeatyClaw 产品端，等待安装 AI 引擎

BEATYCLAW_RUNTIME_PROVIDER=zylos
# 安装 zylos 引擎后，复用 hxa-connect / zylos-main / worker-bot 链路

BEATYCLAW_RUNTIME_PROVIDER=openai-direct
# 直连 OpenAI-compatible API，用于证明 BeatyClaw 可以脱离 Zylos 独立运行
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=...
AGENTIC_DEFAULT_MODEL=gpt-5.5
```

状态接口：

```text
GET /api/hermes/runtime/status
```

该接口用于部署后确认当前是产品端 `none`，还是已接入 `zylos`、`openai-direct`、后续的 `hms` / `openclaw`。返回字段包括：

- `provider`：当前部署选择的 Runtime provider。
- `runtime.available` / `runtime.mode`：当前 Runtime 是否可用。
- `runtime.missingConfig`：缺失的关键环境变量。
- `runtime.checks`：每个关键配置项的检查结果。

前端 `AI 引擎` 页面显示当前引擎和 COCO / HMS / OpenClaw 卡槽；`链接 / 频道` 页面显示当前 AI 引擎状态。

### Runtime 运行时编排

线上 `zylos / COCO` 引擎不是单个进程，而是三段链路：

```text
agentic 产品容器
→ hxa-connect 消息总线
→ hxa-worker-bot 执行 bot
→ GPT-5.5 / OpenAI-compatible API
```

服务器脚本：

```bash
./scripts/runtime-stack.sh status
./scripts/runtime-stack.sh healthcheck
./scripts/runtime-stack.sh recover
./scripts/runtime-stack.sh restart
```

脚本职责：

- `runtime-stack.sh`：统一启动、恢复、重启 `hxa-connect` 和 `hxa-worker-bot`，产品容器 `agentic` 不会被 `stop` 动作关闭。
- `runtime-healthcheck.sh`：一条命令检查容器、共享数据目录、token 身份隔离、hxa-connect 健康、产品端接口和运行时诊断接口。

线上关键目录：

```text
/home/ubuntu/agent-stack/agentic-hermes  -> /home/agent/.hermes
/home/ubuntu/agent-stack/agentic-webui   -> /home/agent/.hermes-web-ui
/home/ubuntu/agent-stack/hxa-connect     -> hxa-connect compose 目录
/home/ubuntu/agent-stack/hxa-worker-bot/.env
```

token 分工：

- `AGENTIC_HXA_TOKEN`：BeatyClaw 产品端入口 bot，用来把用户消息发给 `zylos-main`。
- `ZYLOS_MAIN_HXA_TOKEN`：`zylos-main` 的 bot 身份。
- `hxa-worker-bot/.env` 里的 `HXA_TOKEN`：`worker-bot` 的 bot 身份。

这三个身份不能混用，否则会出现“页面正常，但消息进入不了真实多 Agent 链路”的问题。

真实切换验收：

```bash
# openai-direct 验收
BEATYCLAW_RUNTIME_PROVIDER=openai-direct
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_KEY=...
AGENTIC_DEFAULT_MODEL=gpt-5.5

# zylos 回归
BEATYCLAW_RUNTIME_PROVIDER=zylos
AGENTIC_HXA_RUNTIME_ENABLED=1
AGENTIC_HXA_TOKEN=...
AGENTIC_HXA_BASE_URL=http://127.0.0.1:4800
```

验收记录：

- 本地：默认 `none` 状态检查返回 `not_configured` 和 `AI_ENGINE`，产品端保持可用；`openai-direct` 状态检查可识别为 `active`，但当前 shell 中的 API Key 请求返回 `INVALID_API_KEY`。
- 服务器：`openai-direct` 使用服务器容器环境完成真实调用，返回 `BeatyClaw openai-direct 服务器验收通过。`
- 服务器：默认 `zylos` 使用 hxa/zylos-main 完成真实调用，返回 `BeatyClaw zylos 回归验收通过`。

### Telegram：代码完成，等待真实 Bot Token

当前状态：runtime 已接入，线上未配置真实 `TELEGRAM_BOT_TOKEN`。

已完成：

- 复用现有 Telegram Bot Token 配置入口。
- `Agentic` 启动时读取 `TELEGRAM_BOT_TOKEN`。
- 保存 Token 后 runtime 热启动，不需要重启容器。
- Telegram Bot API `getUpdates` 长轮询代码已接入。
- Telegram Bot API `sendMessage` 回复代码已接入。
- 入站消息会先进入 BeatyClaw Conversation Hub，写入产品会话，再通过 Runtime SDK 调用部署级 Runtime provider。
- `/api/hermes/telegram/status` 已上线。
- 频道页 Telegram 卡片接入 runtime 状态。
- 假 Token 负向验证通过：保存后 runtime 启动，并正确显示 Telegram `401 Unauthorized`，清空后无残留。

未完成：

- 缺真实 Telegram Bot Token。
- 还没有真实 Telegram 消息进入 Conversation Hub / Runtime SDK 的证据。
- 还没有真实 Telegram 回复发回客户端的证据。
- 频道页还不能显示 Telegram `已连接，runtime 运行中`。

真实验收步骤：

1. 在频道页 Telegram 卡片保存真实 Bot Token。
2. 调用 `/api/hermes/telegram/status`，确认：
   - `configured=true`
   - `runtime.running=true`
   - `runtime.bot_username` 有值
   - `runtime.last_error` 为空
3. 用 Telegram 给该 bot 发消息。
4. 确认：
   - `messages_received` 增加
   - `messages_forwarded` 增加
   - `replies_sent` 增加
5. 检查 Telegram 客户端收到回复。
6. 频道页 Telegram 卡片显示 `已连接，runtime 运行中`。

关键实现：

- `packages/server/src/services/agentic/telegram-runtime.ts`
- `packages/server/src/controllers/hermes/telegram.ts`
- `packages/server/src/routes/hermes/telegram.ts`
- `packages/server/src/controllers/hermes/config.ts`
- `tests/server/telegram-runtime.test.ts`

### 飞书：配置入口保留，runtime 未接

当前状态：保留 App ID / App Secret 配置入口，暂未接真实运行时。

原因：

- 飞书需要开放平台应用、事件订阅、回调地址、challenge 校验、权限配置。
- 比 Telegram 更适合在微信和 Telegram 闭环稳定后接入。

### 其他平台

页面中仍保留：

- Discord
- Slack
- WhatsApp
- Matrix
- WeCom

这些目前主要是原 Hermes/Yoyoo 的配置入口，不等于已完成真实收发 runtime。

## 我们研究后的判断

### Zylos / COCO / hxa-connect 的关系

当前理解：

- COCO 更像完整商业产品，有官网、注册登录、支付、文档、案例和 FAQ。
- Zylos 更像产品底层和能力集合，有多平台连接器和 Agent runtime 能力，但不是完整运营型 SaaS。
- hxa-connect 是多 Agent 消息总线，负责 agent 和 agent 之间通信，不负责微信 / Telegram / 飞书平台适配。
- OpenClaw 更偏执行器 / browser automation，不是当前 BeatyClaw 工作台的产品入口。
- Hermes Web UI / Yoyoo0.1 是工作台 UI 底座。

所以当前路线不是“重写 COCO”，而是：

```text
用 Yoyoo0.1 的前端工作台
接入 Zylos / hxa-connect / worker-bot 的后端能力
逐步恢复 COCO 类产品体验
```

### 为什么先微信，再 Telegram，再飞书

微信优先：

- 当前项目已有微信二维码和保存配置接口。
- 已完成真实消息闭环。
- 最贴近国内用户工作流。

Telegram 第二：

- 技术链路轻，只需要 Bot Token。
- `getUpdates` + `sendMessage` 适合快速验证第二个外部入口。
- 当前代码已完成，只等真实 Token。

飞书第三：

- 企业场景价值高。
- 但开放平台配置和回调验证成本更高。

## 当前线上状态

线上地址：

```text
https://agent.aibosss.com
```

已部署：

- `agentic` 容器
- `hxa-connect` 容器
- `zylos` 容器
- `hxa-worker-bot` 容器

已验证：

- `/health` 可访问。
- 微信 runtime 运行中。
- 微信真实消息已收到回复。
- Telegram status 接口可访问，但因无真实 Token 显示未配置。
- 频道页已显示：`微信已跑通完整闭环；Telegram runtime 已接入，保存 Bot Token 后启动；飞书保留配置入口。`

## 本地开发

安装依赖：

```bash
npm install
```

开发启动：

```bash
npm run dev
```

构建：

```bash
npm run build
```

常用测试：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts
```

Runtime 状态和切换相关测试：

```bash
npm run test -- tests/server/runtime-sdk.test.ts tests/server/runtime-controller.test.ts tests/client/runtime-api.test.ts tests/client/channels-runtime-status.test.ts tests/server/conversation-hub.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts
```

第一版真实消息闭环相关测试：

```bash
npm run test -- tests/server/conversation-hub.test.ts tests/server/conversation-hub-web-history.test.ts tests/server/runtime-sdk.test.ts tests/server/runtime-controller.test.ts tests/server/weixin-runtime.test.ts tests/server/telegram-runtime.test.ts tests/client/runtime-api.test.ts tests/client/channels-runtime-status.test.ts tests/client/conversations-api.test.ts tests/client/conversation-monitor-pane.test.ts
npm run build
```

当前已通过的验证记录：

- Runtime 状态 / 切换：7 个测试文件通过。
- 第一版真实消息闭环：10 个测试文件通过，36 个测试通过。
- `npm run build` 通过。
- Docker 镜像构建通过。
- 线上容器重建通过。
- Dockerfile 默认启动命令已修正，镜像可直接以 `node dist/server/index.js` 启动。

当前部署注意：

- 线上已部署镜像：`agentic-yoyoo-saas:message-loop-cmdfix-20260516230751`。
- Web → Conversation Hub → Runtime SDK → zylos 已完成线上真实验收。
- 微信已重新绑定并完成真实消息闭环验收。
- 微信最新验收链路：`messages_seen=1`、`messages_received=1`、`messages_forwarded=1`、`replies_sent=1`。
- Web 历史已出现 `workspace=channel:weixin` 会话，assistant `runtime_trace.status=ok`，`runtime_provider=zylos`，`runtime_model=hxa:zylos-main`。
- 线上 `.env` 已固化 `AGENTIC_HXA_RUNTIME_ENABLED=1`、`BEATYCLAW_RUNTIME_PROVIDER=zylos`，HXA token 使用 `agentic-client` bot token，不再使用 admin secret。

## 部署说明

当前部署方式是构建 Docker 镜像：

```bash
docker build -t agentic-yoyoo-saas:latest .
```

线上 `agentic` 容器使用：

- `dist/server/index.js`
- 端口：`3457`
- 反代域名：`https://agent.aibosss.com`
- Hermes 数据挂载：`/home/agent/.hermes`
- Web UI 数据挂载：`/home/agent/.hermes-web-ui`

注意：

- Dockerfile 已覆盖基础镜像的入口为 `node`，默认命令为 `dist/server/index.js`；手动 `docker run` 时不需要再额外补启动命令。
- 不要提交 `.env`、`hermes_data/`、`data/`、`dist/`、`node_modules/`。
- 不要把服务器密码、OpenAI Key、Telegram Token、微信 Token 写进代码或 README。
- README 只记录状态和验收方式，不记录真实密钥。

### 运行时恢复

当线上出现“发消息只返回 AI 能力端不可用”或“新建员工后没有真实回复”时，先不要改业务代码，按下面顺序排查：

```bash
cd /home/ubuntu/agent-stack/agentic-build-current
./scripts/runtime-stack.sh status
./scripts/runtime-stack.sh healthcheck
```

如果 `hxa-connect` 或 `hxa-worker-bot` 掉线，执行：

```bash
./scripts/runtime-stack.sh recover
```

如果需要带登录态检查完整 Runtime 诊断：

```bash
AGENTIC_DEPLOY_VERIFY_EMAIL=... \
AGENTIC_DEPLOY_VERIFY_PASSWORD=... \
./scripts/runtime-stack.sh healthcheck
```

## 关键目录

```text
packages/client/src/views/hermes/ChannelsView.vue      频道页主界面
packages/client/src/components/layout/AppSidebar.vue   左侧导航品牌
packages/client/public/logo.png                        当前头像/logo
packages/server/src/services/agentic/weixin-runtime.ts 微信 runtime
packages/server/src/services/agentic/telegram-runtime.ts Telegram runtime
packages/server/src/controllers/hermes/config.ts       平台凭据保存
packages/server/src/controllers/hermes/weixin.ts       微信状态/二维码/保存
packages/server/src/controllers/hermes/telegram.ts     Telegram 状态
scripts/runtime-stack.sh                               AI 引擎侧车编排
scripts/runtime-healthcheck.sh                         线上 Runtime 链路自检
tests/server/weixin-runtime.test.ts                    微信 runtime 测试
tests/server/telegram-runtime.test.ts                  Telegram runtime 测试
开发过程/010_Connectors_Runtime.md                      连接器实现过程记录
```

## 下一步建议

### P0：Telegram 真实闭环

阻塞项：真实 Telegram Bot Token。

拿到 Token 后立即验收：

```text
Telegram -> BeatyClaw Conversation Hub -> Runtime SDK -> 部署级 Runtime provider -> Telegram 回复
```

### P1：飞书 runtime

接入飞书需要先准备：

- 飞书开放平台应用
- App ID / App Secret
- 事件订阅
- 回调地址
- challenge 校验
- 权限配置

### P1：频道页产品化

继续优化：

- 连接器状态分级：未配置 / 已保存 / 运行中 / 错误。
- 错误说明更人话。
- 密钥只在点击配置时显示输入框。
- 顶部概览继续只显示系统级状态。

### P2：SaaS 化

后续再做：

- 多用户 / 多租户
- 计费和用量额度
- 团队空间
- 用户自助配置渠道
- 更完整的 Skill 安装和管理
- PostgreSQL 生产化迁移

## 当前交接结论

BeatyClaw 数字员工已经不是原版 Hermes Web UI demo，而是一个正在形成闭环的单用户 AI 工作台：

- UI 工作台已经可用。
- 微信真实闭环已经跑通。
- 产品端已从 hxa / zylos-main / worker-bot / GPT-5.5 中解耦，默认以 `none` AI 引擎卡槽模式运行。
- Telegram runtime 已完成到等待真实 Token 的阶段。
- 飞书和其他平台保留配置入口，后续按优先级接 runtime。

接手同事优先看：

1. `README.md`
2. `Product-Spec.md`
3. `DEV-PLAN.md`
4. `开发过程/010_Connectors_Runtime.md`
5. `packages/server/src/services/agentic/weixin-runtime.ts`
6. `packages/server/src/services/agentic/telegram-runtime.ts`
7. `packages/client/src/views/hermes/ChannelsView.vue`
