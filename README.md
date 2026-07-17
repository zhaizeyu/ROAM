# ROAM · AI 旅行规划 MVP

一个可直接运行的 Next.js 旅行规划产品原型。用户通过三步问卷提供目的地、日期、可用时间、旅行节奏、兴趣与限制，网站生成逐日时间线、Google Maps 路线和购票入口。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。不配置密钥也可以使用演示生成器，便于先验证完整产品流程。

## 接入 OpenAI

在 `.env.local` 中配置：

```bash
OPENAI_API_KEY=你的服务端密钥
OPENAI_MODEL=gpt-5.4-mini
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_MODE=responses
OPENAI_ENABLE_WEB_SEARCH=true
```

密钥只在 `/api/plan` 服务端路由中读取，不会打包到浏览器。配置后，生成器会使用 Responses API、Web Search 和 JSON Schema 结构化输出；未配置时自动使用本地演示计划。

如果使用 New API 等 OpenAI 兼容中转，推荐从下面这组配置开始：

```env
OPENAI_API_KEY=你的New API令牌
OPENAI_BASE_URL=https://你的-new-api-域名/v1
OPENAI_MODEL=中转站中实际存在的模型ID
```

程序会自动识别非官方 Base URL，并使用 `/chat/completions` 和 `json_object`，因此普通 New API 只需上面三项。如果中转完整支持 `/v1/responses`、Structured Outputs 和 `web_search`，可以显式设置 `OPENAI_API_MODE=responses`、`OPENAI_STRUCTURED_OUTPUT=json_schema` 和 `OPENAI_ENABLE_WEB_SEARCH=true`。

## 部署

可部署到 Vercel 或任何支持 Next.js Node 运行时的平台，并在部署平台中设置上述环境变量。生产环境还需要 PostgreSQL；Google Maps 链接本身不需要 Maps JavaScript API 密钥，只有未来把可交互地图直接嵌进页面时才需要单独申请 Google Maps Platform key。

## 部署到 Coolify

仓库已经包含多阶段 `Dockerfile`、Next.js standalone 配置和容器健康检查，不需要在 Coolify 中自定义启动命令。

1. 把项目推送到 GitHub、GitLab 或 Coolify 可访问的 Git 仓库。
2. 在 Coolify 中选择 **New Resource → Application**，连接仓库。
3. Build Pack 选择 **Dockerfile**，Dockerfile Location 使用 `/Dockerfile`。
4. Base Directory 使用 `/`，容器端口（Ports Exposes）填写 `3000`。
5. 配置域名，例如 `https://trip.example.com`。Coolify 的反向代理会把域名流量直接转发到容器内部 `3000` 端口，并自动申请 HTTPS 证书；不要配置宿主机端口映射。
6. 在 Environment Variables 中添加：

```env
OPENAI_API_KEY=你的服务端密钥
OPENAI_MODEL=gpt-5.4-mini
OPENAI_BASE_URL=https://你的-new-api-域名/v1
DATABASE_URL=postgres://用户名:密码@数据库地址:5432/数据库名
DATABASE_SSL=false
NODE_ENV=production
```

`OPENAI_API_KEY` 和 `DATABASE_URL` 只需勾选 **Runtime Variable**，关闭 **Build Variable**，避免密钥进入镜像构建信息。无需在 Coolify 环境变量中配置 `PORT` 或 `HOSTNAME`，也无需把容器端口映射到宿主机。程序首次访问数据库时会自动创建独立的 `roam` schema，不会改动 `public` schema 中的其他项目表。

健康检查已经写入 Dockerfile：

```text
GET /api/health
```

如果你选择在 Coolify UI 中配置健康检查，Path 填 `/api/health`、Expected Status Code 填 `200`；Dockerfile 已有健康检查时，以 Dockerfile 配置为准。

部署后可以先验证：

```bash
curl https://你的域名/api/health
```

预期返回：

```json
{"status":"ok","service":"roam-trip-planner","timestamp":"..."}
```

### 建议的 Coolify 设置

- Auto Deploy：需要提交代码后自动发布时开启。
- Health Checks：开启。
- Minimum Replicas：MVP 保持 `1` 即可。
- Build Cache：保持开启，不要启用 Include Source Commit，避免每次提交使整个镜像缓存失效。
- API 密钥：仅 Runtime Variable；不要添加 `NEXT_PUBLIC_` 前缀。
- 持久卷：ROAM 容器本身无需 Volume；行程、版本、任务与诊断日志保存在 PostgreSQL。

## 推荐生产架构：使用 Hermes Agent

ROAM 可以把 Hermes 当作一个 OpenAI-compatible 智能体接口：

```text
浏览器 → ROAM /api/plan → Hermes API Server → New API / DeepSeek
                               └→ Web Search / 后续 MCP 工具
```

ROAM 与 Hermes 必须是两个容器。浏览器永远只访问 ROAM；`HERMES_API_KEY` 和 New API 密钥都只存在服务端。Hermes 的配置、会话数据库和认证状态位于 `/opt/data`，因此 Hermes 容器必须使用持久卷；ROAM 仍然不需要持久卷。

### 1. 在 Coolify 创建 Hermes Service

优先使用 Coolify 已有的 Hermes Service 模板；如果使用空白 Docker Compose Service，核心设置如下：

```yaml
services:
  hermes:
    image: nousresearch/hermes-agent:latest
    command: gateway run
    restart: unless-stopped
    environment:
      API_SERVER_ENABLED: "true"
      API_SERVER_HOST: "0.0.0.0"
      API_SERVER_PORT: "8642"
      API_SERVER_KEY: ${HERMES_API_SERVER_KEY:?}
      API_SERVER_MODEL_NAME: roam-agent
      NEW_API_BASE_URL: ${NEW_API_BASE_URL:?}
      NEW_API_KEY: ${NEW_API_KEY:?}
      NEW_API_MODEL: ${NEW_API_MODEL:-deepseek-v4-flash}
    volumes:
      - hermes-data:/opt/data

volumes:
  hermes-data:
```

不要给 Hermes 配置公网域名，也不要把 `8642` 映射到宿主机。只需要让它在容器内监听 `0.0.0.0:8642`。

在 Hermes Service 的 Runtime Variables 中填写：

```env
HERMES_API_SERVER_KEY=生成一个新的64位随机内部密钥
NEW_API_BASE_URL=https://你的-new-api-域名/v1
NEW_API_KEY=你的New API令牌
NEW_API_MODEL=deepseek-v4-flash
```

把 [config.example.yaml](deploy/hermes/config.example.yaml) 的内容作为 Coolify File Mount 挂载到 `/opt/data/config.yaml`，把 [SOUL.example.md](deploy/hermes/SOUL.example.md) 挂载到 `/opt/data/SOUL.md`。配置只给 API Server 开放 `safe` 只读研究工具，并再次全局禁用 terminal、file、code execution、memory、delegation 等能力。

DDGS 搜索不需要额外 Key，适合 MVP；它只提供搜索结果。后续需要稳定的正文提取、复杂浏览器或图片工具时，只修改 Hermes 的工具后端，ROAM 不需要再次重构。

### 2. 连接 Coolify 内网

如果 ROAM 和 Hermes 位于同一个 Docker Compose Stack，直接使用服务名：

```env
HERMES_BASE_URL=http://hermes:8642/v1
```

如果 Hermes 是独立 Coolify Service Stack，它默认处于隔离网络。需要在 Hermes 的 Destination 设置中开启 **Connect to Predefined Networks**，然后使用 Coolify 中实际可解析的 Service/Container 名称，例如：

```env
HERMES_BASE_URL=http://roam-hermes:8642/v1
```

不要填写 `127.0.0.1` 或 `localhost`，那会指向 ROAM 自己。由于不同 Coolify 版本的生成名称不同，部署后应从 ROAM 容器终端验证：

```bash
wget -qO- "$HERMES_BASE_URL/health"
```

如果独立 Service 的 Docker DNS 无法稳定解析，最稳妥的处理是把 ROAM 与 Hermes 改为同一个 Git Docker Compose Stack；不建议依赖会变化的容器 IP。

### 3. 把 ROAM 切换到 Hermes

在 ROAM Application 中配置以下 Runtime Variables，然后 Redeploy：

```env
AI_BACKEND=hermes
HERMES_BASE_URL=http://hermes:8642/v1
HERMES_API_KEY=与Hermes的API_SERVER_KEY完全相同
HERMES_MODEL=roam-agent
AI_REQUEST_TIMEOUT_MS=180000
```

切换后，ROAM 不再直接读取 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_MODEL`；这些变量可以保留作为回滚配置。真正使用的底层模型由 Hermes 的 `/opt/data/config.yaml` 决定，客户端请求中的 `HERMES_MODEL` 只是 Hermes API 展示名称。

每次规划请求都会携带新的 `X-Hermes-Session-Id`，避免不同网站用户共享上下文；Hermes 的 memory 工具也在示例配置中禁用。接口会给智能体最多三分钟完成搜索和规划，并验证返回的基本 JSON 结构。

### 4. 验收顺序

1. Hermes Service 的 `/health` 返回 `status: ok`。
2. Hermes 的 `/v1/models` 能看到 `roam-agent`。
3. 从 ROAM 容器访问 `$HERMES_BASE_URL/health` 成功。
4. `https://roam.animaseed.com/api/health` 返回 `aiBackend: hermes`。
5. 在网页生成一个 1 天行程，确认 `notice` 说明核验范围，动态营业信息不再被假装成已验证事实。
6. 再测试 5 天行程、超时和 Hermes 重启；Hermes 重启后 `/opt/data` 配置仍然存在。

MVP 阶段 Hermes 保持单副本。更新镜像前先备份 `/opt/data`，验证稳定后建议把 `latest` 固定到已测试的版本标签，避免上游更新改变工具或配置行为。

## PostgreSQL 持久化

应用使用 `roam` schema 隔离自己的数据：

- `trip_plans` 保存当前行程和永久访问令牌；生成后地址栏会得到可恢复的行程链接。
- `trip_plan_versions` 保存初次生成、手工编辑和 AI 局部重规划的每个版本。
- `plan_jobs` 保存后台生成任务与返回结果，成功结果不会因 ROAM 容器重启而丢失；中断任务可在超时后自动重试。
- `event_logs` 保存任务开始、完成、失败和手工编辑等结构化诊断事件，不记录 LLM 或数据库密钥。

“历史行程”按浏览器本地生成的匿名 ID 隔离；永久链接额外使用随机访问令牌，因此复制完整链接可在其他设备继续查看。当前没有账户系统，拿到完整链接的人等同于获得该行程的访问权限。

行程站点的“完成”勾选仍只保存在浏览器 `localStorage`，它是个人进度而不是行程内容。内置马德里示例不会写入数据库。

## MVP 边界

- 当前包含生成、持久链接、历史行程、版本记录、手工编辑、AI 局部重规划、路线跳转和官方购票链接字段。
- 生产化前建议增加登录、数据库备份与保留策略、按用户限流、用量计费和人工反馈。
- 中国大陆用户能否直接打开 Google Maps 取决于其网络环境；后续可按用户地区增加高德、百度或 Apple Maps 路线适配层。
