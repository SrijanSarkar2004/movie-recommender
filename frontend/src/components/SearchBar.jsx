import { useRef } from 'react';

/**
 * SearchBar — controlled text input with a search icon and clear button.
 *
 * @param {Object}   props
 * @param {string}   props.value         — current query string
 * @param {Function} props.onChange       — called with the new value string
 * @param {boolean}  [props.isSearching] — shows subtle ring when true
 */
export default function SearchBar({ value, onChange, isSearching = false }) {
  const inputRef = useRef(null);

  function handleClear() {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div className="search-wrap">
      {/* Search icon */}
      <svg
        className="search-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        ref={inputRef}
        id="movie-search-input"
        type="search"
        className="search-input"
        placeholder="Search movies…"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search for a movie"
        aria-busy={isSearching}
      />

      {/* Clear button — only visible when there's text */}
      {value && (
        <button
          className="search-clear"
          onClick={handleClear}
          aria-label="Clear search"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1"  y2="11" />
          </svg>
        </button>
      )}
    </div>
  );
}
