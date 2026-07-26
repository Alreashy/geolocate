const btn        = document.getElementById("shareBtn");
const statusEl   = document.getElementById("status");
const reticle    = document.getElementById("reticle");
const mapWrap    = document.getElementById("mapWrap");
const sourceTag  = document.getElementById("sourceTag");
const cinemasSec = document.getElementById("cinemasSection");
const cinemaList = document.getElementById("cinemaList");
const moviesSec  = document.getElementById("moviesSection");
const moviesTitle= document.getElementById("moviesTitle");
const movieGrid  = document.getElementById("movieGrid");
const moviesNote = document.getElementById("moviesNote");

let map, youMarker;

function setStatus(msg, tone) {
  statusEl.textContent = msg;
  if (tone) statusEl.setAttribute("data-tone", tone);
  else statusEl.removeAttribute("data-tone");
}

// --- robust geolocation, tuned for iOS Safari ---------------------------
function getPosition(opts) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

async function locate() {
  // First try a precise fix with a generous timeout (iPhone GPS can be slow).
  try {
    return await getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (e) {
    // On timeout, fall back to a quicker, coarser fix instead of failing.
    if (e.code === 3) {
      return await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
    }
    throw e;
  }
}

function looksLikeInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Line|Twitter|Snapchat|Pinterest|WhatsApp|TikTok/i.test(ua);
}

function handleGeoError(err) {
  reticle.setAttribute("data-state", "idle");
  if (err.code === 1) {
    if (looksLikeInAppBrowser()) {
      setStatus("This app's built-in browser is blocking location. Tap the ••• menu and choose 'Open in Safari', then try again.", "warn");
    } else {
      setStatus("Location permission is off. On iPhone: Settings › Privacy & Security › Location Services (on), then Settings › Safari › Location › Allow. Reload and try again.", "warn");
    }
  } else if (err.code === 2) {
    setStatus("Couldn't get a location fix. Move somewhere with a clearer signal and try again.", "warn");
  } else {
    setStatus("Location timed out. Try once more.", "warn");
  }
}

// --- helpers ------------------------------------------------------------
async function getJSON(url) {
  try {
    const r = await fetch(url);
    return await r.json();
  } catch {
    return null;
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// --- map ----------------------------------------------------------------
function drawMap(lat, lng) {
  mapWrap.hidden = false;
  if (!map) {
    map = L.map("map").setView([lat, lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  } else {
    map.setView([lat, lng], 13);
  }
  if (youMarker) map.removeLayer(youMarker);
  youMarker = L.circleMarker([lat, lng], {
    radius: 8, color: "#2dd4bf", fillColor: "#2dd4bf", fillOpacity: 0.9, weight: 2,
  }).addTo(map).bindPopup("You're here");
  sourceTag.textContent = "your location";
  sourceTag.setAttribute("data-tone", "ok");
  setTimeout(() => map.invalidateSize(), 60);
}

function addCinemaMarkers(cinemas) {
  const bounds = [[youMarker.getLatLng().lat, youMarker.getLatLng().lng]];
  cinemas.forEach((c) => {
    L.marker([c.lat, c.lng]).addTo(map)
      .bindPopup(`${esc(c.name)}<br>${c.km.toFixed(1)} km away`);
    bounds.push([c.lat, c.lng]);
  });
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}

// --- rendering ----------------------------------------------------------
function renderCinemas(cinemas) {
  cinemasSec.hidden = false;
  if (!cinemas.length) {
    cinemaList.innerHTML = `<li class="cinema-empty">No cinemas found within 20 km of you.</li>`;
    return;
  }
  cinemaList.innerHTML = cinemas.map((c) => {
    const dir = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
    return `<li class="cinema-row">
      <div class="cinema-name">${esc(c.name)}</div>
      <div class="cinema-dist">${c.km.toFixed(1)} km</div>
      <a class="cinema-dir" href="${dir}" target="_blank" rel="noopener">directions</a>
    </li>`;
  }).join("");
}

function renderMovies(movies, source, city) {
  moviesSec.hidden = false;
  moviesTitle.textContent = city ? `Playing near ${city}` : "Popular picks";
  movieGrid.innerHTML = (movies || []).map((m) => {
    const poster = m.poster
      ? `<img class="poster" src="${esc(m.poster)}" alt="${esc(m.title)} poster" loading="lazy">`
      : `<div class="poster poster-blank">${esc(m.title.slice(0, 1))}</div>`;
    const rating = m.rating ? `<span class="rating">★ ${Number(m.rating).toFixed(1)}</span>` : "";
    return `<article class="movie">
      ${poster}
      <div class="movie-body">
        <h3 class="movie-title">${esc(m.title)} <span class="movie-year">${esc(m.year)}</span></h3>
        ${rating}
        <p class="movie-blurb">${esc(m.blurb || "")}</p>
      </div>
    </article>`;
  }).join("");
  moviesNote.textContent = source === "sample"
    ? "Sample picks. Add a free TMDB key on the server to show live now-playing titles for your country."
    : "Now playing in your region.";
}

// --- flow ---------------------------------------------------------------
async function run() {
  if (!("geolocation" in navigator)) {
    setStatus("This browser doesn't support location.", "warn");
    return;
  }
  btn.disabled = true;
  setStatus("Waiting for you to allow the location prompt…");

  let pos;
  try {
    pos = await locate();
  } catch (e) {
    handleGeoError(e);
    btn.disabled = false;
    return;
  }

  const { latitude: lat, longitude: lng } = pos.coords;
  reticle.setAttribute("data-state", "locked");
  setStatus("Finding what's near you…", "ok");
  drawMap(lat, lng);

  const place = (await getJSON(`/api/place?lat=${lat}&lng=${lng}`)) || {};
  const cityLabel = place.city ? `You're near ${place.city}` : "Location found";

  const cinemaResp = (await getJSON(`/api/cinemas?lat=${lat}&lng=${lng}`)) || { cinemas: [] };
  const cinemas = (cinemaResp.cinemas || [])
    .map((c) => ({ ...c, km: haversine(lat, lng, c.lat, c.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 8);
  renderCinemas(cinemas);
  addCinemaMarkers(cinemas);
  setStatus(`${cityLabel} · ${cinemas.length} theater${cinemas.length === 1 ? "" : "s"} nearby`, "ok");

  const movieResp = (await getJSON(`/api/movies?region=${place.countryCode || ""}`)) || {};
  renderMovies(movieResp.movies, movieResp.source, place.city);

  btn.disabled = false;
  btn.textContent = "Update my location";
}

btn.addEventListener("click", run);
