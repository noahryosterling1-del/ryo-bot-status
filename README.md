# Shard Status Dashboard (Vercel + Discord.js v14)

A separate Vercel-hosted dashboard that receives signed shard updates from your Discord bot. Includes a responsive dashboard, cluster grouping, status colors, server-ID-to-shard lookup, and a protected update API.

## Architecture

- **Vercel** hosts the static dashboard and serverless API (`/api/status`, `/api/update`).
- **Your bot host** runs the Discord.js v14 bot continuously and sends status snapshots to Vercel.
- The dashboard polls every 5 seconds. Vercel Functions are not a persistent WebSocket server, so this project uses short polling.

## Included

- `api/status.js` — public read-only status endpoint.
- `api/update.js` — authenticated update endpoint.
- `public/index.html`, `public/style.css`, `public/app.js` — dashboard.
- `bot-example/` — example Discord.js v14 sharding manager and reporter.
- `vercel.json`, `.env.example`.

## Deploy the dashboard

1. Create a GitHub repository and upload the contents of this folder.
2. Import the repository into Vercel.
3. In **Vercel → Project → Settings → Environment Variables**, add:
   - `DASHBOARD_API_KEY`: a long random secret used only by the bot and update API.
   - `TOTAL_SHARDS`: expected total shard count (for example `4`). This is a display/configuration value, not proof that those shards are online.
   - `CLUSTER_SIZE`: shards grouped per cluster (for example `4`).
   - `UPSTASH_REDIS_REST_URL`: REST URL for your Upstash Redis database.
   - `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST token.
   - `DISCORD_CLIENT_ID`: your Discord application ID, used only for shard-ID calculations.
4. Deploy or redeploy after adding environment variables.
5. Open your Vercel deployment URL.

Generate a secret locally, e.g. with Node:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use the same value for `DASHBOARD_API_KEY` on Vercel and `DASHBOARD_API_KEY` on your bot host. Never put this key in `public/` files or expose it in browser JavaScript.

## Connect your bot

1. Copy `bot-example/` to your bot host, or merge the relevant files into your existing bot project.
2. Install dependencies in that bot project:
```bash
npm install discord.js dotenv
```
3. Set these environment variables in your bot host's panel:
   - `DISCORD_TOKEN`: bot token (keep private)
   - `DASHBOARD_URL`: your Vercel URL, e.g. `https://your-project.vercel.app`
   - `DASHBOARD_API_KEY`: same secret configured in Vercel
   - `TOTAL_SHARDS`: same shard count as Vercel
   - `CLUSTER_SIZE`: optional; defaults to `4`
   - `DISCORD_CLIENT_ID`: your Discord application ID
4. Run `node index.js`.

**Important:** don't run this example as a second copy if you already have a production bot using the same token. Merge the reporting logic into your existing bot or migrate carefully. A bot token should normally have only one active production instance.

## Do I already have shards?

If your current entry point creates `new Client(...)`, calls `client.login(...)`, and does not use `ShardingManager` or worker processes, it is probably an unsharded bot. If you already use `ShardingManager`, `client.shard`, or a cluster manager, you may already be sharded. Check your existing code before replacing it. The example manager starts a separate example bot; do not run it as a second copy of your existing production bot.

For a small bot, you can start with `TOTAL_SHARDS=1` as a simple initial setup. Larger bots may require Discord's recommended shard count and application-specific setup. Do not blindly start a huge number of shards.

## API payload

The bot sends `POST /api/update` with JSON:
```json
{
  "updatedAt": 1791580000000,
  "totalShards": 4,
  "shards": [
    {"id": 0, "status": "ok", "guildCount": 120, "ping": 48, "cluster": 0}
  ]
}
```
Allowed statuses: `ok`, `disconnected`, `logging_in`, `reconnecting`, `dead`, `unknown`.

The update endpoint checks `Authorization: Bearer <DASHBOARD_API_KEY>`. Keep the key private. The latest snapshot is stored in Upstash Redis so separate Vercel Function invocations can share it. The dashboard API is public read-only, so it should not include tokens, guild names, user data, or other private information.

## Server ID lookup

The page calculates a shard ID from a guild/server ID and the configured total shard count using Discord's standard snowflake formula:
`(BigInt(guildId) >> 22n) % totalShards`.

This is a local calculation in the browser and does not require the bot to reveal guild membership. It can identify the expected shard index, but it cannot prove the server is currently in your bot.

## Persistent storage requirement

This project uses Upstash Redis REST storage. Create a Redis database in Upstash and copy its REST URL and REST token into Vercel environment variables. This is required because Vercel Functions are isolated and in-memory state is not shared reliably between requests. Redeploy after adding or changing environment variables.

## Troubleshooting

- **Dashboard says waiting for data:** deploy first, then start the bot reporter and check the bot host logs.
- **401 Unauthorized:** the API keys do not match, or the `Bearer ` prefix is missing.
- **Shard tiles gray:** that shard has not reported a state yet.
- **Shard ID lookup says invalid:** use the numeric Discord server ID (enable Developer Mode in Discord, then copy server ID).
- **Vercel API returns no latest data:** verify Upstash URL/token and make sure the bot reporter is running.
- **Bot login errors:** confirm the token is valid, the bot is invited, and the environment variable names match. Never paste your token into chat.

## Security

Do not commit `.env` files or bot tokens. Rotate any token that has been accidentally shared. Use a strong random `DASHBOARD_API_KEY`. The update endpoint only accepts authenticated JSON and limits payload size.
