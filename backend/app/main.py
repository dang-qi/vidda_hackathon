from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .agent_graph import (
    AGENT_STEPS,
    AgentGraphError,
    draft_role_profile,
    finish_reviewed_workflow,
    generate_review_matrix,
    has_openrouter_key,
    revise_matrix_rows,
    revise_role_draft,
    revise_training_plan,
    role_from_draft,
    run_agent_workflow,
)
from .storage import add_review_action, build_audit_export, get_run, init_db, list_runs, save_workflow_run
from .workflow import ROLE_CATALOG, apply_country_overrides, get_role, run_workflow


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
review_workflows: dict[str, dict[str, Any]] = {}
jobs_lock = Lock()
review_workflows_lock = Lock()


class CustomRole(BaseModel):
    name: str = Field(default="Custom Role", min_length=1)
    team: str | None = None
    description: str = Field(min_length=1)


class AnalyzeRequest(BaseModel):
    roleId: str | None = None
    customRole: CustomRole | None = None
    useAgent: bool = True
    organizationContext: dict[str, Any] | None = None
    trainingConstraints: dict[str, Any] | None = None
    reviewPolicy: dict[str, Any] | None = None
    regulatoryScope: dict[str, Any] | None = None


class ReviewActionRequest(BaseModel):
    artifactType: str = Field(default="matrix")
    targetId: str
    action: str
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    reviewer: str = Field(default="Demo reviewer")
    comment: str | None = None


class RoleDraftRequest(BaseModel):
    roleId: str | None = None
    customRole: CustomRole | None = None
    organizationContext: dict[str, Any] | None = None
    trainingConstraints: dict[str, Any] | None = None
    reviewPolicy: dict[str, Any] | None = None
    regulatoryScope: dict[str, Any] | None = None


class NaturalLanguageRevisionRequest(BaseModel):
    instruction: str = Field(min_length=1)
    targetId: str | None = None


class ApproveRoleRequest(BaseModel):
    roleDraft: dict[str, Any] | None = None


class MatrixStatusRequest(BaseModel):
    targetId: str
    status: str


class MatrixRowUpdateRequest(BaseModel):
    row: dict[str, Any]


class TrainingRevisionRequest(BaseModel):
    instruction: str = Field(min_length=1)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "agent": "enabled" if has_openrouter_key() else "missing-openrouter-key",
    }


@app.get("/api/roles")
def roles() -> list[dict[str, Any]]:
    return ROLE_CATALOG


@app.post("/api/workflows")
def create_review_workflow(request: RoleDraftRequest) -> dict[str, Any]:
    role = resolve_role_seed(request)
    workflow_id = f"wf_{uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    role_draft = draft_role_profile(role)
    state = {
        "workflowId": workflow_id,
        "status": "role_draft",
        "createdAt": now,
        "updatedAt": now,
        "role": role,
        "roleDraft": role_draft,
        "risks": [],
        "matrix": [],
        "agents": [
            {
                "name": "Role Parser Agent",
                "status": "needs_confirmation",
                "summary": "Created a role draft for human confirmation before risk mapping.",
            }
        ],
        "organizationContext": request.organizationContext,
        "trainingConstraints": request.trainingConstraints,
        "reviewPolicy": request.reviewPolicy,
        "regulatoryScope": request.regulatoryScope,
        "result": None,
        "changeSummary": [],
    }
    with review_workflows_lock:
        review_workflows[workflow_id] = state
    return review_workflow_response(workflow_id)


@app.get("/api/workflows/{workflow_id}")
def get_review_workflow(workflow_id: str) -> dict[str, Any]:
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/role/revise")
def revise_workflow_role(workflow_id: str, request: NaturalLanguageRevisionRequest) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        revision = revise_role_draft(state["roleDraft"], request.instruction)
        state["roleDraft"] = revision["updatedRole"]
        state["role"] = role_from_draft(state["roleDraft"])
        state["status"] = "role_draft"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = revision.get("changeSummary", [])
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/role/approve")
def approve_workflow_role(workflow_id: str, request: ApproveRoleRequest | None = None) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if request and request.roleDraft:
            state["roleDraft"] = request.roleDraft
        state["roleDraft"] = {**state["roleDraft"], "approvalStatus": "confirmed"}
        state["role"] = role_from_draft(state["roleDraft"])
        state["status"] = "role_confirmed"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = ["Role profile confirmed for risk mapping."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/generate")
def generate_workflow_matrix(workflow_id: str) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if state["status"] not in {"role_confirmed", "matrix_review", "matrix_confirmed"}:
            raise HTTPException(status_code=409, detail="Confirm the role before generating the matrix.")
        generated = generate_review_matrix(
            role=state["role"],
            parsed_role=state["roleDraft"],
            organization_context=state.get("organizationContext"),
            review_policy=state.get("reviewPolicy"),
            regulatory_scope=state.get("regulatoryScope"),
        )
        state["risks"] = generated["risks"]
        state["matrix"] = generated["matrix"]
        state["agents"] = generated["agents"]
        state["status"] = "matrix_review"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = ["Generated risk evidence matrix for human confirmation."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/revise")
def revise_workflow_matrix(workflow_id: str, request: NaturalLanguageRevisionRequest) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if not state.get("matrix"):
            raise HTTPException(status_code=409, detail="Generate the matrix before revising it.")
        revision = revise_matrix_rows(
            parsed_role=state["roleDraft"],
            matrix=state["matrix"],
            instruction=request.instruction,
            target_id=request.targetId,
        )
        state["matrix"] = revision["updatedRows"]
        state["status"] = "matrix_review"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = revision.get("changeSummary", [])
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/status")
def update_workflow_matrix_status(workflow_id: str, request: MatrixStatusRequest) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if not state.get("matrix"):
            raise HTTPException(status_code=409, detail="Generate the matrix before updating review status.")
        state["matrix"] = [
            {**row, "humanReview": request.status} if row.get("id") == request.targetId else row
            for row in state["matrix"]
        ]
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = [f"Matrix row {request.targetId} marked as {request.status}."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/row")
def update_workflow_matrix_row(workflow_id: str, request: MatrixRowUpdateRequest) -> dict[str, Any]:
    updated_row = {**request.row, "humanReview": request.row.get("humanReview") or "edited"}
    target_id = updated_row.get("id")
    if not target_id:
        raise HTTPException(status_code=400, detail="Matrix row id is required.")
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if not state.get("matrix"):
            raise HTTPException(status_code=409, detail="Generate the matrix before editing a row.")
        state["matrix"] = [
            updated_row if row.get("id") == target_id else row
            for row in state["matrix"]
        ]
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = [f"Matrix row {target_id} edited directly."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/accept-all")
def accept_all_workflow_matrix_rows(workflow_id: str) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if not state.get("matrix"):
            raise HTTPException(status_code=409, detail="Generate the matrix before accepting rows.")
        state["matrix"] = [
            {**row, "humanReview": "accepted"}
            for row in state["matrix"]
        ]
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = ["All matrix rows accepted by reviewer."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/matrix/approve")
def approve_workflow_matrix(workflow_id: str) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if not state.get("matrix"):
            raise HTTPException(status_code=409, detail="Generate the matrix before approving it.")
        state["matrix"] = [
            {**row, "humanReview": "accepted" if row.get("humanReview") == "needs-review" else row.get("humanReview", "accepted")}
            for row in state["matrix"]
        ]
        state["status"] = "matrix_confirmed"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = ["Risk evidence matrix confirmed for training design."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/training/generate")
def generate_workflow_training(workflow_id: str) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        if state["status"] != "matrix_confirmed":
            raise HTTPException(status_code=409, detail="Confirm the matrix before generating training.")
        result = finish_reviewed_workflow(
            workflow_id=workflow_id,
            role=state["role"],
            parsed_role=state["roleDraft"],
            matrix=state["matrix"],
            agents=state["agents"],
            organization_context=state.get("organizationContext"),
            training_constraints=state.get("trainingConstraints"),
            review_policy=state.get("reviewPolicy"),
        )
        save_workflow_run(result)
        state["result"] = result
        state["status"] = "complete"
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = ["Generated training path after role and matrix confirmation."]
    return review_workflow_response(workflow_id)


@app.post("/api/workflows/{workflow_id}/training/revise")
def revise_workflow_training(workflow_id: str, request: TrainingRevisionRequest) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        result = state.get("result")
        if not result or not result.get("trainingPlan"):
            raise HTTPException(status_code=409, detail="Generate the training plan before revising it.")
        before = result["trainingPlan"]
        revision = revise_training_plan(
            role=state["role"],
            matrix=state.get("matrix") or result.get("riskRegulationMatrix") or [],
            training_plan=before,
            instruction=request.instruction,
        )
        after = revision["updatedTrainingPlan"]
        result["trainingPlan"] = after
        state["result"] = result
        state["updatedAt"] = datetime.now(timezone.utc).isoformat()
        state["changeSummary"] = revision.get("changeSummary", [])
    try:
        add_review_action(
            run_id=workflow_id,
            artifact_type="training_plan",
            target_id="training-plan",
            action="changes_requested",
            before=before,
            after=after,
            reviewer="Demo reviewer",
            comment=f"Training plan revised by AI from reviewer instruction: {request.instruction}",
        )
    except KeyError:
        pass
    return review_workflow_response(workflow_id)


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
                "output": None,
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


@app.get("/api/history/runs")
def history_runs() -> list[dict[str, Any]]:
    return list_runs()


@app.get("/api/history/runs/{run_id}")
def history_run(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Unknown workflow run")
    return run


@app.get("/api/history/runs/{run_id}/audit-pack")
def export_audit_pack(run_id: str) -> JSONResponse:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Unknown workflow run")
    filename = f"{run_id}-audit-pack.json"
    return JSONResponse(
        build_audit_export(run),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/history/runs/{run_id}/review-actions")
def create_review_action(run_id: str, request: ReviewActionRequest) -> dict[str, Any]:
    try:
        return add_review_action(
            run_id=run_id,
            artifact_type=request.artifactType,
            target_id=request.targetId,
            action=request.action,
            before=request.before,
            after=request.after,
            reviewer=request.reviewer,
            comment=request.comment,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown workflow run") from exc


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    try:
        role = get_role(
            role_id=request.roleId,
            custom_role=request.customRole.model_dump() if request.customRole else None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown role id") from exc

    country_code = (request.regulatoryScope or {}).get("country") if request.regulatoryScope else None

    if request.useAgent:
        try:
            result = run_agent_workflow(
                role=role,
                organization_context=request.organizationContext,
                training_constraints=request.trainingConstraints,
                review_policy=request.reviewPolicy,
                regulatory_scope=request.regulatoryScope,
            )
            save_workflow_run(result)
            return result
        except AgentGraphError as exc:
            fallback = run_workflow(role, country_code=country_code)
            fallback["executionMode"] = "deterministic-fallback"
            fallback["agentError"] = str(exc)
            save_workflow_run(fallback)
            return fallback
        except Exception as exc:
            fallback = run_workflow(role, country_code=country_code)
            fallback["executionMode"] = "deterministic-fallback"
            fallback["agentError"] = f"LangGraph workflow failed: {exc}"
            save_workflow_run(fallback)
            return fallback

    fallback = run_workflow(role, country_code=country_code)
    fallback["executionMode"] = "deterministic"
    save_workflow_run(fallback)
    return fallback


def resolve_role_seed(request: RoleDraftRequest) -> dict[str, Any]:
    if request.customRole:
        return get_role(custom_role=request.customRole.model_dump(), role_id=None)
    if request.roleId:
        try:
            return get_role(role_id=request.roleId)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Unknown role id") from exc
    return get_role(
        custom_role={
            "name": "Custom Role",
            "team": "Imported role",
            "description": "Custom role. Ask the reviewer for responsibilities, authority and risk exposure.",
        },
        role_id=None,
    )


def get_review_workflow_state(workflow_id: str) -> dict[str, Any]:
    state = review_workflows.get(workflow_id)
    if not state:
        raise HTTPException(status_code=404, detail="Unknown workflow")
    return state


def review_workflow_response(workflow_id: str) -> dict[str, Any]:
    with review_workflows_lock:
        state = get_review_workflow_state(workflow_id)
        response = {
            "workflowId": state["workflowId"],
            "status": state["status"],
            "createdAt": state["createdAt"],
            "updatedAt": state["updatedAt"],
            "role": state["role"],
            "roleDraft": state["roleDraft"],
            "risks": state.get("risks", []),
            "riskRegulationMatrix": state.get("matrix", []),
            "agents": state.get("agents", []),
            "changeSummary": state.get("changeSummary", []),
            "result": state.get("result"),
        }
    country_code = (state.get("regulatoryScope") or {}).get("country")
    if country_code:
        apply_country_overrides(response, country_code)
        if response.get("result"):
            apply_country_overrides(response["result"], country_code)
    return response


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
                    if "output" in payload:
                        step["output"] = payload["output"]
                    break

    country_code = (request.regulatoryScope or {}).get("country") if request.regulatoryScope else None

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
            result = run_workflow(role, country_code=country_code)
            result["executionMode"] = "deterministic"
        elapsed_ms = round((time.monotonic() - started) * 1000)
        save_workflow_run(result, job_id=job_id, elapsed_ms=elapsed_ms)
        update_job(job_id, status="complete", result=result, elapsed_ms=elapsed_ms)
    except Exception as exc:
        fallback = run_workflow(role, country_code=country_code)
        fallback["executionMode"] = "deterministic-fallback"
        fallback["agentError"] = f"LangGraph workflow failed: {exc}"
        elapsed_ms = round((time.monotonic() - started) * 1000)
        save_workflow_run(fallback, job_id=job_id, elapsed_ms=elapsed_ms)
        update_job(
            job_id,
            status="complete",
            result=fallback,
            error=str(exc),
            elapsed_ms=elapsed_ms,
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
