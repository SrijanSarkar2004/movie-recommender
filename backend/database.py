"""
database.py — SQLite helpers for CineGraph backend.

Uses the stdlib sqlite3 module only (no ORM).
Schema:
    searches(id, search_term UNIQUE, movie_id, poster_url, count, last_searched_at)

All functions accept an optional `db_path` argument so they're easy to test
with an in-memory database (:memory:).
"""

import sqlite3
import contextlib
from pathlib import Path

# Default database file — lives next to this module
DEFAULT_DB_PATH = Path(__file__).parent / "cinegraph.db"


# ─── connection factory ────────────────────────────────────────────────────────

@contextlib.contextmanager
def get_conn(db_path: str | Path = DEFAULT_DB_PATH):
    """Yield a connection with row_factory set to sqlite3.Row."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrent read performance
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─── initialisation ───────────────────────────────────────────────────────────

def init_db(db_path: str | Path = DEFAULT_DB_PATH) -> None:
    """
    Create tables if they don't already exist.
    Also runs a safe migration to add last_searched_at if the DB was created
    by an older version of this file (no data loss).
    """
    with get_conn(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS searches (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                search_term      TEXT    NOT NULL,
                movie_id         INTEGER NOT NULL,
                poster_url       TEXT,
                count            INTEGER NOT NULL DEFAULT 1,
                last_searched_at TEXT    NOT NULL DEFAULT (datetime('now')),
                UNIQUE(search_term)
            )
        """)

        # ── safe migration for databases created before last_searched_at ────
        # sqlite3 doesn't raise if the column already exists in older versions,
        # but does in newer ones — so we check first.
        cols = {row[1] for row in conn.execute("PRAGMA table_info(searches)").fetchall()}
        if "last_searched_at" not in cols:
            # SQLite ALTER TABLE only allows constant (not function) defaults.
            # Existing rows get a sentinel timestamp; new upserts always set the real time.
            conn.execute("""
                ALTER TABLE searches
                ADD COLUMN last_searched_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
            """)


# ─── write ────────────────────────────────────────────────────────────────────

def upsert_search(
    search_term: str,
    movie_id: int,
    poster_url: str | None,
    db_path: str | Path = DEFAULT_DB_PATH,
) -> None:
    """
    Insert a new search row, or increment count if search_term already exists.

    On every upsert:
     - count is incremented
     - movie_id and poster_url are refreshed (latest TMDB result wins)
     - last_searched_at is set to NOW so recently re-searched terms bubble up
       in the trending strip when counts are tied (Bug 4 fix).
    """
    with get_conn(db_path) as conn:
        conn.execute(
            """
            INSERT INTO searches (search_term, movie_id, poster_url, count, last_searched_at)
            VALUES (:term, :mid, :poster, 1, datetime('now'))
            ON CONFLICT(search_term) DO UPDATE SET
                movie_id         = excluded.movie_id,
                poster_url       = excluded.poster_url,
                count            = searches.count + 1,
                last_searched_at = datetime('now')
            """,
            {"term": search_term.strip().lower(), "mid": movie_id, "poster": poster_url},
        )


# ─── read ─────────────────────────────────────────────────────────────────────

def get_trending(
    limit: int = 5,
    db_path: str | Path = DEFAULT_DB_PATH,
) -> list[dict]:
    """
    Return top `limit` searches ordered by:
      1. count DESC         — most searched first
      2. last_searched_at DESC — most recently searched wins ties (Bug 4 fix)

    This ensures that:
     - Re-searching an existing term raises its count and immediately moves it
       to the top even if its count was already equal to others.
     - A brand-new 6th search (count=1) with the same count as others still
       appears at the top because its timestamp is newest.
    """
    with get_conn(db_path) as conn:
        rows = conn.execute(
            """
            SELECT search_term, movie_id, poster_url, count
            FROM   searches
            ORDER  BY count DESC, last_searched_at DESC
            LIMIT  :limit
            """,
            {"limit": limit},
        ).fetchall()
    return [dict(row) for row in rows]
