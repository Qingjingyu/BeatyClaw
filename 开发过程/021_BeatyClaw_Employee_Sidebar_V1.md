# 021 BeatyClaw 员工主体侧边栏 V1

## 背景

苏白确认产品结构从“单个数字员工换引擎”升级为“可以雇佣多个数字员工”。每个员工可以对应独立的底层 AI 引擎和运行实例，但在 BeatyClaw 产品端统一展示。

这意味着左侧导航不能只是一组功能菜单，也不能把“数字员工管理”藏到二级页面里。第一版需要让员工成为产品入口主体：

```text
BeatyClaw 产品端
→ 数字员工列表
→ 当前员工工作台
→ 对话 / 历史 / 档案 / 任务 / 看板 / 连接 / AI 引擎 / 技能 / 记忆 / 用量
```

## 本轮决策

- 侧边栏顶部保留品牌：`BeatyClaw 数字员工`。
- 品牌下方直接展示“数字员工”列表和新增入口。
- 点击员工卡片只做快速切换，不再跳转到员工管理页。
- 员工工作台菜单跟随当前员工，并把 `employee_id` 写入 URL query，方便后续页面按员工隔离数据。
- “员工管理”保留在设置分组里，作为高级管理入口。
- 用户可见的 `zylos` 统一展示为 `COCO`。内部 provider 暂时仍保留 `zylos`，避免破坏已有 runtime / 测试 / 历史数据。

## 实现

- `packages/client/src/components/layout/AppSidebar.vue`
  - 改为“品牌 + 员工列表 + 当前员工工作台 + 能力 + 数据 + 设置”的层级。
  - 新增侧边栏内快速创建员工入口。
  - 点击员工后调用 `employeesStore.selectEmployee()`，并更新当前路由的 `employee_id`。
  - 新增“档案”入口，指向现有 `hermes.files`。

- `packages/client/src/stores/agentic/employees.ts`
  - 给 `loadEmployees()` 增加 10 秒缓存。
  - 避免侧边栏和页面反复挂载时重复拉取员工列表，减轻左侧切换卡顿。
  - 支持 `loadEmployees({ force: true })` 强制刷新。

- `packages/client/src/utils/engine-display.ts`
  - 新增统一展示工具。
  - `zylos` 和 `coco` 都展示为 `COCO`。
  - 员工状态统一展示为中文短标签。

- 其他可见页面
  - 员工管理页、AI 引擎页、连接页、网关页、会话监控 trace 中的 Zylos 可见文案收口为 COCO。

## 验证

```bash
npm run test -- tests/client/engine-display.test.ts tests/client/employees-store.test.ts tests/client/sidebar-employees.test.ts
```

结果：3 个测试文件通过，8 个测试通过。

```bash
npm run build
```

结果：构建通过。Vite 仍提示原有大 chunk 警告，不是本轮新增问题。

真实浏览器检查：

- 本地打开 `http://127.0.0.1:5173/#/hermes/chat`。
- 移动宽度下侧边栏保持抽屉隐藏状态。
- 强制展开侧边栏后，层级显示为：品牌、数字员工、当前员工工作台、能力、数据、设置。

## 当前边界

- 本轮只做产品端导航和展示层，不修改员工实例目录结构。
- `employee_id` 已进入 URL，但各业务页面是否完全按员工隔离，还需要后续逐页接入。
- 本地未登录状态下员工接口返回未授权，所以侧边栏会显示“暂无员工”；线上登录后会展示真实员工列表。
- 内部 runtime provider 仍保留 `zylos` 标识，后续如要彻底重命名，需要做数据库历史数据、环境变量、后端日志和测试的迁移方案。
