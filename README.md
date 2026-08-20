# dsh-plugin-balance

DeepSeek Harness Web 客户端插件：在**输入框上方**显示一个小悬浮窗，查询当前 LLM 账户的余额或套餐用量。

- 悬浮窗注册在 `shell.overlay` 槽位，通过 `[data-composer-card]` 实时定位到输入框正上方。
- 使用 `--dsw-alias-*` 语义主题 token，自动适配 DSH 的亮色 / 暗色主题。
- 可折叠成一个小胶囊，也可展开查看明细。
- 页面加载（DSH Web 启动后的首次打开）时查询一次，之后每 30 分钟自动查询；也可随时点刷新按钮手动查询（强制绕过宿主缓存）。
- 悬浮窗默认定位在输入框正上方，可以直接拖动到任意位置；拖动位置会保存在浏览器中，设置面板里有「恢复默认位置」。
- 账户类型下拉菜单已改为自定义美化菜单，只有三项：DeepSeek 官方、OpenCode Go、自定义；切换时立即更新下方表单。自定义模式下有第二个「厂商」下拉菜单，来自 DSH 模型列表。
- 每个账户类型（以及自定义模式下的每个厂商）独立保存自己的 API Key，切换账户不会串 Key。
- 点击悬浮窗以外的区域会折叠悬浮窗（等同于点 ×）。

## 支持的账户类型

| 账户类型 | 查询方式 | 数据来源 |
| --- | --- | --- |
| DeepSeek 官方余额 | 优先浏览器直连 `https://api.deepseek.com/user/balance`（该接口允许 CORS）；未在悬浮窗里填 Key 时，走宿主代理读取 DSH 凭据 `DEEPSEEK_API_KEY` | 官方余额接口 |
| OpenCode Go 套餐用量 | 只能走宿主代理（`https://opencode.ai/zen/go/v1/usage` **不返回 CORS 头**，浏览器无法直连） | DSH 凭据 `OPENCODE_GO_API_KEY`（缺省回退 `OPENCODE_API_KEY`） |
| 自定义额度接口 | 账户类型选「自定义」后，可先在下拉菜单选择厂商（来自 DSH 模型列表，如 `juhe-api`）。选择厂商后会自动带出 DSH 中已配置的 `baseURL` 与 `apiKeyEnv`（密钥由宿主代理解析，不落浏览器）；路径和返回类型需按厂商接口补全 | DSH 宿主代理 |

## 为什么 OpenCode Go 要走宿主代理

浏览器直接向 `https://opencode.ai/zen/go/v1/usage` 发起跨域 GET 时，浏览器会先发送 `OPTIONS` 预检。OpenCode 对该路径的 `OPTIONS` 返回 404 且不带 `Access-Control-Allow-*` 头，因此预检失败，请求根本发不出去。DeepSeek 官方 `/user/balance` 则允许这个预检，所以官方余额可以直连。

本插件的主进程半（`lib/index.js`）在 DSH Web 服务器上注册了同源路由：

```text
GET /api/dsh-plugin-balance/query?provider=opencode-go
GET /api/dsh-plugin-balance/query?provider=deepseek
```

主进程半按请求通过 `ctx.credentials` 解析密钥，调用上游 API，只把**脱敏后的余额 / 用量 JSON** 返回给浏览器；密钥不会出现在响应、日志或前端 localStorage 中。OpenCode Go 的返回形如：

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 23, "resetsAt": "..." },
    "weekly":  { "status": "ok", "percent": 38, "resetsAt": "..." },
    "monthly": { "status": "ok", "percent": 81, "resetsAt": "..." }
  }
}
```

悬浮窗会展示 5h、每周、每月 三个周期的已用百分比与重置时间（主数字取每月用量）。主窗口会同时显示全部三个百分比徽章（仅百分比），折叠胶囊也会显示三个百分比；明细面板保留进度条与重置时间。

## Token 使用量统计

插件会在主进程半监听 DSH 的会话事件流（`session/event`），把每次模型请求上报的 token 用量（输入 + 缓存读/写、输出）按**本地日期、月份、模型**累计，并持久化到 `~/.dsh/storages/dsh-plugin-balance-usage.json`：

- **每一天 / 每个月 / 总共** 各用了多少 token；
- **哪个模型** 消耗了多少（含该模型的今日 / 本月 / 总计，以及入 / 出拆分）。

统计通过同源接口提供给前端：

```text
GET /api/dsh-plugin-balance/tokens
```

悬浮窗新增「Token 使用量」按钮（柱状图图标），面板显示：今日 / 本月 / 总计三个数字、最近 7 天柱状图、按模型统计列表。统计对重复上报做了幂等处理（同一 turn:step 的新样本替换旧样本），插件热重载或 DSH 重启后重放会话日志也不会重复计数。仅统计插件加载后仍活跃的会话（含重启后续接的会话）；历史已归档会话不会回填。

## 安装

本插件安装在 web profile 中。推荐从 GitHub Releases 安装发布包：

```bash
# 下载 GitHub Release 中附带的 .tgz 后，或直接引用本地目录：
cd ~/.dsh/profiles/web
npm install dsh-plugin-balance@file:/path/to/dsh-plugin-balance.tgz
```

1. `package.json` 的 dependencies 加入：

   ```json
   "dsh-plugin-balance": "file:/home/yh/work/dsh-plugin-balance"
   ```

2. `cordis.patch.yml` 加入：

   ```yaml
   - insert:
       - id: plugin-balance
         name: dsh-plugin-balance
   ```

3. 执行 `pnpm install`，重启 `dsh web`，刷新浏览器页面。

主进程半需要 `webServer` 与 `credentials` 两个服务（web profile 的 `@deepseek-ai/dsh-web-app` 已提供）；它只用于 OpenCode Go 查询和 DeepSeek 无浏览器 Key 时的回退查询。

## 设置说明

点击悬浮窗的开关（switch）按钮：

- **DeepSeek 官方余额**：可以留空 Key（自动使用 DSH 的 `DEEPSEEK_API_KEY`），也可以填写 Key（浏览器直连，Key 仅保存在浏览器 localStorage）。填写了 Key 时还可以改接口地址，用于兼容 `/user/balance` 的网关。
- **OpenCode Go 套餐用量**：无需填写任何内容，自动读取 DSH 凭据 `OPENCODE_GO_API_KEY`（或 `OPENCODE_API_KEY`），显示滚动 / 本周 / 本月用量。

## 文件

- `lib/index.js` — Host 半：`/api/dsh-plugin-balance/query` 同源代理、凭据解析、上游查询与 30 秒缓存；token 用量折叠、持久化与 `/api/dsh-plugin-balance/tokens` 统计接口。
- `lib/client.js` — Client 半：`shell.overlay` 悬浮窗、输入框上方定位、可拖动并持久化位置、主题配色、两种账户的展示、三周期百分比徽章与 Token 使用量面板。
