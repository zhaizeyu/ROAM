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
OPENAI_API_MODE=chat_completions
OPENAI_ENABLE_WEB_SEARCH=false
```

如果你的 New API 已完整支持 `/v1/responses`、Structured Outputs 和 `web_search` 工具，可以把 `OPENAI_API_MODE` 改为 `responses`，并按上游能力决定是否开启网络搜索。

## 部署

可部署到 Vercel 或任何支持 Next.js Node 运行时的平台，并在部署平台中设置上述环境变量。Google Maps 链接本身不需要 Maps JavaScript API 密钥；只有未来把可交互地图直接嵌进页面时，才需要单独申请 Google Maps Platform key，并配置域名限制和账单。

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
OPENAI_API_MODE=chat_completions
OPENAI_ENABLE_WEB_SEARCH=false
NODE_ENV=production
```

`OPENAI_API_KEY` 只需勾选 **Runtime Variable**，关闭 **Build Variable**，避免密钥进入镜像构建信息。无需在 Coolify 环境变量中配置 `PORT` 或 `HOSTNAME`，也无需把容器端口映射到宿主机。

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
- 持久卷：当前项目不需要数据库或本地文件持久化，因此无需挂载 Volume。

## 当前数据是否持久化

当前是一次性规划模式，没有数据库，也没有把生成结果写入容器磁盘：

- 生成后的行程只保存在当前浏览器页面的 React 内存中。
- 用户刷新或关闭页面后，刚生成的行程就会消失；不需要等到容器重启。
- 容器重启不会影响任何共享数据，因为服务端本来就没有保存行程。
- 行程站点的“完成”勾选单独保存在该浏览器的 `localStorage`；同一浏览器刷新后通常仍保留，清理站点数据或换设备后会消失。
- 内置马德里示例写在代码里，重新部署后仍然存在。

如果下一阶段需要“分享链接、跨设备继续、历史行程”，再接 PostgreSQL 即可；当前 MVP 无需数据库和 Volume。

## MVP 边界

- 当前包含生成、展示、路线跳转、官方购票链接字段和本地完成进度。
- 生产化前建议增加登录、数据库保存、限流、用量计费、计划分享和人工反馈。
- 中国大陆用户能否直接打开 Google Maps 取决于其网络环境；后续可按用户地区增加高德、百度或 Apple Maps 路线适配层。
