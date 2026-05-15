# 007 Agentic Server Deployment

## Background

Agentic 本地对话已接入 OpenAI-compatible runtime，并验证 `gpt-5.5` 可用。本次目标是把 Agentic 部署到服务器并切到公网域名。

## Deployment

服务器：

- Host: 生产部署机，真实 IP 不写入仓库
- Domain: `agent.aibosss.com`
- Runtime: Docker + Caddy
- Agentic container: `agentic`
- Agentic local port: `127.0.0.1:3457`
- hxa-connect local port: `127.0.0.1:4800`
- Old zylos container retained on `127.0.0.1:3456`

线上环境变量：

```text
OPENAI_BASE_URL=https://key.cosark.com.cn
AGENTIC_DEFAULT_MODEL=gpt-5.5
AGENTIC_DISABLE_HERMES_GATEWAY=1
```

`OPENAI_API_KEY` 和 owner password 只写入服务器 `.env`，不写入仓库。

## Caddy

`agent.aibosss.com` 已从旧 Zylos `127.0.0.1:3456` 切到 Agentic `127.0.0.1:3457`。

`/hxa/*` 继续反代到 hxa-connect：

```text
handle_path /hxa/* {
  reverse_proxy 127.0.0.1:4800
}
```

Caddy 切换前已备份：

```text
/etc/caddy/Caddyfile.bak.20260515041809
```

## Verification

本地验证：

```bash
npm run test -- tests/server/agentic-runtime.test.ts tests/server/auth.test.ts tests/server/yoyoo-auth.test.ts tests/client/login-view.test.ts tests/client/api.test.ts
npm run build
```

结果：通过。

服务器验证：

```text
https://agent.aibosss.com/ -> 200
https://agent.aibosss.com/hxa/ -> 200
https://agent.aibosss.com/health -> 200
```

公网登录和对话验证：

```text
PUBLIC_LOGIN_STATUS 200
PUBLIC_SOCKET_CONNECTED
PUBLIC_RUN_COMPLETED: 公网 Agentic GPT-5.5 对话验证成功。
```

## Notes

`/health` 当前显示 `gateway: stopped` 是预期结果，因为 Agentic SaaS 部署禁用了 Hermes gateway，聊天走 OpenAI-compatible runtime。

旧 `zylos` 容器仍保留，便于回滚。
