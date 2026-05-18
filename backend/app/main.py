from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .agent_graph import AGENT_STEPS, AgentGraphError, has_openrouter_key, run_agent_workflow
from .workflow import ROLE_CATALOG, get_role, run_workflow


app = FastAPI(
    title="Vidda Compliance Training Workflow",
    description="Multi-agent workflow demo for role-based AMLR compliance training generation.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=3)
jobs: dict[str, dict[str, Any]] = {}
jobs_lock = Lock()


class CustomRole(BaseModel):
    name: str = Field(default="Custom Role", min_length=1)
    team: str | None = None
    description: str = Field(min_length=20)


class AnalyzeRequest(BaseModel):
    roleId: str | None = None
    customRole: CustomRole | None = None
    useAgent: bool = True
    organizationContext: dict[str, Any] | None = None
    trainingConstraints: dict[str, Any] | None = None
    reviewPolicy: dict[str, Any] | None = None
    regulatoryScope: dict[str, Any] | None = None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "agent": "enabled" if has_openrouter_key() else "missing-openrouter-key",
    }


@app.get("/api/roles")
def roles() -> list[dict[str, Any]]:
    return ROLE_CATALOG


@app.post("/api/analyze/start")
def start_analyze(request: AnalyzeRequest) -> dict[str, Any]:
    try:
        role = get_role(
            role_id=request.roleId,
            custom_role=request.customRole.model_dump() if request.customRole else None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown role id") from exc

    job_id = f"job_{uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    job = {
        "jobId": job_id,
        "status": "queued",
        "startedAt": now,
        "updatedAt": now,
        "elapsedMs": 0,
        "role": {"id": role["id"], "name": role["name"]},
        "steps": [
            {
                "id": step["id"],
                "name": step["name"],
                "status": "pending",
                "elapsedMs": None,
                "error": None,
            }
            for step in AGENT_STEPS
        ],
        "result": None,
        "error": None,
    }
    with jobs_lock:
        jobs[job_id] = job
    executor.submit(run_job, job_id, request, role, time.monotonic())
    return job_response(job_id)


@app.get("/api/analyze/jobs/{job_id}")
def get_analyze_job(job_id: str) -> dict[str, Any]:
    return job_response(job_id)


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    try:
        role = get_role(
            role_id=request.roleId,
            custom_role=request.customRole.model_dump() if request.customRole else None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown role id") from exc

    if request.useAgent:
        try:
            return run_agent_workflow(
                role=role,
                organization_context=request.organizationContext,
                training_constraints=request.trainingConstraints,
                review_policy=request.reviewPolicy,
                regulatory_scope=request.regulatoryScope,
            )
        except AgentGraphError as exc:
            fallback = run_workflow(role)
            fallback["executionMode"] = "deterministic-fallback"
            fallback["agentError"] = str(exc)
            return fallback
        except Exception as exc:
            fallback = run_workflow(role)
            fallback["executionMode"] = "deterministic-fallback"
            fallback["agentError"] = f"LangGraph workflow failed: {exc}"
            return fallback

    fallback = run_workflow(role)
    fallback["executionMode"] = "deterministic"
    return fallback


def run_job(job_id: str, request: AnalyzeRequest, role: dict[str, Any], started: float) -> None:
    update_job(job_id, status="running", elapsed_ms=0)

    def progress_callback(step_id: str, status: str, payload: dict[str, Any] | None = None) -> None:
        payload = payload or {}
        elapsed_ms = round((time.monotonic() - started) * 1000)
        with jobs_lock:
            job = jobs[job_id]
            job["status"] = "running"
            job["updatedAt"] = datetime.now(timezone.utc).isoformat()
            job["elapsedMs"] = elapsed_ms
            if step_id == "workflow":
                return
            for step in job["steps"]:
                if step["id"] == step_id:
                    step["status"] = status
                    if "elapsedMs" in payload:
                        step["elapsedMs"] = payload["elapsedMs"]
                    if "error" in payload:
                        step["error"] = payload["error"]
                    break

    try:
        if request.useAgent:
            result = run_agent_workflow(
                role=role,
                organization_context=request.organizationContext,
                training_constraints=request.trainingConstraints,
                review_policy=request.reviewPolicy,
                regulatory_scope=request.regulatoryScope,
                progress_callback=progress_callback,
            )
        else:
            result = run_workflow(role)
            result["executionMode"] = "deterministic"
        update_job(job_id, status="complete", result=result, elapsed_ms=round((time.monotonic() - started) * 1000))
    except Exception as exc:
        fallback = run_workflow(role)
        fallback["executionMode"] = "deterministic-fallback"
        fallback["agentError"] = f"LangGraph workflow failed: {exc}"
        update_job(
            job_id,
            status="complete",
            result=fallback,
            error=str(exc),
            elapsed_ms=round((time.monotonic() - started) * 1000),
        )


def update_job(
    job_id: str,
    status: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    elapsed_ms: int | None = None,
) -> None:
    with jobs_lock:
        job = jobs[job_id]
        if status is not None:
            job["status"] = status
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error
        if elapsed_ms is not None:
            job["elapsedMs"] = elapsed_ms
        job["updatedAt"] = datetime.now(timezone.utc).isoformat()


def job_response(job_id: str) -> dict[str, Any]:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown analysis job")
        return {
            **job,
            "steps": [dict(step) for step in job["steps"]],
            "result": job["result"],
        }
