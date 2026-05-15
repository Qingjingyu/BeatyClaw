# Yoyoo HMS Routing V1

## 背景

原始 `hermes-web-ui` 默认把 Web 请求代理到一个全局 Hermes profile。Yoyoo 需要多用户隔离：同一个产品端里，每个登录用户都应该面对自己的 HMS、自己的运行目录和自己的可见工作空间。

## 决策

本阶段不修改 Hermes/HMS 的智能逻辑，只在产品端后端增加用户路由能力。

- 登录用户请求 `/api/hermes/*` 或 `/v1/*` 时，优先走 Yoyoo 用户网关。
- 用户 Hermes 运行目录放在 `system/hermes-home`，用户不可见。
- 用户可见目录继续保留为 `yoyoo-home` 和 `workspace`。
- 启动用户 HMS gateway 时注入 `YOYOO_HOME`、`YOYOO_WORKSPACE`、`YOYOO_USER_ID` 等环境变量，为后续文件写入和 skill 读取留边界。
- 没有 Yoyoo 登录态时，继续保留原项目的全局 profile 逻辑。

## 实现

- 新增 `packages/server/src/services/yoyoo-gateway-manager.ts`，按 `user_id` 启动或复用独立 Hermes gateway。
- 扩展 `YoyooSpace`，增加 `hermes_home_path`。
- 修改 Hermes proxy handler：如果 `ctx.state.yoyooUser` 存在，就使用用户网关；否则回退原 profile。

## 验证

- `npx vitest run tests/server/yoyoo-auth.test.ts tests/server/proxy-handler.test.ts tests/server/auth.test.ts tests/client/login-view.test.ts tests/client/api.test.ts`
- `npm run build`
- 真实登录后请求 `/api/hermes/v1/models` 返回 `hermes-agent`，并在当前用户 `system/hermes-home` 下生成 Hermes 运行文件。

