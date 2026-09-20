/* ============================================================================
   A WebSocket server, in as little code as the protocol allows
   ----------------------------------------------------------------------------
   The rest of this project vendors nothing it can write itself, and the
   WebSocket handshake is a hash and a header. Framing is a length, a mask and
   a payload. Doing it here means the server runs anywhere Node runs, with no
   install step and nothing to keep up to date.

   What this does: text and binary frames, continuation frames, ping and pong,
   close with a code, and a cap on how much one connection may send at once.
   What it does not: extensions, compression, or being a client.
   ============================================================================ */
"use strict";
const crypto = require("crypto");

const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 1 << 20;        /* a megabyte is far more than a game needs */

function accept(key) {
  return crypto.createHash("sha1").update(key + MAGIC).digest("base64");
}

/* ---- writing ------------------------------------------------------------- */
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | opcode;          /* FIN, and the opcode */
  return Buffer.concat([head, payload]);
}

/* ---- one connection ------------------------------------------------------ */
class Socket {
  constructor(socket, head) {
    this.socket = socket;
    this.open = true;
    this.handlers = {};
    this.buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOp = 0;
    this.alive = true;

    socket.on("data", (chunk) => this.feed(chunk));
    socket.on("error", () => this.shut(1006));
    socket.on("close", () => this.shut(1006));
    socket.setTimeout(0);
    socket.setNoDelay(true);
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...args) { if (this.handlers[name]) this.handlers[name](...args); }

  send(text) {
    if (!this.open) return false;
    try { this.socket.write(frame(0x1, Buffer.from(String(text), "utf8"))); }
    catch (e) { return false; }
    return true;
  }

  ping() {
    if (!this.open) return;
    try { this.socket.write(frame(0x9, Buffer.alloc(0))); } catch (e) {}
  }

  close(code = 1000, why = "") {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(why));
    body.writeUInt16BE(code, 0);
    body.write(why, 2);
    try { this.socket.write(frame(0x8, body)); } catch (e) {}
    this.shut(code);
    try { this.socket.end(); } catch (e) {}
  }

  shut(code) {
    if (!this.open) return;
    this.open = false;
    this.emit("close", code);
    try { this.socket.destroy(); } catch (e) {}
  }

  /* ---- reading ----------------------------------------------------------- */
  feed(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    for (;;) {
      const taken = this.readFrame();
      if (!taken) return;
    }
  }

  readFrame() {
    const b = this.buffer;
    if (b.length < 2) return false;

    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let at = 2;

    if (len === 126) {
      if (b.length < at + 2) return false;
      len = b.readUInt16BE(at);
      at += 2;
    } else if (len === 127) {
      if (b.length < at + 8) return false;
      const big = b.readBigUInt64BE(at);
      if (big > BigInt(MAX_MESSAGE)) { this.close(1009, "too big"); return false; }
      len = Number(big);
      at += 8;
    }
    /* every frame from a browser is masked; an unmasked one is a broken client */
    if (!masked) { this.close(1002, "unmasked"); return false; }
    if (b.length < at + 4 + len) return false;

    const mask = b.subarray(at, at + 4);
    at += 4;
    const body = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) body[i] = b[at + i] ^ mask[i & 3];
    this.buffer = b.subarray(at + len);

    if (opcode === 0x8) { this.close(1000); return false; }        /* they hung up */
    if (opcode === 0x9) {                                          /* ping -> pong */
      try { this.socket.write(frame(0xa, body)); } catch (e) {}
      return true;
    }
    if (opcode === 0xa) { this.alive = true; return true; }        /* pong */

    if (opcode === 0x0) {                                          /* continuation */
      this.fragments.push(body);
    } else {
      this.fragments = [body];
      this.fragmentOp = opcode;
    }
    const size = this.fragments.reduce((n, f) => n + f.length, 0);
    if (size > MAX_MESSAGE) { this.close(1009, "too big"); return false; }
    if (!fin) return true;

    const whole = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.fragmentOp === 0x1) this.emit("text", whole.toString("utf8"));
    else this.emit("binary", whole);
    return true;
  }
}

/* Answer an upgrade request, or refuse it. Returns the Socket, or null. */
function upgrade(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (req.headers.upgrade !== "websocket" || !key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return null;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept(key) + "\r\n\r\n");
  return new Socket(socket, head);
}

module.exports = { upgrade, Socket, MAX_MESSAGE };
