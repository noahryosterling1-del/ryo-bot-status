const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  shards: "auto"
});

function sendStatus(status) {
  if (typeof process.send !== "function") return;
  process.send({
    type: "shard-status",
    id: client.shard?.ids?.[0] ?? 0,
    status,
    guildCount: client.guilds.cache.size,
    ping: Number.isFinite(client.ws.ping) && client.ws.ping >= 0 ? client.ws.ping : null
  });
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag} | shard(s): ${(client.shard?.ids || []).join(", ")}`);
  sendStatus("ok");
});
client.on("shardDisconnect", () => sendStatus("disconnected"));
client.on("shardReconnecting", () => sendStatus("reconnecting"));
client.on("shardReady", () => sendStatus("ok"));

client.login();
