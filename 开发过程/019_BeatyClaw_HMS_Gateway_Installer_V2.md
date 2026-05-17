# 019 BeatyClaw HMS Gateway Installer V2

Date: 2026-05-17

## 背景

HMS Installer V1 只生成占位 health 服务，用来证明员工实例的 install/start/health/stop 链路。V2 开始接近真实 HMS：安装器可以生成 Hermes gateway 启动清单。

本阶段没有直接把整套 Hermes/HMS 仓库复制进员工目录，而是复用现有项目里已经跑通过的启动形态：

```text
hermes gateway run --replace
```

## 实现

更新：

- `packages/server/src/services/agentic/employee-runtime-installer.ts`
- `packages/server/src/services/agentic/employee-runtime.ts`
- `tests/server/employee-runtime-installer.test.ts`
- `tests/server/employee-runtime-process.test.ts`

新增安装模式：

```text
BEATYCLAW_HMS_INSTALL_MODE=hermes-gateway
```

当启用该模式时，安装器会为每个员工生成：

```text
employees/{employeeId}/config/hermes-home/config.yaml
employees/{employeeId}/data/yoyoo-home/
employees/{employeeId}/workspace/
employees/{employeeId}/config/runtime-install.json
```

`runtime-install.json` 会写入：

```json
{
  "startCommand": "hermes",
  "startArgs": ["gateway", "run", "--replace"],
  "env": {
    "HERMES_HOME": ".../config/hermes-home",
    "YOYOO_HOME": ".../data/yoyoo-home",
    "YOYOO_WORKSPACE": ".../workspace",
    "YOYOO_USER_ID": "{employeeId}"
  }
}
```

process adapter 现在会读取安装清单里的 `env`，启动真实进程时注入。

## 为什么保留占位模式

不是所有开发机和 CI 环境都有 `hermes` CLI。默认继续使用 placeholder，保证 BeatyClaw 产品端和员工实例管理可以稳定测试。

真实 HMS gateway 需要显式开启：

```text
BEATYCLAW_HMS_INSTALL_MODE=hermes-gateway
BEATYCLAW_HMS_PORT=4621
HERMES_BIN=/path/to/hermes
```

## 当前边界

- 还没有自动安装 `hermes` CLI。
- 还没有复制 HMS 源码。
- 还没有检查 `hermes` 二进制是否存在。
- 还没有端口池和冲突处理。
- 还没有把聊天 Runtime SDK 自动路由到当前员工 HMS gateway。

## 下一步

下一阶段应做：

1. Hermes/HMS 可执行文件检测。
2. 员工端口池分配。
3. 真实 gateway 启动后的 API key 读取。
4. Runtime SDK 按当前员工调用该 HMS gateway。
