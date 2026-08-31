import { useState, useEffect } from 'react';
import { fetchRecommendations } from '../api/backend.js';
import { fetchMovieDetailsBatch } from '../api/tmdb.js';

/**
 * useRecommendations
 *
 * Fetches GNN recommendations whenever viewedTmdbIds changes.
 *
 * The backend now uses a sliding window of the last 5 viewed items (WINDOW_SIZE),
 * so recommendations naturally update with each new search without accumulation
 * diluting the signal.
 *
 * notInDataset is true when the backend returned [] — UI can show a targeted hint.
 *
 * @param {number[]} viewedTmdbIds — TMDB ids accumulated this session
 * @returns {{ movies: Object[], loading: boolean, error: string|null, notInDataset: boolean }}
 */
export function useRecommendations(viewedTmdbIds) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notInDataset, setNotInDataset] = useState(false);

  useEffect(() => {
    if (!viewedTmdbIds?.length) {
      setMovies([]);
      setNotInDataset(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotInDataset(false);

    (async () => {
      try {
        const tmdbIds = await fetchRecommendations(viewedTmdbIds);

        if (cancelled) return;

        if (!tmdbIds.length) {
          // Backend returned empty — the most recent movies aren't in the dataset.
          // Show an empty state with a helpful hint; do NOT preserve stale recs
          // (that caused recommendations to freeze when the user kept searching).
          setNotInDataset(true);
          setMovies([]);
          return;
        }

        const details = await fetchMovieDetailsBatch(tmdbIds);
        if (!cancelled) {
          setMovies(details);
          setNotInDataset(false);
        }
      } catch (err) {
        if (!cancelled) setError(err.message ?? 'Could not load recommendations.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [JSON.stringify(viewedTmdbIds)]);

  return { movies, loading, error, notInDataset };
}
