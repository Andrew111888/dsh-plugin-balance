<div align="center">

# dsh-plugin-balance

**A floating credit / quota widget for the DeepSeek Harness Web — plus DSH session token usage & cost stats.**

[English](#-english) · [简体中文](README.zh-CN.md)

</div>

> **English** · [简体中文版 README](README.zh-CN.md)

---

## ✨ What it is

`dsh-plugin-balance` is a DSH (DeepSeek Harness) Web plugin that floats a small widget **right above the input box**. It shows:

- **LLM account balance / quota** for DeepSeek official, **OpenCode Go**, OpenAI, or any custom quota endpoint.
- **OpenCode Go** — the main window shows all three usage periods at a glance: **5h / weekly / monthly** percentage badges (color-coded green → amber → red).
- **DSH session token usage** — how many tokens your DSH chats consumed, tracked **per day / per month / in total, broken down by model**, persisted to disk.
- **Estimated cost** — token usage priced with DeepSeek's official peak / off-peak rates.

The widget is draggable, theme-aware (light/dark), and collapses into a slim pill that keeps a **refresh button**.

## 🖼 Preview

![dsh-plugin-balance preview](docs/preview.png)

## Features

| Area | What you get |
| --- | --- |
| Accounts | DeepSeek official (`/user/balance`), **OpenCode Go** (`/usage` via host proxy), OpenAI `credit_grants`, or a **custom quota endpoint** synced from the DSH model list |
| OpenCode Go display | 5h / 每周 / 每月 percentage chips in the main row, clean percentages in the collapsed pill, reset times in the detail panel |
| Token usage | Today / This month / Total token counts, a last-7-days mini bar chart, and a **per-model** breakdown (input / output / cache-hit) |
| Cost estimate | `≈¥` badges with DeepSeek official peak/off-peak (peak = off-peak × 2; Beijing 9:00–12:00, 14:00–18:00) — only `deepseek-v4-flash` / `deepseek-v4-pro` are priced |
| UX | Draggable, position persisted, click-outside collapses, theme-adaptive, refresh on the pill too |

## 🚀 Install as a DSH plugin

> The plugin is published as a Git repo + `npm pack` tarball. Install it into the **`web` profile** (where the DSH Web UI runs).

### Option A — from the GitHub Release tarball

1. Download `dsh-plugin-balance-<version>.tgz` from the [Releases](https://github.com/Andrew111888/dsh-plugin-balance/releases) page.
2. Add it as a `file:` dependency in your profile's `package.json` (e.g. `~/.dsh/profiles/web/package.json`):

   ```json
   "dependencies": {
     "dsh-plugin-balance": "file:/path/to/dsh-plugin-balance-1.2.0.tgz"
   }
   ```

3. Enable it in `cordis.patch.yml`:

   ```yaml
   - insert:
       - id: plugin-balance
         name: dsh-plugin-balance
   ```

4. Install & restart:

   ```bash
   cd ~/.dsh/profiles/web
   pnpm install
   # restart `dsh web`, then refresh the browser page
   ```

### Option B — local development

```json
"dsh-plugin-balance": "file:/home/yh/work/dsh-plugin-balance"
```

then follow steps 3–4 above.

> Requires the `webServer` and `credentials` services (provided by `@deepseek-ai/dsh-web-app` in the web profile). The host half needs `credentials`, `webServer`, `llm`, `settings`, and `sessions`.

## ⚙️ Usage

Click the **switch** button to open settings:

- **DeepSeek official** — you can leave the key blank to auto-use DSH's `DEEPSEEK_API_KEY`, or enter a key in the browser (stored in `localStorage`). A custom `/user/balance` base URL is supported.
- **OpenCode Go** — nothing to fill in; it auto-reads the DSH credential `OPENCODE_GO_API_KEY` (falls back to `OPENCODE_API_KEY`).
- **Custom quota endpoint** — pick a vendor from the DSH model list (auto-fills `baseURL` + `apiKeyEnv`), or fill the endpoint manually; credentials are resolved host-side, never sent to the browser.

Click the **bar-chart** button to open the **TOKEN 使用量** panel (today / this month / total + 7-day chart + per-model breakdown + cost badges).

## 🧮 Token usage & cost

The host half listens to the DSH session event stream (`session/event`), folds each request's reported token usage (input + cache write, cache hit, output) **by day / month / model**, and persists it to `~/.dsh/storages/dsh-plugin-balance-usage.json`.

- Idempotent: a newer sample for the same `turn:step` replaces the earlier one; replaying logs after a reload / restart never double-counts.
- Served to the client at `GET /api/dsh-plugin-balance/tokens`.
- Cost uses DeepSeek's official pricing (`deepseek-v4-flash` / `deepseek-v4-pro`), priced by the moment each sample occurred (see the note in the UI).

## 📄 License

[BSD-3-Clause](LICENSE)
