/* Testler için küçük bir WebSocket sunucusu (bağımlılık yok).
 *
 * Uzantının iki ağ özelliği — OBS bağlantısı ve masaüstü köprüsü — yalnızca
 * karşı tarafta gerçek bir sunucu varken çalışıyor. Gerçek OBS ve gerçek
 * masaüstü uygulaması açmadan sınayabilmek için karşı tarafı burada taklit
 * ediyoruz; uzantı tarafındaki istemci kodu gerçekten konuşuyor.
 *
 * Yalnızca testin ihtiyacı kadarı: el sıkışma, maskeli istemci çerçevelerini
 * çözme, maskesiz metin çerçevesi yazma.
 */
const http = require('http');
const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeClose(code, reason) {
  const r = Buffer.from(String(reason || ''), 'utf8');
  const payload = Buffer.alloc(2 + r.length);
  payload.writeUInt16BE(code, 0);
  r.copy(payload, 2);
  const head = Buffer.alloc(2);
  head[0] = 0x88;                                   // FIN + close
  head[1] = payload.length;
  return Buffer.concat([head, payload]);
}

function encode(data) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x81;                                   // FIN + metin
  return Buffer.concat([head, payload]);
}

function parser(onText, onClose) {
  let buf = Buffer.alloc(0);
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + 4 + len) return;
      const key = buf.slice(off, off + 4);
      const payload = buf.slice(off + 4, off + 4 + len);
      for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
      buf = buf.slice(off + 4 + len);
      if (opcode === 0x8) { onClose(); return; }
      if (opcode === 0x1 || opcode === 0x0) onText(payload.toString('utf8'));
    }
  };
}

/* onConnect(client) -> client.send(obj), client.close(); onMessage(obj, client) */
function start({ port, onConnect, onMessage }) {
  const sockets = new Set();
  const server = http.createServer((req, res) => { res.writeHead(426); res.end(); });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n');
    sockets.add(socket);
    const client = {
      origin: req.headers.origin || '',
      send: obj => { try { socket.write(encode(JSON.stringify(obj))); } catch (e) {} },
      // Durum kodlu kapanış: istemci "neden" kapandığını ancak böyle öğrenir
      close: (code, reason) => {
        try { if (code) socket.write(encodeClose(code, reason)); } catch (e) {}
        try { socket.destroy(); } catch (e) {}
      }
    };
    const push = parser(
      text => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (onMessage) onMessage(m, client); },
      () => { sockets.delete(socket); try { socket.destroy(); } catch (e) {} }
    );
    socket.on('data', c => { try { push(c); } catch (e) {} });
    socket.on('error', () => sockets.delete(socket));
    socket.on('close', () => sockets.delete(socket));
    if (onConnect) onConnect(client);
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => resolve({
      port,
      stop: () => { for (const s of sockets) { try { s.destroy(); } catch (e) {} } server.close(); }
    }));
  });
}

module.exports = { start };
