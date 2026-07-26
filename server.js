/**
 * Marquee — "popular in your area" movie screen.
 *
 * The visitor is asked up front ("see what's popular in your area?"). On Allow,
 * their coordinates are turned into a region, and we show the movies popular
 * there. The location is used to answer the visitor and is NOT stored.
 */

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", true);
app.use(express.json());
app.use(express.static(__dirname));

const UA = "MarqueeDemo/1.0 (student project)";

// Fetch with a hard timeout so a slow upstream service can't hang the request.
async function fetchWithTimeout(url, options = {}, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function coords(req, res) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "bad coordinates" });
    return null;
  }
  return { lat, lng };
}

// Region from coordinates (city + country code).
app.get("/api/place", async (req, res) => {
  const c = coords(req, res);
  if (!c) return;
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&zoom=10`;
    const r = await fetchWithTimeout(url, { headers: { "User-Agent": UA } });
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

// Popular movies for the visitor's region (TMDB), with a sample fallback.
const SAMPLE = [
  { title: "Dune: Part Two", year: "2024", rating: 8.2, poster: null, backdrop: null,
    blurb: "Paul Atreides unites with the Fremen to wage war against House Harkonnen." },
  { title: "Inside Out 2", year: "2024", rating: 7.6, poster: null, backdrop: null,
    blurb: "Riley's mind gains new emotions as she navigates her teenage years." },
  { title: "Oppenheimer", year: "2023", rating: 8.1, poster: null, backdrop: null,
    blurb: "The story of the physicist behind the first atomic bomb." },
  { title: "Spider-Man: Across the Spider-Verse", year: "2023", rating: 8.5, poster: null, backdrop: null,
    blurb: "Miles Morales journeys across the multiverse of Spider-People." },
  { title: "Everything Everywhere All at Once", year: "2022", rating: 7.8, poster: null, backdrop: null,
    blurb: "A laundromat owner is swept into a multiverse-spanning adventure." },
  { title: "Top Gun: Maverick", year: "2022", rating: 8.2, poster: null, backdrop: null,
    blurb: "Maverick trains a new squad for a near-impossible mission." },
  { title: "The Batman", year: "2022", rating: 7.8, poster: null, backdrop: null,
    blurb: "A young Batman hunts the Riddler through a corrupt Gotham." },
  { title: "Barbie", year: "2023", rating: 6.9, poster: null, backdrop: null,
    blurb: "Barbie leaves Barbie Land on a journey of self-discovery." },
];

function mapMovie(m) {
  return {
    title: m.title,
    year: (m.release_date || "").slice(0, 4),
    rating: m.vote_average,
    blurb: m.overview,
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
  };
}

async function tmdb(pathName, region, key) {
  const url =
    `https://api.themoviedb.org/3/movie/${pathName}?api_key=${key}` +
    (region ? `&region=${region}` : "");
  const r = await fetchWithTimeout(url);
  const j = await r.json();
  return (j.results || []).filter((m) => m.poster_path).slice(0, 12).map(mapMovie);
}

app.get("/api/movies", async (req, res) => {
  const region = (req.query.region || "").toUpperCase().slice(0, 2);
  const key = process.env.TMDB_API_KEY;
  if (key) {
    try {
      const [popular, nowPlaying] = await Promise.all([
        tmdb("popular", region, key),
        tmdb("now_playing", region, key),
      ]);
      if (popular.length || nowPlaying.length) {
        return res.json({ source: "live", popular, nowPlaying });
      }
    } catch {
      /* fall through to sample */
    }
  }
  res.json({ source: "sample", popular: SAMPLE, nowPlaying: [] });
});

app.listen(PORT, () => {
  console.log(`\n  Marquee running at http://localhost:${PORT}\n`);
});
