# 031 BeatyClaw Employee Runtime Port Pool

更新时间：2026-05-17 20:55 CST

## 背景

V3 已经接入 Docker runtime adapter，但真实多员工运行还有一个基础问题：端口不能靠手工固定。如果多个员工都读同一个 `BEATYCLAW_HMS_PORT`，就会抢端口，导致后启动的员工失败。

所以本轮先做端口池。它同时服务 process runtime 和 docker runtime。

## 目标

1. 支持按引擎配置端口池。
2. 没有固定端口时，自动从端口池分配。
3. 分配时扫描已有员工 manifest，跳过已用端口。
4. 固定端口仍然优先，兼容现有部署。
5. 不做真实端口 socket 探测，先以员工 manifest 为准。

## 配置

以 HMS 为例：

```env
BEATYCLAW_HMS_PORT_RANGE=4800-4899
```

固定端口仍然有效：

```env
BEATYCLAW_HMS_PORT=4581
```

优先级：

```text
固定 BEATYCLAW_HMS_PORT
→ BEATYCLAW_HMS_PORT_RANGE 第一个未使用端口
→ 员工 id hash 默认端口
```

## 实现

核心文件：

```text
packages/server/src/services/agentic/employee-runtime-installer.ts
```

新增逻辑：

- `parsePortRange()`
- `collectUsedPorts()`
- `resolvePort()`

扫描路径：

```text
dirname(employee.instanceRoot)/*/config/runtime-install.json
```

只读取 manifest 中合法的 `port` 字段，缺失或损坏的 manifest 不占用端口。

## 验证

测试命令：

```bash
npm run test -- tests/server/employee-runtime-installer.test.ts tests/server/employee-runtime-docker.test.ts tests/server/employee-runtime-process.test.ts tests/server/employees-service.test.ts tests/server/employees-controller.test.ts
```

结果：

```text
5 个测试文件通过
22 个测试通过
```

新增覆盖：

- 端口池 `4800-4802` 中，已有员工占用 `4800` 时，新员工拿 `4801`。
- Docker adapter、process adapter、员工自动创建回归不受影响。

## 当前边界

本轮端口池以 manifest 为准，不检查操作系统端口是否真的被其他进程占用。

后续可以升级：

- 启动前做 TCP listen 探测。
- 加入端口锁文件，避免并发创建员工时抢同一个端口。
- 在员工管理页展示端口池状态。
