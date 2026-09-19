const aedes = require("aedes")();
const { createServer } = require("aedes-server-factory");
const server = createServer(aedes, { ws: true });
aedes.on("client", c => console.log("[broker] joined:", c.id));
aedes.on("publish", (packet, c) => {
  if (c) console.log("[broker] carried", packet.payload.length, "bytes on", packet.topic);
});
server.listen(9004, "127.0.0.1", () => console.log("[broker] listening on ws://127.0.0.1:9004"));
