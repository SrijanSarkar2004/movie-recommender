"""
sample_dataset.py — Downsample ml-latest (or any MovieLens dataset) to a
Colab-friendly size by randomly selecting a percentage of users.

Usage
-----
1. Download ml-latest.zip from https://files.grouplens.org/datasets/movielens/ml-latest.zip
2. Extract it so you have ml-latest/ratings.csv
3. Run:
       python ml/sample_dataset.py --input ml-latest/ratings.csv --pct 7

4. Output: ml/data/ratings_sampled.csv  ← upload THIS to Colab

Why CSV and not Excel
---------------------
Even at 5% of users the file will have 1-3 million rows.
Excel's row limit is 1,048,576.  CSV has no limit and is faster to read.

Sampling strategy
-----------------
We use STRATIFIED sampling — we prefer users who have rated MORE movies.
This preserves collaborative-filtering signal: heavy raters create the
dense co-rating patterns that LightGCN learns from.

Configurable options
--------------------
--input   Path to ratings.csv (default: ml-latest/ratings.csv)
--pct     Percentage of users to keep, e.g. 7  means 7%  (default: 7)
--seed    Random seed for reproducibility                  (default: 42)
--output  Where to write the sampled CSV                   (auto-named)
"""

import argparse
import os
import random
from pathlib import Path

import pandas as pd
import numpy as np


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description='Sample a MovieLens ratings file by user')
    p.add_argument('--input',  default='ml-latest/ratings.csv',
                   help='Path to full ratings.csv')
    p.add_argument('--pct',    type=float, default=7.0,
                   help='Percentage of users to keep (e.g. 7 = 7%%)')
    p.add_argument('--seed',   type=int,   default=42,
                   help='Random seed')
    p.add_argument('--output', default=None,
                   help='Output CSV path (default: ml/data/ratings_sampled_<pct>pct.csv)')
    return p.parse_args()


# ─── Sampling ─────────────────────────────────────────────────────────────────

def stratified_user_sample(ratings: pd.DataFrame, pct: float, seed: int) -> pd.DataFrame:
    """
    Sample `pct`% of users with stratified selection.

    Users are split into 3 activity tiers (low / mid / high raters).
    We sample the requested percentage FROM EACH TIER proportionally,
    so the resulting dataset preserves the mix of casual and heavy raters.

    This produces better GNN embeddings than pure random sampling, which
    tends to over-select low-activity users (they are the majority).
    """
    rng = np.random.default_rng(seed)

    user_counts = ratings.groupby('userId').size().reset_index(name='n_ratings')
    n_total     = len(user_counts)
    n_sample    = max(1, int(n_total * pct / 100))

    print(f'Total users      : {n_total:,}')
    print(f'Sample target    : {n_sample:,}  ({pct:.1f}%)')

    # Tertile-based stratification
    tertiles = np.percentile(user_counts['n_ratings'], [33, 67])
    user_counts['tier'] = pd.cut(
        user_counts['n_ratings'],
        bins=[0, tertiles[0], tertiles[1], np.inf],
        labels=['low', 'mid', 'high']
    )

    sampled_users = []
    for tier, group in user_counts.groupby('tier', observed=True):
        tier_share = len(group) / n_total
        n_tier     = max(1, round(n_sample * tier_share))
        n_tier     = min(n_tier, len(group))           # can't exceed tier size
        chosen     = rng.choice(group['userId'].values, size=n_tier, replace=False)
        sampled_users.extend(chosen.tolist())
        print(f'  Tier {tier!s:4s}  pool={len(group):,}  sampled={n_tier:,}  '
              f'(avg ratings: {group["n_ratings"].mean():.0f})')

    return ratings[ratings['userId'].isin(set(sampled_users))].copy()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    random.seed(args.seed)

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(
            f'\n  Could not find: {input_path}\n'
            f'  Download ml-latest.zip from:\n'
            f'    https://files.grouplens.org/datasets/movielens/ml-latest.zip\n'
            f'  Extract it and pass --input path/to/ratings.csv'
        )

    # Default output path
    if args.output:
        out_path = Path(args.output)
    else:
        out_dir  = Path(__file__).parent / 'data'
        out_dir.mkdir(parents=True, exist_ok=True)
        pct_tag  = str(int(args.pct)) if args.pct == int(args.pct) else str(args.pct)
        out_path = out_dir / f'ratings_sampled_{pct_tag}pct.csv'

    # ── Load ──────────────────────────────────────────────────────────────────
    print(f'\nLoading {input_path} ...')
    ratings = pd.read_csv(
        input_path,
        dtype={'userId': int, 'movieId': int, 'rating': float, 'timestamp': int}
    )
    print(f'Loaded   : {len(ratings):,} rows | {ratings["userId"].nunique():,} users | '
          f'{ratings["movieId"].nunique():,} movies')

    # ── Sample ────────────────────────────────────────────────────────────────
    print(f'\nStratified user sampling at {args.pct}% ...')
    sampled = stratified_user_sample(ratings, args.pct, args.seed)

    print(f'\nSampled  : {len(sampled):,} rows | {sampled["userId"].nunique():,} users | '
          f'{sampled["movieId"].nunique():,} movies')
    print(f'Reduction: {len(sampled)/len(ratings)*100:.1f}% of original rows')

    # ── Quick sanity check ────────────────────────────────────────────────────
    avg_ratings_per_movie  = sampled.groupby('movieId').size().mean()
    avg_ratings_per_user   = sampled.groupby('userId').size().mean()
    print(f'\nSanity check:')
    print(f'  Avg ratings/user  : {avg_ratings_per_user:.1f}')
    print(f'  Avg ratings/movie : {avg_ratings_per_movie:.1f}')

    expected_rows = len(sampled)
    if expected_rows > 1_048_576:
        print(f'\n  NOTE: {expected_rows:,} rows exceeds Excel limit (1,048,576).')
        print(f'  This file is saved as CSV — open it in Python/Colab, not Excel.')
    elif expected_rows > 500_000:
        print(f'\n  NOTE: {expected_rows:,} rows — Excel can open this but will be slow.')
        print(f'  Recommend using CSV and reading with pd.read_csv().')

    # Training time estimate (rough: ~3 min per 100k rows on T4 for LightGCN)
    est_minutes = max(1, int(expected_rows / 100_000 * 3))
    print(f'\n  Estimated Colab T4 training time: ~{est_minutes} min')

    # ── Save ──────────────────────────────────────────────────────────────────
    print(f'\nSaving to {out_path} ...')
    sampled.to_csv(out_path, index=False)
    size_mb = out_path.stat().st_size / 1_048_576
    print(f'Saved    : {size_mb:.1f} MB')
    print(f'\n{"="*60}')
    print(f'DONE!  Upload this file to Colab as "ratings.csv":')
    print(f'  {out_path}')
    print(f'{"="*60}')
    print(f'\nAlso upload links.csv from ml-latest/ for TMDB id mapping.')
    print(f'The Colab notebook reads "ratings.csv" — rename before uploading.')


if __name__ == '__main__':
    main()
