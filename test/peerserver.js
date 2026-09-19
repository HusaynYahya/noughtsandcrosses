const { PeerServer } = require("peer");
const server = PeerServer({ host: "127.0.0.1", port: 9000, path: "/unc", allow_discovery: true });
server.on("connection", c => console.log("[server] claimed:", c.getId()));
server.on("disconnect", c => console.log("[server] released:", c.getId()));
console.log("[server] listening on 9000/unc");
