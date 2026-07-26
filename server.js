/**
 * Marquee — movie suggestions based on where you are.
 *
 * The visitor taps a clearly-labelled button, the browser asks their
 * permission, and on Allow we use their coordinates to:
 *   1. name their city   (OpenStreetMap Nominatim — free, no key)
 *   2. list nearby cinemas (OpenStreetMap Overpass — free, no key)
 *   3. suggest now-playing movies (TMDB if a key is set, else a sample list)
 *
 * The location is used to answer the visitor and is NOT stored. There is no
 * owner-only capture log — the person sees their own results, which is the
 * whole point of a recommendation feature.
 */

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", true);
app.use(express.json());
// Serve the front-end files that sit next to this file (flat layout).
app.use(express.static(__dirname));

const UA = "MarqueeDemo/1.0 (student project)";

function coords(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "bad coordinates" });
    return null;
  }
  return { lat, lng };
}

// 1. City / country from coordinates.
app.get("/api/place", async (req, res) => {
  const c = coords(req, res);
  if (!c) return;
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&zoom=10`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    const j = await r.json();
    const a = j.address || {};
    res.json({
      city: a.city || a.town || a.village || a.county || a.state || null,
      country: a.country || null,
      countryCode: (a.country_code || "").toUpperCase() || null,
    });
  } catch {
    res.json({ city: null, country: null, countryCode: null });
  }
});

// 2. Nearby cinemas (within ~20 km).
app.get("/api/cinemas", async (req, res) => {
  const c = coords(req, res);
  if (!c) return;
  const q =
    `[out:json][timeout:25];(` +
    `node["amenity"="cinema"](around:20000,${c.lat},${c.lng});` +
    `way["amenity"="cinema"](around:20000,${c.lat},${c.lng});` +
    `);out center 40;`;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "data=" + encodeURIComponent(q),
    });
    const j = await r.json();
    const seen = new Set();
    const cinemas = [];
    for (const el of j.elements || []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const name = el.tags?.name;
      if (lat == null || lng == null || !name || seen.has(name)) continue;
      seen.add(name);
      cinemas.push({ name, lat, lng });
    }
    res.json({ cinemas });
  } catch {
    res.json({ cinemas: [] });
  }
});

// 3. Now-playing movies for the visitor's country (TMDB), with a sample fallback.
const SAMPLE_MOVIES = [
  { title: "Dune: Part Two", year: "2024", rating: 8.2, poster: null,
    blurb: "Paul Atreides unites with the Fremen to wage war against House Harkonnen." },
  { title: "Inside Out 2", year: "2024", rating: 7.6, poster: null,
    blurb: "Riley's mind gains new emotions as she navigates her teenage years." },
  { title: "Oppenheimer", year: "2023", rating: 8.1, poster: null,
    blurb: "The story of the physicist behind the first atomic bomb." },
  { title: "Spider-Man: Across the Spider-Verse", year: "2023", rating: 8.5, poster: null,
    blurb: "Miles Morales journeys across the multiverse of Spider-People." },
  { title: "Everything Everywhere All at Once", year: "2022", rating: 7.8, poster: null,
    blurb: "A laundromat owner is swept into a multiverse-spanning adventure." },
  { title: "Top Gun: Maverick", year: "2022", rating: 8.2, poster: null,
    blurb: "Maverick trains a new squad for a near-impossible mission." },
  { title: "The Batman", year: "2022", rating: 7.8, poster: null,
    blurb: "A young Batman hunts the Riddler through a corrupt Gotham." },
  { title: "Barbie", year: "2023", rating: 6.9, poster: null,
    blurb: "Barbie leaves Barbie Land on a journey of self-discovery." },
];

app.get("/api/movies", async (req, res) => {
  const region = (req.query.region || "").toUpperCase().slice(0, 2);
  const key = process.env.TMDB_API_KEY;
  if (key) {
    try {
      const url =
        `https://api.themoviedb.org/3/movie/now_playing?api_key=${key}` +
        (region ? `&region=${region}` : "");
      const r = await fetch(url);
      const j = await r.json();
      const movies = (j.results || []).slice(0, 8).map((m) => ({
        title: m.title,
        year: (m.release_date || "").slice(0, 4),
        rating: m.vote_average,
        blurb: m.overview,
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
      }));
      if (movies.length) return res.json({ source: "now-playing", movies });
    } catch {
      /* fall through to sample list */
    }
  }
  res.json({ source: "sample", movies: SAMPLE_MOVIES });
});

app.listen(PORT, () => {
  console.log(`\n  Marquee running at http://localhost:${PORT}\n`);
});
