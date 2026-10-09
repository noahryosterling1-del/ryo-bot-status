require("dotenv").config();
const { ShardingManager } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const dashboardUrl = (process.env.DASHBOARD_URL || "").replace(/\/+$/, "");
const apiKey = process.env.DASHBOARD_API_KEY;
const totalShards = Number.parseInt(process.env.TOTAL_SHARDS || "1", 10);
const clusterSize = Math.max(1, Number.parseInt(process.env.CLUSTER_SIZE || "4", 10));

if (!token) throw new Error("Missing DISCORD_TOKEN");
if (!dashboardUrl) throw new Error("Missing DASHBOARD_URL");
if (!apiKey) throw new Error("Missing DASHBOARD_API_KEY");
if (!Number.isInteger(totalShards) || totalShards < 1) throw new Error("TOTAL_SHARDS must be a positive integer");

const manager = new ShardingManager("./bot.js", { token, totalShards, respawn: true });
const shardStates = new Map(Array.from({length: totalShards}, (_, id) => [id, {
  id, status: "unknown", guildCount: null, ping: null, cluster: Math.floor(id / clusterSize)
}]));

async function report() {
  const payload = { updatedAt: Date.now(), totalShards, clusterSize, shards: [...shardStates.values()] };
  try {
    const response = await fetch(`${dashboardUrl}/api/update`, {
      method: "POST",
      headers: {"content-type":"application/json","authorization":`Bearer ${apiKey}`},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) console.error(`[dashboard] update failed: ${response.status} ${await response.text()}`);
  } catch (error) {
    console.error("[dashboard] update error:", error.message);
  }
}

manager.on("shardCreate", shard => {
  const id = shard.id;
  shardStates.set(id, {...shardStates.get(id), status: "logging_in"});
  console.log(`[manager] launched shard ${id}`);
  shard.on("message", message => {
    if (!message || message.type !== "shard-status" || Number(message.id) !== id) return;
    shardStates.set(id, {
      ...shardStates.get(id),
      status: ["ok","disconnected","logging_in","reconnecting","dead","unknown"].includes(message.status) ? message.status : "unknown",
      guildCount: Number.isFinite(Number(message.guildCount)) ? Number(message.guildCount) : null,
      ping: Number.isFinite(Number(message.ping)) && Number(message.ping) >= 0 ? Number(message.ping) : null
    });
    report();
  });
  shard.on("disconnect", () => { shardStates.set(id, {...shardStates.get(id), status:"disconnected"}); report(); });
  shard.on("reconnecting", () => { shardStates.set(id, {...shardStates.get(id), status:"reconnecting"}); report(); });
  shard.on("death", () => { shardStates.set(id, {...shardStates.get(id), status:"dead"}); report(); });
  report();
});

setInterval(report, 5000);
manager.spawn({ timeout: 120000 }).then(report).catch(error => {
  console.error("[manager] failed to spawn shards:", error);
  process.exitCode = 1;
});
