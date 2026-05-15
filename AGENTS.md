# Yoyoo SaaS 项目规则

## 项目定位

这是从 `参考代码/Yoyoo0.1/hermes-web-ui` 整理出的主项目目录，用作 COCO 类 AI 员工 SaaS 的产品壳底座。

当前目标不是维护原版 Hermes Web UI，而是在保留可复用能力的基础上，逐步接入：

- 多租户用户系统
- 用户独立 Agent / HMS / Zylos runtime 空间
- Skill / channel 自助安装与配置
- 用量、额度、账单和运营后台

## 当前阶段

当前阶段：Discovery / Planning。

在没有 `Product-Spec.md` 和 `DEV-PLAN.md` 前，不要大规模改业务代码。

## 来源

初始代码来自：

```text
参考代码/Yoyoo0.1/hermes-web-ui
```

复制时已排除：

- `node_modules/`
- `dist/`
- `.git/`
- `.DS_Store`
- 本地 SQLite 数据库文件
- `.env`
- 日志文件

## 工程边界

- 前端：Vue 3 + TypeScript + Vite。
- 后端：Node.js + Koa + TypeScript。
- 当前数据层偏 SQLite / 本地文件，后续 SaaS 化需要迁移到 PostgreSQL。
- 不要把 API key、平台 token、用户渠道凭证写入前端或提交到仓库。
- 用户隔离、安全、计费相关改动必须先写设计文档。

## 下一步

1. 写 `Product-Spec.md`，明确 MVP。
2. 写 `DEV-PLAN.md`，拆阶段。
3. 梳理现有 Hermes 能力与目标 Yoyoo SaaS 能力的映射。
4. 再开始改代码。
