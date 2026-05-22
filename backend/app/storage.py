from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .workflow import source_pack


DB_PATH = Path(__file__).resolve().parents[1] / "data" / "vidda.sqlite3"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS workflow_runs (
                run_id TEXT PRIMARY KEY,
                job_id TEXT,
                role_id TEXT,
                role_name TEXT NOT NULL,
                role_team TEXT,
                status TEXT NOT NULL,
                model TEXT,
                execution_mode TEXT,
                generated_at TEXT,
                completed_at TEXT NOT NULL,
                elapsed_ms INTEGER,
                approval_status TEXT NOT NULL DEFAULT 'needs_review',
                role_json TEXT NOT NULL,
                result_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                type TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                content_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES workflow_runs(run_id)
            );

            CREATE TABLE IF NOT EXISTS review_actions (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                artifact_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                action TEXT NOT NULL,
                before_json TEXT,
                after_json TEXT,
                reviewer TEXT NOT NULL,
                comment TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES workflow_runs(run_id)
            );
            """
        )


def save_workflow_run(
    result: dict[str, Any],
    job_id: str | None = None,
    elapsed_ms: int | None = None,
) -> str:
    init_db()
    run_id = result.get("workflowId") or f"wf_{uuid4().hex[:10]}"
    role = result.get("role") or {}
    completed_at = now_iso()
    artifacts = {
        "role_information": result.get("roleInformation") or {
            "sourceRole": role,
            "parsedRole": result.get("parsedRole"),
        },
        "parsed_role": result.get("parsedRole"),
        "matrix": result.get("riskRegulationMatrix"),
        "training_plan": result.get("trainingPlan"),
        "quality_review": result.get("qualityReview"),
        "audit_pack": result.get("auditPack"),
    }
    approval_status = derive_approval_status(result)

    with connect() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO workflow_runs (
                run_id, job_id, role_id, role_name, role_team, status, model,
                execution_mode, generated_at, completed_at, elapsed_ms,
                approval_status, role_json, result_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                job_id,
                role.get("id"),
                role.get("name") or "Unknown role",
                role.get("team"),
                "complete",
                result.get("model"),
                result.get("executionMode"),
                result.get("generatedAt"),
                completed_at,
                elapsed_ms,
                approval_status,
                json.dumps(role, ensure_ascii=False),
                json.dumps(result, ensure_ascii=False),
            ),
        )
        connection.execute("DELETE FROM artifacts WHERE run_id = ?", (run_id,))
        for artifact_type, content in artifacts.items():
            if content is None:
                continue
            connection.execute(
                """
                INSERT INTO artifacts (id, run_id, type, version, content_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"artifact_{uuid4().hex[:12]}",
                    run_id,
                    artifact_type,
                    1,
                    json.dumps(content, ensure_ascii=False),
                    completed_at,
                ),
            )
    return run_id


def list_runs() -> list[dict[str, Any]]:
    init_db()
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT
                run_id, job_id, role_id, role_name, role_team, status, model,
                execution_mode, generated_at, completed_at, elapsed_ms,
                approval_status
            FROM workflow_runs
            ORDER BY completed_at DESC
            LIMIT 100
            """
        ).fetchall()
    return [dict(row) for row in rows]


def get_run(run_id: str) -> dict[str, Any] | None:
    init_db()
    with connect() as connection:
        run = connection.execute(
            "SELECT * FROM workflow_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if not run:
            return None
        artifact_rows = connection.execute(
            "SELECT type, version, content_json, created_at FROM artifacts WHERE run_id = ? ORDER BY type",
            (run_id,),
        ).fetchall()
        action_rows = connection.execute(
            "SELECT * FROM review_actions WHERE run_id = ? ORDER BY created_at DESC",
            (run_id,),
        ).fetchall()

    run_dict = dict(run)
    run_dict["role"] = json.loads(run_dict.pop("role_json"))
    run_dict["result"] = json.loads(run_dict.pop("result_json"))
    run_dict["artifacts"] = [
        {
            **dict(row),
            "content": json.loads(row["content_json"]),
        }
        for row in artifact_rows
    ]
    for artifact in run_dict["artifacts"]:
        artifact.pop("content_json", None)
    run_dict["reviewActions"] = [decode_action(row) for row in action_rows]
    return run_dict


def add_review_action(
    run_id: str,
    artifact_type: str,
    target_id: str,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reviewer: str = "Demo reviewer",
    comment: str | None = None,
) -> dict[str, Any]:
    init_db()
    action_id = f"review_{uuid4().hex[:12]}"
    created_at = now_iso()
    with connect() as connection:
        exists = connection.execute(
            "SELECT run_id FROM workflow_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        if not exists:
            raise KeyError(run_id)
        connection.execute(
            """
            INSERT INTO review_actions (
                id, run_id, artifact_type, target_id, action, before_json,
                after_json, reviewer, comment, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action_id,
                run_id,
                artifact_type,
                target_id,
                action,
                json.dumps(before, ensure_ascii=False) if before is not None else None,
                json.dumps(after, ensure_ascii=False) if after is not None else None,
                reviewer,
                comment,
                created_at,
            ),
        )
        if artifact_type == "matrix" and after is not None:
            update_matrix_artifact(connection, run_id, target_id, after)
        if artifact_type == "training_plan" and after is not None:
            update_training_artifact(connection, run_id, after)
        update_approval_status(connection, run_id)
        row = connection.execute(
            "SELECT * FROM review_actions WHERE id = ?",
            (action_id,),
        ).fetchone()
    return decode_action(row)


def update_matrix_artifact(
    connection: sqlite3.Connection,
    run_id: str,
    target_id: str,
    updated_row: dict[str, Any],
) -> None:
    run = connection.execute(
        "SELECT result_json FROM workflow_runs WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    if not run:
        return

    result = json.loads(run["result_json"])
    matrix = result.get("riskRegulationMatrix") or []
    result["riskRegulationMatrix"] = [
        updated_row if row.get("id") == target_id else row
        for row in matrix
    ]
    connection.execute(
        "UPDATE workflow_runs SET result_json = ? WHERE run_id = ?",
        (json.dumps(result, ensure_ascii=False), run_id),
    )

    artifact = connection.execute(
        "SELECT id, content_json FROM artifacts WHERE run_id = ? AND type = 'matrix' ORDER BY version DESC LIMIT 1",
        (run_id,),
    ).fetchone()
    if not artifact:
        return
    content = json.loads(artifact["content_json"])
    if isinstance(content, list):
        content = [
            updated_row if row.get("id") == target_id else row
            for row in content
        ]
        connection.execute(
            "UPDATE artifacts SET content_json = ? WHERE id = ?",
            (json.dumps(content, ensure_ascii=False), artifact["id"]),
        )


def update_training_artifact(
    connection: sqlite3.Connection,
    run_id: str,
    updated_training: dict[str, Any],
) -> None:
    run = connection.execute(
        "SELECT result_json FROM workflow_runs WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    if not run:
        return

    result = json.loads(run["result_json"])
    result["trainingPlan"] = updated_training
    connection.execute(
        "UPDATE workflow_runs SET result_json = ? WHERE run_id = ?",
        (json.dumps(result, ensure_ascii=False), run_id),
    )

    artifact = connection.execute(
        "SELECT id FROM artifacts WHERE run_id = ? AND type = 'training_plan' ORDER BY version DESC LIMIT 1",
        (run_id,),
    ).fetchone()
    if artifact:
        connection.execute(
            "UPDATE artifacts SET content_json = ? WHERE id = ?",
            (json.dumps(updated_training, ensure_ascii=False), artifact["id"]),
        )


def update_approval_status(connection: sqlite3.Connection, run_id: str) -> None:
    latest_actions = connection.execute(
        "SELECT action FROM review_actions WHERE run_id = ?",
        (run_id,),
    ).fetchall()
    actions = [row["action"] for row in latest_actions]

    run = connection.execute(
        "SELECT result_json FROM workflow_runs WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    if run:
        result = json.loads(run["result_json"])
        matrix = result.get("riskRegulationMatrix") or []
        statuses = [str(row.get("humanReview", "")).strip() for row in matrix]
        if "rejected" in statuses or "rejected" in actions:
            status = "changes_requested"
        elif "approved_for_lms" in actions and matrix and all(status in {"accepted", "edited"} for status in statuses):
            status = "approved_for_lms"
        elif matrix and all(status in {"accepted", "edited"} for status in statuses):
            status = "matrix_approved"
        elif any(status in {"accepted", "edited"} for status in statuses):
            status = "in_review"
        else:
            status = "needs_review"
        connection.execute(
            "UPDATE workflow_runs SET approval_status = ? WHERE run_id = ?",
            (status, run_id),
        )
        return

    if not latest_actions:
        return
    if "rejected" in actions:
        status = "changes_requested"
    elif "approved_for_lms" in actions:
        status = "approved_for_lms"
    elif any(action in {"accepted", "edited"} for action in actions):
        status = "in_review"
    else:
        status = "needs_review"
    connection.execute(
        "UPDATE workflow_runs SET approval_status = ? WHERE run_id = ?",
        (status, run_id),
    )


def derive_approval_status(result: dict[str, Any]) -> str:
    rows = result.get("riskRegulationMatrix") or []
    statuses = [row.get("humanReview") for row in rows]
    if "rejected" in statuses:
        return "changes_requested"
    if any(status not in {"accepted", "edited"} for status in statuses):
        return "needs_review"
    if rows:
        training = result.get("trainingPlan") or {}
        assignments = training.get("lmsAssignments") or []
        if any(assignment.get("approvalStatus") == "approved_for_lms" for assignment in assignments):
            return "approved_for_lms"
        return "matrix_approved"
    return "needs_review"


def decode_action(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    data["before"] = json.loads(data.pop("before_json")) if data.get("before_json") else None
    data["after"] = json.loads(data.pop("after_json")) if data.get("after_json") else None
    return data


def build_audit_export(run: dict[str, Any]) -> dict[str, Any]:
    result = run.get("result") or {}
    return {
        "exportedAt": now_iso(),
        "run": {
            "runId": run.get("run_id"),
            "jobId": run.get("job_id"),
            "roleName": run.get("role_name"),
            "roleTeam": run.get("role_team"),
            "generatedAt": run.get("generated_at"),
            "completedAt": run.get("completed_at"),
            "elapsedMs": run.get("elapsed_ms"),
            "executionMode": run.get("execution_mode"),
            "model": run.get("model"),
            "approvalStatus": run.get("approval_status"),
        },
        "sources": result.get("sourcePack") or source_pack(),
        "roleProfile": {
            "role": result.get("role"),
            "parsedRole": result.get("parsedRole"),
        },
        "riskRegulationMatrix": result.get("riskRegulationMatrix") or [],
        "trainingPath": result.get("trainingPlan") or {},
        "qualityReview": result.get("qualityReview") or {},
        "auditSummary": result.get("auditPack") or {},
        "reviewActions": run.get("reviewActions") or [],
    }
