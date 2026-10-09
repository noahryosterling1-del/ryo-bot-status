const $ = (id) => document.getElementById(id);
const statusLabels = {ok:"OK", logging_in:"Logging in", reconnecting:"Reconnecting", dead:"Dead", disconnected:"Offline", unknown:"Unknown"};
let current = { totalShards: 1, shards: [], updatedAt: null };
let selectedShard = null;

function formatTime(value) {
  if (!value) return "Last update: —";
  return "Last update: " + new Date(value).toLocaleTimeString();
}
function render(data) {
  const total = Math.max(1, Number(data.totalShards) || 1);
  current = {...data, totalShards: total, shards: Array.isArray(data.shards) ? data.shards : []};
  const byId = new Map(current.shards.map(s => [Number(s.id), s]));
  let connected = 0, issues = 0, guilds = 0;
  for (let i=0;i<total;i++) {
    const s=byId.get(i);
    if (s?.status === "ok") connected++;
    else if (s && !["unknown","logging_in"].includes(s.status)) issues++;
    if (Number.isFinite(Number(s?.guildCount))) guilds += Number(s.guildCount);
  }
  $("total").textContent = total;
  $("connected").textContent = connected;
  $("issues").textContent = issues;
  $("guilds").textContent = guilds.toLocaleString();
  $("last-update").textContent = formatTime(data.updatedAt);
  const overall = $("overall");
  overall.className = "pill " + (connected === total ? "ok" : current.shards.length ? "bad" : "neutral");
  overall.textContent = connected === total ? "All reported shards OK" : current.shards.length ? `${connected}/${total} shards connected` : "Waiting for data";

  const clusterSize = Math.max(1, Number(data.clusterSize) || Number(window.CLUSTER_SIZE) || 4);
  const groupCount = Math.ceil(total / clusterSize);
  const root = $("clusters");
  root.innerHTML = "";
  if (!current.shards.length) {
    root.innerHTML = '<div class="empty">No shard updates received yet. Start the bot reporter and check the API configuration.</div>';
    $("notice").textContent = data.note || "";
    return;
  }
  for (let cluster=0;cluster<groupCount;cluster++) {
    const section=document.createElement("section");
    const heading=document.createElement("h3");
    heading.className="cluster-title";
    heading.textContent=`Cluster ${cluster} · shards ${cluster*clusterSize}–${Math.min(total-1,(cluster+1)*clusterSize-1)}`;
    section.appendChild(heading);
    const tiles=document.createElement("div"); tiles.className="tiles";
    for(let id=cluster*clusterSize;id<Math.min(total,(cluster+1)*clusterSize);id++){
      const s=byId.get(id)||{id,status:"unknown"};
      const tile=document.createElement("button");
      tile.type="button"; tile.className=`tile ${statusLabels[s.status]?s.status:"unknown"}${selectedShard===id?" selected":""}`;
      tile.title=`Shard ${id} · ${statusLabels[s.status]||"Unknown"}${s.guildCount!=null?" · "+s.guildCount+" guilds":""}${s.ping!=null?" · "+s.ping+" ms":""}`;
      const number=document.createElement("b");number.textContent=id;
      const label=document.createElement("small");label.textContent=statusLabels[s.status]||"Unknown";
      tile.append(number,label);
      tile.addEventListener("click",()=>{selectedShard=id;render(current);$("notice").textContent=`Shard ${id}: ${statusLabels[s.status]||"Unknown"}${s.guildCount!=null?" · "+s.guildCount+" guilds":""}${s.ping!=null?" · "+s.ping+" ms ping":""}.`;});
      tiles.appendChild(tile);
    }
    section.appendChild(tiles);root.appendChild(section);
  }
  $("notice").textContent = data.note || "";
}
async function refresh() {
  try {
    const response=await fetch("/api/status",{cache:"no-store"});
    if(!response.ok) throw new Error(`Status API returned ${response.status}`);
    render(await response.json());
  } catch(err) {
    $("notice").textContent="Unable to load status: "+err.message;
  }
}
$("lookup-form").addEventListener("submit",(event)=>{
  event.preventDefault();
  const value=$("guild-id").value.trim();
  const result=$("lookup-result");
  if(!/^\d{17,20}$/.test(value)){result.textContent="Enter a valid numeric Discord server ID (17–20 digits).";return;}
  if(!current.totalShards){result.textContent="Shard count is not configured yet.";return;}
  try {
    const shardId=Number((BigInt(value)>>22n)%BigInt(current.totalShards));
    const clusterSize=Math.max(1, Number(current.clusterSize) || 4);
    const shard=current.shards.find(s=>Number(s.id)===shardId);
    const status=shard?(statusLabels[shard.status]||"Unknown"):"No status received";
    result.textContent=`Server ID maps to shard ${shardId} · Cluster ${Math.floor(shardId/clusterSize)} · ${status}. This calculation does not confirm that your bot is in that server.`;
    selectedShard=shardId;render(current);
  } catch { result.textContent="Couldn't calculate shard ID. Check the server ID."; }
});
refresh();
setInterval(refresh,5000);
