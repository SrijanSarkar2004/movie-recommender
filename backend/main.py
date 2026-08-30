# Uvicorn reload trigger for ml-1m
"""
main.py — CineGraph FastAPI backend.

Routes
------
POST /api/search          log a search term + top-result movie
GET  /api/trending        top-5 most-searched movies
GET  /api/recommend/cold  cold-start GNN recommendations (stub until Phase 4)

Run with:
    uvicorn main:app --reload
"""

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import init_db, upsert_search, get_trending

# ─── paths ────────────────────────────────────────────────────────────────────

BASE_DIR          = Path(__file__).parent
EMBEDDINGS_PATH   = BASE_DIR / "embeddings.pt"
TMDB_MAP_PATH     = BASE_DIR / "movieid_to_tmdbid.json"

# ─── ML state (populated at startup if files exist) ───────────────────────────

_embeddings  = None   # torch.Tensor  [N_items, D]  — loaded at startup
_tmdb_to_idx = {}     # dict[int, int] tmdb_id → embedding row index
_idx_to_tmdb = {}     # dict[int, int] embedding row index → tmdb_id  (reverse map)

# Use the single most recently viewed movie that IS in the training dataset
# as the query anchor.  Averaging multiple items collapses the query vector
# toward a cluster centroid, causing the recommendations to freeze.
# Single-item lookup gives crisp, movie-specific results that change on
# every search.
QUERY_ANCHOR = 1  # number of most-recent in-dataset items to average


# ─── lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise database
    init_db()

    # Attempt to load ML artefacts (Phase 4 — silently skipped if absent)
    global _embeddings, _tmdb_to_idx, _idx_to_tmdb
    if EMBEDDINGS_PATH.exists() and TMDB_MAP_PATH.exists():
        try:
            import torch
            _embeddings = torch.load(str(EMBEDDINGS_PATH), map_location="cpu")

            with open(TMDB_MAP_PATH) as f:
                movieid_to_tmdbid: dict[str, int] = json.load(f)

            # Inverse map: tmdb_id (int) → row index in _embeddings
            # movieid_to_tmdbid keys are MovieLens movieIds (str),
            # values are TMDB ids (int). The row order in embeddings.pt
            # matches the sorted MovieLens movieId order from training.
            sorted_keys = sorted(movieid_to_tmdbid.keys(), key=int)
            _tmdb_to_idx = {
                int(movieid_to_tmdbid[k]): idx
                for idx, k in enumerate(sorted_keys)
                if movieid_to_tmdbid[k]  # skip nulls
            }
            # Pre-build the reverse map once at startup (used every request)
            _idx_to_tmdb = {v: k for k, v in _tmdb_to_idx.items()}
            print(
                f"[startup] Loaded embeddings {tuple(_embeddings.shape)} "
                f"and {len(_tmdb_to_idx)} TMDB→idx mappings."
            )
        except Exception as exc:
            print(f"[startup] Could not load ML artefacts: {exc}")
            _embeddings  = None
            _tmdb_to_idx = {}
            _idx_to_tmdb = {}
    else:
        print("[startup] embeddings.pt / movieid_to_tmdbid.json not found — "
              "recommendation endpoint will return empty results.")

    yield  # app runs here


# ─── app factory ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="CineGraph API",
    description="Backend for the GNN-powered movie recommender.",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Vite dev server (and any localhost port for flexibility)
_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:4173",  # Vite preview
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ─── schemas ──────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    search_term: str = Field(..., min_length=1, max_length=200)
    movie_id:    int = Field(..., gt=0)
    poster_url:  str | None = Field(default=None)


class SearchResponse(BaseModel):
    ok: bool = True


class TrendingItem(BaseModel):
    search_term: str
    movie_id:    int
    poster_url:  str | None
    count:       int


class RecommendResponse(BaseModel):
    tmdb_ids: list[int]


# ─── routes ───────────────────────────────────────────────────────────────────

@app.post("/api/search", response_model=SearchResponse, summary="Log a movie search")
def log_search(payload: SearchRequest):
    """
    Called by the frontend after every successful TMDB search.
    Inserts or increments the search_term row, recording the top movie's
    TMDB id and poster URL for the trending strip.
    """
    if not payload.search_term.strip():
        raise HTTPException(status_code=422, detail="search_term must not be blank.")
    upsert_search(
        search_term=payload.search_term,
        movie_id=payload.movie_id,
        poster_url=payload.poster_url,
    )
    return {"ok": True}


@app.get("/api/trending", response_model=list[TrendingItem], summary="Top 5 trending searches")
def trending():
    """Returns the top-5 most-searched movies, ordered by search count."""
    return get_trending(limit=5)


@app.get(
    "/api/recommend/cold",
    response_model=RecommendResponse,
    summary="Cold-start GNN recommendations",
)
def recommend_cold(
    tmdb_ids: str = Query(
        ...,
        description="Comma-separated TMDB movie ids the session has viewed.",
        examples=["550,680,13"],
    )
):
    """
    Given a comma-separated list of TMDB ids the current session has viewed,
    uses the WINDOW_SIZE most recent ones to build a query embedding and returns
    the top-20 nearest movies by dot product.

    Using only the recent window (not the full history) prevents the query
    vector from averaging out to a fixed centroid, which would cause
    recommendations to freeze after a few searches.

    Returns an empty list if embeddings have not been loaded yet.
    """
    # Parse + validate input
    try:
        viewed = [int(x.strip()) for x in tmdb_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="tmdb_ids must be comma-separated integers.")

    if not viewed:
        return {"tmdb_ids": []}

    # Stub path — embeddings not yet loaded
    if _embeddings is None:
        return {"tmdb_ids": []}

    # ── Phase 4 real logic ─────────────────────────────────────────────────────
    import torch

    # Find the most recently searched movies that ARE in the training dataset.
    # We walk the viewed list in reverse (newest first) and collect the first
    # QUERY_ANCHOR ids that exist in _tmdb_to_idx.
    # 
    # Why not average all history?
    #  Averaging N items shifts the query by 1/N of the new item's contribution.
    #  After ~5 searches the vector barely moves → recommendations freeze.
    # Why not a fixed window?
    #  If recent searches are all out-of-dataset films the window is empty.
    # Single-movie anchor: always responds to the latest in-dataset search.
    anchor_indices = []
    for tid in reversed(viewed):
        if tid in _tmdb_to_idx:
            anchor_indices.append(_tmdb_to_idx[tid])
            if len(anchor_indices) >= QUERY_ANCHOR:
                break

    if not anchor_indices:
        return {"tmdb_ids": []}

    # Build query vector from the anchor(s)
    anchor_embs = _embeddings[anchor_indices]          # [k, D]
    query_vec   = anchor_embs.mean(dim=0)              # [D]

    # Use Cosine Similarity instead of raw Dot Product.
    # Raw dot product suffers from popularity bias because famous movies have 
    # larger vector norms, dominating the math. Normalizing fixes vectors to 
    # length 1, so the dot product strictly measures angle/genre similarity.
    import torch.nn.functional as F
    query_norm = F.normalize(query_vec.unsqueeze(0), p=2, dim=1).squeeze(0)
    embs_norm = F.normalize(_embeddings, p=2, dim=1)

    # Cosine similarity scores [N_items]
    scores = (embs_norm @ query_norm).clone()  # clone → writable tensor

    # Mask out ALL viewed items (full history) so we never re-recommend
    all_indices = [_tmdb_to_idx[tid] for tid in viewed if tid in _tmdb_to_idx]
    if all_indices:
        seen_t = torch.tensor(all_indices, dtype=torch.long)
        scores[seen_t] = float("-inf")

    # Top-20 by descending score
    top_indices = torch.topk(scores, k=min(20, scores.shape[0])).indices.tolist()

    # Map back: embedding row index → TMDB id (using pre-built reverse map)
    result_ids = [_idx_to_tmdb[i] for i in top_indices if i in _idx_to_tmdb]

    return {"tmdb_ids": result_ids}


# ─── health check ─────────────────────────────────────────────────────────────

@app.get("/health", include_in_schema=False)
def health():
    return {
        "status": "ok",
        "embeddings_loaded": _embeddings is not None,
        "known_tmdb_ids": len(_tmdb_to_idx),
    }
