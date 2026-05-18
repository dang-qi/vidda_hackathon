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
2. Run the multi-agent workflow.
3. Review the risk-regulation-competency matrix.
4. Change human review status on high-risk mappings.
5. Open the training path and LMS assignment view.
6. Open Audit & Quality to show coverage score, reviewer flags and traceability.

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
    "articles": ["9", "10", "11", "12", "13", "14"]
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
