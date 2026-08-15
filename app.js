(function () {
  'use strict';

  // 房间码 -> 唯一的房主 Peer ID 前缀/后缀
  const ROOM_PREFIX = 'chatroom_';
  const HOST_SUFFIX = '_host';

  const landing = document.getElementById('landing');
  const chat = document.getElementById('chat');
  const roomInput = document.getElementById('room-input');
  const nameInput = document.getElementById('name-input');
  const joinBtn = document.getElementById('join-btn');
  const leaveBtn = document.getElementById('leave-btn');
  const retryBtn = document.getElementById('retry-btn');
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const roomLabel = document.getElementById('room-label');
  const onlineLabel = document.getElementById('online-label');
  const statusEl = document.getElementById('status');

  // ===== 信令服务器配置（仅用于交换连接信息，不经过聊天内容）=====
  // 留空 {} 表示使用 PeerJS 公共云（0.peerjs.com）。
  // 若在国内访问不稳定 / 被墙，请改为自建 PeerJS 信令服务，例如：
  //   const SIGNAL = { host: '你的服务域名', port: 443, path: '/', secure: true };
  // 自建服务代码见仓库 peer-server/ 目录（可一键部署到 Render / Railway / Fly.io）。
  const SIGNAL = {};

  let peer = null;     // PeerJS 实例
  let conn = null;     // 客户端 -> 房主 的连接
  let role = null;     // 'host' | 'client'
  let myName = '匿名';
  let room = '';
  const clients = new Map(); // 房主视角：DataConnection -> { name }
  let peerListView = [];     // 客户端视角：已知成员昵称列表（含房主与其他人）
  let connectTimer = null;

  // ---------- Peer 创建 / 连接超时 ----------
  function makePeer(id) {
    if (typeof Peer === 'undefined') {
      status('PeerJS 库未加载，请确认 peerjs.min.js 已随页面一起部署', 'err');
      return null;
    }
    const opts = Object.assign({ debug: 0 }, SIGNAL);
    return id ? new Peer(id, opts) : new Peer(opts);
  }

  function clearConnectTimer() {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  }

  function armConnectTimer() {
    clearConnectTimer();
    connectTimer = setTimeout(() => {
      if (role === 'host' || role === 'client') {
        status('连接超时：信令服务器不可达。请检查网络，或改用自建信令服务后点「重试」。', 'err');
        showRetry(true);
      }
    }, 10000);
  }

  function showRetry(on) {
    if (retryBtn) retryBtn.style.display = on ? 'inline-block' : 'none';
  }

  // ---------- 工具 ----------
  function sanitizeRoom(code) {
    const s = (code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return ROOM_PREFIX + (s || 'default');
  }
  function hostId() { return room + HOST_SUFFIX; }

  function status(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' status-' + kind : '');
  }

  function nowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderMessage(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.self ? 'msg-self' : 'msg-other');
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = (m.self ? '我' : (m.name || '匿名')) + ' · ' + nowTime();
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = m.text;
    wrap.appendChild(meta);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollBottom();
  }

  function renderSystem(text) {
    const el = document.createElement('div');
    el.className = 'msg-system';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollBottom();
  }

  function updateOnline() {
    let count, label;
    if (role === 'host') {
      count = clients.size + 1;
      label = '在线 ' + count + ' 人（你是房主）';
    } else if (role === 'client') {
      count = peerListView.length + 1; // + 自己
      label = '在线 ' + count + ' 人';
    } else {
      label = '';
    }
    onlineLabel.textContent = label;
  }

  // ---------- 发送 ----------
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    const msg = { type: 'msg', name: myName, text: text, ts: Date.now() };
    renderMessage(Object.assign({}, msg, { self: true }));
    if (role === 'host') {
      hostBroadcast(msg);
    } else if (conn && conn.open) {
      conn.send(msg);
    }
  }

  function hostBroadcast(data) {
    clients.forEach((info, c) => { if (c.open) c.send(data); });
  }
  function relayToOthers(sender, data) {
    clients.forEach((info, c) => { if (c !== sender && c.open) c.send(data); });
  }

  function resetPeer() {
    clearConnectTimer();
    showRetry(false);
    if (peer) { try { peer.destroy(); } catch (e) {} }
    peer = null;
    conn = null;
  }

  // ---------- 房主（Host）----------
  function becomeHost() {
    role = 'host';
    clients.clear();
    resetPeer();
    peer = makePeer(hostId());
    if (!peer) return;
    armConnectTimer();
    peer.on('open', () => {
      clearConnectTimer();
      showRetry(false);
      status('你已成为房主，等待其他人加入…', 'ok');
      updateOnline();
    });
    peer.on('connection', (connection) => {
      clients.set(connection, { name: '匿名' });
      connection.on('data', (data) => onHostData(connection, data));
      connection.on('close', () => {
        const info = clients.get(connection);
        clients.delete(connection);
        if (info) {
          renderSystem(info.name + ' 离开了房间');
          relayToOthers(null, { type: 'leave', name: info.name, ts: Date.now() });
        }
        updateOnline();
      });
      connection.on('error', () => {});
    });
    peer.on('error', (err) => {
      clearConnectTimer();
      if (err.type === 'unavailable-id') {
        // 房间已有房主，改为客户端接入
        becomeClient();
      } else {
        status('连接出错：' + err.type, 'err');
        showRetry(true);
      }
    });
  }

  function onHostData(conn, data) {
    if (!data || !data.type) return;
    if (data.type === 'join') {
      const info = clients.get(conn);
      if (info) info.name = data.name || '匿名';
      relayToOthers(conn, { type: 'join', name: data.name, ts: data.ts });
      renderSystem((data.name || '匿名') + ' 加入了房间');
      // 把当前成员名单发给新加入者
      const names = [myName].concat([...clients.values()].map(i => i.name));
      conn.send({ type: 'peers', names: names });
      updateOnline();
    } else if (data.type === 'msg') {
      renderMessage(Object.assign({}, data, { self: false }));
      relayToOthers(conn, data);
    }
  }

  // ---------- 客户端（Client）----------
  function becomeClient() {
    role = 'client';
    resetPeer();
    peer = makePeer();
    if (!peer) return;
    armConnectTimer();
    peer.on('open', () => {
      clearConnectTimer();
      showRetry(false);
      status('正在连接房间…');
      conn = peer.connect(hostId(), { reliable: true });
      setupClientConn(conn);
    });
    peer.on('error', (err) => {
      clearConnectTimer();
      if (err.type === 'peer-unavailable') {
        // 房主暂时不存在，尝试自己成为房主（重选）
        becomeHost();
      } else {
        status('连接出错：' + err.type, 'err');
        showRetry(true);
      }
    });
  }

  function setupClientConn(connection) {
    connection.on('open', () => {
      connection.send({ type: 'join', name: myName, ts: Date.now() });
      status('已连接，可以开始聊天', 'ok');
      updateOnline();
    });
    connection.on('data', (data) => onClientData(data));
    connection.on('close', () => {
      status('与房主断开，正在尝试重新进入…');
      retryJoin();
    });
    connection.on('error', () => {});
  }

  function onClientData(data) {
    if (!data || !data.type) return;
    if (data.type === 'msg') {
      renderMessage(Object.assign({}, data, { self: false }));
    } else if (data.type === 'join') {
      renderSystem((data.name || '匿名') + ' 加入了房间');
    } else if (data.type === 'leave') {
      renderSystem((data.name || '匿名') + ' 离开了房间');
    } else if (data.type === 'peers') {
      peerListView = data.names || [];
      updateOnline();
    }
  }

  // 客户端失连后自动重选房主/重连
  function retryJoin() {
    role = null;
    becomeHost();
  }

  // ---------- 进入 / 退出 / 重试 ----------
  function join() {
    const code = roomInput.value.trim();
    const nm = nameInput.value.trim();
    if (!code) { roomInput.focus(); return; }
    room = sanitizeRoom(code);
    myName = nm || ('用户' + Math.floor(Math.random() * 9000 + 1000));
    enterRoom(code);
  }

  function retry() {
    if (!room) { join(); return; }
    const code = room.replace(ROOM_PREFIX, '');
    enterRoom(code);
  }

  function enterRoom(code) {
    landing.style.display = 'none';
    chat.style.display = 'flex';
    roomLabel.textContent = '房间：' + code;
    messagesEl.innerHTML = '';
    peerListView = [];
    renderSystem('正在进入房间「' + code + '」…');
    becomeHost(); // 若房间已有房主，会自动降级为客户端
  }

  function leave() {
    resetPeer();
    role = null;
    clients.clear();
    chat.style.display = 'none';
    landing.style.display = 'flex';
    status('');
    roomInput.value = '';
  }

  // ---------- 事件绑定 ----------
  joinBtn.addEventListener('click', join);
  roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
  leaveBtn.addEventListener('click', leave);
  retryBtn.addEventListener('click', retry);
})();
