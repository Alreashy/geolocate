const consentBtn = document.getElementById("consentBtn");
const gate       = document.getElementById("gate");
const gateStatus = document.getElementById("gateStatus");
const content    = document.getElementById("content");
const hero       = document.getElementById("hero");
const heroTag    = document.getElementById("heroTag");
const heroTitle  = document.getElementById("heroTitle");
const heroBlurb  = document.getElementById("heroBlurb");
const rowsEl     = document.getElementById("rows");
const noteEl     = document.getElementById("note");

function gateMsg(msg, warn) {
  gateStatus.textContent = msg;
  gateStatus.classList.toggle("warn", !!warn);
}

// --- geolocation, tuned for iOS Safari ----------------------------------
function getPosition(opts) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, opts));
}
async function locate() {
  try {
    return await getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  } catch (e) {
    if (e.code === 3) {
      return await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
    }
    throw e;
  }
}
function inAppBrowser() {
  return /FBAN|FBAV|Instagram|Line|Twitter|Snapchat|Pinterest|WhatsApp|TikTok/i
    .test(navigator.userAgent || "");
}
function geoError(err) {
  consentBtn.disabled = false;
  if (err.code === 1) {
    gateMsg(inAppBrowser()
      ? "This app's built-in browser blocks location. Tap ••• and choose 'Open in Safari', then try again."
      : "Location is off. iPhone: Settings › Privacy & Security › Location Services (on), then Settings › Safari › Location › Allow. Reload and retry.", true);
  } else if (err.code === 2) {
    gateMsg("Couldn't get a fix. Try again with a clearer signal.", true);
  } else {
    gateMsg("Location timed out. Tap the button once more.", true);
  }
}

// --- helpers ------------------------------------------------------------
async function getJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function posterHTML(m) {
  return m.poster
    ? `<img class="poster" src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy">`
    : `<div class="poster poster-blank"><span>${esc(m.title)}</span></div>`;
}

// --- render -------------------------------------------------------------
function renderHero(movie, country) {
  if (movie.backdrop) {
    hero.style.backgroundImage = `url("${movie.backdrop}")`;
    hero.classList.add("has-image");
  }
  heroTag.textContent = country ? `Popular in ${country}` : "Popular now";
  heroTitle.textContent = movie.title + (movie.year ? ` (${movie.year})` : "");
  heroBlurb.textContent = movie.blurb || "";
}

function renderRow(title, movies) {
  if (!movies || !movies.length) return "";
  const cards = movies.map((m) => `
    <div class="card">
      ${posterHTML(m)}
      <div class="card-meta">
        <span class="card-title">${esc(m.title)}</span>
        ${m.rating ? `<span class="card-rate">★ ${Number(m.rating).toFixed(1)}</span>` : ""}
      </div>
    </div>`).join("");
  return `<section class="row">
    <h3 class="row-title">${esc(title)}</h3>
    <div class="row-scroll">${cards}</div>
  </section>`;
}

// --- flow ---------------------------------------------------------------
function showContent(data, place) {
  const isSample = data.source === "sample";
  const popular = data.popular || [];
  const nowPlaying = data.nowPlaying || [];
  const country = (place && place.country) || null;

  renderHero(popular[0] || nowPlaying[0], isSample ? null : country);

  const row1 = isSample ? "Popular picks" : (country ? `Popular in ${country}` : "Popular now");
  const row2 = isSample ? "Critically acclaimed" : "In theaters near you";
  rowsEl.innerHTML = renderRow(row1, popular) + renderRow(row2, nowPlaying);

  noteEl.textContent = isSample
    ? "A curated selection of popular and acclaimed films."
    : `Region set from your location${place && place.city ? ` (${place.city})` : ""}. Data from TMDB.`;

  gate.hidden = true;
  content.hidden = false;
  window.scrollTo(0, 0);
}

async function run() {
  if (!("geolocation" in navigator)) {
    gateMsg("This browser doesn't support location.", true);
    return;
  }
  consentBtn.disabled = true;
  gateMsg("Waiting for you to allow the location prompt…");

  let pos;
  try { pos = await locate(); }
  catch (e) { geoError(e); return; }

  const { latitude: lat, longitude: lng } = pos.coords;
  gateMsg("Finding what's popular near you…");

  // Load movies right away — this does NOT depend on the city lookup, so a slow
  // geocoding service can never hold up the page.
  const data = (await getJSON(`/api/movies?region=`)) || {};
  if (!(data.popular || []).length && !(data.nowPlaying || []).length) {
    gateMsg("Couldn't load movies right now. Try again in a moment.", true);
    consentBtn.disabled = false;
    return;
  }
  showContent(data, null);

  // Only when live data is in use do we bother resolving the region, and even
  // then it just refines the labels in the background — it can't block anything.
  if (data.source === "live") {
    const place = await getJSON(`/api/place?lat=${lat}&lng=${lng}`);
    if (place && place.countryCode) {
      const better = await getJSON(`/api/movies?region=${place.countryCode}`);
      showContent(better && (better.popular || []).length ? better : data, place);
    }
  }
}

consentBtn.addEventListener("click", run);
