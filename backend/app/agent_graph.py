from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from collections.abc import Callable
from typing import Any, Literal, TypedDict
from uuid import uuid4

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field, ValidationError

from .workflow import (
    AMLR_ARTICLES,
    apply_country_overrides,
    build_audit_pack,
    enrich_training_plan,
    get_country_override,
    quality_reviewer_agent,
    regulation_mapper_agent,
    risk_mapper_agent,
    role_parser_agent,
    sort_matrix_rows_by_level,
    source_pack,
    training_designer_agent,
)


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "deepseek/deepseek-v4-flash"

AGENT_STEPS = [
    {"id": "role_parser", "name": "Role Parser Agent"},
    {"id": "risk_mapper", "name": "Risk Mapper Agent"},
    {"id": "regulation_mapper", "name": "Regulation Mapper Agent"},
    {"id": "training_designer", "name": "Training Designer Agent"},
    {"id": "quality_reviewer", "name": "Quality Reviewer Agent"},
]

ProgressCallback = Callable[[str, str, dict[str, Any] | None], None]


class AgentGraphError(RuntimeError):
    pass


class Responsibility(BaseModel):
    text: str
    evidence: str
    humanReview: str = "accepted"


class ParsedRoleOutput(BaseModel):
    function: str
    lineOfDefence: str
    responsibilities: list[Responsibility] = Field(min_length=1, max_length=8)
    riskClues: list[str] = Field(min_length=1, max_length=8)
    decisionAuthority: str
    sourceQuality: str


class RoleDraftOutput(ParsedRoleOutput):
    name: str
    team: str | None = None
    missingFields: list[str] = Field(default_factory=list, max_length=8)
    clarifyingQuestions: list[str] = Field(default_factory=list, max_length=6)
    approvalStatus: Literal["draft", "needs_user_input", "confirmed"] = "draft"


class RiskExposure(BaseModel):
    theme: Literal["AML", "Sanctions", "Fraud", "Documentation", "Governance"]
    level: Literal["Low", "Medium", "High", "Critical"]
    scenario: str
    evidence: str
    impact: str


class RiskMapperOutput(BaseModel):
    risks: list[RiskExposure] = Field(min_length=3, max_length=6)


class ArticleTrace(BaseModel):
    article: str
    title: str
    rationale: str


class MatrixRow(BaseModel):
    id: str
    riskTheme: str
    riskLevel: str
    riskScenario: str
    roleEvidence: str
    whyItMatters: str
    amlrArticles: list[ArticleTrace] = Field(min_length=1, max_length=4)
    competencyNeed: str
    trainingDepth: str
    confidence: int = Field(ge=0, le=100)
    humanReview: str


class RegulationMapperOutput(BaseModel):
    rows: list[MatrixRow] = Field(min_length=3, max_length=6)


class TrainingModule(BaseModel):
    moduleId: str | None = None
    title: str
    whyIncluded: str
    whyExpanded: str | None = None
    sourceRiskId: str | None = None
    roleEvidence: str | None = None
    amlrTrace: list[str] | None = None
    competencyNeed: str | None = None
    competencyType: str | None = None
    assessment: str
    approvalStatus: str | None = None
    lmsStatus: str | None = None


class TrainingQuarter(BaseModel):
    name: str
    focus: str
    modules: list[TrainingModule] = Field(min_length=2, max_length=4)


class LMSAssignment(BaseModel):
    learnerGroup: str
    status: str
    approvalStatus: str | None = None
    lmsStatus: str | None = None
    owner: str | None = None
    dueWindow: str | None = None
    mandatoryModules: int
    assessment: str
    refreshCycle: str


class TrainingPlanOutput(BaseModel):
    title: str
    philosophy: str
    quarters: list[TrainingQuarter] = Field(min_length=4, max_length=4)
    lmsAssignments: list[LMSAssignment] = Field(min_length=1, max_length=2)


class QualityDimension(BaseModel):
    name: str
    score: int = Field(ge=0, le=100)


class ReviewFlag(BaseModel):
    severity: Literal["low", "medium", "high"]
    message: str
    target: str


class QualityReviewOutput(BaseModel):
    overallScore: int = Field(ge=0, le=100)
    dimensions: list[QualityDimension] = Field(min_length=4, max_length=4)
    reviewFlags: list[ReviewFlag]
    gapAnalysis: list[str] = Field(min_length=1, max_length=5)


class RoleRevisionOutput(BaseModel):
    updatedRole: RoleDraftOutput
    changeSummary: list[str] = Field(default_factory=list, max_length=8)


class MatrixRevisionOutput(BaseModel):
    updatedRows: list[MatrixRow] = Field(min_length=1, max_length=8)
    changeSummary: list[str] = Field(default_factory=list, max_length=8)


class TrainingRevisionOutput(BaseModel):
    updatedTrainingPlan: TrainingPlanOutput
    changeSummary: list[str] = Field(default_factory=list, max_length=8)


class WorkflowState(TypedDict, total=False):
    workflow_id: str
    role: dict[str, Any]
    organization_context: dict[str, Any]
    training_constraints: dict[str, Any]
    review_policy: dict[str, Any]
    regulatory_scope: dict[str, Any]
    parsed_role: dict[str, Any]
    risks: list[dict[str, Any]]
    matrix: list[dict[str, Any]]
    training_plan: dict[str, Any]
    quality_review: dict[str, Any]
    agents: list[dict[str, str]]


def has_openrouter_key() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY"))


def run_agent_workflow(
    role: dict[str, Any],
    organization_context: dict[str, Any] | None = None,
    training_constraints: dict[str, Any] | None = None,
    review_policy: dict[str, Any] | None = None,
    regulatory_scope: dict[str, Any] | None = None,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    if not has_openrouter_key():
        raise AgentGraphError("OPENROUTER_API_KEY is not available in the backend process.")

    graph = build_graph(progress_callback)
    workflow_id = f"wf_{uuid4().hex[:10]}"
    initial_state: WorkflowState = {
        "workflow_id": workflow_id,
        "role": role,
        "organization_context": organization_context or default_organization_context(),
        "training_constraints": training_constraints or default_training_constraints(),
        "review_policy": review_policy or default_review_policy(),
        "regulatory_scope": regulatory_scope or default_regulatory_scope(),
        "agents": [],
    }
    emit_progress(progress_callback, "workflow", "running", {"workflowId": workflow_id})
    final_state = graph.invoke(
        initial_state,
        config={"configurable": {"thread_id": workflow_id}},
    )
    response = format_agent_response(final_state)
    emit_progress(progress_callback, "workflow", "complete", {"workflowId": workflow_id})
    return response


def draft_role_profile(role: dict[str, Any]) -> dict[str, Any]:
    if not has_openrouter_key():
        return deterministic_role_draft(role)
    try:
        draft = call_json_model(
            RoleDraftOutput,
            "You are the Role Parser Agent. Turn a role template, file extract, or short user description into a reviewer-confirmable role draft.",
            {
                "task": (
                    "Create a structured role draft for an AMLR compliance training workflow. "
                    "If the source is thin, infer cautiously and ask concrete clarifying questions before downstream risk analysis."
                ),
                "role_source": role,
                "output_rules": [
                    "Do not mark approvalStatus confirmed.",
                    "Use needs_user_input when the role source is only a title or lacks concrete responsibilities.",
                    "Responsibilities must cite source evidence when available; use humanReview needs-confirmation for inferred responsibilities.",
                    "Clarifying questions should help decide day-to-day duties, decision authority, customer exposure, and line of defence.",
                ],
            },
        )
        return normalize_role_draft(draft.model_dump())
    except Exception:
        return deterministic_role_draft(role)


def revise_role_draft(current_draft: dict[str, Any], instruction: str) -> dict[str, Any]:
    if not has_openrouter_key():
        updated = {
            **current_draft,
            "approvalStatus": "draft",
            "responsibilities": [
                *current_draft.get("responsibilities", []),
                {
                    "text": instruction.strip(),
                    "evidence": "Reviewer natural-language revision",
                    "humanReview": "needs-confirmation",
                },
            ][:8],
        }
        return {
            "updatedRole": normalize_role_draft(updated),
            "changeSummary": ["Added reviewer instruction to the role draft for confirmation."],
        }
    try:
        revision = call_json_model(
            RoleRevisionOutput,
            "You revise structured role drafts from reviewer natural-language instructions.",
            {
                "task": "Apply the reviewer instruction to the current role draft. Preserve useful existing fields and return the full updated role.",
                "current_role_draft": current_draft,
                "reviewer_instruction": instruction,
                "output_rules": [
                    "Set approvalStatus to draft or needs_user_input after any revision.",
                    "Keep responsibilities concrete and role-specific.",
                    "Use humanReview needs-confirmation for changed or inferred responsibilities.",
                    "Add clarifyingQuestions only when the instruction leaves material ambiguity.",
                ],
            },
        )
        return {
            "updatedRole": normalize_role_draft(revision.updatedRole.model_dump()),
            "changeSummary": revision.changeSummary,
        }
    except Exception:
        return revise_role_draft_without_model(current_draft, instruction)


def generate_review_matrix(
    role: dict[str, Any],
    parsed_role: dict[str, Any],
    organization_context: dict[str, Any] | None = None,
    review_policy: dict[str, Any] | None = None,
    regulatory_scope: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state: WorkflowState = {
        "workflow_id": f"wf_{uuid4().hex[:10]}",
        "role": role,
        "parsed_role": parsed_role,
        "organization_context": organization_context or default_organization_context(),
        "review_policy": review_policy or default_review_policy(),
        "regulatory_scope": regulatory_scope or default_regulatory_scope(),
        "agents": [
            agent_summary(
                "Role Parser Agent",
                f"Reviewer confirmed {len(parsed_role.get('responsibilities', []))} responsibilities before risk mapping.",
            )
        ],
    }
    if not has_openrouter_key():
        risks = risk_mapper_agent(role, parsed_role)
        matrix = require_human_review(regulation_mapper_agent(risks))
        return {
            "risks": risks,
            "matrix": matrix,
            "agents": [
                *state["agents"],
                agent_summary("Risk Mapper Agent", f"Mapped {len(risks)} deterministic risk exposures for reviewer confirmation."),
                agent_summary("Regulation Mapper Agent", "Linked risks to AMLR article traces using deterministic fallback rules."),
            ],
        }

    try:
        risk_output = risk_mapper_node(state)
        matrix_output = regulation_mapper_node({**state, **risk_output})
        return {
            "risks": risk_output["risks"],
            "matrix": require_human_review(matrix_output["matrix"]),
            "agents": matrix_output["agents"],
        }
    except Exception:
        risks = risk_mapper_agent(role, parsed_role)
        matrix = require_human_review(regulation_mapper_agent(risks))
        return {
            "risks": risks,
            "matrix": matrix,
            "agents": [
                *state["agents"],
                agent_summary("Risk Mapper Agent", f"Mapped {len(risks)} fallback risk exposures for reviewer confirmation."),
                agent_summary("Regulation Mapper Agent", "Linked risks to AMLR article traces using fallback rules."),
            ],
        }


def revise_matrix_rows(
    parsed_role: dict[str, Any],
    matrix: list[dict[str, Any]],
    instruction: str,
    target_id: str | None = None,
) -> dict[str, Any]:
    if not has_openrouter_key():
        updated_rows = []
        for row in matrix:
            if target_id and row.get("id") != target_id:
                updated_rows.append(row)
                continue
            updated_rows.append(
                normalize_matrix_row(
                    {
                        **row,
                        "roleEvidence": f"{row.get('roleEvidence', '')} Reviewer note: {instruction}".strip(),
                        "humanReview": "edited",
                    }
                )
            )
        return {
            "updatedRows": sort_matrix_rows_by_level(updated_rows),
            "changeSummary": ["Applied reviewer note to the selected matrix scope."],
        }

    try:
        revision = call_json_model(
            MatrixRevisionOutput,
            "You revise AMLR risk evidence matrix rows from reviewer natural-language instructions.",
            {
                "task": "Apply the reviewer instruction to the matrix. Return the full updated set of rows, not only the changed row.",
                "parsed_role": parsed_role,
                "current_matrix": matrix,
                "target_row_id": target_id,
                "reviewer_instruction": instruction,
                "available_amlr_articles": article_scope(default_regulatory_scope()),
                "output_rules": [
                    "Preserve row ids unless a row is clearly removed or added.",
                    "Set changed rows humanReview to edited.",
                    "Use humanReview needs-review for unresolved high or critical risk.",
                    "Confidence must reflect role evidence strength after the revision.",
                ],
            },
        )
        return {
            "updatedRows": sort_matrix_rows_by_level(
                [normalize_matrix_row(row.model_dump()) for row in revision.updatedRows]
            ),
            "changeSummary": revision.changeSummary,
        }
    except Exception:
        return revise_matrix_rows_without_model(matrix, instruction, target_id)


def finish_reviewed_workflow(
    workflow_id: str,
    role: dict[str, Any],
    parsed_role: dict[str, Any],
    matrix: list[dict[str, Any]],
    agents: list[dict[str, str]] | None = None,
    organization_context: dict[str, Any] | None = None,
    training_constraints: dict[str, Any] | None = None,
    review_policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state: WorkflowState = {
        "workflow_id": workflow_id,
        "role": role,
        "parsed_role": parsed_role,
        "matrix": matrix,
        "organization_context": organization_context or default_organization_context(),
        "training_constraints": training_constraints or default_training_constraints(),
        "review_policy": review_policy or default_review_policy(),
        "agents": agents or [],
    }
    if not has_openrouter_key():
        training = training_designer_agent(role, matrix)
        quality = quality_reviewer_agent(role, matrix, training)
        state["training_plan"] = training
        state["quality_review"] = quality
        state["agents"] = [
            *state["agents"],
            agent_summary("Training Designer Agent", f"Generated a deterministic {len(training['quarters'])}-quarter training path."),
            agent_summary("Quality Reviewer Agent", f"Overall confidence score: {quality['overallScore']}%."),
        ]
    else:
        try:
            training_output = training_designer_node(state)
            quality_output = quality_reviewer_node({**state, **training_output})
            state = {**state, **training_output, **quality_output}
        except Exception:
            training = training_designer_agent(role, matrix)
            quality = quality_reviewer_agent(role, matrix, training)
            state["training_plan"] = training
            state["quality_review"] = quality
            state["agents"] = [
                *state["agents"],
                agent_summary("Training Designer Agent", f"Generated a fallback {len(training['quarters'])}-quarter training path."),
                agent_summary("Quality Reviewer Agent", f"Overall confidence score: {quality['overallScore']}%."),
            ]
    response = format_agent_response(state)
    response["executionMode"] = "staged-human-review"
    return response


def revise_training_plan(
    role: dict[str, Any],
    matrix: list[dict[str, Any]],
    training_plan: dict[str, Any],
    instruction: str,
) -> dict[str, Any]:
    if not has_openrouter_key():
        return revise_training_plan_without_model(training_plan, instruction)
    try:
        revision = call_json_model(
            TrainingRevisionOutput,
            "You revise role-based AMLR training plans from reviewer natural-language instructions.",
            {
                "task": "Apply the reviewer instruction to the training plan. Return the full updated training plan.",
                "role": role,
                "risk_regulation_matrix": matrix,
                "current_training_plan": training_plan,
                "reviewer_instruction": instruction,
                "output_rules": [
                    "Preserve the 4-quarter structure unless the reviewer explicitly asks for a different structure.",
                    "Keep modules traceable to role evidence, matrix rows, AMLR articles or competency needs.",
                    "Set changed modules and LMS assignments approvalStatus to changes_requested.",
                    "Do not silently approve LMS assignment after a revision.",
                ],
            },
        )
        updated = enrich_training_plan(revision.updatedTrainingPlan.model_dump(), matrix)
        return {
            "updatedTrainingPlan": mark_training_changes_requested(updated),
            "changeSummary": revision.changeSummary,
        }
    except Exception:
        return revise_training_plan_without_model(training_plan, instruction)


def build_graph(progress_callback: ProgressCallback | None = None):
    workflow = StateGraph(WorkflowState)
    workflow.add_node("role_parser", timed_node("role_parser", "Role Parser Agent", role_parser_node, progress_callback))
    workflow.add_node("risk_mapper", timed_node("risk_mapper", "Risk Mapper Agent", risk_mapper_node, progress_callback))
    workflow.add_node("regulation_mapper", timed_node("regulation_mapper", "Regulation Mapper Agent", regulation_mapper_node, progress_callback))
    workflow.add_node("training_designer", timed_node("training_designer", "Training Designer Agent", training_designer_node, progress_callback))
    workflow.add_node("quality_reviewer", timed_node("quality_reviewer", "Quality Reviewer Agent", quality_reviewer_node, progress_callback))
    workflow.add_edge(START, "role_parser")
    workflow.add_edge("role_parser", "risk_mapper")
    workflow.add_edge("risk_mapper", "regulation_mapper")
    workflow.add_edge("regulation_mapper", "training_designer")
    workflow.add_edge("training_designer", "quality_reviewer")
    workflow.add_edge("quality_reviewer", END)
    return workflow.compile(checkpointer=InMemorySaver())


def timed_node(
    step_id: str,
    step_name: str,
    node_fn: Callable[[WorkflowState], dict[str, Any]],
    progress_callback: ProgressCallback | None,
) -> Callable[[WorkflowState], dict[str, Any]]:
    def wrapped(state: WorkflowState) -> dict[str, Any]:
        started = time.monotonic()
        emit_progress(progress_callback, step_id, "running", {"name": step_name})
        try:
            output = node_fn(state)
        except Exception as exc:
            emit_progress(
                progress_callback,
                step_id,
                "failed",
                {"name": step_name, "elapsedMs": round((time.monotonic() - started) * 1000), "error": str(exc)},
            )
            raise
        emit_progress(
            progress_callback,
            step_id,
            "complete",
            {
                "name": step_name,
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "output": step_output(step_id, output),
            },
        )
        return output

    return wrapped


def step_output(step_id: str, output: dict[str, Any]) -> dict[str, Any] | None:
    output_keys = {
        "role_parser": ("parsed_role", "Parsed role profile"),
        "risk_mapper": ("risks", "Risk exposure map"),
        "regulation_mapper": ("matrix", "Risk-regulation matrix"),
        "training_designer": ("training_plan", "Training path"),
        "quality_reviewer": ("quality_review", "Quality review"),
    }
    if step_id not in output_keys:
        return None
    key, title = output_keys[step_id]
    if key not in output:
        return None
    return {
        "type": key,
        "title": title,
        "data": output[key],
    }


def emit_progress(
    progress_callback: ProgressCallback | None,
    step_id: str,
    status: str,
    payload: dict[str, Any] | None = None,
) -> None:
    if progress_callback:
        progress_callback(step_id, status, payload or {})


def role_parser_node(state: WorkflowState) -> dict[str, Any]:
    role = state["role"]
    parsed = call_json_model(
        ParsedRoleOutput,
        "You are the Role Parser Agent for an AMLR compliance training workflow.",
        {
            "task": "Extract the role function, line of defence, day-to-day responsibilities, risk clues, decision authority and source quality. Use only the supplied role text.",
            "role": role,
            "output_rules": [
                "responsibilities must cite concrete role evidence",
                "riskClues must be short labels",
                "humanReview should be accepted unless the evidence is weak",
            ],
        },
    )
    return {
        "parsed_role": parsed.model_dump(),
        "agents": [
            *state.get("agents", []),
            agent_summary(
                "Role Parser Agent",
                f"Extracted {len(parsed.responsibilities)} responsibilities and {len(parsed.riskClues)} risk clues with source quality: {parsed.sourceQuality}.",
            ),
        ],
    }


def risk_mapper_node(state: WorkflowState) -> dict[str, Any]:
    risks = call_json_model(
        RiskMapperOutput,
        "You are the Risk Mapper Agent. Map role responsibilities to financial crime training risk exposure.",
        {
            "task": "Create 3-6 role-specific risk exposures. Do not invent facts beyond the role evidence.",
            "role": state["role"],
            "parsed_role": state["parsed_role"],
            "organization_context": state["organization_context"],
            "allowed_themes": ["AML", "Sanctions", "Fraud", "Documentation", "Governance"],
            "allowed_levels": ["Low", "Medium", "High", "Critical"],
        },
    )
    return {
        "risks": [risk.model_dump() for risk in risks.risks],
        "agents": [
            *state.get("agents", []),
            agent_summary(
                "Risk Mapper Agent",
                f"Mapped {len(risks.risks)} exposures across {', '.join(sorted({risk.theme for risk in risks.risks}))}.",
            ),
        ],
    }


def regulation_mapper_node(state: WorkflowState) -> dict[str, Any]:
    articles = article_scope(state.get("regulatory_scope"))
    country_code = (state.get("regulatory_scope") or {}).get("country")
    country_context = country_prompt_context(country_code)
    payload: dict[str, Any] = {
        "task": "For each risk, produce one matrix row linking risk evidence to AMLR article traces, competency need, training depth, confidence and human review status.",
        "risks": state["risks"],
        "parsed_role": state["parsed_role"],
        "available_amlr_articles": articles,
        "review_policy": state["review_policy"],
        "requirements": [
            "Use only available_amlr_articles in the amlrArticles[] field.",
            "Set humanReview to needs-review for High or Critical risk unless policy says otherwise.",
            "Confidence should reflect evidence strength, not model certainty theatre.",
        ],
    }
    if country_context:
        payload["national_context"] = country_context
        payload["requirements"].append(
            "When relevant, the whyItMatters and roleEvidence text should reference the national_context citations (e.g. FFFS 2017:11, Ley 10/2010, GwG) in addition to AMLR — but keep amlrArticles[] strictly to AMLR articles from available_amlr_articles."
        )
    mapped = call_json_model(
        RegulationMapperOutput,
        "You are the Regulation Mapper Agent. Link role risks to AMLR articles and competency needs.",
        payload,
    )
    rows = [normalize_matrix_row(row.model_dump()) for row in mapped.rows]
    rows = sort_matrix_rows_by_level(rows)
    return {
        "matrix": rows,
        "agents": [
            *state.get("agents", []),
            agent_summary(
                "Regulation Mapper Agent",
                "Linked risks to AMLR article traces and competency needs.",
            ),
        ],
    }


def training_designer_node(state: WorkflowState) -> dict[str, Any]:
    country_code = (state.get("regulatory_scope") or {}).get("country")
    country_context = country_prompt_context(country_code)
    payload: dict[str, Any] = {
        "task": "Create a 4-quarter training path. Each module must be justified by a mapped risk, AMLR article, or competency need.",
        "role": state["role"],
        "matrix": state["matrix"],
        "training_constraints": state["training_constraints"],
        "organization_context": state["organization_context"],
        "requirements": [
            "The plan must not be generic AML awareness only.",
            "Include scenario-based assessment for high-risk or critical mappings.",
            "Module titles must be unique across the whole training path; if two modules cover the same theme, make one title clearly practical, scenario-based, governance-focused, or evidence-focused.",
            "LMS assignment must be ready for approval, not silently approved.",
        ],
    }
    if country_context:
        payload["national_context"] = country_context
        payload["requirements"].append(
            f"Tailor module titles, philosophy and assessment style to {country_context['name']} regulatory practice. A separate country-mandatory module will be added deterministically — do not duplicate it."
        )
    training = call_json_model(
        TrainingPlanOutput,
        "You are the Training Designer Agent. Produce a role-based training path.",
        payload,
    )
    return {
        "training_plan": training.model_dump(),
        "agents": [
            *state.get("agents", []),
            agent_summary(
                "Training Designer Agent",
                f"Generated a {len(training.quarters)}-quarter training path with {sum(len(q.modules) for q in training.quarters)} modules.",
            ),
        ],
    }


def quality_reviewer_node(state: WorkflowState) -> dict[str, Any]:
    quality = call_json_model(
        QualityReviewOutput,
        "You are the Quality Reviewer Agent. Review the workflow output like a compliance QA reviewer.",
        {
            "task": "Score the output and flag issues needing human approval or viability proof.",
            "role": state["role"],
            "matrix": state["matrix"],
            "training_plan": state["training_plan"],
            "review_policy": state["review_policy"],
            "dimensions": [
                "Regulatory coverage",
                "Role specificity",
                "Evidence strength",
                "Human review readiness",
            ],
        },
    )
    return {
        "quality_review": quality.model_dump(),
        "agents": [
            *state.get("agents", []),
            agent_summary(
                "Quality Reviewer Agent",
                f"Overall confidence score: {quality.overallScore}%. {len(quality.reviewFlags)} review flags require attention.",
            ),
        ],
    }


def call_json_model(model_type: type[BaseModel], system: str, payload: dict[str, Any]) -> BaseModel:
    llm = openrouter_llm()
    schema = model_type.model_json_schema()
    prompt = {
        "payload": payload,
        "json_schema": schema,
        "instruction": "Return only valid JSON matching json_schema. Do not wrap in markdown.",
    }
    response = llm.invoke(
        [
            SystemMessage(content=system),
            HumanMessage(content=json.dumps(prompt, ensure_ascii=False)),
        ]
    )
    raw = stringify_content(response.content)
    try:
        return model_type.model_validate(extract_json(raw))
    except (ValueError, ValidationError) as exc:
        repaired = repair_json(llm, model_type, raw, str(exc))
        return model_type.model_validate(repaired)


def repair_json(llm: ChatOpenAI, model_type: type[BaseModel], raw: str, error: str) -> dict[str, Any]:
    response = llm.invoke(
        [
            SystemMessage(content="Repair invalid structured output for a compliance workflow."),
            HumanMessage(
                content=json.dumps(
                    {
                        "invalid_output": raw,
                        "validation_error": error,
                        "json_schema": model_type.model_json_schema(),
                        "instruction": "Return only corrected JSON. No markdown.",
                    },
                    ensure_ascii=False,
                )
            ),
        ]
    )
    return extract_json(stringify_content(response.content))


def openrouter_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise AgentGraphError("OPENROUTER_API_KEY is not set.")
    return ChatOpenAI(
        model=os.getenv("VIDDA_OPENROUTER_MODEL", DEFAULT_MODEL),
        api_key=api_key,
        base_url=os.getenv("VIDDA_OPENROUTER_BASE_URL", OPENROUTER_BASE_URL),
        temperature=float(os.getenv("OPENROUTER_TEMPERATURE", "0.1")),
        timeout=float(os.getenv("OPENROUTER_TIMEOUT", "12")),
        default_headers={
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:5173"),
            "X-Title": os.getenv("OPENROUTER_APP_TITLE", "Vidda Hackathon Compliance Training Engine"),
        },
    )


def extract_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        loaded = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ValueError("LLM response did not contain a JSON object.")
        loaded = json.loads(match.group(0))
    if not isinstance(loaded, dict):
        raise ValueError("LLM response must be a JSON object.")
    return loaded


def stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content)


def country_prompt_context(country_code: str | None) -> dict[str, Any] | None:
    override = get_country_override(country_code)
    if not override:
        return None
    return {
        "code": override["code"],
        "name": override["name"],
        "additional_citations": override["additionalCitations"],
        "training_frequency_default": override["trainingFrequencyDefault"],
        "independent_review_requirement": override["independentReviewLabel"],
    }


def article_scope(regulatory_scope: dict[str, Any] | None) -> dict[str, Any]:
    requested = (regulatory_scope or {}).get("articles") or ["9", "10", "11", "12", "13", "14"]
    normalized = [str(article).replace("Article", "").strip() for article in requested]
    return {
        f"Article {article_id}": details
        for article_id, details in AMLR_ARTICLES.items()
        if article_id in normalized
    }


def format_agent_response(state: WorkflowState) -> dict[str, Any]:
    role = state["role"]
    quality = state["quality_review"]
    training_plan = enrich_training_plan(state["training_plan"], state["matrix"])
    country_code = (state.get("regulatory_scope") or {}).get("country")
    response: dict[str, Any] = {
        "workflowId": state["workflow_id"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "executionMode": "langgraph-openrouter",
        "model": os.getenv("VIDDA_OPENROUTER_MODEL", DEFAULT_MODEL),
        "role": {
            "id": role["id"],
            "name": role["name"],
            "team": role["team"],
            "persona": role["persona"],
            "lineOfDefence": role["lineOfDefence"],
        },
        "roleInformation": {
            "sourceRole": role,
            "parsedRole": state["parsed_role"],
        },
        "agents": state["agents"],
        "parsedRole": state["parsed_role"],
        "riskRegulationMatrix": state["matrix"],
        "trainingPlan": training_plan,
        "qualityReview": quality,
        "auditPack": build_audit_pack(role, state["matrix"], quality),
        "sourcePack": source_pack(),
    }
    apply_country_overrides(response, country_code)
    return response


def agent_summary(name: str, summary: str) -> dict[str, str]:
    return {
        "name": name,
        "status": "complete",
        "summary": summary,
    }


def normalize_matrix_row(row: dict[str, Any]) -> dict[str, Any]:
    status = str(row.get("humanReview", "")).lower().strip()
    status_map = {
        "approved": "accepted",
        "approve": "accepted",
        "accepted": "accepted",
        "needs approval": "needs-review",
        "needs human review": "needs-review",
        "requires review": "needs-review",
        "requires human review": "needs-review",
        "needs-review": "needs-review",
        "edited": "edited",
        "edited by human": "edited",
        "rejected": "rejected",
    }
    row["humanReview"] = status_map.get(status, "needs-review")
    return row


def require_human_review(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**row, "humanReview": "needs-review"} for row in rows]


def normalize_role_draft(draft: dict[str, Any]) -> dict[str, Any]:
    responsibilities = draft.get("responsibilities") or []
    normalized_responsibilities = []
    for item in responsibilities[:8]:
        if isinstance(item, str):
            normalized_responsibilities.append(
                {"text": item, "evidence": item, "humanReview": "needs-confirmation"}
            )
        else:
            status = str(item.get("humanReview") or "needs-confirmation").lower().strip()
            normalized_responsibilities.append(
                {
                    "text": item.get("text") or item.get("evidence") or "Responsibility needs confirmation",
                    "evidence": item.get("evidence") or item.get("text") or "Reviewer input",
                    "humanReview": "accepted" if status in {"accepted", "confirmed"} else "needs-confirmation",
                }
            )
    if not normalized_responsibilities:
        normalized_responsibilities.append(
            {
                "text": "Confirm the role's day-to-day responsibilities with the reviewer.",
                "evidence": "Role source did not include concrete responsibilities.",
                "humanReview": "needs-confirmation",
            }
        )

    missing_fields = draft.get("missingFields") or []
    clarifying = draft.get("clarifyingQuestions") or []
    source_quality = draft.get("sourceQuality") or "low"
    approval = draft.get("approvalStatus") or "draft"
    if approval not in {"draft", "needs_user_input", "confirmed"}:
        approval = "draft"
    if source_quality == "low" and not clarifying:
        clarifying = [
            "What are the role's main day-to-day responsibilities?",
            "Does the role make decisions, perform checks, or only escalate issues?",
            "Which customer, transaction, third-party, or policy risks does the role touch?",
        ]
    return {
        "name": draft.get("name") or "Custom Role",
        "team": draft.get("team") or "Imported role",
        "function": draft.get("function") or "To be confirmed by reviewer",
        "lineOfDefence": draft.get("lineOfDefence") or "To be confirmed by reviewer",
        "responsibilities": normalized_responsibilities,
        "riskClues": (draft.get("riskClues") or ["Needs human review"])[:8],
        "decisionAuthority": draft.get("decisionAuthority") or "To be confirmed by reviewer",
        "sourceQuality": source_quality,
        "missingFields": missing_fields[:8],
        "clarifyingQuestions": clarifying[:6],
        "approvalStatus": approval,
    }


def revise_role_draft_without_model(current_draft: dict[str, Any], instruction: str) -> dict[str, Any]:
    updated = {
        **current_draft,
        "approvalStatus": "draft",
        "responsibilities": [
            *current_draft.get("responsibilities", []),
            {
                "text": instruction.strip(),
                "evidence": "Reviewer natural-language revision",
                "humanReview": "needs-confirmation",
            },
        ][:8],
    }
    return {
        "updatedRole": normalize_role_draft(updated),
        "changeSummary": ["Added reviewer instruction to the role draft for confirmation."],
    }


def revise_matrix_rows_without_model(
    matrix: list[dict[str, Any]],
    instruction: str,
    target_id: str | None = None,
) -> dict[str, Any]:
    updated_rows = []
    for row in matrix:
        if target_id and row.get("id") != target_id:
            updated_rows.append(row)
            continue
        updated_rows.append(
            normalize_matrix_row(
                {
                    **row,
                    "roleEvidence": f"{row.get('roleEvidence', '')} Reviewer note: {instruction}".strip(),
                    "humanReview": "edited",
                }
            )
        )
    return {
        "updatedRows": sort_matrix_rows_by_level(updated_rows),
        "changeSummary": ["Applied reviewer note to the selected matrix scope."],
    }


def revise_training_plan_without_model(training_plan: dict[str, Any], instruction: str) -> dict[str, Any]:
    updated = {
        **training_plan,
        "philosophy": (
            f"{training_plan.get('philosophy', '')} Reviewer revision request: {instruction}"
        ).strip(),
    }
    updated = mark_training_changes_requested(updated)
    return {
        "updatedTrainingPlan": updated,
        "changeSummary": ["Added reviewer instruction to the training plan for confirmation."],
    }


def mark_training_changes_requested(training_plan: dict[str, Any]) -> dict[str, Any]:
    return {
        **training_plan,
        "approvalStatus": "changes_requested",
        "quarters": [
            {
                **quarter,
                "modules": [
                    {
                        **module,
                        "approvalStatus": "changes_requested",
                        "lmsStatus": "Changes requested",
                    }
                    for module in quarter.get("modules", [])
                ],
            }
            for quarter in training_plan.get("quarters", [])
        ],
        "lmsAssignments": [
            {
                **assignment,
                "approvalStatus": "changes_requested",
                "status": "Changes requested",
                "lmsStatus": "Blocked",
            }
            for assignment in training_plan.get("lmsAssignments", [])
        ],
    }


def deterministic_role_draft(role: dict[str, Any]) -> dict[str, Any]:
    parsed = role_parser_agent(role)
    is_thin = len(" ".join([role.get("description", ""), *role.get("tasks", [])]).strip()) < 120
    draft = {
        "name": role.get("name") or "Custom Role",
        "team": role.get("team") or "Imported role",
        **parsed,
        "sourceQuality": "low" if is_thin else "medium",
        "missingFields": ["responsibilities", "decisionAuthority"] if is_thin else [],
        "clarifyingQuestions": [
            "What are the role's main day-to-day responsibilities?",
            "What decisions can this role make without escalation?",
            "Which AML, sanctions, fraud, documentation, or governance risks does it touch?",
        ]
        if is_thin
        else [
            "Do these responsibilities accurately describe the role before risk mapping?",
        ],
        "approvalStatus": "needs_user_input" if is_thin else "draft",
    }
    for item in draft["responsibilities"]:
        item["humanReview"] = "needs-confirmation"
    return normalize_role_draft(draft)


def role_from_draft(draft: dict[str, Any], role_id: str = "custom-role") -> dict[str, Any]:
    responsibilities = draft.get("responsibilities") or []
    tasks = [item.get("text", "") for item in responsibilities if item.get("text")]
    description = "\n".join(
        [
            f"Role function: {draft.get('function') or 'Not specified'}",
            f"Line of defence / accountability: {draft.get('lineOfDefence') or 'Not specified'}",
            f"Decision authority: {draft.get('decisionAuthority') or 'Not specified'}",
            "",
            "Responsibilities:",
            *tasks,
            "",
            "Risk clues:",
            *[str(clue) for clue in draft.get("riskClues", [])],
        ]
    )
    return {
        "id": role_id,
        "name": draft.get("name") or "Custom Role",
        "team": draft.get("team") or "Imported role",
        "persona": draft.get("function") or "Reviewer-confirmed role",
        "description": description,
        "tasks": tasks or ["Confirm role responsibilities."],
        "lineOfDefence": draft.get("lineOfDefence") or "To be confirmed by reviewer",
        "riskSignals": draft.get("riskClues") or [],
    }


def default_organization_context() -> dict[str, Any]:
    return {
        "industry": "Banking and regulated financial services",
        "business_model": "Role-based AML, financial crime and customer operations training",
        "risk_appetite": "medium",
        "lines_of_defence_model": True,
    }


def default_training_constraints() -> dict[str, Any]:
    return {
        "duration": "12 months",
        "format": ["e-learning", "scenario workshop", "manager review"],
        "assessment_style": "scenario-based",
        "lms_required": True,
    }


def default_review_policy() -> dict[str, Any]:
    return {
        "require_human_approval_for": ["High", "Critical"],
        "strict_regulatory_traceability": True,
        "allow_generic_modules": False,
    }


def default_regulatory_scope() -> dict[str, Any]:
    return {
        "jurisdiction": "EU",
        "regulation": "AMLR 2024/1624",
        "articles": ["9", "10", "11", "12", "13", "14"],
    }
