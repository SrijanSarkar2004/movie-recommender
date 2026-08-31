import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from 'react-use';

import { searchMovies, discoverPopular, posterUrl, releaseYear } from './api/tmdb.js';
import { logSearch, fetchTrending } from './api/backend.js';
import { useRecommendations } from './hooks/useRecommendations.js';

import SearchBar from './components/SearchBar.jsx';
import MovieCard from './components/MovieCard.jsx';
import Spinner from './components/Spinner.jsx';

// ─── Skeleton grid ────────────────────────────────────────────────────────────
function SkeletonGrid({ count = 12 }) {
  return (
    <div className="movie-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-card__poster skeleton" />
          <div className="skeleton-card__line skeleton" />
          <div className="skeleton-card__line--short skeleton" />
        </div>
      ))}
    </div>
  );
}

// ─── Trending strip ───────────────────────────────────────────────────────────
function TrendingStrip({ items, onSelect }) {
  if (!items.length) return null;

  return (
    <section className="section" aria-labelledby="trending-heading">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title" id="trending-heading">🔥 Trending Searches</h2>
          <span className="section-badge">Live</span>
        </div>

        <div className="trending-strip" role="list">
          {items.map((item, i) => (
            <a
              key={item.movie_id}
              className="trending-card"
              role="listitem"
              href={`https://www.themoviedb.org/movie/${item.movie_id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`#${i + 1} trending: ${item.search_term}`}
              onClick={e => { e.preventDefault(); onSelect(item.search_term); }}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="trending-card__img-wrap">
                {item.poster_url ? (
                  <img
                    className="trending-card__img"
                    src={item.poster_url}
                    alt={item.search_term}
                    loading="lazy"
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'var(--bg-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem',
                  }} aria-hidden="true">🎬</div>
                )}
                <div className="trending-card__gradient" aria-hidden="true" />
                <span className="trending-card__rank" aria-hidden="true">#{i + 1}</span>
              </div>
              <p className="trending-card__label">{item.search_term}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Recommended section ─────────────────────────────────────────────────────
function RecommendedSection({ viewedIds }) {
  const { movies, loading, error, notInDataset } = useRecommendations(viewedIds);

  // Hidden until user has searched at least once
  if (!viewedIds.length) return null;

  return (
    <section className="section" aria-labelledby="recommended-heading">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title" id="recommended-heading">✨ Recommended for You</h2>
          <span className="section-badge">GNN</span>
        </div>

        {loading && <SkeletonGrid count={6} />}

        {error && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Could not load recommendations — backend may not be running yet.
          </p>
        )}

        {/* Inline hint when last-searched movie isn't in training data, but show
            existing recommendations below it rather than replacing them */}
        {!loading && notInDataset && movies.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">🎞️</span>
            <p className="empty-state__title">This movie isn't in our training data</p>
            <p className="empty-state__body">
              The GNN is trained on films up to 2018. Try{' '}
              <strong>Inception</strong>, <strong>The Matrix</strong>, or{' '}
              <strong>Pulp Fiction</strong> for personalised recommendations.
            </p>
          </div>
        )}

        {!loading && notInDataset && movies.length > 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', marginTop: '-0.5rem' }}>
            💡 That film wasn't in our dataset — showing recommendations from your previous searches.
          </p>
        )}

        {!loading && !error && movies.length === 0 && !notInDataset && (
          <div className="empty-state">
            <span className="empty-state__icon">🔍</span>
            <p className="empty-state__title">Search for a film to get recommendations</p>
            <p className="empty-state__body">
              The GNN model is trained on classic films. Try searching for{' '}
              <strong>Inception</strong>, <strong>The Matrix</strong>, or{' '}
              <strong>Pulp Fiction</strong> — then recommendations will appear here.
            </p>
          </div>
        )}

        {!loading && movies.length > 0 && (
          <div className="movie-grid">
            {movies.map((m, i) => (
              <MovieCard key={m.id} movie={m} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── state ──
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [movies, setMovies] = useState([]);
  const [trending, setTrending] = useState([]);
  const [viewedIds, setViewedIds] = useState([]); // session-scoped, no persistence
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // Track whether the *current* query has already been logged to avoid
  // duplicate backend calls on re-renders.
  const loggedQuery = useRef('');

  // ── debounce ──
  useDebounce(() => setDebouncedQ(query), 500, [query]);

  // ── fetch trending on mount (fire-and-forget; UI shows whatever came back) ──
  useEffect(() => {
    fetchTrending()
      .then(setTrending)
      .catch(() => { }); // backend may not be running yet in Phase 1
  }, []);

  // ── main fetch: search or discover ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const isSearch = Boolean(debouncedQ.trim());

    (async () => {
      try {
        const data = isSearch
          ? await searchMovies(debouncedQ)
          : await discoverPopular();

        if (cancelled) return;

        const results = data.results ?? [];
        setMovies(results);
        setIsSearching(false);

        // ── log search to backend ──────────────────────────────────────────────
        // Always log when there's an active search — this ensures:
        //  • Re-searching the same movie increments its trending count (Bug 4)
        //  • Clicking a trending card that wasn't previously found also logs
        if (isSearch && results.length > 0) {
          const top = results[0];
          const poster = posterUrl(top.poster_path, 'w92');

          // Accumulate viewed ids for the recommendation engine
          setViewedIds(prev =>
            prev.includes(top.id) ? prev : [...prev, top.id]
          );

          // Best-effort — don't block UI on backend availability
          // Refresh trending after every log so counts stay live
          logSearch(debouncedQ, top.id, poster)
            .then(() => fetchTrending().then(setTrending).catch(() => { }))
            .catch(() => { });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? 'Failed to fetch movies.');
          setIsSearching(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [debouncedQ]);

  // When the raw query changes, mark as searching immediately
  useEffect(() => {
    if (query !== debouncedQ) setIsSearching(true);
  }, [query]);

  // ── handlers ──
  const handleQueryChange = useCallback(val => {
    setQuery(val);
    if (!val.trim()) loggedQuery.current = '';
  }, []);

  const handleTrendingSelect = useCallback(term => {
    setQuery(term);
    setDebouncedQ(term);
  }, []);

  // ── render ──
  return (
    <>
      {/* ── Navbar ── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <div className="container navbar__inner">
          <a href="/" className="navbar__logo" aria-label="CineGraph home">
            <div className="navbar__logo-mark" aria-hidden="true">🎬</div>
            <span className="navbar__logo-text">CineGraph</span>
          </a>
          <span className="navbar__tag">Powered by GNN</span>
        </div>
      </nav>

      <main id="main-content">
        {/* ── Hero ── */}
        <section className="hero" aria-labelledby="hero-heading">
          <div className="container">
            <p className="hero__eyebrow">
              <span className="hero__eyebrow-dot" aria-hidden="true" />
              Graph Neural Network · MovieLens · TMDB
            </p>
            <h1 className="hero__title font-display" id="hero-heading">
              CINE<span>GRAPH</span>
            </h1>
            <p className="hero__subtitle">
              Discover trending films and unlock AI-powered recommendations
              trained on the MovieLens dataset.
            </p>
            <SearchBar
              value={query}
              onChange={handleQueryChange}
              isSearching={isSearching}
            />
          </div>
        </section>

        {/* ── Trending ── */}
        <TrendingStrip items={trending} onSelect={handleTrendingSelect} />

        {/* ── Divider ── */}
        {trending.length > 0 && <div className="section-divider" />}

        {/* ── Movie grid (searches) ── */}
        <section className="section" aria-labelledby="movies-heading">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title" id="movies-heading">
                {debouncedQ.trim()
                  ? `Results for "${debouncedQ}"`
                  : '🎬 All Movies'}
              </h2>
              {!loading && movies.length > 0 && (
                <span className="section-badge">{movies.length} found</span>
              )}
            </div>

            {/* Error state */}
            {error && (
              <div className="error-banner" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
                <button
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: '6px',
                    color: '#fca5a5',
                    padding: '0.25rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                  onClick={() => setDebouncedQ(q => q + ' ')}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading */}
            {loading && !error && <SkeletonGrid count={12} />}

            {/* Results — clicking a card triggers a search for that title,
                which logs to the backend, updates trending, and fires the
                recommendation engine (Bugs 2 & 3) */}
            {!loading && !error && movies.length > 0 && (
              <div className="movie-grid">
                {movies.map((m, i) => (
                  <MovieCard
                    key={m.id}
                    movie={m}
                    index={i}
                    onClick={mov => {
                      // Treat as a search so backend logs it + trending updates
                      setQuery(mov.title);
                      setDebouncedQ(mov.title);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && movies.length === 0 && (
              <div className="empty-state">
                <span className="empty-state__icon">🔍</span>
                <p className="empty-state__title">No movies found</p>
                <p className="empty-state__body">
                  Try a different title or clear the search to browse popular films.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Recommended (hidden until first search) ── */}
        <RecommendedSection viewedIds={viewedIds} />
      </main>

      {/* ── Footer ── */}
      <footer style={{
        padding: '2rem 0',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.75rem',
      }}>
        <div className="container">
          <p>
            CineGraph · Data from{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-light)' }}>TMDB</a>
            {' '}& <a href="https://grouplens.org/datasets/movielens/" target="_blank"
              rel="noopener noreferrer" style={{ color: 'var(--accent-light)' }}>MovieLens</a>
            {' '}· GNN powered by LightGCN
          </p>
        </div>
      </footer>
    </>
  );
}
