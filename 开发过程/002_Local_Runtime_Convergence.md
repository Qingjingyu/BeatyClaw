# 本地运行环境收敛

## 目标

只保留 `Yoyoo0.1/hermes-web-ui` 当前开发服务，避免旧参考项目、旧 Yoyoo Web 和旧 Hermes gateway 干扰验收。

## 标准入口

- 前端验收地址：`http://127.0.0.1:5176/`
- 后端地址：`http://127.0.0.1:8658`
- 当前用户 HMS gateway：`127.0.0.1:9642`

## 标准启动命令

在项目目录：

```bash
cd /Users/subai/A/A_subai/AIcode/Test/Agent/Test0.01hermes/Yoyoo0.1/hermes-web-ui
PORT=8658 BACKEND_URL=http://127.0.0.1:8658 HERMES_WEB_UI_STOP_GATEWAYS_ON_SHUTDOWN=0 npm run dev
```

## 本次清理结果

已温和停止旧进程：

- `参考项目/hermes-web-ui`
- `Yoyoo AI/Yoyoo-Web-HermesUI`
- 旧全局 Hermes gateway

当前保留：

- `Yoyoo0.1/hermes-web-ui` Vite 前端
- `Yoyoo0.1/hermes-web-ui` Node 后端
- 当前登录用户自己的 HMS gateway

## 验收结果

清理后重新验证：

- `GET /health`：`200`
- `POST /api/yoyoo/auth/login`：`200`
- `GET /api/yoyoo/me`：`200`
- `GET /api/hermes/v1/models`：`200`

