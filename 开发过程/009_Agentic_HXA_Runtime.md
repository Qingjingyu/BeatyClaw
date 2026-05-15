# 009 Agentic HXA Runtime

## 背景

Agentic 聊天页此前是：

```text
用户 -> Agentic -> GPT-5.5 -> Agentic -> 用户
```

这能对话，但不是正式多 Agent 流程。正式流程应该先进入 `zylos-main`，再由 hxa-connect 分发给其他 Agent。

## 本次目标

把 Agentic 后端 runtime 改成可切换：

```text
用户 -> Agentic -> hxa-connect -> zylos-main -> Agentic -> 用户
```

如果 hxa runtime 没配置，则保留原来的 GPT-5.5 直连能力，避免线上断聊。

## 实现

- 新增 hxa 主 Agent 调用函数：发送消息到 `AGENTIC_HXA_MAIN_BOT`。
- 发送后轮询同一个 hxa DM channel，等待 `zylos-main` 回复。
- Chat Socket 在 hxa runtime 可用时优先返回 hxa 回复。
- 新增最小 `zylos-main` 常驻 runtime：收到 hxa 消息后，用 GPT-5.5 生成回复并通过 hxa 发回入口 Bot。
- 线上新增 `agentic-client` Bot，作为 Agentic 用户入口身份，避免复用 `worker-bot` 导致自动回执噪音。
- `zylos-main` 已升级为最小真实调度：收到 `agentic-client` 消息后，先向 `worker-bot` 发送带 trace id 的任务，等待 `[worker-reply]`，再用 GPT-5.5 汇总回复用户。
- hxa token 只在服务端环境变量里读取，不进入前端。

## 环境变量

```text
AGENTIC_HXA_RUNTIME_ENABLED=1
AGENTIC_HXA_BASE_URL=https://agent.aibosss.com/hxa
AGENTIC_HXA_TOKEN=...
AGENTIC_HXA_MAIN_BOT=zylos-main
AGENTIC_HXA_REPLY_TIMEOUT_MS=20000
AGENTIC_HXA_POLL_INTERVAL_MS=1000
ZYLOS_MAIN_RUNTIME_ENABLED=1
ZYLOS_MAIN_HXA_BASE_URL=https://agent.aibosss.com/hxa
ZYLOS_MAIN_HXA_TOKEN=...
ZYLOS_MAIN_BOT_NAME=zylos-main
ZYLOS_MAIN_WORKER_BOT=worker-bot
ZYLOS_MAIN_WORKER_TIMEOUT_MS=10000
ZYLOS_MAIN_WORKER_POLL_INTERVAL_MS=1000
ZYLOS_MAIN_KANBAN_BOARD=default
ZYLOS_MAIN_MODEL=gpt-5.5
```

## 当前风险

当前 `zylos-main` runtime 已经会调度 `worker-bot`，但 worker 仍是第一版简单自动回复，不具备真正工具执行能力。

线上当前 Bot 分工：

- `agentic-client`：Agentic 聊天入口身份，只负责把用户消息送入 hxa。
- `zylos-main`：主 Agent，负责接收入口消息并回复。
- `worker-bot`：协作 Agent，后续用于任务分发和执行。

## 验证

```bash
npm run test -- tests/server/agentic-runtime.test.ts
npm run build
```

线上验证：

- `agentic-client` 注册成功，并保存 token 到服务器 secrets。
- Agentic 容器 `AGENTIC_HXA_TOKEN` 已切换为 `agentic-client`。
- 公网 Socket 聊天验证通过，`run_id` 为 `hxa_...`。
- hxa 数据库最新消息发送者为 `agentic-client`，回复者为 `zylos-main`。

## Worker Dispatch 修复

第一次实现时，`zylos-main` 发给 `worker-bot` 的任务文案里包含 `[worker-reply]` 字样。现有 `worker-bot` 为了避免消息循环，会跳过任何包含 `[worker-reply]` 的消息，所以第一轮验证出现 worker 超时。

修复：

- `zylos-main` 发送任务时只保留 `[agentic-task:<traceId>]`。
- 不再在任务正文里出现 `[worker-reply]`。
- `zylos-main` 通过 trace id 匹配 `worker-bot` 的自动回执。

修复后公网验证通过：

```text
agentic-client -> zylos-main -> worker-bot -> zylos-main -> Agentic
```

hxa 数据库中可见：

- `agentic-client` 发出用户请求
- `zylos-main` 发出 `[agentic-task:...]`
- `worker-bot` 返回 `[worker-reply] 收到：[agentic-task:...]`
- `zylos-main` 汇总后返回用户

## Kanban Task Capture

在 worker 调度跑通后，`zylos-main` 增加了第一版任务沉淀能力：

- 对明显是任务/待办/安排/拆解类的用户请求，自动创建 Hermes Kanban 任务。
- 默认写入 `default` 看板，避免服务器上没有独立 `agentic` 看板时导致失败。
- 任务正文保留来源、用户原始请求和 worker-bot 返回。
- 创建失败不会阻断聊天回复，只记录服务端日志。
- GPT-5.5 汇总上下文里会带上任务 ID 和看板名，方便用户知道已经沉淀到看板。
- Docker 环境必须使用 `HERMES_BIN=/opt/hermes/.venv/bin/hermes`，不能指向 `/opt/hermes/hermes`，后者缺少 Python venv 依赖。
- 如果 GPT-5.5 临时 429 或不可用，`zylos-main` 会返回 worker-bot 和看板任务的兜底结果，避免聊天主链路超时无响应。

当前边界：

- 这是规则识别，不是完整意图分类器。
- worker-bot 仍没有真正执行工具，只是把对话任务先变成可追踪的看板任务。

验证结果：

```text
用户消息 -> agentic-client -> zylos-main -> worker-bot -> Hermes Kanban -> zylos-main -> Agentic
```

线上验证通过：

- 公网 Socket 对话返回 `run_id=hxa_...`。
- 返回内容包含任务 ID：`t_cd14c2ab`。
- `hermes kanban --board default list --json` 可查到该任务。
- 任务状态为 `ready`，负责人为 `worker-bot`，tenant 为 `agentic`。

## Kanban Completion Loop

任务沉淀后，`zylos-main` 已继续补上第一版执行回写闭环：

```text
用户消息 -> zylos-main 创建 Kanban 任务 -> zylos-main 带任务 ID 分发给 worker-bot -> worker-bot 回复 -> zylos-main complete Kanban 任务 -> 回复用户
```

实现决策：

- 先由 `zylos-main` 创建和完成 Kanban 任务，因为 `worker-bot` 独立容器当前没有 Hermes CLI 环境。
- worker 任务正文会带上 `kanban_task_id` 和 `kanban_board`，后续 worker 独立接管 CLI 时可直接复用协议。
- worker 返回后，`zylos-main` 调用 `hermes kanban complete`，把任务状态标记为 `done`。
- 如果 complete 失败，只记录服务端日志，不阻断聊天回复。

线上验证通过：

- 新建任务：`t_d015920c`
- 最终状态：`done`
- runs 中可见 `profile=worker-bot`、`status=completed`、`outcome=completed`

当前边界：

- 这仍然不是 worker-bot 独立领取任务执行，而是 `zylos-main` 代替 worker 写回 Kanban。
- 下一步要把 `/home/ubuntu/agent-stack/hxa-worker-bot` 升级为带 Hermes CLI 环境或 HTTP 回写能力的正式 worker。

## Worker Independent Kanban Completion

本轮继续把 Kanban 完成动作从 `zylos-main` 下放给 `worker-bot`：

```text
用户消息
-> Agentic
-> hxa-connect
-> zylos-main 创建 Kanban 任务
-> zylos-main 把 kanban_task_id / kanban_board 发给 worker-bot
-> worker-bot 调用 Hermes CLI complete 任务
-> worker-bot 回复 kanban_status=done
-> zylos-main 识别 worker 已完成，不再代完成
-> Agentic 回复用户
```

实现决策：

- `worker-bot` 线上容器改为使用 `agentic-yoyoo-saas:latest` 镜像，保证容器内有 Node runtime 和 Hermes CLI。
- `worker-bot` 挂载 Agentic 的 Hermes 数据目录，共享同一套 Kanban 状态。
- worker 协议继续复用 `kanban_task_id=` 和 `kanban_board=`，避免额外设计一套任务通信协议。
- `zylos-main` 保留兜底能力：如果 worker 没有返回 `kanban_status=done`，主 Agent 仍可代完成，避免任务卡死。
- 如果 worker 已返回 `kanban_status=done`，`zylos-main` 会跳过 `completeTasks`，防止重复写 run。

线上验证通过：

- 对话返回 `run_id=hxa_b39302ac-05cb-4d89-adeb-008101704710_fa81b69d-e0b5-4f84-8fe4-f8e7df6f072f`。
- 创建任务：`t_2cb7251e`。
- worker 日志显示：`completed kanban task t_2cb7251e on board default`。
- Kanban 明细显示任务状态为 `done`。
- Kanban runs 显示 `profile=worker-bot`、`status=completed`、`outcome=completed`。
- 用户侧最终回复包含任务 ID、看板名和 `done` 状态。

本地验证：

```bash
npm run test -- tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 5 个测试文件、34 个测试通过。
- TypeScript / Vite / Server build 通过。

当前边界：

- 线上 worker-bot 脚本仍在服务器 `/home/ubuntu/agent-stack/hxa-worker-bot/bot.js`，下一步应该把它正式纳入仓库，避免部署逻辑只存在服务器上。
- worker 现在能完成 Kanban 写回，但还没有真正执行复杂工具链，比如调用外部 API、读写业务连接器或拆多个子任务。

## Worker Bot Repository Integration

本轮把原先只存在于服务器 `/home/ubuntu/agent-stack/hxa-worker-bot/bot.js` 的 worker 能力收进了本地仓库。

新增结构：

```text
packages/worker-bot/src/
  hxa-client.ts        # 内置 HXA HTTP + WebSocket 客户端
  index.ts             # worker-bot 运行入口
  kanban-worker.ts     # Kanban 协议解析、摘要清洗、complete 调用
packages/worker-bot/tsconfig.json
tests/worker-bot/kanban-worker.test.ts
scripts/build-worker-bot.mjs
```

实现决策：

- 不再依赖服务器上手写的 `bot.js` 作为唯一来源。
- worker-bot 编译产物进入 `dist/worker-bot/index.js`。
- Docker 镜像同时包含 Agentic 主服务和 worker-bot，主服务运行 `dist/server/index.js`，worker 运行 `dist/worker-bot/index.js`。
- `docker-compose.yml` 增加 worker profile，方便本地或单机部署时按需启动 worker。
- HXA 客户端先内置最小能力：`/api/ws-ticket`、`/ws`、`/api/me`、`/api/send`，避免依赖未写入本项目依赖表的外部 SDK。

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts
npm run build
```

结果：

- 3 个测试文件、32 个测试通过。
- worker-bot 类型检查通过。
- 构建产物包含 `dist/worker-bot/index.js`。

线上验证：

- `agentic` 容器命令：`node dist/server/index.js`。
- `hxa-worker-bot` 容器命令：`node dist/worker-bot/index.js`。
- 对话验证返回 `run_id=hxa_b39302ac-05cb-4d89-adeb-008101704710_81d72a5e-dc7c-4d89-820a-8c9e605044a5`。
- 创建并完成任务：`t_788cd303`。
- worker 日志显示：`completed kanban task t_788cd303 on board default`。
- Kanban 明细显示任务状态为 `done`。
- Kanban runs 显示 `profile=worker-bot`、`status=completed`、`outcome=completed`。

当前边界：

- worker-bot 现在具备“收到任务 -> 完成 Kanban 写回”的正式仓库能力。
- worker 还没有真正执行外部工具或业务连接器，只是完成了任务生命周期闭环。
- 下一步可以继续恢复 COCO 类产品能力：连接器配置、技能安装、任务拆解执行、用量统计和前端状态联动。

## Kanban Split Skill

本轮把 worker-bot 从“完成父任务”升级为具备第一个内置执行技能：`kanban.split`。

目标：

```text
用户在 Agentic 聊天框说“帮我把 X 拆成任务”
-> zylos-main 创建父任务
-> worker-bot 识别拆解意图
-> worker-bot 创建 3-5 个子任务
-> 子任务通过 Hermes Kanban parent 关系挂到父任务下
-> worker-bot complete 父任务
-> zylos-main 返回父任务、子任务、状态、下一步
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `shouldSplitKanbanTask`
  - 新增 `buildSplitPlan`
  - 新增 `splitKanbanTask`
  - 新增 `buildSplitWorkerReply`
- `packages/worker-bot/src/index.ts`
  - 收到任务后先判断是否触发 `kanban.split`
  - 命中时执行 `hermes kanban create --parent <parentId> --json`
  - 创建完成后执行 `hermes kanban complete <parentId> --summary ...`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - 新增 `buildDeterministicReply`
  - 对 `worker_skill=kanban.split` 的回复使用确定性总结，减少 GPT 格式漂移

线上验证通过：

- 对话 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_86d50779-538c-412c-abdf-fab2e8359530`
- 用户请求：`帮我把 Agentic 登录、对话、任务看板、技能和用量拆成任务`
- 父任务：`t_bc814161`
- 父任务状态：`done`
- 子任务：
  - `t_4ec11928` / `1. Agentic 登录` / `ready`
  - `t_d3873250` / `2. 对话` / `ready`
  - `t_b11ea7a2` / `3. 任务看板` / `ready`
  - `t_1d004841` / `4. 技能` / `ready`
  - `t_fc5c4e36` / `5. 用量` / `ready`
- 父任务 `children` 字段已关联以上 5 个子任务。
- worker 日志显示：`split kanban task t_bc814161 into 5 children on board default`。

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 6 个测试文件、42 个测试通过。
- `npm run build` 通过。

当前边界：

- `kanban.split` 目前是规则式拆解，不调用 LLM 做复杂规划。
- 子任务会创建并关联父任务，但不会自动继续逐个执行子任务。
- 下一步可以把子任务执行接入 worker 调度，或者先做 `memory.write` / `skill.run` 这类第二个内置技能。

## First Child Execution Loop

本轮继续把 `kanban.split` 从“只拆任务”推进到“拆完后先执行第一步”的最小闭环。

目标：

```text
用户在 Agentic 聊天框说“帮我把 X 拆成任务并先执行第一步”
-> zylos-main 创建父任务
-> worker-bot 执行 kanban.split
-> worker-bot 创建 3-5 个子任务
-> worker-bot complete 父任务，释放子任务依赖
-> worker-bot complete 第一个子任务
-> 其他子任务保持 ready
-> 聊天框返回父任务、已执行第一步、剩余任务和下一步
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `shouldExecuteFirstChildTask`
  - `splitKanbanTask` 在识别“先执行第一步”后，会先 complete 父任务，再 complete 第一个子任务
  - `buildSplitWorkerReply` 增加：
    - `executed_child_task=...`
    - `executed_child_result=...`
    - `remaining_child_tasks:`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - `buildDeterministicReply` 解析已执行子任务和剩余子任务
  - 聊天框返回中明确展示“已执行第一步”和“剩余子任务”

关键修复：

- 第一版线上验证发现：如果先 complete 子任务，再 complete 父任务，Hermes Kanban 会因为父任务依赖未释放，导致第一个子任务仍停在 `ready`。
- 修复后执行顺序改为：

```text
create children -> complete parent -> complete first child
```

线上验证通过：

- 对话 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_963df912-5cad-4b02-a6e1-e94c615aac81`
- 用户请求：`帮我把 Agentic 登录、对话、任务看板拆成任务并先执行第一步`
- 父任务：`t_12f415de` / `done`
- 第一个子任务：`t_10a73e3a` / `1. Agentic 登录` / `done`
- 剩余子任务：
  - `t_cf1cf38d` / `2. 对话` / `ready`
  - `t_e69f55fe` / `3. 任务看板` / `ready`
- 父任务 `children` 字段已关联 3 个子任务。
- 第一个子任务 `parents` 字段已关联父任务。
- worker 日志显示已返回 `executed_child_task`、`executed_child_result` 和 `remaining_child_tasks`。

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 6 个测试文件、45 个测试通过。
- `npm run build` 通过。

当前边界：

- 第一子任务执行仍是最小模拟执行，summary 说明“已完成最小可验收动作”。
- 暂不执行所有子任务。
- 暂不接外部连接器或复杂工具调用。

## Worker status.check Skill

本轮把“先执行第一步”从模拟 summary 升级为第一个真实工具型 skill：`status.check`。

目标：

```text
用户在 Agentic 聊天框说“帮我把 X 拆成任务并先执行第一步”
-> zylos-main 创建父任务
-> worker-bot 执行 kanban.split
-> worker-bot 创建子任务
-> worker-bot 对第一个子任务执行 status.check
-> status.check 调用 Hermes CLI 检查看板可访问性
-> worker-bot complete 父任务和第一个子任务
-> 聊天框返回执行技能、检查结果和剩余子任务
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `runStatusCheck`
  - `splitKanbanTask` 在“先执行第一步”时调用 `hermes kanban --board <board> list --json`
  - 第一个子任务 summary 现在包含：
    - HXA 已连接为 `worker-bot`
    - Hermes CLI 可调用
    - Kanban board 可访问
    - 当前 board 返回任务数量
  - worker reply 增加 `executed_child_skill=status.check`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - `buildDeterministicReply` 解析 `executed_child_skill`
  - 聊天框返回中展示“执行技能：status.check”

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 2 个核心测试文件、20 个测试通过。
- 6 个回归测试文件、45 个测试通过。
- `npm run build` 通过。

线上验证：

- 已部署到 `agent.aibosss.com`。
- `agentic` 容器命令：`node dist/server/index.js`。
- `hxa-worker-bot` 容器命令：`node dist/worker-bot/index.js`。
- 公网 Socket 对话验证通过：
  - run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_7be767d3-8872-444a-94fe-4c0542fedfd5`
  - 父任务：`t_bcbebd90` / `done`
  - 第一个子任务：`t_a82a3a9d` / `done`
  - 剩余子任务：
    - `t_8655a102` / `2. 对话链路` / `ready`
    - `t_8400984e` / `3. 看板写回` / `ready`
- 聊天框返回包含：
  - `执行技能：status.check`
  - `HXA：已连接为 worker-bot`
  - `Hermes CLI：可调用`
  - `Kanban：default 可访问`
- Kanban 第一个子任务 `latest_summary` 已写入真实检查结果。

当前边界：

- `status.check` 是第一个真实工具型 skill，但它只检查 Agentic / HXA / Hermes Kanban 基础链路。
- 暂不检查微信、飞书、Telegram 等外部连接器。
- 暂不执行所有子任务。

## Worker kanban.execute_next Skill

本轮把“继续执行剩余任务”接入 worker-bot，形成父任务下的下一步执行闭环。

目标：

```text
用户在 Agentic 聊天框说“继续执行剩余任务”
-> zylos-main 创建/定位本次看板任务上下文
-> worker-bot 执行 kanban.execute_next
-> worker-bot 读取父任务 children
-> worker-bot 找到第一个 ready 子任务
-> worker-bot 对该子任务执行 status.check
-> worker-bot complete 该子任务并回写 summary
-> 聊天框返回已执行子任务、执行技能、剩余子任务和下一步
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `shouldExecuteNextKanbanTask`
  - 新增 `executeNextKanbanTask`
  - 新增 `buildExecuteNextWorkerReply`
  - 执行逻辑：
    - `hermes kanban --board <board> show <parentId> --json`
    - `hermes kanban --board <board> list --json`
    - 从父任务 `children` 中挑第一个 `ready` 子任务
    - 执行 `status.check`
    - `hermes kanban complete <childId> --summary ...`
- `packages/worker-bot/src/index.ts`
  - 收到“继续执行剩余任务 / 下一个子任务”类请求时优先执行 `kanban.execute_next`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - `buildDeterministicReply` 新增 `worker_skill=kanban.execute_next` 分支
  - 聊天框返回中展示“已执行下一个子任务”

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 2 个核心测试文件、23 个测试通过。
- 6 个回归测试文件、48 个测试通过。
- `npm run build` 通过。

修复：

- 第一轮线上验证发现，用户说“继续执行剩余任务，父任务是 t_xxx”时，`zylos-main` 会创建一个新的看板任务，而不是把显式父任务 ID 传给 worker。
- 修复后新增 `resolveExplicitKanbanTask`，从用户请求中识别 `t_xxx`，并作为本轮 `kanban_task_id` 传给 worker-bot。

修复后本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 6 个回归测试文件、49 个测试通过。
- `npm run build` 通过。

线上验证：

- 第一轮对话 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_9bc83ac6-4041-471c-aa05-b4ec8fc33a3b`
- 第二轮继续执行 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_a79e4b3f-9040-4c4f-97fb-b5d90be8bde3`
- 父任务：`t_b3cd0ff5` / `done`
- 第一个子任务：`t_71d63ef4` / `done`
- 第二个子任务：`t_69a70691` / `done`
  - latest_summary 包含 `worker-bot 已执行 kanban.execute_next`
  - latest_summary 包含 `worker-bot 已执行 status.check`
- 剩余子任务：`t_a6fdce67` / `ready`

当前边界：

- `kanban.execute_next` 当前执行的是下一个 ready 子任务，不会一次性跑完所有剩余子任务。
- 子任务执行动作目前仍复用 `status.check` 作为真实工具型 skill。
- 还没有把“继续执行”自动绑定到上一轮父任务上下文；当前仍依赖 zylos-main 创建/传入的 `kanban_task_id`。

## Remembered Parent Task Context

本轮继续补上“最近父任务上下文记忆”，让用户不必每次手动带 `t_xxx`。

目标：

```text
用户：帮我把 X 拆成任务并先执行第一步
-> zylos-main 创建父任务并记住它

用户：继续执行剩余任务
-> zylos-main 自动复用最近父任务
-> worker-bot 执行 kanban.execute_next
-> 下一个 ready 子任务完成并回写
```

实现：

- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - 新增 `rememberedKanbanTasks`
  - 新增 `rememberKanbanTaskForSender`
  - 新增 `resolveKanbanTaskForRequest`
  - 新增 `shouldContinueRememberedKanbanTask`
  - 新增 `clearRememberedKanbanTasks` 供测试隔离
- 记忆粒度：
  - 当前按 hxa sender 记忆，例如 `agentic-client`
  - 只记最近一个父任务
  - 显式 `t_xxx` 仍优先于记忆
- 安全边界：
  - 不改 hxa-connect 协议
  - 不改 Hermes Kanban 数据结构
  - 不持久化到数据库，容器重启后记忆会清空

本地验证：

```bash
npm run test -- tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- `hxa-main-runtime` 15 个测试通过。
- 6 个回归测试文件、51 个测试通过。
- `npm run build` 通过。

线上验证：

- 第一轮对话 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_a2ad63a8-5e46-4c84-9e81-438013fa0183`
- 第二轮继续执行 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_93b10880-1134-4d12-81cf-f1a74e65c067`
- 第二轮用户只发送：`继续执行剩余任务`
- zylos-main 自动复用父任务：`t_eaca02e9`
- 父任务：`t_eaca02e9` / `done`
- 第一子任务：`t_01b459c8` / `done`
- 第二轮执行子任务：`t_509ed726` / `done`
  - latest_summary 包含 `worker-bot 已执行 kanban.execute_next`
  - latest_summary 包含 `worker-bot 已执行 status.check`
- 剩余子任务：`t_bbda2d63` / `ready`

当前边界：

- 这是进程内短期记忆，不是长期记忆系统。
- 现在按 `agentic-client` 入口 Bot 记忆；第一期单用户可用，多用户阶段需要按真实用户/session 隔离。
- Hermes 返回的父任务 `children` 顺序不一定等于创建顺序，当前 `kanban.execute_next` 会执行返回顺序里的第一个 `ready` 子任务；后续如果要严格按标题序号执行，需要在 worker 里排序。

## Numbered Child Execution Order

本轮修复 `kanban.execute_next` 的子任务执行顺序。

背景：

- Hermes Kanban 的父任务 `children` 字段返回顺序不一定等于创建顺序。
- 之前 worker-bot 会执行 `children` 返回顺序里的第一个 `ready` 子任务。
- 线上出现过 `children=[1,3,2]` 时，第二轮执行了 `3. 看板写回`，而不是 `2. 对话链路`。

目标：

```text
父任务 children 返回顺序可以乱
worker-bot 必须按子任务标题中的序号执行
例如：
1. 状态检查 done
2. 对话链路 ready
3. 看板写回 ready
=> 下一步必须执行 2. 对话链路
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增标题序号解析逻辑
  - `pickReadyChild` 先过滤 ready 子任务，再按标题开头数字排序
  - 没有数字的标题排到最后
  - 数字相同或缺失时，再按标题和 id 做稳定排序
- `tests/worker-bot/kanban-worker.test.ts`
  - 新增乱序 children 回归测试
  - 覆盖 `children=['child-three','child-two','child-one']` 但必须执行 `2. 对话链路`

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- worker-bot 12 个测试通过。
- 6 个回归测试文件、52 个测试通过。
- `npm run build` 通过。

线上验证：

- 第一轮对话 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_592554cf-b3b3-4a2e-8368-efe4a0f0330b`
- 第二轮继续执行 run：`hxa_b39302ac-05cb-4d89-adeb-008101704710_aa505a2b-3244-4eff-95da-326bd70c1c1b`
- 父任务：`t_40d19ca8` / `done`
- 父任务 children 返回顺序：`t_85a69018`, `t_ef6ef29c`, `t_fe9fd9c6`
- 第一个子任务：`t_fe9fd9c6` / `1. Agentic 状态检查` / `done`
- 第二轮执行子任务：`t_85a69018` / `2. 对话链路` / `done`
- 剩余子任务：`t_ef6ef29c` / `3. 看板写回` / `ready`
- 结论：即使 children 顺序不是 `1,2,3`，worker-bot 也按标题序号执行了 `2. 对话链路`。

当前边界：

- 排序依赖标题前缀数字，例如 `1. xxx`、`2. xxx`。
- 如果未来子任务标题没有序号，需要改为在 task metadata 里保存 step order。

## Persistent Parent Task Context

本轮把“最近父任务上下文记忆”从进程内 Map 升级为可持久化的 runtime 记忆。

背景：

- 之前用户说“继续执行剩余任务”时，`zylos-main` 可以复用上一轮父任务。
- 但这个记忆只存在 Node 进程内。
- 一旦 `agentic` 容器重启，记忆会清空，用户必须重新提供 `t_xxx`。

目标：

```text
用户：帮我把 X 拆成任务并先执行第一步
-> zylos-main 记住父任务并写入本地 JSON

agentic 容器重启

用户：继续执行剩余任务
-> zylos-main 从 JSON 恢复最近父任务
-> worker-bot 继续执行下一个 ready 子任务
```

实现：

- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - 新增 `loadRememberedKanbanTasks`
  - 新增 `persistRememberedKanbanTasks`
  - 新增 `resetRememberedKanbanTaskCacheForTest`
  - `rememberKanbanTaskForSender` 现在会把最近父任务写入 JSON
  - `resolveKanbanTaskForRequest` 在继续执行请求里会懒加载持久化记忆
- 默认存储路径：
  - 优先使用 `ZYLOS_MAIN_TASK_MEMORY_FILE`
  - 未配置时写入 `${HERMES_HOME}/agentic-task-memory.json`
  - 如果 `HERMES_HOME` 未配置，则回退到 `data/hermes/agentic-task-memory.json`
- JSON 结构：

```json
{
  "version": 1,
  "tasksBySender": {
    "agentic-client": {
      "id": "t_xxx",
      "title": "父任务标题",
      "board": "default"
    }
  }
}
```

本地验证：

```bash
npm run test -- tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- `hxa-main-runtime` 16 个测试通过。
- 6 个回归测试文件、53 个测试通过。
- `npm run build` 通过。

当前边界：

- 这是 runtime 级持久化，不是完整长期记忆系统。
- 当前仍按 `agentic-client` 入口身份记忆；第一期单用户可用，多用户阶段需要按真实用户/session 隔离。

## 2026-05-16 Normal Chat Routing Fix

### 背景

线上普通聊天回复质量很差，例如用户发送“你好 / 你是谁”时，系统会先把消息派给 `worker-bot`，而 `worker-bot` 对非任务型消息只会返回：

```text
[worker-reply] 收到：...
```

随后 `zylos-main` 再把这个低质量回执交给 GPT 汇总，导致最终回复显得机械、空泛。

### 根因

`zylos-main` 之前对所有用户消息都执行：

```text
用户消息 -> zylos-main -> worker-bot -> GPT 汇总 -> 用户
```

这对任务、记忆、看板执行是合理的，但对普通对话不合理。普通问答应该直接由 `zylos-main / GPT-5.5` 回复，不需要 worker-bot 参与。

### 修复

- 新增 `shouldDispatchWorker(content)`：
  - 任务创建 / 拆解类请求：派发 worker。
  - 记忆写入类请求：派发 worker。
  - 继续执行 / 执行全部剩余任务：派发 worker。
  - 显式包含 `t_xxx` 看板任务 ID：派发 worker。
  - 普通聊天，例如“你好”“你是谁”：不派发 worker。
- 普通聊天 prompt 改成：
  - 明确说明本次没有派发 worker-bot。
  - 要求直接回答用户。
  - 不提 worker-bot、看板或内部调度。
- 普通聊天的 GPT fallback 也去掉 worker-bot 文案。

### 验证

本地测试：

```bash
npm run test -- tests/server/hxa-main-runtime.test.ts tests/server/agentic-runtime.test.ts tests/worker-bot/kanban-worker.test.ts
npm run build
```

结果：

- 3 个测试文件通过。
- 45 个测试通过。
- 构建通过。

线上验证：

```text
输入：你是谁
输出：我是你的 AI 助手，可以帮你回答问题、整理信息、写作、分析和处理日常任务。
```

worker-bot 日志中没有收到这条普通聊天任务，只保留上线消息，说明普通聊天已经绕过 worker-bot。
- 当前只持久化“最近父任务”，不是任务历史列表。

## Worker kanban.execute_all Skill

本轮把“执行所有剩余任务”接入 worker-bot，形成父任务下的批量推进能力。

目标：

```text
用户：执行所有剩余任务
-> zylos-main 从持久化记忆恢复最近父任务
-> worker-bot 执行 kanban.execute_all
-> worker-bot 读取父任务 children
-> worker-bot 按标题序号挑出所有 ready 子任务
-> worker-bot 逐个执行 status.check 并 complete 子任务
-> 聊天框返回已执行列表、剩余任务和下一步
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `shouldExecuteAllKanbanTasks`
  - 新增 `executeAllKanbanTasks`
  - 新增 `buildExecuteAllWorkerReply`
  - 抽出 `listReadyChildren`，保证 `execute_next` 和 `execute_all` 使用同一套编号排序
  - 新增 bounded concurrency 执行器，默认并发 `1`
- `packages/worker-bot/src/index.ts`
  - 收到“执行所有剩余任务 / 全部执行完”类请求时优先执行 `kanban.execute_all`
  - 新增 `WORKER_BOT_TASK_CONCURRENCY` 环境变量，默认 `1`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - `buildDeterministicReply` 新增 `worker_skill=kanban.execute_all` 分支
  - 聊天框会返回“已执行所有剩余子任务”

并发准备：

- 默认仍是顺序执行，降低线上风险。
- `executeAllKanbanTasks` 已支持 `concurrency` 参数。
- 后续如果要多 worker 并行，可以把每个 child 的执行函数替换成“发给不同 worker-bot”，外层 bounded concurrency 不需要重写。

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- worker-bot 16 个测试通过。
- 2 个核心测试文件、34 个测试通过。
- 6 个回归测试文件、59 个测试通过。
- `npm run build` 通过。

线上验证：

- 已部署到 `agent.aibosss.com`。
- 第一轮用户请求：`帮我把 Agentic 状态检查、对话链路、看板写回拆成任务并先执行第一步`
- 父任务：`t_9bb33a64` / `done`
- 第一子任务：`t_84308e7b` / `1. Agentic 状态检查` / `done`
- 第二轮用户只发送：`执行所有剩余任务`
- zylos-main 自动复用父任务：`t_9bb33a64`
- worker-bot 返回：`worker_skill=kanban.execute_all`
- 批量完成：
  - `t_70750606` / `2. 对话链路` / `done`
  - `t_23ec0e1f` / `3. 看板写回` / `done`
- Kanban 明细显示后两个子任务 `latest_summary` 均包含 `worker-bot 已执行 kanban.execute_all` 和 `worker-bot 已执行 status.check`。

当前边界：

- `kanban.execute_all` 当前仍复用 `status.check` 作为每个子任务的真实执行 skill。
- 默认并发为 1；线上可通过 `WORKER_BOT_TASK_CONCURRENCY` 提升。
- 目前还没有多个 worker-bot 的队列分发，只是代码结构已经预留并发执行策略。

## Worker memory.write Skill

本轮新增第二类真实业务 skill：`memory.write`。

目标：

```text
用户：请记住：Agentic 默认模型是 GPT-5.5
-> zylos-main 识别为需要沉淀的任务
-> zylos-main 创建 Kanban 任务
-> worker-bot 执行 memory.write
-> worker-bot 写入 Hermes memories/MEMORY.md
-> worker-bot complete Kanban 任务
-> 聊天框稳定返回写入位置和记忆内容
```

实现：

- `packages/worker-bot/src/kanban-worker.ts`
  - 新增 `shouldRunMemoryWrite`
  - 新增 `runMemoryWrite`
  - 新增 `completeMemoryWriteTask`
  - 新增 `buildMemoryWriteWorkerReply`
- `packages/worker-bot/src/index.ts`
  - 收到“请记住 / 写入记忆 / 保存到记忆 / 记录到记忆”类任务时执行 `memory.write`
  - 默认写入 `${HERMES_HOME}/memories/MEMORY.md`
- `packages/server/src/services/agentic/hxa-main-runtime.ts`
  - `shouldCreateKanbanTask` 把记忆写入类请求纳入任务沉淀
  - `buildDeterministicReply` 新增 `worker_skill=memory.write` 分支

本地验证：

```bash
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts
npm run test -- tests/worker-bot/kanban-worker.test.ts tests/server/hxa-main-runtime.test.ts tests/server/hermes-kanban-service.test.ts tests/server/agentic-runtime.test.ts tests/server/hxa-connect.test.ts tests/client/hxa-api.test.ts
npm run build
```

结果：

- 2 个核心测试文件、38 个测试通过。
- 6 个回归测试文件、63 个测试通过。
- `npm run build` 通过。

线上验证：

- 已部署到 `agent.aibosss.com`。
- 用户请求：`请记住：Agentic memory.write 线上验证 1778857633966`
- 聊天框返回：
  - `记忆已写入`
  - 任务 ID：`t_969e48ad`
  - 写入位置：`/home/agent/.hermes/memories/MEMORY.md`
  - 记忆内容：`Agentic memory.write 线上验证 1778857633966`
- 服务器文件验证：
  - `tail /home/agent/.hermes/memories/MEMORY.md` 可见该条记忆。
- Kanban 验证：
  - `t_969e48ad` 状态为 `done`
  - latest_summary 包含 `worker-bot 已执行 memory.write`
  - runs 中 `profile=worker-bot`、`status=completed`、`outcome=completed`

当前边界：

- `memory.write` 现在是追加写入 `MEMORY.md`，不是结构化长期记忆库。
- 当前没有做记忆去重、语义合并、版本回滚。
- 第一版用于证明 worker 可以执行非 Kanban 基础检查类的真实业务写入。
