const btn       = document.getElementById("shareBtn");
const statusEl  = document.getElementById("status");
const reticle   = document.getElementById("reticle");
const coordsBox = document.getElementById("coords");
const outLat    = document.getElementById("outLat");
const outLng    = document.getElementById("outLng");
const outAcc    = document.getElementById("outAcc");
const mapWrap   = document.getElementById("mapWrap");
const sourceTag = document.getElementById("sourceTag");

let map, marker, ring;

function setStatus(msg, tone) {
  statusEl.textContent = msg;
  if (tone) statusEl.setAttribute("data-tone", tone);
  else statusEl.removeAttribute("data-tone");
}

function showCoords(lat, lng, accuracy) {
  coordsBox.hidden = false;
  outLat.textContent = lat.toFixed(6);
  outLng.textContent = lng.toFixed(6);
  outAcc.textContent = accuracy != null ? `${Math.round(accuracy)} m` : "n/a";
}

function drawMap(lat, lng, accuracy, tone) {
  mapWrap.hidden = false;
  const zoom = tone === "ok" ? 16 : 11;

  if (!map) {
    map = L.map("map", { attributionControl: true }).setView([lat, lng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  } else {
    map.setView([lat, lng], zoom);
  }

  if (marker) map.removeLayer(marker);
  if (ring) map.removeLayer(ring);

  const color = tone === "ok" ? "#2dd4bf" : "#f5a524";
  marker = L.circleMarker([lat, lng], {
    radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2,
  }).addTo(map);

  if (accuracy != null) {
    ring = L.circle([lat, lng], {
      radius: accuracy, color, weight: 1, fillColor: color, fillOpacity: 0.08,
    }).addTo(map);
  }

  sourceTag.textContent = tone === "ok"
    ? "gps · precise"
    : "ip · approximate";
  sourceTag.setAttribute("data-tone", tone);

  // Leaflet needs a nudge when its container was just unhidden.
  setTimeout(() => map.invalidateSize(), 60);
}

async function sendToServer(payload) {
  try {
    const res = await fetch("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return null;
  }
}

async function useIpFallback() {
  setStatus("Permission declined. Estimating from network address…", "warn");
  const result = await sendToServer({}); // no GPS → server does the IP lookup
  if (result && result.ipLocation && result.ipLocation.lat != null) {
    const l = result.ipLocation;
    reticle.setAttribute("data-state", "approx");
    showCoords(l.lat, l.lng, null);
    drawMap(l.lat, l.lng, null, "warn");
    const place = [l.city, l.region, l.country].filter(Boolean).join(", ");
    setStatus(`Approximate fix · ${place || "unknown"} · via ${l.isp || "network"}`, "warn");
  } else {
    reticle.setAttribute("data-state", "idle");
    setStatus("Could not determine a location.", "warn");
  }
  btn.disabled = false;
}

btn.addEventListener("click", () => {
  btn.disabled = true;

  if (!("geolocation" in navigator)) {
    setStatus("This browser does not support geolocation.", "warn");
    btn.disabled = false;
    return;
  }

  setStatus("Waiting for you to allow the browser prompt…");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      reticle.setAttribute("data-state", "locked");
      showCoords(lat, lng, accuracy);
      drawMap(lat, lng, accuracy, "ok");
      setStatus(`Locked · GPS fix to within ${Math.round(accuracy)} m`, "ok");
      await sendToServer({ lat, lng, accuracy });
      btn.disabled = false;
    },
    (err) => {
      // PERMISSION_DENIED (1), POSITION_UNAVAILABLE (2), TIMEOUT (3)
      if (err.code === 1) {
        useIpFallback();
      } else {
        setStatus("GPS unavailable. Trying network estimate…", "warn");
        useIpFallback();
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});
