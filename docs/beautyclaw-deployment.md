# BeatyClaw Deployment Handoff

This file records the production wiring needed to run BeatyClaw as an independent product layer with pluggable AI engines. Do not commit real tokens or passwords.

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
AI engine slot
├─ none: product shell only
├─ zylos: hxa-connect / zylos-main / worker-bot / GPT-5.5
├─ hms: planned adapter
├─ openclaw: planned adapter
└─ coco: planned product/runtime package
```

External channels, such as Weixin, enter through the same Conversation Hub and are written into the product conversation history. When no AI engine is installed, BeatyClaw stores the message and returns a clear "install an AI engine" reply instead of calling zylos.

## Required Environment

| Variable | Purpose |
| --- | --- |
| `AGENTIC_OWNER_EMAIL` | Single owner login email. |
| `AGENTIC_OWNER_PASSWORD` | Single owner login password. |
| `BEATYCLAW_RUNTIME_PROVIDER` | Runtime provider for this deployment. Product-shell default is `none`; set to `zylos` only when installing the zylos engine. |
| `AGENTIC_HXA_RUNTIME_ENABLED` | Set to `1` only when BeatyClaw should call hxa-connect through the zylos adapter. |
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

Run these checks after deploy. Replace the host, port, and cookie/token handling with the current deployment method.

Local compose defaults to port `6060`. The current `agent.aibosss.com` production container uses `PORT=3457` behind the public reverse proxy, so server-side checks should use the container's actual `PORT`.

```bash
PORT="${PORT:-6060}"
curl -fsS "http://127.0.0.1:${PORT}/api/hermes/runtime/status"
```

Expected product-shell result:

- Runtime provider is `none`.
- Runtime status is `not_configured`.
- `missingConfig` contains `AI_ENGINE`.
- Login and product pages remain available.

When a zylos engine is installed, additional checks should verify:

```bash
curl -fsS "http://127.0.0.1:${PORT}/api/hermes/weixin/status"
curl -fsS "http://127.0.0.1:${PORT}/api/agentic/hxa/overview"
```

## Conversation Verification

After sending a real Weixin message:

```bash
PORT="${PORT:-6060}"
curl -fsS "http://127.0.0.1:${PORT}/api/hermes/sessions/conversations?limit=20"
```

Expected result:

- A session with `workspace` like `channel:weixin` appears in the default list.
- The detail endpoint returns user and assistant messages.
- Assistant messages include `runtime_trace` with channel, provider, model, worker dispatch status, and status.

## Image Build Notes

Build the image for the server architecture. The current production server is `linux/amd64`; an image built on Apple Silicon without `--platform linux/amd64` will fail on the server with `exec format error`.

Recommended options:

```bash
# Build on the production server, or:
docker buildx build --platform linux/amd64 -t agentic-yoyoo-saas:<tag> .
```

## Standard Production Deploy

Use the server-side deploy script instead of uploading a local Docker image tarball.

```bash
cd /home/ubuntu/agent-stack/agentic-build-current
git pull
chmod +x scripts/deploy-production.sh
AGENTIC_DEPLOY_VERIFY_EMAIL="<owner-email>" \
AGENTIC_DEPLOY_VERIFY_PASSWORD="<owner-password>" \
BEATYCLAW_DEPLOY_EXPECTED_RUNTIME_PROVIDER="none" \
scripts/deploy-production.sh
```

The script:

1. Pulls the latest `main` branch from GitHub.
2. Builds the image on the production server architecture.
3. Starts a candidate container on `PORT + 1` with external channel pollers disabled.
4. Verifies public health and, when credentials are provided, Runtime status on the candidate.
5. Stops the old production container only after the candidate passes.
6. Starts the new production container, then verifies Runtime status. HXA/Weixin checks are opt-in with `BEATYCLAW_DEPLOY_VERIFY_CONNECTORS=1`.
7. Keeps the previous container for rollback.

Rollback, if needed:

```bash
docker rm -f agentic
docker rename <previous-container-name> agentic
docker start agentic
```

## Current Known Boundary

- BeatyClaw is the product layer. It owns login, UI, channel status, conversation history, and the Runtime SDK boundary.
- Zylos/hxa-connect/worker-bot are no longer required for the product shell. They become one installable AI engine package.
- OpenClaw, HMS, and COCO are represented as AI engine slots until their adapters/installers are implemented.
- Telegram has a product configuration entry and runtime path, but production validation depends on a real Bot Token.
- Feishu currently has configuration storage only; full runtime binding is a later phase.
