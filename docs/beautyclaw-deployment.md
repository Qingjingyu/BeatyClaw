# BeatyClaw Deployment Handoff

This file records the production wiring needed to run BeatyClaw as a product layer in front of an AI runtime. Do not commit real tokens or passwords.

## Production Shape

```text
agent.aibosss.com
↓
BeatyClaw Web UI / Koa BFF
↓
Conversation Hub
↓
Runtime SDK
↓
zylos provider
↓
hxa-connect / zylos-main / worker-bot / GPT-5.5
```

External channels, such as Weixin, enter through the same Conversation Hub and are written into the product conversation history before the message is sent to the runtime.

## Required Environment

| Variable | Purpose |
| --- | --- |
| `AGENTIC_OWNER_EMAIL` | Single owner login email. |
| `AGENTIC_OWNER_PASSWORD` | Single owner login password. |
| `BEATYCLAW_RUNTIME_PROVIDER` | Runtime provider for this deployment. Current production value is `zylos`. |
| `AGENTIC_HXA_RUNTIME_ENABLED` | Set to `1` when BeatyClaw should call hxa-connect through the zylos adapter. |
| `AGENTIC_HXA_BASE_URL` | Internal hxa-connect URL, for example `http://127.0.0.1:4800` on the host or service DNS in compose. |
| `AGENTIC_HXA_TOKEN` | hxa-connect bot/client token allowed to call `/api/send`. This is not the admin secret. |
| `AGENTIC_HXA_MAIN_BOT` | Main bot target. Current production target is `zylos-main`. |
| `WEIXIN_ACCOUNT_ID` | Weixin iLink account id saved after QR binding. |
| `WEIXIN_TOKEN` | Weixin iLink account token saved after QR binding. |
| `WEIXIN_BASE_URL` | Weixin iLink base URL. Current value is `https://ilinkai.weixin.qq.com`. |
| `WEIXIN_RUNTIME_WATCHDOG_MS` | Watchdog interval for restarting the Weixin runtime if it stops. |
| `HXA_CONNECT_ADMIN_SECRET` | Optional, only for admin overview/status APIs. Do not use this as `AGENTIC_HXA_TOKEN`. |

## Persistent Mounts

Production should keep these paths stable across container recreates:

| Container path | Purpose |
| --- | --- |
| `/home/agent/.hermes` | Hermes/BeatyClaw runtime state, profiles, Weixin state, local conversation DB. |
| `/home/agent/.hermes-web-ui` | Product auth and Web UI data. |

## Runtime Verification

Run these checks after deploy. Replace the host and cookie/token handling with the current deployment method.

```bash
curl -fsS http://127.0.0.1:6060/api/hermes/runtime/status
curl -fsS http://127.0.0.1:6060/api/hermes/weixin/status
curl -fsS http://127.0.0.1:6060/api/agentic/hxa/overview
```

Expected result:

- Runtime provider is `zylos`.
- Runtime status is available/active.
- Weixin is configured and the runtime is running.
- hxa-connect overview is online when admin overview credentials are configured.

## Conversation Verification

After sending a real Weixin message:

```bash
curl -fsS 'http://127.0.0.1:6060/api/hermes/sessions/conversations?limit=20'
```

Expected result:

- A session with `workspace` like `channel:weixin` appears in the default list.
- The detail endpoint returns user and assistant messages.
- Assistant messages include `runtime_trace` with channel, provider, model, worker dispatch status, and status.

## Current Known Boundary

- BeatyClaw is the product layer. It owns login, UI, channel status, conversation history, and the Runtime SDK boundary.
- Zylos/hxa-connect/worker-bot are the AI runtime layer. They can be replaced later by OpenClaw or HMS through new Runtime SDK adapters.
- Telegram has a product configuration entry and runtime path, but production validation depends on a real Bot Token.
- Feishu currently has configuration storage only; full runtime binding is a later phase.
