# Vidda Compliance Training Engine

React + FastAPI hackathon demo for an AI-powered human-in-the-loop workflow that generates role-based AMLR compliance training.

## What It Demonstrates

- A five-stage multi-agent pipeline:
  - Role Parser Agent
  - Risk Mapper Agent
  - Regulation Mapper Agent
  - Training Designer Agent
  - Quality Reviewer Agent
- Role-to-risk-to-regulation explainability.
- Human review checkpoints before LMS assignment.
- A lightweight audit and quality view for governance evidence.
- **Per-country national overlay (Sweden 🇸🇪 · Spain 🇪🇸 · Germany 🇩🇪)**: the same EU regulation produces visibly different output per jurisdiction — national-law citations layered on AMLR articles, localised role labels, a country-mandatory training module in the right quarter, and a colour-coded matrix banner.
- **Instant country swap for the demo**: when the first multi-agent run completes, the other two countries are pre-fetched in parallel (~250 ms each via the deterministic engine) and cached in the browser. Switching jurisdictions or running the side-by-side compare view becomes a zero-network state swap, so a 5-minute demo or short live presentation can show all three countries back-to-back without re-running the agents.

### Per-country overlay in detail

| Country | National law on the stack | Local role label (KYC Analyst) | Mandatory module | Quarter |
|---|---|---|---|---|
| 🇸🇪 SE | FFFS 2017:11, Lag 2017:630 | KYC-analytiker (centralt funktionsansvarig) | Independent review evidence pack | Q4 |
| 🇪🇸 ES | Ley 10/2010, RD 304/2014, SEPBLAC | Analista KYC (representante ante SEPBLAC) | External expert review preparation | Q4 |
| 🇩🇪 DE | GwG §6/§7, GwG §10, BaFin AuA | KYC-Analyst (erste Verteidigungslinie) | Deputy MLRO handover protocol | Q3 |

The country layer is **additive** — `riskRegulationMatrix` rows pick up a `nationalCitations[]` array and a `localRoleLabel` on top of their existing AMLR articles, the training plan gets one extra country-mandatory module, and a new top-level `countryOverlay` object is added. Any consumer that doesn't know about country still works.

The overlay is applied **deterministically post-LLM**, so the structured national fields are guaranteed regardless of whether the model honours the prompt — and it works through both `/api/analyze` and the new `/api/workflows` review path.

## Run Locally

Backend:

```bash
conda activate vidda_hackathon
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

The agent backend reads `OPENROUTER_API_KEY` from the environment. It defaults to:

```text
deepseek/deepseek-v4-flash
```

To override only for this project:

```bash
export VIDDA_OPENROUTER_MODEL="deepseek/deepseek-v4-flash"
export VIDDA_OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
```

Frontend:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://127.0.0.1:5173/
```

## Demo Flow

1. Select a challenge role, such as KYC Analyst, Customer Advisor or MLRO.
2. Pick a jurisdiction (Sweden / Spain / Germany) from the country picker.
3. Run the multi-agent workflow.
4. Review the risk-regulation-competency matrix with the country overlay banner (citations, role labels and mandatory modules tailored to the country).
5. **Instant country swap** — in the matrix view click another country chip to re-render with cached results, or click `🇪🇸 vs 🇸🇪` to open the side-by-side compare view with auto-generated "Why different?" lines. No re-run, no LLM latency.
6. Change human review status on high-risk mappings.
7. Open the training path (the country-mandatory module is highlighted in amber) and LMS assignment view.
8. Open Audit & Quality to show coverage score, reviewer flags and traceability.

## API

```text
GET  /api/health
GET  /api/roles
POST /api/analyze
POST /api/analyze/start
GET  /api/analyze/jobs/{job_id}
```

Example:

```bash
curl -s -X POST http://127.0.0.1:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"roleId":"kyc-analyst"}'
```

Optional input fields:

```json
{
  "roleId": "kyc-analyst",
  "useAgent": true,
  "organizationContext": {
    "industry": "Banking",
    "risk_appetite": "medium",
    "lines_of_defence_model": true
  },
  "trainingConstraints": {
    "duration": "12 months",
    "format": ["e-learning", "scenario workshop", "manager review"],
    "assessment_style": "scenario-based",
    "lms_required": true
  },
  "reviewPolicy": {
    "require_human_approval_for": ["High", "Critical"],
    "strict_regulatory_traceability": true,
    "allow_generic_modules": false
  },
  "regulatoryScope": {
    "jurisdiction": "EU",
    "regulation": "AMLR 2024/1624",
    "articles": ["9", "10", "11", "12", "13", "14"],
    "country": "SE"
  }
}
```

For the UI progress graph, use the job endpoints:

```bash
curl -s -X POST http://127.0.0.1:8000/api/analyze/start \
  -H 'Content-Type: application/json' \
  -d '{"roleId":"customer-advisor","useAgent":true}'

curl -s http://127.0.0.1:8000/api/analyze/jobs/job_xxxxx
```

## DevOps

This repository ships with a small DevOps baseline.

- **`CONTRIBUTING.md`** — local setup using Python venv, environment config, branch/commit conventions, PR workflow. Start here when onboarding.
- **`.env.example`** — template for the OpenRouter environment variables read by `backend/app/agent_graph.py` (1 required, 6 optional overrides). Copy to `.env` and fill in `OPENROUTER_API_KEY`. Real `.env` files are gitignored and must never be committed.
- **`.github/workflows/ci.yml`** — GitHub Actions workflow that runs on every push and pull request to `main`. It installs `backend/requirements.txt` on Python 3.12 and runs a smoke import check on `backend.app` to catch broken imports before merge. No real API calls are made in CI.
- **`.gitignore`** — excludes `.env` (secrets) and `CLAUDE.md` (local AI-assistant context) from the repo.
