# 无服务器聊天室（Serverless P2P Chat）

纯静态、点对点（WebRTC）聊天室，可直接部署到 GitHub Pages。
**消息不经过任何应用服务器**，仅在浏览器之间端到端加密直连（WebRTC DTLS）。

## 部署到 GitHub Pages 后"一直显示正在进入房间中"怎么办？

这是**最常见的坑**：之前 PeerJS 库是从 `unpkg.com` 这类公共 CDN 加载的，而国内网络经常访问不了，
导致 `Peer` 未定义、`new Peer()` 抛错，于是永远卡在"正在进入房间中"。本地两个标签页能通，往往只是当时 CDN 可达或有缓存。

本仓库已修复：

- **PeerJS 库改为本地文件 `peerjs.min.js`**，不再依赖任何 CDN（务必把这个文件一起推上仓库）。
- 连接失败 / 超时会显示明确错误，并出现「重试」按钮，不再静默卡死。
- 信令服务器可在 `app.js` 顶部 `SIGNAL` 中配置。

如果改用本地库后仍连不上，基本就是 **PeerJS 公共信令服务器（0.peerjs.com）也被网络限制**了。
解决办法：部署一个自己的信令服务（见下文「自建信令服务」），然后在 `app.js` 里：

```js
const SIGNAL = { host: '你的服务域名', port: 443, path: '/', secure: true };
```

## 原理

- 进入时输入「房间码」，相同房间码的人进入同一个房间。
- 房间内自动选举一名「房主（Host）」作为连接中转；消息只在成员浏览器之间传输，服务器看不到内容。
- 房主离开时，其余成员会自动重新选举新房主并恢复连接。
- 仅「建立连接」这一步（信令）使用 PeerJS 公共中转，用来交换连接信息，**不触碰聊天内容**。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库（例如 `chatroom`）。
2. 把本目录的 `index.html`、`styles.css`、`app.js` 推送到仓库（可用根目录，也可用 `docs/` 目录）。
3. 仓库 → **Settings → Pages** → Source 选择 `main` 分支（或 `docs` 目录）→ 保存。
4. 等待约 1 分钟，访问 `https://<用户名>.github.io/<仓库名>/` 即可。

> 提示：若使用 `docs/` 目录部署，请把 `index.html`、`styles.css`、`app.js`、`peerjs.min.js` 放在 `docs/` 下，并在 Pages 设置里选择 `docs` 目录。

## 使用

- 打开网页，输入相同的「房间码」即可进入同一个房间实时聊天。
- 昵称留空会自动生成。
- 刷新页面会清空聊天记录（无服务器存储，属预期行为）。

## 想要完全零第三方？

当前信令依赖 PeerJS 公共 broker。若希望彻底不依赖任何第三方，可：

- 自建 PeerJS 信令服务（或任何 WebRTC 信令服务），然后修改 `app.js` 中 `SIGNAL` 配置（传入 `{ host, port, path, secure }`）。
- 或改为「手动复制连接码」的纯 P2P 模式（牺牲一点便捷性）。

## 自建信令服务（国内网络推荐）

聊天内容永远只在浏览器之间传输；这个服务**只负责交换连接信息**（类似"接线员"），可免费部署。

1. 仓库里已有 `peer-server/` 目录（`server.js` + `package.json` + `render.yaml`）。
2. 在 Render 新建 Blueprint 服务并关联本仓库，或新建 Web 服务指向 `peer-server` 目录，`npm install && npm start`。
   Railway / Fly.io 同理，监听 `process.env.PORT`。
3. 部署完成后会得到一个域名（如 `https://chatroom-peer-server.onrender.com`）。
4. 在 `app.js` 顶部修改：
   ```js
   const SIGNAL = { host: 'chatroom-peer-server.onrender.com', port: 443, path: '/', secure: true };
   ```
5. 重新部署 GitHub Pages，即可稳定连接（不再依赖公共 broker）。

> 免费服务可能休眠：首次连接稍慢属正常。也可换用任意支持 WebSocket 的信令服务。

## 文件说明

- `index.html` — 落地页（输入房间码/昵称）与聊天界面
- `styles.css` — 样式
- `app.js` — WebRTC 连接、房主选举、消息收发逻辑（顶部 `SIGNAL` 可配置信令服务）
- `peerjs.min.js` — 本地打包的 PeerJS 库（**必须随页面一起部署**，不再依赖 CDN）
- `peer-server/` — 可选的自建信令服务（国内网络推荐）
