function fmt(n) { return typeof n === "number" ? n.toFixed(5) : "—"; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function load() {
  let data = [];
  try {
    const res = await fetch("/api/locations");
    data = await res.json();
  } catch {
    document.getElementById("tableWrap").innerHTML =
      '<p class="empty">Could not load captures.</p>';
    return;
  }

  document.getElementById("count").textContent =
    `${data.length} record${data.length === 1 ? "" : "s"}`;

  const map = L.map("allmap").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const points = [];
  for (const e of data) {
    const precise = !!e.gps;
    const loc = e.gps || e.ipLocation;
    if (loc && loc.lat != null) {
      const color = precise ? "#2dd4bf" : "#f5a524";
      L.circleMarker([loc.lat, loc.lng], {
        radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 2,
      }).addTo(map).bindPopup(
        `${precise ? "GPS" : "IP"}<br>${fmt(loc.lat)}, ${fmt(loc.lng)}`
      );
      points.push([loc.lat, loc.lng]);
    }
  }
  if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });

  if (!data.length) {
    document.getElementById("tableWrap").innerHTML =
      '<p class="empty">No captures yet. Open the main page and share a location.</p>';
    return;
  }

  const rows = data.slice().reverse().map((e) => {
    const precise = !!e.gps;
    const loc = e.gps || e.ipLocation || {};
    const place = e.ipLocation
      ? [e.ipLocation.city, e.ipLocation.country].filter(Boolean).join(", ")
      : "";
    const when = new Date(e.timestamp).toLocaleString();
    return `<tr>
      <td>${esc(when)}</td>
      <td><span class="pill ${precise ? "gps" : "ip"}">${precise ? "gps" : "ip"}</span></td>
      <td>${fmt(loc.lat)}, ${fmt(loc.lng)}</td>
      <td>${precise && e.gps.accuracy != null ? Math.round(e.gps.accuracy) + " m" : "—"}</td>
      <td>${esc(place)}</td>
      <td>${esc(e.ip)}</td>
    </tr>`;
  }).join("");

  document.getElementById("tableWrap").innerHTML = `
    <table>
      <thead><tr>
        <th>time</th><th>source</th><th>lat, lng</th>
        <th>±</th><th>ip location</th><th>ip</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

load();
