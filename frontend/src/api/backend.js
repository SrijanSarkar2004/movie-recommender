// Backend API helpers — talks to the FastAPI service.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

async function backendFetch(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Backend ${res.status}`);
  }
  return res.json();
}

/**
 * Log a successful search to the backend (increments trending counter).
 * @param {string} searchTerm
 * @param {number} movieId    — TMDB id of the top result
 * @param {string|null} posterUrl
 */
export async function logSearch(searchTerm, movieId, posterUrl) {
  return backendFetch('/api/search', {
    method: 'POST',
    body: JSON.stringify({
      search_term: searchTerm,
      movie_id: movieId,
      poster_url: posterUrl ?? null,
    }),
  });
}

/**
 * Fetch the top-5 trending searches from the backend.
 * @returns {Promise<Array<{search_term: string, movie_id: number, poster_url: string|null, count: number}>>}
 */
export async function fetchTrending() {
  return backendFetch('/api/trending');
}

/**
 * Get cold-start recommendations given a list of viewed TMDB ids.
 * Returns an array of TMDB movie ids.
 * @param {number[]} tmdbIds
 * @returns {Promise<number[]>}
 */
export async function fetchRecommendations(tmdbIds) {
  if (!tmdbIds?.length) return [];
  const params = new URLSearchParams({ tmdb_ids: tmdbIds.join(',') });
  const data = await backendFetch(`/api/recommend/cold?${params}`);
  return data.tmdb_ids ?? [];
}
