# Contributing

How to set up and run the Vidda Compliance Training Engine backend locally.

## Prerequisites

- Python 3.12 (matches CI)
- git

## 1. Clone and branch

```bash
git clone https://github.com/dang-qi/vidda_hackathon.git
cd vidda_hackathon
git checkout -b scope/short-description
```

Branch naming: `scope/short-description` (e.g. `devops/ci-setup`, `feat/role-parser`).

Never push directly to `main` — always open a pull request.

## 2. Backend setup

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 3. Environment variables

```bash
cp .env.example .env
```

Open `.env` and set `OPENROUTER_API_KEY`. The other variables have working defaults and can be left as-is.

**Never commit `.env`.** It is gitignored. Never paste real keys into chat, issues, or PRs.

## 4. Run the backend

```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

The API is then available at http://127.0.0.1:8000.

## 5. Frontend

See `frontend/` once that team publishes setup docs.

## Commit conventions

```
feat(scope): short description
fix(scope): short description
docs(scope): short description
```

Examples:

```
feat(ci): add GitHub Actions workflow
docs(contributing): add local setup guide
fix(ci): bump Python version
```

## Pull requests

- Branch off `main`
- Keep PRs focused — one concern per PR
- Open the PR against `main` and request review before merging
