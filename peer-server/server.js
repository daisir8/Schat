// 极简 PeerJS 信令服务（仅用于交换 WebRTC 连接信息，不经过聊天内容）
// 部署到 Render / Railway / Fly.io 等免费平台即可，在 app.js 的 SIGNAL 中填入本服务地址。
const { PeerServer } = require('peer');

const port = process.env.PORT || 3001;
const path = process.env.PEER_PATH || '/';

const server = PeerServer({ port, path, allow_discovery: false });

server.on('connection', (id) => {
  console.log('peer connected:', id);
});
server.on('disconnect', (id) => {
  console.log('peer disconnected:', id);
});

console.log(`PeerJS signaling server listening on :${port}${path}`);
