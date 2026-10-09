// Public status endpoint backed by shared Upstash Redis REST storage.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(503).json({ error: "Status storage is not configured. Add Upstash Redis environment variables in Vercel." });
  }
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/get/shard-status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Redis returned ${response.status}`);
    const result = await response.json();
    const raw = result.result;
    if (!raw) {
      return res.status(200).json({
        updatedAt: null,
        totalShards: Number.parseInt(process.env.TOTAL_SHARDS || "1", 10),
        clusterSize: Number.parseInt(process.env.CLUSTER_SIZE || "4", 10),
        shards: [],
        note: "Waiting for the bot to send its first update."
      });
    }
    return res.status(200).json(JSON.parse(raw));
  } catch (error) {
    console.error("[status] storage read failed:", error.message);
    return res.status(502).json({ error: "Could not read shard status storage." });
  }
};
