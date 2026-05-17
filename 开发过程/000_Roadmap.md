# Yoyoo0.1 Roadmap

## 当前路线

Yoyoo0.1 采用 `hermes-web-ui` 作为第一版产品端底座，先保留原项目能力，再逐步接入 Yoyoo 的登录、多租户空间和用户独立 HMS。

## 当前阶段

- Auth V1：已完成邮箱密码登录、HttpOnly Cookie 登录态、默认管理员账号。
- User Space V1：已完成每用户独立目录：`system/`、`yoyoo-home/`、`workspace/`。
- HMS Routing V1：已完成登录用户的 Hermes API 请求路由到用户自己的 HMS gateway。

## 核心边界

- 入口层只负责识别用户、鉴权、附件接收和请求转发。
- Yoyoo 产品层负责用户、多租户目录、运行管理、产品展示。
- Hermes/HMS 作为可替换 AI 引擎，尽量保持原始能力，不在产品层预设智能行为。
- BeatyClaw 是 Control Plane；数字员工是独立 Runtime Instance。不能只靠共享系统里的 `employee_id` 假装隔离，后续员工目录、配置、数据、日志和工作区都必须以实例为边界。
