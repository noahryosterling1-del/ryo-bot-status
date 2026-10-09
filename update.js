// Authenticated shard snapshot ingestion endpoint backed by Upstash Redis REST.
const ALLOWED = new Set(["ok", "disconnected", "logging_in", "reconnecting", "dead", "unknown"]);
const MAX_BODY_BYTES = 128 * 1024;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.DASHBOARD_API_KEY;
  if (!expected) return res.status(503).json({ error: "DASHBOARD_API_KEY is not configured" });
  if ((req.headers.authorization || "") !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return res.status(503).json({ error: "Status storage is not configured." });

  let body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return res.status(413).json({ error: "Payload too large" });
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.shards)) {
    return res.status(400).json({ error: "Expected JSON with a shards array" });
  }
  const total = Number.parseInt(body.totalShards || process.env.TOTAL_SHARDS || "1", 10);
  const clusterSize = Math.max(1, Number.parseInt(body.clusterSize || process.env.CLUSTER_SIZE || "4", 10));
  if (!Number.isInteger(total) || total < 1 || total > 2500) return res.status(400).json({ error: "Invalid totalShards" });
  if (JSON.stringify(body).length > MAX_BODY_BYTES) return res.status(413).json({ error: "Payload too large" });

  const shards = [];
  for (const item of body.shards) {
    const id = Number(item.id);
    if (!Number.isInteger(id) || id < 0 || id >= total) continue;
    shards.push({
      id,
      status: ALLOWED.has(item.status) ? item.status : "unknown",
      guildCount: Number.isFinite(Number(item.guildCount)) ? Math.max(0, Number(item.guildCount)) : null,
      ping: Number.isFinite(Number(item.ping)) ? Math.max(0, Number(item.ping)) : null,
      cluster: Number.isInteger(Number(item.cluster)) && Number(item.cluster) >= 0 ? Number(item.cluster) : Math.floor(id / clusterSize),
      updatedAt: Date.now()
    });
  }
  const snapshot = { updatedAt: Date.now(), totalShards: total, clusterSize, shards, note: null };
  try {
    const response = await fetch(`${redisUrl.replace(/\/+$/, "")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", "shard-status", JSON.stringify(snapshot)])
    });
    if (!response.ok) throw new Error(`Redis returned ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return res.status(200).json({ ok: true, received: shards.length, updatedAt: snapshot.updatedAt });
  } catch (error) {
    console.error("[update] storage write failed:", error.message);
    return res.status(502).json({ error: "Could not save shard status." });
  }
};
