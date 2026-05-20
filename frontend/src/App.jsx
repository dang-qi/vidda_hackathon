import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const VIDDA_LOGO =
  "https://vidda.io/_next/image?url=https%3A%2F%2Fa.storyblok.com%2Ff%2F290798558767898%2F477x72%2Fee934cc8bd%2Fvidda_logo.png&w=3840&q=75";
const ACTIVE_JOB_KEY = "vidda.activeAnalysisJobId";
const LAST_RUN_KEY = "vidda.lastCompletedRunId";

const reviewOptions = [
  { value: "needs-review", label: "Needs review" },
  { value: "accepted", label: "Accepted" },
  { value: "edited", label: "Edited by human" },
  { value: "rejected", label: "Rejected" },
];

const emptyRoleForm = {
  name: "",
  team: "",
  function: "",
  lineOfDefence: "",
  responsibilities: "",
  riskSignals: "",
  additionalContext: "",
};

const loadedSources = [
  {
    name: "Hackathon challenge overview",
    file: "Hackathon Information for developers.pdf",
    coverage: "Evaluation criteria, workflow expectations, risk-based training examples and LMS expectations.",
  },
  {
    name: "Role descriptions",
    file: "Role Descriptions Hackathon.pdf",
    coverage: "Five role profiles with tasks, responsibilities, competencies and inherent AML risk exposure.",
  },
  {
    name: "AMLR 2024/1624 extract",
    file: "AMLR 1624.pdf",
    coverage: "Articles 9-14 for controls, risk assessment, compliance functions, training and integrity.",
  },
];

function App() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("kyc-analyst");
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [analysis, setAnalysis] = useState(null);
  const [activeStep, setActiveStep] = useState("role");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const activeJobId = job?.jobId;
  const activeJobStatus = job?.status;

  useEffect(() => {
    fetch(`${API_BASE}/api/roles`)
      .then((response) => response.json())
      .then((data) => {
        setRoles(data);
        const defaultRole = data.find((role) => role.id === selectedRole) ?? data[0];
        if (defaultRole) {
          setRoleForm(roleToForm(defaultRole));
          setSelectedRole(defaultRole.id);
        }
      })
      .catch(() => setError("Backend is not reachable. Start FastAPI on port 8000."));
  }, []);

  useEffect(() => {
    const savedJobId = safeStorageGet(ACTIVE_JOB_KEY);
    if (!savedJobId) {
      restoreLastResult();
      return;
    }
    setIsLoading(true);
    fetch(`${API_BASE}/api/analyze/jobs/${savedJobId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("saved job not found");
        }
        return response.json();
      })
      .then((savedJob) => {
        setJob(savedJob);
        if (savedJob.status === "complete" && savedJob.result) {
          safeStorageSet(LAST_RUN_KEY, savedJob.result.workflowId);
          setAnalysis(savedJob.result);
          setActiveStep("matrix");
          setIsLoading(false);
          loadHistory();
        } else if (["queued", "running"].includes(savedJob.status)) {
          setActiveStep("role");
        } else {
          safeStorageRemove(ACTIVE_JOB_KEY);
          setIsLoading(false);
        }
      })
      .catch(() => {
        safeStorageRemove(ACTIVE_JOB_KEY);
        restoreLastResult();
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!activeJobId || !["queued", "running"].includes(activeJobStatus)) {
      return undefined;
    }
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/analyze/jobs/${activeJobId}`);
        if (!response.ok) {
          throw new Error("job polling failed");
        }
        const nextJob = await response.json();
        setJob(nextJob);
        if (nextJob.status === "complete" && nextJob.result) {
          safeStorageRemove(ACTIVE_JOB_KEY);
          safeStorageSet(LAST_RUN_KEY, nextJob.result.workflowId);
          setAnalysis(nextJob.result);
          setActiveStep("matrix");
          setIsLoading(false);
          loadHistory();
        }
        if (nextJob.status === "failed") {
          safeStorageRemove(ACTIVE_JOB_KEY);
          setError(nextJob.error || "Agent workflow failed.");
          setIsLoading(false);
        }
      } catch (err) {
        setError("Lost connection while polling the agent workflow.");
        setIsLoading(false);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeJobId, activeJobStatus]);

  useEffect(() => {
    if (!activeJobId || !["queued", "running"].includes(activeJobStatus)) {
      return undefined;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [activeJobId, activeJobStatus]);

  async function runAnalysis() {
    const rolePayload = buildCustomRolePayload(roleForm);
    if (!rolePayload.name || rolePayload.description.length < 20) {
      setError("Enter a role title and enough role detail before running the workflow.");
      return;
    }
    setIsLoading(true);
    setError("");
    setAnalysis(null);
    setJob(null);
    setNowMs(Date.now());
    try {
      const response = await fetch(`${API_BASE}/api/analyze/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customRole: rolePayload, useAgent: true }),
      });
      if (!response.ok) {
        throw new Error("analysis failed");
      }
      const data = await response.json();
      safeStorageSet(ACTIVE_JOB_KEY, data.jobId);
      setJob(data);
    } catch (err) {
      setError("Could not generate the workflow. Check that the backend is running.");
      setIsLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const response = await fetch(`${API_BASE}/api/history/runs`);
      if (!response.ok) {
        throw new Error("history failed");
      }
      const data = await response.json();
      setHistoryRuns(data);
      if (selectedRun && !data.some((run) => run.run_id === selectedRun.run_id)) {
        setSelectedRun(null);
      }
      return data;
    } catch {
      // History is supporting context; keep the primary workflow usable if it is unavailable.
      return [];
    }
  }

  async function restoreLastResult() {
    try {
      const runs = await loadHistory();
      if (!runs.length) {
        return;
      }
      const savedRunId = safeStorageGet(LAST_RUN_KEY);
      const runToLoad = runs.find((run) => run.run_id === savedRunId) ?? runs[0];
      const response = await fetch(`${API_BASE}/api/history/runs/${runToLoad.run_id}`);
      if (!response.ok) {
        throw new Error("last run not found");
      }
      const data = await response.json();
      safeStorageSet(LAST_RUN_KEY, data.run_id);
      setSelectedRun(data);
      if (!analysis) {
        setAnalysis(data.result);
        setActiveStep("matrix");
      }
    } catch {
      safeStorageRemove(LAST_RUN_KEY);
    }
  }

  async function loadRun(runId) {
    try {
      const response = await fetch(`${API_BASE}/api/history/runs/${runId}`);
      if (!response.ok) {
        throw new Error("run detail failed");
      }
      const data = await response.json();
      safeStorageSet(LAST_RUN_KEY, data.run_id);
      setSelectedRun(data);
    } catch {
      setError("Could not load the saved workflow run.");
    }
  }

  async function recordReviewAction({
    artifactType,
    targetId,
    action,
    before,
    after,
    comment,
  }) {
    if (!analysis?.workflowId) {
      return null;
    }
    const response = await fetch(`${API_BASE}/api/history/runs/${analysis.workflowId}/review-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType,
        targetId,
        action,
        before,
        after,
        reviewer: "Demo reviewer",
        comment,
      }),
    });
    if (!response.ok) {
      throw new Error("review action failed");
    }
    const actionRecord = await response.json();
    await loadHistory();
    if (selectedRun?.run_id === analysis.workflowId) {
      await loadRun(analysis.workflowId);
    }
    return actionRecord;
  }

  async function updateReview(rowId, status) {
    if (!analysis) {
      return;
    }
    const beforeRow = analysis.riskRegulationMatrix.find((row) => row.id === rowId);
    const afterRow = beforeRow ? { ...beforeRow, humanReview: status } : null;

    setAnalysis((current) => ({
      ...current,
      riskRegulationMatrix: current.riskRegulationMatrix.map((row) =>
        row.id === rowId ? { ...row, humanReview: status } : row,
      ),
    }));

    if (!analysis.workflowId || !beforeRow || !afterRow) {
      return;
    }

    try {
      await recordReviewAction({
        artifactType: "matrix",
        targetId: rowId,
        action: status,
        before: beforeRow,
        after: afterRow,
        comment: `Matrix row marked as ${status}`,
      });
    } catch {
      setError("Review was updated locally, but the audit trail could not be saved.");
    }
  }

  async function approveTrainingForLms() {
    if (!analysis?.trainingPlan) {
      return;
    }
    const before = analysis.trainingPlan;
    const after = markTrainingPlan(before, "approved_for_lms");
    setAnalysis((current) => ({
      ...current,
      trainingPlan: after,
    }));
    try {
      await recordReviewAction({
        artifactType: "training_plan",
        targetId: "training-plan",
        action: "approved_for_lms",
        before,
        after,
        comment: "Training path approved for LMS assignment",
      });
    } catch {
      setError("Training approval was updated locally, but the audit trail could not be saved.");
    }
  }

  async function requestTrainingChanges() {
    if (!analysis?.trainingPlan) {
      return;
    }
    const before = analysis.trainingPlan;
    const after = markTrainingPlan(before, "changes_requested");
    setAnalysis((current) => ({
      ...current,
      trainingPlan: after,
    }));
    try {
      await recordReviewAction({
        artifactType: "training_plan",
        targetId: "training-plan",
        action: "rejected",
        before,
        after,
        comment: "Reviewer requested changes before LMS assignment",
      });
    } catch {
      setError("Change request was updated locally, but the audit trail could not be saved.");
    }
  }

  async function downloadAuditPack(runId = analysis?.workflowId) {
    if (!runId) {
      setError("Run the workflow before exporting an audit pack.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/history/runs/${runId}/audit-pack`);
      if (!response.ok) {
        throw new Error("audit export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${runId}-audit-pack.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Could not export the audit pack. Check that the backend is running.");
    }
  }

  const approvedCount = analysis?.riskRegulationMatrix.filter((row) =>
    ["accepted", "edited"].includes(row.humanReview),
  ).length ?? 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vidda workflow home">
          <img src={VIDDA_LOGO} alt="Vidda" />
          <span>Compliance Training Engine</span>
        </a>
        <nav className="topnav" aria-label="Workflow sections">
          <button onClick={() => setActiveStep("role")}>Role</button>
          <button onClick={() => setActiveStep("matrix")} disabled={!analysis}>Matrix</button>
          <button onClick={() => setActiveStep("training")} disabled={!analysis}>Training</button>
          <button onClick={() => setActiveStep("audit")} disabled={!analysis}>Audit</button>
          <button onClick={() => setActiveStep("history")}>History</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Multi-agent AMLR workflow</p>
          <h1>From role to risk to training plan, with humans in control.</h1>
          <p>
            Generate role-specific compliance training from job responsibilities, AMLR obligations,
            competency needs and reviewer decisions.
          </p>
        </div>
        <div className="hero-panel">
          <div className="signal-row">
            <span>AI pipeline</span>
            <strong>5 agents</strong>
          </div>
          <div className="signal-row">
            <span>Human checkpoints</span>
            <strong>{analysis ? `${approvedCount}/${analysis.riskRegulationMatrix.length}` : "ready"}</strong>
          </div>
          <div className="signal-row">
            <span>Audit readiness</span>
            <strong>{analysis ? `${analysis.qualityReview.overallScore}%` : "pending"}</strong>
          </div>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace">
        <aside className="sidebar">
          <p className="section-kicker">Workflow</p>
          <StepButton id="role" activeStep={activeStep} setActiveStep={setActiveStep} index="01" label="Enter role information" />
          <StepButton id="matrix" activeStep={activeStep} setActiveStep={setActiveStep} index="02" label="Risk-regulation matrix" disabled={!analysis} />
          <StepButton id="training" activeStep={activeStep} setActiveStep={setActiveStep} index="03" label="Training path" disabled={!analysis} />
          <StepButton id="audit" activeStep={activeStep} setActiveStep={setActiveStep} index="04" label="Audit & quality" disabled={!analysis} />
          <StepButton id="history" activeStep={activeStep} setActiveStep={setActiveStep} index="05" label="History & approvals" />
        </aside>

        <div className="main-panel">
          {activeStep === "role" && (
            <RoleIntake
              roles={roles}
              selectedRole={selectedRole}
              onPresetSelect={(role) => {
                setSelectedRole(role.id);
                setRoleForm(roleToForm(role));
              }}
              roleForm={roleForm}
              setRoleForm={setRoleForm}
              runAnalysis={runAnalysis}
              isLoading={isLoading}
              job={job}
              nowMs={nowMs}
            />
          )}
          {activeStep === "matrix" && analysis && (
            <MatrixView analysis={analysis} updateReview={updateReview} />
          )}
          {activeStep === "training" && analysis && (
            <TrainingView analysis={analysis} />
          )}
          {activeStep === "audit" && analysis && (
            <AuditView
              analysis={analysis}
              approvedCount={approvedCount}
              approveTrainingForLms={approveTrainingForLms}
              requestTrainingChanges={requestTrainingChanges}
              downloadAuditPack={downloadAuditPack}
            />
          )}
          {activeStep === "history" && (
            <HistoryView
              runs={historyRuns}
              selectedRun={selectedRun}
              loadRun={loadRun}
              refreshHistory={loadHistory}
              downloadAuditPack={downloadAuditPack}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function StepButton({ id, activeStep, setActiveStep, index, label, disabled = false }) {
  return (
    <button
      className={`step-button ${activeStep === id ? "is-active" : ""}`}
      onClick={() => setActiveStep(id)}
      disabled={disabled}
    >
      <span>{index}</span>
      {label}
    </button>
  );
}

function RoleIntake({
  roles,
  selectedRole,
  onPresetSelect,
  roleForm,
  setRoleForm,
  runAnalysis,
  isLoading,
  job,
  nowMs,
}) {
  function updateField(field, value) {
    setRoleForm((current) => ({ ...current, [field]: value }));
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseRoleFile(text, file.name);
    setRoleForm((current) => ({
      ...current,
      ...imported,
      additionalContext: imported.additionalContext || current.additionalContext,
    }));
    event.target.value = "";
  }

  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Role intake</p>
        <h2>Enter role information</h2>
        <p>
          Use a preset role to populate the form, edit the fields, or import a role description file.
          The agent uses this structured profile to generate the risk-role-competency matrix.
        </p>
      </div>

      <SourcesLoaded sources={loadedSources} />

      <div className="role-grid">
        {roles.map((role) => (
          <button
            key={role.id}
            className={`role-card ${selectedRole === role.id ? "is-selected" : ""}`}
            onClick={() => onPresetSelect(role)}
          >
            <span>{role.team}</span>
            <strong>{role.name}</strong>
            <small>{role.persona}</small>
          </button>
        ))}
      </div>

      <div className="role-form">
        <div className="form-toolbar">
          <div>
            <p className="section-kicker">Structured input</p>
            <h3>Role profile</h3>
          </div>
          <label className="file-import">
            Import role file
            <input type="file" accept=".txt,.md,.json" onChange={handleFileImport} />
          </label>
        </div>

        <div className="form-grid">
          <label>
            <span>Job title</span>
            <input
              value={roleForm.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="e.g. Sanctions Screening Specialist"
            />
          </label>
          <label>
            <span>Team / department</span>
            <input
              value={roleForm.team}
              onChange={(event) => updateField("team", event.target.value)}
              placeholder="e.g. Financial Crime Operations"
            />
          </label>
          <label>
            <span>Role function</span>
            <input
              value={roleForm.function}
              onChange={(event) => updateField("function", event.target.value)}
              placeholder="What is this role's function?"
            />
          </label>
          <label>
            <span>Line of defence / accountability</span>
            <input
              value={roleForm.lineOfDefence}
              onChange={(event) => updateField("lineOfDefence", event.target.value)}
              placeholder="e.g. First line customer contact"
            />
          </label>
        </div>

        <label className="wide-field">
          <span>Tasks and responsibilities</span>
          <textarea
            value={roleForm.responsibilities}
            onChange={(event) => updateField("responsibilities", event.target.value)}
            rows="7"
            placeholder="Paste or write the day-to-day responsibilities. One bullet or sentence per line works best."
          />
        </label>

        <div className="form-grid">
          <label>
            <span>Known risk signals</span>
            <textarea
              value={roleForm.riskSignals}
              onChange={(event) => updateField("riskSignals", event.target.value)}
              rows="5"
              placeholder="e.g. High interaction volume, fraud red flags, escalation dependency"
            />
          </label>
          <label>
            <span>Additional context</span>
            <textarea
              value={roleForm.additionalContext}
              onChange={(event) => updateField("additionalContext", event.target.value)}
              rows="5"
              placeholder="Relevant systems, customer types, jurisdictions, constraints, or reviewer notes."
            />
          </label>
        </div>
      </div>

      <button className="primary-action" onClick={runAnalysis} disabled={isLoading || !roleForm.name || !roleForm.responsibilities}>
        {isLoading ? "Running agents..." : "Run multi-agent workflow"}
      </button>

      {job && <AgentProgress job={job} nowMs={nowMs} />}
    </div>
  );
}

function AgentProgress({ job, nowMs }) {
  const running = job.steps.find((step) => step.status === "running");
  const liveTotalMs = liveElapsed(job, nowMs);
  const inspectableSteps = job.steps.filter((step) => getStepOutput(step, job));
  const latestInspectable = inspectableSteps.at(-1);
  const [selectedStepId, setSelectedStepId] = useState(latestInspectable?.id ?? job.steps[0]?.id);
  const [manualSelection, setManualSelection] = useState(false);
  const selectedStep =
    job.steps.find((step) => step.id === selectedStepId && getStepOutput(step, job)) ??
    latestInspectable ??
    job.steps.find((step) => step.status === "running") ??
    job.steps[0];

  useEffect(() => {
    if (!latestInspectable) {
      return;
    }
    const selectedHasOutput = job.steps.some(
      (step) => step.id === selectedStepId && getStepOutput(step, job),
    );
    if (!manualSelection || !selectedHasOutput) {
      setSelectedStepId(latestInspectable.id);
    }
  }, [job, latestInspectable?.id, manualSelection, selectedStepId]);

  useEffect(() => {
    setManualSelection(false);
  }, [job.jobId]);

  return (
    <section className="progress-panel" aria-label="Agent workflow progress">
      <div className="progress-heading">
        <div>
          <p className="section-kicker">Agent progress</p>
          <h3>{running ? running.name : job.status === "complete" ? "Workflow complete" : "Queued"}</h3>
        </div>
        <div className="elapsed-badge">
          <span>Total time</span>
          <strong>{formatElapsed(liveTotalMs)}</strong>
        </div>
      </div>

      <div className="agent-graph">
        {job.steps.map((step, index) => {
          const output = getStepOutput(step, job);
          const canInspect = Boolean(output);
          return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              className={`graph-node is-${step.status} ${selectedStep?.id === step.id ? "is-selected" : ""}`}
              onClick={() => {
                if (!canInspect) return;
                setSelectedStepId(step.id);
                setManualSelection(true);
              }}
              disabled={!canInspect}
              aria-pressed={selectedStep?.id === step.id}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.name}</strong>
              <small>{step.statusLabel || labelForStatus(step.status)}</small>
              <em>{formatStepElapsed(job, step, nowMs)}</em>
            </button>
            {index < job.steps.length - 1 && <div className={`graph-edge is-${step.status}`} />}
          </React.Fragment>
        );
        })}
      </div>

      <AgentOutputPanel step={selectedStep} output={getStepOutput(selectedStep, job)} />

      {job.error && (
        <div className="progress-note">
          Agent fallback used: {job.error}
        </div>
      )}
    </section>
  );
}

function getStepOutput(step, job) {
  if (!step) return null;
  if (step.output) return step.output;
  const result = job?.result;
  if (!result) return null;
  const outputByStep = {
    role_parser: { type: "parsed_role", title: "Parsed role profile", data: result.parsedRole },
    risk_mapper: { type: "risks", title: "Risk exposure map", data: result.riskRegulationMatrix?.map((row) => ({
      theme: row.riskTheme,
      level: row.riskLevel,
      scenario: row.riskScenario,
      evidence: row.roleEvidence,
      impact: row.whyItMatters,
    })) },
    regulation_mapper: { type: "matrix", title: "Risk-regulation matrix", data: result.riskRegulationMatrix },
    training_designer: { type: "training_plan", title: "Training path", data: result.trainingPlan },
    quality_reviewer: { type: "quality_review", title: "Quality review", data: result.qualityReview },
  };
  const output = outputByStep[step.id];
  return output?.data ? output : null;
}

function AgentOutputPanel({ step, output }) {
  return (
    <div className="agent-output-panel">
      <div className="agent-output-heading">
        <div>
          <p className="section-kicker">Agent result inspector</p>
          <h3>{output?.title ?? step?.name ?? "Waiting for first result"}</h3>
        </div>
        <InspectorStatusBadge value={output ? "available" : "waiting"} />
      </div>
      {!output && (
        <p className="muted-copy">
          The first completed agent result will appear here. Completed nodes become clickable for review.
        </p>
      )}
      {output?.type === "parsed_role" && <ParsedRoleOutput data={output.data} />}
      {output?.type === "risks" && <RiskOutput data={output.data} />}
      {output?.type === "matrix" && <MatrixOutput data={output.data} />}
      {output?.type === "training_plan" && <TrainingOutput data={output.data} />}
      {output?.type === "quality_review" && <QualityOutput data={output.data} />}
    </div>
  );
}

function ParsedRoleOutput({ data }) {
  return (
    <div className="agent-output-grid">
      <div className="agent-output-card">
        <span>Role function</span>
        <strong>{data.function}</strong>
        <small>{riskGovernanceLabel(data.lineOfDefence)}</small>
      </div>
      <div className="agent-output-card">
        <span>Decision rights</span>
        <strong>{data.decisionAuthority}</strong>
        <small>Input evidence quality: {sourceQualityLabel(data.sourceQuality)}</small>
      </div>
      <div className="agent-output-card wide">
        <span>Reviewer checkpoint</span>
        <strong>Confirm role profile before risk mapping.</strong>
        <small>Reviewer should check responsibilities, risk governance position and decision rights before downstream agents use this profile.</small>
      </div>
      <div className="agent-output-list wide">
        {(data.responsibilities ?? []).map((item, index) => (
          <div key={`${item.text}-${index}`}>
            <strong>{item.text}</strong>
            {item.evidence && item.evidence !== item.text && <small>Source evidence: {item.evidence}</small>}
            <InspectorStatusBadge value={item.humanReview === "accepted" ? "confirmed" : "needs_confirmation"} />
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectorStatusBadge({ value }) {
  const labels = {
    available: "Result available",
    waiting: "Waiting",
    confirmed: "Source confirmed",
    needs_confirmation: "Needs confirmation",
  };
  return <span className={`inspector-badge is-${value}`}>{labels[value] ?? value}</span>;
}

function riskGovernanceLabel(value) {
  if (!value) return "Risk governance position not specified";
  const normalized = String(value).toLowerCase();
  if (normalized.includes("first")) {
    return `${value}: owns or performs day-to-day controls close to customers, cases or operations.`;
  }
  if (normalized.includes("second")) {
    return `${value}: sets policy, monitors controls, challenges the first line and handles specialist compliance decisions.`;
  }
  if (normalized.includes("third")) {
    return `${value}: independently audits whether controls and governance are effective.`;
  }
  return value;
}

function sourceQualityLabel(value) {
  if (!value) return "Not assessed";
  const normalized = String(value).toLowerCase();
  if (normalized === "high") return "High: source role gives concrete tasks, responsibilities and risk signals.";
  if (normalized === "medium") return "Medium: source role is usable but needs reviewer confirmation.";
  if (normalized === "low") return "Low: source role is too thin for confident mapping.";
  return value;
}

function RiskOutput({ data }) {
  return (
    <div className="agent-output-list">
      {(data ?? []).map((risk, index) => (
        <div key={`${risk.scenario}-${index}`}>
          <strong>{risk.scenario}</strong>
          <small>{risk.theme} · {risk.level}</small>
          <p>{risk.evidence}</p>
          <p>{risk.impact}</p>
        </div>
      ))}
    </div>
  );
}

function MatrixOutput({ data }) {
  return (
    <div className="agent-output-list">
      {(data ?? []).map((row) => (
        <div key={row.id}>
          <strong>{row.riskScenario}</strong>
          <small>{row.riskTheme} · {row.riskLevel} · Evidence strength {row.confidence}%</small>
          <p>{row.roleEvidence}</p>
          <span>{row.amlrArticles.map((article) => article.article).join(", ")}</span>
          <StatusBadge value={row.humanReview === "accepted" || row.humanReview === "edited" ? "matrix_approved" : "needs_review"} />
        </div>
      ))}
    </div>
  );
}

function TrainingOutput({ data }) {
  const modules = data.quarters?.flatMap((quarter) => quarter.modules ?? []) ?? [];
  return (
    <div className="agent-output-grid">
      <div className="agent-output-card">
        <span>Training path</span>
        <strong>{data.title}</strong>
        <small>{modules.length} modules · {data.quarters?.length ?? 0} phases</small>
      </div>
      <div className="agent-output-card">
        <span>LMS status</span>
        <strong>{data.lmsAssignments?.[0]?.status ?? "Ready for approval"}</strong>
        <small>{data.lmsAssignments?.[0]?.mandatoryModules ?? modules.length} mandatory modules</small>
      </div>
      <div className="agent-output-list wide">
        {modules.slice(0, 6).map((module) => (
          <div key={module.moduleId || module.title}>
            <strong>{module.title}</strong>
            <small>{module.competencyType || "Competency"} · {(module.amlrTrace ?? []).join(", ")}</small>
            <p>{module.whyExpanded || module.whyIncluded}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityOutput({ data }) {
  return (
    <div className="agent-output-grid">
      <div className="agent-output-card">
        <span>Overall score</span>
        <strong>{data.overallScore}%</strong>
        <small>Compliance QA review</small>
      </div>
      {(data.dimensions ?? []).map((dimension) => (
        <div className="agent-output-card" key={dimension.name}>
          <span>{dimension.name}</span>
          <strong>{dimension.score}%</strong>
        </div>
      ))}
      <div className="agent-output-list wide">
        {(data.reviewFlags ?? []).map((flag) => (
          <div key={`${flag.target}-${flag.message}`}>
            <strong>{flag.severity} · {flag.target}</strong>
            <p>{flag.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function liveElapsed(job, nowMs) {
  if (!job?.startedAt) return job?.elapsedMs ?? 0;
  if (!["queued", "running"].includes(job.status)) return job.elapsedMs ?? 0;
  const started = new Date(job.startedAt).getTime();
  if (Number.isNaN(started)) return job.elapsedMs ?? 0;
  return Math.max(job.elapsedMs ?? 0, nowMs - started);
}

function formatStepElapsed(job, step, nowMs) {
  if (step.elapsedMs !== null && step.elapsedMs !== undefined) {
    return formatElapsed(step.elapsedMs);
  }
  if (step.status !== "running") {
    return "--";
  }
  const completedBefore = job.steps
    .slice(0, job.steps.findIndex((candidate) => candidate.id === step.id))
    .reduce((total, candidate) => total + (candidate.elapsedMs ?? 0), 0);
  return formatElapsed(Math.max(0, liveElapsed(job, nowMs) - completedBefore));
}

function labelForStatus(status) {
  if (status === "complete") return "Complete";
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  return "Pending";
}

function formatElapsed(ms) {
  if (ms === null || ms === undefined) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is optional; polling still works until refresh.
  }
}

function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

function roleToForm(role) {
  return {
    name: role.name ?? "",
    team: role.team ?? "",
    function: role.persona ?? "",
    lineOfDefence: role.lineOfDefence ?? "",
    responsibilities: (role.tasks ?? []).join("\n"),
    riskSignals: (role.riskSignals ?? []).join("\n"),
    additionalContext: role.description ?? "",
  };
}

function buildCustomRolePayload(form) {
  const description = [
    `Role function: ${form.function || "Not specified"}`,
    `Line of defence / accountability: ${form.lineOfDefence || "Not specified"}`,
    "",
    "Tasks and responsibilities:",
    form.responsibilities || "Not specified",
    "",
    "Known risk signals:",
    form.riskSignals || "Not specified",
    "",
    "Additional context:",
    form.additionalContext || "Not specified",
  ].join("\n");

  return {
    name: form.name.trim(),
    team: form.team.trim() || "Imported role",
    description,
  };
}

function parseRoleFile(text, fileName) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { additionalContext: `Imported empty file: ${fileName}` };
  }

  if (fileName.toLowerCase().endsWith(".json")) {
    try {
      const parsed = JSON.parse(trimmed);
      const tasks = parsed.tasks ?? parsed.responsibilities ?? parsed.main_duties ?? [];
      const riskSignals = parsed.riskSignals ?? parsed.risk_signals ?? parsed.risks ?? [];
      return {
        name: parsed.name ?? parsed.title ?? parsed.jobTitle ?? parsed.job_title ?? "",
        team: parsed.team ?? parsed.department ?? "",
        function: parsed.function ?? parsed.persona ?? parsed.roleFunction ?? parsed.role_function ?? "",
        lineOfDefence: parsed.lineOfDefence ?? parsed.line_of_defence ?? parsed.accountability ?? "",
        responsibilities: Array.isArray(tasks) ? tasks.join("\n") : String(tasks || ""),
        riskSignals: Array.isArray(riskSignals) ? riskSignals.join("\n") : String(riskSignals || ""),
        additionalContext: parsed.description ?? parsed.additionalContext ?? trimmed,
      };
    } catch {
      return {
        additionalContext: `Imported from ${fileName}\n\n${trimmed}`,
      };
    }
  }

  return {
    responsibilities: trimmed,
    additionalContext: `Imported from ${fileName}`,
  };
}

function SourcesLoaded({ sources }) {
  return (
    <section className="sources-panel" aria-label="Loaded challenge sources">
      <div>
        <p className="section-kicker">Sources loaded</p>
        <h3>Challenge packet grounding</h3>
      </div>
      <div className="source-grid">
        {sources.map((source) => (
          <div className="source-tile" key={source.name}>
            <strong>{source.name}</strong>
            <span>{source.file}</span>
            <small>{source.coverage}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function markTrainingPlan(trainingPlan, status) {
  const approved = status === "approved_for_lms";
  return {
    ...trainingPlan,
    approvalStatus: status,
    quarters: trainingPlan.quarters.map((quarter) => ({
      ...quarter,
      modules: quarter.modules.map((module) => ({
        ...module,
        approvalStatus: status,
        lmsStatus: approved ? "Ready for assignment" : "Changes requested",
      })),
    })),
    lmsAssignments: trainingPlan.lmsAssignments.map((assignment) => ({
      ...assignment,
      approvalStatus: status,
      status: approved ? "Approved for LMS assignment" : "Changes requested",
      lmsStatus: approved ? "Ready to assign" : "Blocked",
    })),
  };
}

function MatrixView({ analysis, updateReview }) {
  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Agent output</p>
        <h2>Risk, regulation and competency matrix</h2>
        <p>
          Each row shows why training is assigned, which AMLR articles support it, and where human
          approval is required.
        </p>
      </div>

      <div className="agent-strip">
        {analysis.agents.map((agent) => (
          <div key={agent.name} className="agent-pill">
            <span>{agent.name}</span>
            <small>{agent.summary}</small>
          </div>
        ))}
      </div>

      <div className="matrix-table">
        <div className="matrix-header">
          <span>Risk</span>
          <span>Role risk evidence</span>
          <span>AMLR trace</span>
          <span>Human review</span>
        </div>
        {analysis.riskRegulationMatrix.map((row) => (
          <div key={row.id} className="matrix-row">
            <div>
              <strong>{row.riskScenario}</strong>
              <div className="risk-meta">
                <span>Theme: {row.riskTheme}</span>
                <span>Level: {row.riskLevel}</span>
                <span>Evidence strength: {row.confidence}%</span>
              </div>
            </div>
            <div>
              <p>{row.roleEvidence}</p>
              <small>{row.competencyNeed}</small>
            </div>
            <div className="article-list">
              {row.amlrArticles.map((article) => (
                <span
                  key={article.article}
                  className="article-badge"
                  tabIndex="0"
                  aria-label={`${article.article}: ${article.title}. ${article.rationale}`}
                >
                  {article.article}
                  <span className="article-tooltip" role="tooltip">
                    <strong>{article.title}</strong>
                    <small>{article.rationale}</small>
                  </span>
                </span>
              ))}
            </div>
            <div>
              <select value={row.humanReview} onChange={(event) => updateReview(row.id, event.target.value)}>
                {reviewOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingView({ analysis }) {
  const allModules = analysis.trainingPlan.quarters.flatMap((quarter) => quarter.modules);
  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Training design</p>
        <h2>{analysis.trainingPlan.title}</h2>
        <p>{analysis.trainingPlan.philosophy}</p>
      </div>

      <div className="training-summary">
        <div>
          <span>Modules</span>
          <strong>{allModules.length}</strong>
        </div>
        <div>
          <span>Risk mappings used</span>
          <strong>{new Set(allModules.map((module) => module.sourceRiskId).filter(Boolean)).size}</strong>
        </div>
        <div>
          <span>AMLR trace</span>
          <strong>{uniqueArticlesFromModules(allModules).join(", ") || "Pending"}</strong>
        </div>
      </div>

      <div className="quarter-grid">
        {analysis.trainingPlan.quarters.map((quarter) => (
          <section key={quarter.name} className="quarter-band">
            <h3>{quarter.name}</h3>
            <p>{quarter.focus}</p>
            <ul>
              {quarter.modules.map((module) => (
                <li key={module.moduleId || module.title}>
                  <strong>{module.title}</strong>
                  <span>{module.whyIncluded}</span>
                  <small>{module.assessment}</small>
                  <details className="module-explain">
                    <summary>Why this module?</summary>
                    <p>{module.whyExpanded}</p>
                    <dl>
                      <div>
                        <dt>Role risk evidence</dt>
                        <dd>{module.roleEvidence}</dd>
                      </div>
                      <div>
                        <dt>AMLR trace</dt>
                        <dd>{(module.amlrTrace ?? []).join(", ") || "Pending mapping"}</dd>
                      </div>
                      <div>
                        <dt>Competency</dt>
                        <dd>{module.competencyType}: {module.competencyNeed}</dd>
                      </div>
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="lms-panel">
        <div className="section-heading compact">
          <p className="section-kicker">LMS preview</p>
          <h3>Assignment and tracking status</h3>
        </div>
        <div className="lms-table">
          <div className="lms-header">
            <span>Learner group</span>
            <span>Modules</span>
            <span>Assessment</span>
            <span>Status</span>
          </div>
          {analysis.trainingPlan.lmsAssignments.map((assignment) => (
            <div className="lms-row" key={assignment.learnerGroup}>
              <div>
                <strong>{assignment.learnerGroup}</strong>
                <small>{assignment.owner || "Compliance Manager"} · {assignment.dueWindow || "Year 1"}</small>
              </div>
              <span>{assignment.mandatoryModules} mandatory</span>
              <span>{assignment.assessment}</span>
              <div>
                <StatusBadge value={normalizeApprovalStatus(assignment.approvalStatus)} />
                <small>{assignment.lmsStatus || assignment.status}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuditView({
  analysis,
  approvedCount,
  approveTrainingForLms,
  requestTrainingChanges,
  downloadAuditPack,
}) {
  const matrixApproved = approvedCount === analysis.riskRegulationMatrix.length;
  const trainingApproved = analysis.trainingPlan.lmsAssignments.some(
    (assignment) => assignment.approvalStatus === "approved_for_lms",
  );
  return (
    <div className="panel-section">
      <div className="section-heading history-heading">
        <div>
          <p className="section-kicker">Audit & quality</p>
          <h2>Evidence pack for compliance review</h2>
          <p>{analysis.auditPack.summary}</p>
        </div>
        <button className="secondary-action" onClick={() => downloadAuditPack()}>
          Export audit pack
        </button>
      </div>

      <div className="score-grid">
        {analysis.qualityReview.dimensions.map((dimension) => (
          <div key={dimension.name} className="score-tile">
            <span>{dimension.name}</span>
            <strong>{dimension.score}%</strong>
          </div>
        ))}
      </div>

      <section className="checkpoint-panel" aria-label="Human review checkpoints">
        <div className="section-heading compact">
          <p className="section-kicker">Human-in-the-loop</p>
          <h3>Reviewer checkpoints</h3>
        </div>
        <div className="checkpoint-grid">
          <div className="checkpoint-item">
            <span>01</span>
            <strong>Role source confirmed</strong>
            <small>{analysis.parsedRole.sourceQuality}</small>
            <StatusBadge value={analysis.role.id === "custom-role" ? "in_review" : "matrix_approved"} />
          </div>
          <div className="checkpoint-item">
            <span>02</span>
            <strong>Risk-regulation matrix</strong>
            <small>{approvedCount}/{analysis.riskRegulationMatrix.length} mappings accepted or edited</small>
            <StatusBadge value={matrixApproved ? "matrix_approved" : "needs_review"} />
          </div>
          <div className="checkpoint-item">
            <span>03</span>
            <strong>Training path</strong>
            <small>{countTrainingModules(analysis.trainingPlan.quarters)} modules ready for LMS review</small>
            <StatusBadge value={trainingApproved ? "approved_for_lms" : "needs_review"} />
          </div>
        </div>
        <div className="checkpoint-actions">
          <button className="secondary-action" onClick={approveTrainingForLms} disabled={!matrixApproved}>
            Approve training for LMS
          </button>
          <button className="secondary-action" onClick={requestTrainingChanges}>
            Request training changes
          </button>
        </div>
      </section>

      <div className="audit-layout">
        <div className="audit-summary">
          <h3>Traceability</h3>
          <dl>
            <div>
              <dt>Evidence items</dt>
              <dd>{analysis.auditPack.evidenceItems}</dd>
            </div>
            <div>
              <dt>AMLR coverage</dt>
              <dd>{analysis.auditPack.amlrCoverage.join(", ")}</dd>
            </div>
            <div>
              <dt>Human approvals</dt>
              <dd>{approvedCount}/{analysis.riskRegulationMatrix.length}</dd>
            </div>
            <div>
              <dt>Quality score</dt>
              <dd>{analysis.auditPack.qualityScore}%</dd>
            </div>
          </dl>
        </div>
        <div className="audit-summary">
          <h3>Reviewer flags</h3>
          <ul>
            {analysis.qualityReview.reviewFlags.map((flag) => (
              <li key={`${flag.target}-${flag.message}`}>{flag.message}</li>
            ))}
          </ul>
        </div>
      </div>

      <SourcesLoaded sources={analysis.sourcePack ?? loadedSources} />
    </div>
  );
}

function HistoryView({ runs, selectedRun, loadRun, refreshHistory, downloadAuditPack }) {
  const detail = selectedRun?.result;
  const matrix = detail?.riskRegulationMatrix ?? [];
  const quarters = detail?.trainingPlan?.quarters ?? [];
  const selectedRunId = selectedRun?.run_id;

  return (
    <div className="panel-section">
      <div className="section-heading history-heading">
        <div>
          <p className="section-kicker">Audit trail</p>
          <h2>History & approvals</h2>
          <p>
            Every generated workflow is saved with its matrix, training path, quality review and
            human review actions.
          </p>
        </div>
        <div className="action-row">
          {selectedRun && (
            <button className="secondary-action" onClick={() => downloadAuditPack(selectedRun.run_id)}>
              Export audit pack
            </button>
          )}
          <button className="secondary-action" onClick={refreshHistory}>
            Refresh
          </button>
        </div>
      </div>

      <div className="history-layout">
        <section className="history-list" aria-label="Generated workflow runs">
          <div className="history-table">
            <div className="history-header">
              <span>Role</span>
              <span>Generated</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {runs.length === 0 && (
              <div className="empty-state">
                Run the workflow once to create the first audit record.
              </div>
            )}
            {runs.map((run) => (
              <div
                key={run.run_id}
                className={`history-row ${selectedRunId === run.run_id ? "is-selected" : ""}`}
              >
                <div>
                  <strong>{run.role_name}</strong>
                  <small>{run.role_team || "No team specified"}</small>
                </div>
                <div>
                  <span>{formatDateTime(run.completed_at)}</span>
                  <small>{formatElapsed(run.elapsed_ms)}</small>
                </div>
                <div>
                  <StatusBadge value={run.approval_status} />
                  <small>{run.execution_mode || "unknown mode"}</small>
                </div>
                <button className="small-action" onClick={() => loadRun(run.run_id)}>
                  View
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="history-detail" aria-label="Selected workflow detail">
          {!selectedRun && (
            <div className="empty-state">
              Select a run to inspect saved artifacts and reviewer decisions.
            </div>
          )}

          {selectedRun && (
            <>
              <div className="detail-title">
                <div>
                  <p className="section-kicker">Selected run</p>
                  <h3>{selectedRun.role_name}</h3>
                </div>
                <StatusBadge value={selectedRun.approval_status} />
              </div>

              <dl className="compact-dl">
                <div>
                  <dt>Generated</dt>
                  <dd>{formatDateTime(selectedRun.completed_at)}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{selectedRun.model || "deterministic"}</dd>
                </div>
                <div>
                  <dt>Matrix rows</dt>
                  <dd>{matrix.length}</dd>
                </div>
                <div>
                  <dt>Training modules</dt>
                  <dd>{countTrainingModules(quarters)}</dd>
                </div>
              </dl>

              <div className="artifact-preview">
                <h3>Saved artifacts</h3>
                <div className="artifact-grid">
                  <div>
                    <span>Risk-regulation matrix</span>
                    <strong>{matrix.length} mappings</strong>
                  </div>
                  <div>
                    <span>Training path</span>
                    <strong>{quarters.length} phases</strong>
                  </div>
                  <div>
                    <span>Quality score</span>
                    <strong>{detail?.qualityReview?.overallScore ?? "--"}%</strong>
                  </div>
                </div>
              </div>

              <div className="timeline">
                <h3>Reviewer timeline</h3>
                {selectedRun.reviewActions.length === 0 && (
                  <p className="muted-copy">No reviewer action has been recorded for this run yet.</p>
                )}
                {selectedRun.reviewActions.map((action) => (
                  <div className="timeline-item" key={action.id}>
                    <div>
                      <strong>{reviewLabel(action.action)}</strong>
                      <span>{action.artifact_type} · {action.target_id}</span>
                    </div>
                    <small>
                      {action.reviewer} · {formatDateTime(action.created_at)}
                    </small>
                    {action.comment && <p>{action.comment}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ value }) {
  return <span className={`status-badge is-${value || "unknown"}`}>{statusLabel(value)}</span>;
}

function statusLabel(value) {
  const labels = {
    needs_review: "Needs review",
    in_review: "In review",
    matrix_approved: "Matrix approved",
    approved_for_lms: "Approved for LMS",
    changes_requested: "Changes requested",
  };
  return labels[value] ?? "Unknown";
}

function normalizeApprovalStatus(value) {
  if (value === "approved_for_lms") return "approved_for_lms";
  if (value === "changes_requested") return "changes_requested";
  if (value === "matrix_approved") return "matrix_approved";
  if (value === "in_review") return "in_review";
  return "needs_review";
}

function reviewLabel(value) {
  return reviewOptions.find((option) => option.value === value)?.label ?? statusLabel(value);
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countTrainingModules(quarters) {
  return quarters.reduce((total, quarter) => total + (quarter.modules?.length ?? 0), 0);
}

function uniqueArticlesFromModules(modules) {
  return [...new Set(modules.flatMap((module) => module.amlrTrace ?? []))].slice(0, 6);
}

export default App;
