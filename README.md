# CineGraph — GNN-Powered Movie Recommender

> **A full-stack movie discovery app**: TMDB-powered search, live trending strip tracked in SQLite, and AI-driven "Recommended for You" powered by a **LightGCN** Graph Neural Network trained on the MovieLens 25M dataset.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite + Tailwind v4)                │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │  Search  │  │ Trending │  │ Recommended for You    │ │
│  │  (TMDB)  │  │(FastAPI) │  │ (FastAPI cold endpoint)│ │
│  └────┬─────┘  └────┬─────┘  └──────────┬─────────────┘ │
└───────┼─────────────┼──────────────────┼──────────────┘
        │ TMDB API    │ /api/trending     │ /api/recommend/cold
        │             │                  │
        ▼             ▼                  ▼
   api.themoviedb.org     ┌──────────────────────┐
                          │  FastAPI  (Python)    │
                          │  main.py             │
                          │  database.py (SQLite)│
                          │  embeddings.pt       │
                          │  movieid_to_tmdbid   │
                          └──────────────────────┘
ML Pipeline (offline / Google Colab):
  ml/train_lightgcn.ipynb  →  embeddings.pt
  ml/build_tmdb_map.py     →  movieid_to_tmdbid.json
```

---

## Project Structure

```
movie-recommender/
├── README.md
├── .gitignore
├── backend/
│   ├── main.py               # FastAPI app + all routes
│   ├── database.py           # SQLite helpers
│   ├── requirements.txt
│   ├── .env.example
│   └── .gitignore
├── ml/
│   ├── data/                 # Place ratings.csv + links.csv here (gitignored)
│   ├── build_tmdb_map.py     # links.csv → movieid_to_tmdbid.json
│   └── train_lightgcn.ipynb  # Colab notebook — trains LightGCN, exports embeddings
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── .env.example
    ├── .gitignore
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/
        │   ├── tmdb.js        # TMDB fetch helpers
        │   └── backend.js     # Backend fetch helpers
        ├── components/
        │   ├── MovieCard.jsx
        │   ├── SearchBar.jsx
        │   └── Spinner.jsx
        └── hooks/
            └── useRecommendations.js
```

---

## Quick Start

### 1 · Frontend (React)

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local — add your TMDB API key
npm install
npm run dev          # → http://localhost:5173
```

Get a free TMDB API key at <https://www.themoviedb.org/settings/api>.

### 2 · Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
# Optional: pip install torch --index-url https://download.pytorch.org/whl/cpu
cp .env.example .env
uvicorn main:app --reload   # → http://localhost:8000
```

The backend runs without `embeddings.pt` — recommendations will return an empty list until you add the ML artefacts (see below).

---

## ML Pipeline (Google Colab)

### Prerequisites

Download the **MovieLens 25M** dataset from <https://grouplens.org/datasets/movielens/25m/> and extract:
- `ratings.csv` → `ml/data/ratings.csv`
- `links.csv`   → `ml/data/links.csv`

### Step 1 — Build TMDB map

```bash
python ml/build_tmdb_map.py
# → ml/movieid_to_tmdbid.json
```

### Step 2 — Train LightGCN on Colab

1. Open `ml/train_lightgcn.ipynb` in **Google Colab**
2. Enable a **T4 GPU** runtime (*Runtime → Change runtime type → GPU*)
3. Upload `ratings.csv` and `links.csv` to the session
4. Run all cells (~30-60 min on T4)
5. Download `embeddings.pt` and `movieid_to_tmdbid.json`

### Step 3 — Add artefacts to backend

```
backend/
├── embeddings.pt              ← place here
└── movieid_to_tmdbid.json     ← place here
```

Restart the FastAPI server; the startup log will confirm:

```
[startup] Loaded embeddings (58098, 64) and 45115 TMDB→idx mappings.
```

Recommendations will now populate after the first search.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Log a search term + top movie; body: `{search_term, movie_id, poster_url}` |
| `GET` | `/api/trending` | Top-5 most-searched movies ordered by count |
| `GET` | `/api/recommend/cold?tmdb_ids=550,680` | Cold-start GNN recommendations for comma-separated TMDB ids |
| `GET` | `/health` | Service health + embeddings status |

---

## Environment Variables

### `frontend/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_TMDB_API_KEY` | ✅ | Your TMDB v3 API key |
| `VITE_BACKEND_URL` | ❌ | Backend base URL (default: `http://localhost:8000`) |

### `backend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_PATH` | ❌ | Path to SQLite DB (default: `cinegraph.db`) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | FastAPI, Uvicorn, SQLite |
| ML model | LightGCN (`torch_geometric`) |
| Data | MovieLens 25M, TMDB API |

---

## Secrets Audit

The following are **never committed to git**:
- `.env.local` / `.env` — API keys
- `*.db` — SQLite database
- `embeddings.pt` — trained model weights
- `movieid_to_tmdbid.json` — derived data file
- `ml/data/` — raw dataset files (hundreds of MB)

---

*Built as a résumé-grade original project demonstrating GNN-based collaborative filtering on real-world data.*
