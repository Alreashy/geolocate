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

// Built-in movie lists — no API key needed. Two rows keep the grid full.
const M = (title, year, rating, blurb) => ({ title, year, rating, poster: null, backdrop: null, blurb });

const SAMPLE_POPULAR = [
  M("Dune: Part Two", "2024", 8.2, "Paul Atreides unites with the Fremen to wage war against House Harkonnen."),
  M("Inside Out 2", "2024", 7.6, "Riley's mind gains new emotions as she navigates her teenage years."),
  M("Deadpool & Wolverine", "2024", 7.7, "The merc with a mouth drags a reluctant Wolverine across the multiverse."),
  M("Top Gun: Maverick", "2022", 8.2, "Maverick trains a new squad for a near-impossible mission."),
  M("Spider-Man: No Way Home", "2021", 8.2, "Peter Parker's identity is exposed, tearing open the multiverse."),
  M("The Batman", "2022", 7.8, "A young Batman hunts the Riddler through a corrupt Gotham."),
  M("Oppenheimer", "2023", 8.3, "The story of the physicist behind the first atomic bomb."),
  M("Barbie", "2023", 6.8, "Barbie leaves Barbie Land on a journey of self-discovery."),
  M("Avatar: The Way of Water", "2022", 7.6, "The Sully family fights to stay together on the oceans of Pandora."),
  M("Guardians of the Galaxy Vol. 3", "2023", 7.9, "The Guardians risk everything to protect one of their own."),
  M("John Wick: Chapter 4", "2023", 7.7, "Wick takes on the High Table in a globe-spanning showdown."),
  M("Godzilla Minus One", "2023", 7.7, "Postwar Japan faces a monstrous new threat from the sea."),
  M("The Super Mario Bros. Movie", "2023", 7.0, "A Brooklyn plumber is swept into the vibrant Mushroom Kingdom."),
  M("Mission: Impossible – Dead Reckoning", "2023", 7.6, "Ethan Hunt races to control a rogue, world-altering AI."),
  M("Wonka", "2023", 7.0, "A young Willy Wonka schemes his way into the chocolate trade."),
  M("Elemental", "2023", 7.0, "In a city of elements, fire and water discover how much they share."),
  M("Kung Fu Panda 4", "2024", 6.9, "Po searches for a successor while facing a shape-shifting foe."),
  M("Wicked", "2024", 7.3, "The untold story of the witches of Oz and an unlikely friendship."),
];

const SAMPLE_ACCLAIMED = [
  M("Everything Everywhere All at Once", "2022", 7.8, "A laundromat owner is swept into a multiverse-spanning adventure."),
  M("Parasite", "2019", 8.5, "A poor family schemes their way into a wealthy household."),
  M("Interstellar", "2014", 8.7, "Explorers travel through a wormhole to save humanity."),
  M("The Dark Knight", "2008", 9.0, "Batman faces the Joker, a criminal bent on pure chaos."),
  M("Inception", "2010", 8.8, "A thief steals secrets from within the architecture of dreams."),
  M("Spider-Man: Across the Spider-Verse", "2023", 8.5, "Miles Morales journeys across the multiverse of Spider-People."),
  M("Whiplash", "2014", 8.5, "A young drummer is pushed to the brink by a ruthless mentor."),
  M("Mad Max: Fury Road", "2015", 8.1, "A high-octane escape across a scorched desert wasteland."),
  M("La La Land", "2016", 8.0, "A jazz musician and an actress chase their dreams in Los Angeles."),
  M("Coco", "2017", 8.4, "A boy journeys into the Land of the Dead to uncover his family's past."),
  M("Spirited Away", "2001", 8.6, "A girl works in a spirit bathhouse to free her transformed parents."),
  M("Your Name", "2016", 8.4, "Two strangers discover they are mysteriously swapping bodies."),
  M("The Grand Budapest Hotel", "2014", 8.1, "A legendary concierge and his protégé chase a stolen painting."),
  M("Blade Runner 2049", "2017", 8.0, "A young blade runner unearths a secret that could unravel society."),
  M("Dune", "2021", 8.0, "A noble heir confronts his destiny on a deadly desert planet."),
  M("Joker", "2019", 8.4, "A failing comedian descends into madness in a decaying city."),
  M("Soul", "2020", 8.0, "A musician's soul is separated from his body on the biggest day of his life."),
  M("Knives Out", "2019", 7.9, "A detective untangles a wealthy family's web of lies after a death."),
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
  res.json({ source: "sample", popular: SAMPLE_POPULAR, nowPlaying: SAMPLE_ACCLAIMED });
});

app.listen(PORT, () => {
  console.log(`\n  Marquee running at http://localhost:${PORT}\n`);
});
