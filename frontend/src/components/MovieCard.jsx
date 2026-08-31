import { posterUrl, releaseYear } from '../api/tmdb.js';

/**
 * MovieCard — displays poster, title, year, star rating, and language badge.
 *
 * @param {Object}   props
 * @param {Object}   props.movie     — TMDB movie object
 * @param {Function} [props.onClick] — called with the movie object when clicked
 * @param {number}   [props.index]   — used to stagger the CSS fade-in animation
 */
export default function MovieCard({ movie, onClick, index = 0 }) {
  const poster  = posterUrl(movie.poster_path, 'w342');
  const year    = releaseYear(movie.release_date);
  const rating  = movie.vote_average?.toFixed(1) ?? '—';
  const lang    = (movie.original_language ?? '').toUpperCase();
  const tmdbUrl = `https://www.themoviedb.org/movie/${movie.id}`;

  const delay = Math.min(index * 40, 400);

  return (
    <article
      className="movie-card"
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onClick?.(movie)}
      role="button"
      tabIndex={0}
      aria-label={`${movie.title}, ${year}`}
      onKeyDown={e => e.key === 'Enter' && onClick?.(movie)}
    >
      {/* Poster */}
      <div className="movie-card__poster-wrap">
        {poster ? (
          <img
            className="movie-card__poster"
            src={poster}
            alt={`${movie.title} poster`}
            loading="lazy"
          />
        ) : (
          <div className="movie-card__poster--placeholder" aria-hidden="true">
            🎬
          </div>
        )}

        {/* Rating badge */}
        {movie.vote_average > 0 && (
          <div className="movie-card__rating" aria-label={`Rating: ${rating}`}>
            ★ {rating}
          </div>
        )}

        {/* Language badge */}
        {lang && (
          <div className="movie-card__lang" aria-label={`Language: ${lang}`}>
            {lang}
          </div>
        )}

        {/* Hover overlay */}
        <div className="movie-card__overlay" aria-hidden="true">
          <a
            href={tmdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="movie-card__overlay-btn"
            onClick={e => e.stopPropagation()}
          >
            View on TMDB ↗
          </a>
        </div>
      </div>

      {/* Info */}
      <div className="movie-card__info">
        <p className="movie-card__title" title={movie.title}>{movie.title}</p>
        <p className="movie-card__meta">{year}</p>
      </div>
    </article>
  );
}
