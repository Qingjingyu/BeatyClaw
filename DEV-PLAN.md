# Agentic DEV Plan

## Phase

Current Phase: Planning.

本计划只覆盖 Agentic 第一期：单用户 AI 工作台。先不做多租户、支付、套餐和对外 SaaS。

## Technical Baseline

- Frontend: Vue 3 + TypeScript + Vite.
- Backend: Node.js + Koa + TypeScript.
- UI base: existing Yoyoo0.1 / hermes-web-ui layout and views.
- Runtime target: Coco / Zylos / hxa-connect backend stack.
- Secret policy: model keys and runtime tokens are server-side only.

## Milestone 0: Project Baseline

Goal: make the copied project an explicit Agentic working project.

Tasks:

1. Keep `yoyoo-saas` as the main project directory.
2. Keep `AGENTS.md` and `SOURCE.md` as project context.
3. Add `Product-Spec.md`.
4. Add `DEV-PLAN.md`.
5. Add development-process record for Agentic phase 1.

Verification:

```bash
npm ci --ignore-scripts
npm run build
```

Acceptance:

- The project builds from a clean dependency install.
- The project has a clear product spec and development plan.

## Milestone 1: Agentic Branding And Navigation

Goal: rename the working product shell from Hermes/Yoyoo framing to Agentic without redesigning the UI.

Scope:

- Product name: Agentic.
- Keep current layout and route structure unless a route clearly does not belong in phase 1.
- Keep the existing visual design.
- Update visible copy where it confuses the first-phase product.

Tasks:

1. Replace primary product labels with Agentic.
2. Review sidebar items and keep phase-1 entries:
   - Login
   - Chat
   - History
   - Tasks
   - Kanban
   - Links / Channels
   - Skills
   - Memory
   - Usage
3. Hide or deprioritize non-phase-1 entries if they distract from the first release.
4. Keep models, settings, logs, gateways, files, terminal available only if needed for operations.

Verification:

```bash
npm run build
```

Manual verification:

- Start dev server.
- Open login page.
- Confirm main navigation reads as Agentic.

## Milestone 2: Single-User Login

Goal: preserve a simple protected workspace.

Scope:

- One owner account.
- No registration.
- No invitations.
- No multi-tenant UI.

Tasks:

1. Audit current auth flow:
   - `/api/yoyoo/auth/login`
   - `/api/yoyoo/me`
   - `/api/yoyoo/auth/logout`
   - token-based fallback auth
2. Decide one canonical first-phase login path.
3. Remove or hide confusing alternate login language.
4. Ensure all workspace routes require login.

Verification:

```bash
npm run test -- tests/server/yoyoo-auth.test.ts tests/client/login-view.test.ts
npm run build
```

Manual verification:

- Unauthenticated user is redirected to login.
- Login succeeds with configured owner account.
- Logout clears access.

## Milestone 3: Chat And History Adapter

Goal: keep the existing chat/history UI while preparing the backend adapter for Coco / Zylos runtime.

Scope:

- Chat page.
- Session list.
- History search.
- Message persistence.

Tasks:

1. Document current Hermes chat API calls used by the frontend.
2. Add an Agentic runtime adapter boundary in the server:
   - current mode: Hermes-compatible
   - target mode: Zylos / Coco runtime
3. Keep the frontend API shape stable where possible.
4. Add clear error states for runtime unavailable.

Verification:

```bash
npm run test -- tests/client/session-search.test.ts tests/server/sessions-controller.test.ts tests/server/sessions-routes.test.ts
npm run build
```

Manual verification:

- Send a message.
- See response.
- Open the same conversation from history.

## Milestone 4: Tasks And Kanban

Goal: make tasks and board usable as the first-phase work tracker.

Scope:

- Jobs page can remain if useful, but user-facing framing should be “Tasks”.
- Kanban remains the main visual task tracker.

Tasks:

1. Decide whether Jobs and Kanban stay as two pages or one task area.
2. Keep Kanban CRUD and status operations.
3. Connect task detail to conversation references where current code supports it.
4. Add first-phase empty states explaining how to create a task.

Verification:

```bash
npm run test -- tests/client/kanban-store.test.ts tests/client/kanban-view.test.ts tests/server/kanban-controller.test.ts tests/server/hermes-kanban-service.test.ts
npm run build
```

Manual verification:

- Create a task.
- Move or update it.
- View task detail.

## Milestone 5: Links / Channels

Goal: make channel connection a user-facing flow.

Scope:

- The user configures external platform credentials.
- Platform model/API keys are not user-facing.
- First phase supports as many existing channel components as can be safely exposed, but each channel must show a truthful status.

Initial channel priority:

1. Feishu
2. Telegram
3. WeCom
4. WeChat personal account as experimental
5. Slack / WhatsApp / DingTalk as available

Tasks:

1. Audit existing channel settings fields in `PlatformSettings`.
2. Map each visible channel to:
   - required user input
   - server storage location
   - validation method
   - component install/start status
3. Add status labels:
   - Not configured
   - Config saved
   - Needs verification
   - Connected
   - Experimental
4. Ensure secrets are saved server-side only.
5. Do not expose model API key configuration in this flow.

Verification:

```bash
npm run test -- tests/server/config.test.ts
npm run build
```

Manual verification:

- Configure one test channel.
- Save credentials.
- Reload page and see status.
- Confirm secret value is masked.

## Milestone 6: Skills, Memory, Usage

Goal: preserve the existing operational views and adapt labels to Agentic.

Tasks:

1. Skills:
   - Show installed skills/components.
   - Show source and status.
   - Defer full marketplace install if risky.
2. Memory:
   - Show and edit memory files.
   - Make error states clear when runtime memory is unavailable.
3. Usage:
   - Show token usage where real data exists.
   - If estimating, label estimates clearly.

Verification:

```bash
npm run test -- tests/client/usage-store.test.ts tests/client/usage-view-period.test.ts tests/server/usage-store.test.ts tests/server/usage-analytics-db.test.ts
npm run build
```

Manual verification:

- Open skills page.
- Open memory page and save a change.
- Open usage page and see either data or a clear empty state.

## Milestone 7: Server Deployment Adapter

Goal: connect Agentic shell to the deployed Coco / Zylos / hxa-connect backend shape.

Scope:

- Internal runtime config.
- Zylos endpoint.
- hxa-connect endpoint.
- server-side secret management.

Tasks:

1. Add server-side environment variables:
   - Agentic runtime mode.
   - Zylos base URL.
   - hxa-connect base URL.
   - internal runtime secrets.
2. Keep these values out of frontend responses.
3. Add health checks for runtime dependencies.
4. Show dependency status in an internal diagnostics view or logs.

Verification:

```bash
npm run build
curl -f http://127.0.0.1:<port>/health
```

Manual verification:

- Agentic server starts.
- Runtime dependency health can be checked.

## Out Of Scope For Phase 1

- Multi-tenant SaaS.
- Public registration.
- Team accounts.
- Stripe/payment.
- Subscription packages.
- User-provided model API keys.
- Full marketplace.
- Rewriting the UI.
- PostgreSQL migration, unless SQLite blocks the first phase.

## Completion Criteria For Phase 1

- Agentic login protects the workspace.
- Agentic navigation exposes first-phase modules.
- Chat and history work through the selected runtime path.
- Tasks and Kanban are usable.
- Links page can save at least one channel configuration and show status.
- Skills page lists available skills/components.
- Memory page can read and save memory.
- Usage page displays real or clearly labeled estimated usage.
- Build passes.
- Development-process docs are updated.
