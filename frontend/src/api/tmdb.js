// TMDB API helpers
// The key is read from the Vite env — never hardcoded here.
const BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY  = import.meta.env.VITE_TMDB_API_KEY;

if (!API_KEY) {
  console.warn(
    '[tmdb.js] VITE_TMDB_API_KEY is not set. ' +
    'Copy frontend/.env.example to frontend/.env.local and add your key.'
  );
}

// ---------- helpers ----------

/**
 * Generic TMDB fetch — appends api_key and throws on non-2xx.
 * @param {string} path  — e.g. "/movie/popular"
 * @param {Record<string,string|number>} params — additional query params
 */
async function tmdbFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.status_message ?? `TMDB ${res.status}`);
  }
  return res.json();
}

// ---------- public API ----------

/**
 * Discover popular movies (default landing grid).
 * @param {number} page
 */
export async function discoverPopular(page = 1) {
  return tmdbFetch('/discover/movie', {
    sort_by: 'popularity.desc',
    include_adult: false,
    page,
  });
}

/**
 * Search movies by query string.
 * @param {string} query
 * @param {number} page
 */
export async function searchMovies(query, page = 1) {
  if (!query?.trim()) return discoverPopular(page);
  return tmdbFetch('/search/movie', {
    query: query.trim(),
    include_adult: false,
    page,
  });
}

/**
 * Fetch details for a single movie by TMDB id.
 * @param {number} movieId
 */
export async function fetchMovieDetails(movieId) {
  return tmdbFetch(`/movie/${movieId}`);
}

/**
 * Fetch details for multiple TMDB ids in parallel.
 * Returns an array of results (skips failed fetches gracefully).
 * @param {number[]} ids
 */
export async function fetchMovieDetailsBatch(ids) {
  const results = await Promise.allSettled(ids.map(fetchMovieDetails));
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
}

// ---------- image helpers ----------

/** Full TMDB poster URL. Falls back to null if no path. */
export function posterUrl(path, size = 'w342') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Extracts release year from date string. */
export function releaseYear(dateStr) {
  if (!dateStr) return '—';
  return dateStr.slice(0, 4);
}
