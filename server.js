// Charter Captain – Spielseite + Vermittlungs-Server (läuft auf Render).
//
// 1) Liefert die Browser-Version des Spiels aus (Ordner ./public, beim Render-Build
//    aus dem GitHub-Release geladen).
// 2) Vermittlungs-Server über WebSocket (gleiche Adresse wie die Seite):
// Der Host erstellt einen Raum und bekommt einen kurzen Code (z. B. "KX7P").
// Mitspieler treten mit dem Code bei. Der Server leitet nur Datenpakete zwischen
// Host und Mitspielern weiter – das eigentliche Spiel läuft beim Host.
//
// Nachrichten:
//   Text (JSON) zur Steuerung:  {t:"host"} | {t:"join", code} | {t:"kick", id}
//   Antworten:                  {t:"hosted", code, id:1} | {t:"joined", code, id}
//                               {t:"peer_connected", id} | {t:"peer_disconnected", id} | {t:"error", msg}
//   Binär (Spieldaten): die ersten 4 Bytes sind die Spieler-ID (int32, little endian).
//     Vom Spieler zum Server = Empfänger (0 = alle, negativ = alle außer), vom Server = Absender.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O und 1/I (leicht zu verwechseln)

const rooms = new Map(); // Code → { code, peers: Map<id, socket> }

const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`Charter Captain Server läuft. Offene Räume: ${rooms.size}\n`);
  }
  // Spieldateien ausliefern (nur aus ./public, keine Pfade nach oben)
  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Nicht gefunden');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  fs.createReadStream(file).pipe(res);
});
const wss = new WebSocketServer({ server, maxPayload: 4 * 1024 * 1024 });

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function newPeerId(room) {
  let id;
  do {
    id = 2 + Math.floor(Math.random() * 0x7ffffff0);
  } while (room.peers.has(id));
  return id;
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function leave(socket) {
  const room = socket.room;
  if (!room) return;
  socket.room = null;
  room.peers.delete(socket.peerId);
  if (socket.peerId === 1) {
    // Host weg → Raum schließen, alle Mitspieler trennen
    for (const other of room.peers.values()) {
      send(other, { t: 'peer_disconnected', id: 1 });
      other.room = null;
      other.close(4000, 'Host hat das Spiel verlassen');
    }
    rooms.delete(room.code);
  } else {
    const host = room.peers.get(1);
    if (host) send(host, { t: 'peer_disconnected', id: socket.peerId });
  }
}

function handleControl(socket, text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (message.t === 'host' && !socket.room) {
    const room = { code: newCode(), peers: new Map() };
    rooms.set(room.code, room);
    socket.room = room;
    socket.peerId = 1;
    room.peers.set(1, socket);
    send(socket, { t: 'hosted', code: room.code, id: 1 });
  } else if (message.t === 'join' && !socket.room) {
    const room = rooms.get(String(message.code || '').trim().toUpperCase());
    if (!room) return send(socket, { t: 'error', msg: 'Raum nicht gefunden. Code prüfen.' });
    if (room.peers.size >= MAX_PLAYERS) return send(socket, { t: 'error', msg: 'Der Raum ist voll (4 Spieler).' });
    const id = newPeerId(room);
    socket.room = room;
    socket.peerId = id;
    room.peers.set(id, socket);
    send(socket, { t: 'joined', code: room.code, id });
    send(room.peers.get(1), { t: 'peer_connected', id });
  } else if (message.t === 'kick' && socket.peerId === 1 && socket.room) {
    const target = socket.room.peers.get(message.id);
    if (target) target.close(4001, 'Vom Host getrennt');
  }
}

function handleData(socket, data) {
  const room = socket.room;
  if (!room || data.length < 4) return;
  const target = data.readInt32LE(0);
  data.writeInt32LE(socket.peerId, 0); // Empfänger erfährt den Absender
  if (socket.peerId !== 1) {
    // Mitspieler reden nur mit dem Host (Godot leitet selbst weiter)
    const host = room.peers.get(1);
    if (host && host.readyState === host.OPEN) host.send(data);
    return;
  }
  for (const [id, other] of room.peers) {
    if (id === 1 || other.readyState !== other.OPEN) continue;
    if (target === 0 || target === id || (target < 0 && -target !== id)) other.send(data);
  }
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (data, isBinary) => {
    if (isBinary) handleData(socket, Buffer.from(data));
    else handleControl(socket, data.toString());
  });
  socket.on('close', () => leave(socket));
  socket.on('error', () => leave(socket));
});

// Verbindungen am Leben halten und tote Verbindungen aufräumen
setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 25000);

server.listen(PORT, () => console.log(`Vermittlungs-Server auf Port ${PORT}`));
