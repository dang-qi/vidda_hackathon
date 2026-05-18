import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const VIDDA_LOGO =
  "https://vidda.io/_next/image?url=https%3A%2F%2Fa.storyblok.com%2Ff%2F290798558767898%2F477x72%2Fee934cc8bd%2Fvidda_logo.png&w=3840&q=75";
const ACTIVE_JOB_KEY = "vidda.activeAnalysisJobId";

const reviewOptions = [
  { value: "needs-review", label: "Needs review" },
  { value: "accepted", label: "Accepted" },
  { value: "edited", label: "Edited by human" },
  { value: "rejected", label: "Rejected" },
];

function App() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("kyc-analyst");
  const [analysis, setAnalysis] = useState(null);
  const [activeStep, setActiveStep] = useState("role");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const activeJobId = job?.jobId;
  const activeJobStatus = job?.status;

  useEffect(() => {
    fetch(`${API_BASE}/api/roles`)
      .then((response) => response.json())
      .then((data) => setRoles(data))
      .catch(() => setError("Backend is not reachable. Start FastAPI on port 8000."));
  }, []);

  useEffect(() => {
    const savedJobId = safeStorageGet(ACTIVE_JOB_KEY);
    if (!savedJobId) {
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
          setAnalysis(savedJob.result);
          setActiveStep("matrix");
          setIsLoading(false);
        } else if (["queued", "running"].includes(savedJob.status)) {
          setActiveStep("role");
        } else {
          safeStorageRemove(ACTIVE_JOB_KEY);
          setIsLoading(false);
        }
      })
      .catch(() => {
        safeStorageRemove(ACTIVE_JOB_KEY);
        setIsLoading(false);
      });
  }, []);

  const selected = useMemo(
    () => roles.find((role) => role.id === selectedRole),
    [roles, selectedRole],
  );

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
          setAnalysis(nextJob.result);
          setActiveStep("matrix");
          setIsLoading(false);
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
    setIsLoading(true);
    setError("");
    setAnalysis(null);
    setJob(null);
    setNowMs(Date.now());
    try {
      const response = await fetch(`${API_BASE}/api/analyze/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRole, useAgent: true }),
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

  function updateReview(rowId, status) {
    setAnalysis((current) => ({
      ...current,
      riskRegulationMatrix: current.riskRegulationMatrix.map((row) =>
        row.id === rowId ? { ...row, humanReview: status } : row,
      ),
    }));
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
          <StepButton id="role" activeStep={activeStep} setActiveStep={setActiveStep} index="01" label="Select role" />
          <StepButton id="matrix" activeStep={activeStep} setActiveStep={setActiveStep} index="02" label="Risk-regulation matrix" disabled={!analysis} />
          <StepButton id="training" activeStep={activeStep} setActiveStep={setActiveStep} index="03" label="Training path" disabled={!analysis} />
          <StepButton id="audit" activeStep={activeStep} setActiveStep={setActiveStep} index="04" label="Audit & quality" disabled={!analysis} />
        </aside>

        <div className="main-panel">
          {activeStep === "role" && (
            <RoleIntake
              roles={roles}
              selectedRole={selectedRole}
              setSelectedRole={setSelectedRole}
              selected={selected}
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
            <AuditView analysis={analysis} approvedCount={approvedCount} />
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

function RoleIntake({ roles, selectedRole, setSelectedRole, selected, runAnalysis, isLoading, job, nowMs }) {
  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Role intake</p>
        <h2>Select a role from the challenge pack</h2>
        <p>
          The workflow starts with a real role description, then asks agents to extract responsibilities,
          risk exposure, AMLR obligations and competency needs.
        </p>
      </div>

      <div className="role-grid">
        {roles.map((role) => (
          <button
            key={role.id}
            className={`role-card ${selectedRole === role.id ? "is-selected" : ""}`}
            onClick={() => setSelectedRole(role.id)}
          >
            <span>{role.team}</span>
            <strong>{role.name}</strong>
            <small>{role.persona}</small>
          </button>
        ))}
      </div>

      {selected && (
        <div className="role-detail">
          <div>
            <p className="section-kicker">Source role</p>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
          </div>
          <ul>
            {selected.riskSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="primary-action" onClick={runAnalysis} disabled={isLoading || !selected}>
        {isLoading ? "Running agents..." : "Run multi-agent workflow"}
      </button>

      {job && <AgentProgress job={job} nowMs={nowMs} />}
    </div>
  );
}

function AgentProgress({ job, nowMs }) {
  const running = job.steps.find((step) => step.status === "running");
  const liveTotalMs = liveElapsed(job, nowMs);
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
        {job.steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className={`graph-node is-${step.status}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.name}</strong>
              <small>{step.statusLabel || labelForStatus(step.status)}</small>
              <em>{formatStepElapsed(job, step, nowMs)}</em>
            </div>
            {index < job.steps.length - 1 && <div className={`graph-edge is-${step.status}`} />}
          </React.Fragment>
        ))}
      </div>

      {job.error && (
        <div className="progress-note">
          Agent fallback used: {job.error}
        </div>
      )}
    </section>
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
                <span>Confidence: {row.confidence}%</span>
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
  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Training design</p>
        <h2>{analysis.trainingPlan.title}</h2>
        <p>{analysis.trainingPlan.philosophy}</p>
      </div>

      <div className="quarter-grid">
        {analysis.trainingPlan.quarters.map((quarter) => (
          <section key={quarter.name} className="quarter-band">
            <h3>{quarter.name}</h3>
            <p>{quarter.focus}</p>
            <ul>
              {quarter.modules.map((module) => (
                <li key={module.title}>
                  <strong>{module.title}</strong>
                  <span>{module.whyIncluded}</span>
                  <small>{module.assessment}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="lms-band">
        {analysis.trainingPlan.lmsAssignments.map((assignment) => (
          <div key={assignment.learnerGroup}>
            <p className="section-kicker">LMS assignment</p>
            <h3>{assignment.learnerGroup}</h3>
            <p>{assignment.status}</p>
            <span>{assignment.mandatoryModules} mandatory modules</span>
            <span>{assignment.assessment}</span>
            <span>{assignment.refreshCycle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditView({ analysis, approvedCount }) {
  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">Audit & quality</p>
        <h2>Evidence pack for compliance review</h2>
        <p>{analysis.auditPack.summary}</p>
      </div>

      <div className="score-grid">
        {analysis.qualityReview.dimensions.map((dimension) => (
          <div key={dimension.name} className="score-tile">
            <span>{dimension.name}</span>
            <strong>{dimension.score}%</strong>
          </div>
        ))}
      </div>

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
    </div>
  );
}

export default App;
