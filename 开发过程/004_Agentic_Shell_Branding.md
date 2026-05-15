# 004 Agentic Shell Branding

## Background

Agentic 第一期需要先把现有 `Yoyoo0.1 / hermes-web-ui` 的前端壳子改成产品工作台，而不是继续露出参考项目和底层控制台气质。

## Decision

本次只做产品壳子收口，不接 Coco / Zylos / hxa-connect 真实后端。

已完成：

- 登录页品牌改为 Agentic。
- 浏览器标题改为 Agentic。
- 新增 `/agentic/chat` 作为产品入口，并兼容原 `/hermes/chat`。
- 侧边栏品牌改为 Agentic。
- 侧边栏只突出第一期主入口：
  - 对话
  - 历史
  - 任务
  - 看板
  - 频道
  - 技能
  - 记忆
  - 用量
- 隐藏普通工作台视角下的底层入口：
  - Models
  - Profiles
  - Logs
  - Gateways
  - Terminal
  - Files
  - Plugins
  - Group Chat
  - Settings
  - API Relay

## Implementation Notes

- 只调整前端壳子和导航，不删除底层路由和页面文件。
- 原 `/hermes/*` 路由继续保留，降低改动风险。
- 新入口 `/agentic/chat` 先重定向到现有聊天页，后续可以逐步替换为真正的 Agentic route name。
- 模型选择器和 Profile 选择器先从主侧边栏隐藏，符合“模型 key 和 runtime 由平台内置”的第一期边界。

## Verification

已运行：

```bash
npm run build
```

结果：通过。

构建仍有 Vite 大 chunk 警告，这是原项目已有的包体积问题，不影响本次壳子收口。

