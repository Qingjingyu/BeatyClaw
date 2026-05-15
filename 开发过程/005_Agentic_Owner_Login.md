# 005 Agentic Owner Login

## Background

Agentic 第一期是单用户工作台。登录和配置需要从“参考项目 token 控制台”收口成“owner 账号登录 + 服务端内置配置”。

## Decision

本次做登录和配置边界收口，不接真实 Agent 回复。

已完成：

- 前端路由统一用 `/api/yoyoo/me` 判断登录态。
- 登录成功后进入 `/agentic/chat`。
- 前端不再依赖 `localStorage.hermes_api_key` 判断是否登录。
- 服务端默认不生成、不打印启动日志 token。
- 旧 token 登录默认关闭，仅当 `AGENTIC_ALLOW_TOKEN_AUTH=1` 时启用。
- owner 账号从环境变量读取：
  - `AGENTIC_OWNER_EMAIL`
  - `AGENTIC_OWNER_PASSWORD`
  - `AGENTIC_OWNER_NAME`
- 模型和 runtime 配置只通过服务端环境变量表达，示例写入 `.env.example`，不写真实 key。

## Security Notes

- session cookie 使用 HttpOnly，前端 JavaScript 不能读取。
- `.env` 已在 `.gitignore`，真实 key 不应进入仓库。
- `.env.example` 只放变量名和占位符。
- 前端仍保留少量旧 token helper 作为兼容 API，但产品登录主线不再使用它。

## Verification

已运行：

```bash
npm run test -- tests/server/yoyoo-auth.test.ts tests/client/login-view.test.ts tests/client/api.test.ts
npm run build
```

结果：通过。

