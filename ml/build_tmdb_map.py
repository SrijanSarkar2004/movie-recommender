"""
build_tmdb_map.py
=================
Reads ml/data/links.csv (MovieLens format) and writes a JSON map
  { "<movieLensId>": <tmdbId>, ... }
to ml/movieid_to_tmdbid.json.

Usage
-----
    python ml/build_tmdb_map.py

Input expected at: ml/data/links.csv
  columns: movieId, imdbId, tmdbId

Output: ml/movieid_to_tmdbid.json
"""

import json
import sys
from pathlib import Path

# ── paths ──────────────────────────────────────────────────────────────────────
ML_DIR   = Path(__file__).parent
DATA_DIR = ML_DIR / "data"
INPUT    = DATA_DIR / "links.csv"
OUTPUT   = ML_DIR / "movieid_to_tmdbid.json"


def main() -> None:
    if not INPUT.exists():
        print(
            f"[ERROR] Input file not found: {INPUT}\n"
            "Download the MovieLens 25M dataset and place links.csv in ml/data/.",
            file=sys.stderr,
        )
        sys.exit(1)

    mapping: dict[str, int] = {}
    skipped = 0

    with INPUT.open(newline="", encoding="utf-8") as f:
        # Read the header
        header = f.readline().strip().split(",")
        movie_id_col = header.index("movieId")
        tmdb_id_col  = header.index("tmdbId")

        for line_no, line in enumerate(f, start=2):
            parts = line.strip().split(",")
            if len(parts) <= max(movie_id_col, tmdb_id_col):
                skipped += 1
                continue

            movie_id_str  = parts[movie_id_col].strip()
            tmdb_id_str   = parts[tmdb_id_col].strip()

            # Drop rows with missing or non-numeric tmdbId
            if not tmdb_id_str or not tmdb_id_str.isdigit():
                skipped += 1
                continue

            mapping[movie_id_str] = int(tmdb_id_str)

    print(f"[build_tmdb_map] {len(mapping):,} entries written, {skipped:,} rows skipped.")

    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(mapping, f, separators=(",", ":"))

    print(f"[build_tmdb_map] Output → {OUTPUT.resolve()}")


if __name__ == "__main__":
    main()
