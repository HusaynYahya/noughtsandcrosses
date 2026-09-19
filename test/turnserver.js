const Turn = require("node-turn");
const server = new Turn({
  listeningIps: ["127.0.0.1"],
  listeningPort: 3478,
  authMech: "long-term",
  credentials: { gamer: "letmein" },
  debugLevel: "INFO"
});
server.start();
console.log("[turn] relay listening on 127.0.0.1:3478 (gamer/letmein)");
