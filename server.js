/**
 * Consent-based location capture server.
 *
 * Two accuracy tiers:
 *   1. Browser Geolocation API (precise, GPS-level) — requires the visitor to
 *      click "Allow" on the browser permission prompt. Sent from the frontend.
 *   2. IP-based lookup (approximate, city-level) — done here on the server as a
 *      fallback when the visitor denies permission or GPS is unavailable.
 *
 * Captured entries are appended to locations.json.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "locations.json");

// Behind a host like Render/Vercel/nginx, this makes req.ip the real client IP.
app.set("trust proxy", true);

app.use(express.json());
// Serve the front-end files that sit next to this file (flat layout).
app.use(express.static(__dirname));

function readLocations() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeLocations(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.ip;
}

// Free IP geolocation. No key needed. Returns approximate (city-level) data.
async function lookupIp(ip) {
  try {
    const url =
      `http://ip-api.com/json/${encodeURIComponent(ip)}` +
      `?fields=status,country,regionName,city,lat,lon,isp`;
    const resp = await fetch(url);
    const geo = await resp.json();
    if (geo && geo.status === "success") {
      return {
        city: geo.city,
        region: geo.regionName,
        country: geo.country,
        lat: geo.lat,
        lng: geo.lon,
        isp: geo.isp,
      };
    }
  } catch {
    /* network/lookup failure — return null, don't break the request */
  }
  return null;
}

// Receive a location report from the browser.
app.post("/api/location", async (req, res) => {
  const { lat, lng, accuracy } = req.body || {};
  const ip = getClientIp(req);

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ip,
    userAgent: req.headers["user-agent"] || null,
    gps: null,
    ipLocation: await lookupIp(ip),
  };

  if (typeof lat === "number" && typeof lng === "number") {
    entry.gps = {
      lat,
      lng,
      accuracy: typeof accuracy === "number" ? accuracy : null,
    };
  }

  const list = readLocations();
  list.push(entry);
  writeLocations(list);

  res.json({ ok: true, id: entry.id, ipLocation: entry.ipLocation });
});

// Read back everything captured (used by the results page).
app.get("/api/locations", (req, res) => {
  res.json(readLocations());
});

app.listen(PORT, () => {
  console.log(`\n  Location demo running at http://localhost:${PORT}`);
  console.log(`  Results dashboard at   http://localhost:${PORT}/results.html\n`);
});
