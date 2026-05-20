import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const VIDDA_LOGO =
  "https://vidda.io/_next/image?url=https%3A%2F%2Fa.storyblok.com%2Ff%2F290798558767898%2F477x72%2Fee934cc8bd%2Fvidda_logo.png&w=3840&q=75";
const ACTIVE_JOB_KEY = "vidda.activeAnalysisJobId";
const LAST_RUN_KEY = "vidda.lastCompletedRunId";

const reviewOptions = [
  { value: "needs-review", label: "Needs review" },
  { value: "accepted", label: "Accepted" },
  { value: "edited", label: "Edit direct" },
  { value: "edit-ai", label: "Edit by asking AI" },
  { value: "rejected", label: "Rejected" },
];

const riskLevelOrder = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

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

const COUNTRIES = [
  {
    code: "SE",
    name: "Sweden",
    flag: "🇸🇪",
    confidence: 88,
    tagline: "Centralt funktionsansvarig + independent review function",
  },
  {
    code: "ES",
    name: "Spain",
    flag: "🇪🇸",
    confidence: 90,
    tagline: "OCI + annual external expert review (Ley 10/2010)",
  },
  {
    code: "DE",
    name: "Germany",
    flag: "🇩🇪",
    confidence: 85,
    tagline: "Geldwäschebeauftragter + deputy MLRO (GwG §6/§7)",
  },
];

const roleDemoPrompts = [
  {
    label: "Second-line oversight",
    instruction:
      "Change this role into a second-line oversight role. It does not directly onboard customers. It reviews samples of first-line files, challenges weak CDD/EDD decisions, monitors policy adherence, and reports recurring control issues to Compliance leadership.",
  },
  {
    label: "Branch manager",
    instruction:
      "Make this role a retail Branch Manager. The role supervises customer advisors, checks that onboarding documents are complete, approves routine escalations, coaches staff on fraud and AML red flags, and escalates high-risk customers to Compliance or the MLRO.",
  },
  {
    label: "Remove final decision",
    instruction:
      "Clarify that this role performs initial screening and documentation only. It cannot make final sanctions, PEP, SAR, or high-risk customer approval decisions. Those decisions must be escalated to Compliance.",
  },
];

function App() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState("kyc-analyst");
  const [selectedCountry, setSelectedCountry] = useState("SE");
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [workflow, setWorkflow] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [cachedAnalyses, setCachedAnalyses] = useState({});
  const [prefetchStatus, setPrefetchStatus] = useState({});
  const [compareCountry, setCompareCountry] = useState(null);
  const [compareAnalysis, setCompareAnalysis] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [activeStep, setActiveStep] = useState("role");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(null);
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
          cacheAnalysisAndPrefetch(savedJob.result);
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
          cacheAnalysisAndPrefetch(nextJob.result);
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

  function cacheAnalysisAndPrefetch(result) {
    const countryCode = result?.countryOverlay?.code;
    if (!countryCode) return;
    setCachedAnalyses((current) => ({ ...current, [countryCode]: result }));
    setPrefetchStatus((current) => ({ ...current, [countryCode]: "ready" }));
    COUNTRIES.filter((c) => c.code !== countryCode).forEach((country) => {
      prefetchCountry(country.code);
    });
  }

  async function prefetchCountry(targetCountry) {
    setPrefetchStatus((current) => {
      if (current[targetCountry] === "ready" || current[targetCountry] === "loading") {
        return current;
      }
      return { ...current, [targetCountry]: "loading" };
    });
    try {
      const body = { ...buildAnalysisBody(targetCountry), useAgent: false };
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error("prefetch failed");
      }
      const data = await response.json();
      setCachedAnalyses((current) => ({ ...current, [targetCountry]: data }));
      setPrefetchStatus((current) => ({ ...current, [targetCountry]: "ready" }));
    } catch {
      setPrefetchStatus((current) => ({ ...current, [targetCountry]: "error" }));
    }
  }

  function buildAnalysisBody(countryCode) {
    const rolePayload = buildCustomRolePayload(roleForm);
    const presetRole = roles.find((role) => role.id === selectedRole);
    const formMatchesPreset = presetRole && presetRole.name === roleForm.name;
    return {
      ...(formMatchesPreset ? { roleId: selectedRole } : { customRole: rolePayload }),
      useAgent: true,
      regulatoryScope: {
        jurisdiction: "EU",
        regulation: "AMLR 2024/1624",
        articles: ["9", "10", "11", "12", "13", "14"],
        country: countryCode,
      },
    };
  }

  async function runAnalysis() {
    const rolePayload = buildCustomRolePayload(roleForm);
    if (!rolePayload.name) {
      setError("Enter a role title or choose a template before creating a role draft.");
      return;
    }
    setIsLoading(true);
    setLoadingMessage({
      title: "Role Parser Agent is drafting the role profile.",
      body: "It reads the selected template or role name, infers likely responsibilities, identifies missing information, and prepares questions for human confirmation.",
    });
    setError("");
    setAnalysis(null);
    setCachedAnalyses({});
    setPrefetchStatus({});
    setCompareAnalysis(null);
    setCompareCountry(null);
    setJob(null);
    setNowMs(Date.now());
    try {
      const response = await fetch(`${API_BASE}/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRole,
          customRole: rolePayload,
          regulatoryScope: {
            jurisdiction: "EU",
            regulation: "AMLR 2024/1624",
            articles: ["9", "10", "11", "12", "13", "14"],
            country: selectedCountry,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("role draft failed");
      }
      const data = await response.json();
      setWorkflow(data);
      setRoleForm(roleDraftToForm(data.roleDraft));
    } catch (err) {
      setError("Could not create the role draft. Check that the backend is running.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function reviseRoleDraft(instruction) {
    if (!workflow?.workflowId || !instruction.trim()) return;
    setIsLoading(true);
    setLoadingMessage({
      title: "Role Parser Agent is applying your natural-language change.",
      body: "It updates the structured responsibilities, risk clues, decision authority, and follow-up questions while keeping the draft ready for human confirmation.",
    });
    setError("");
    try {
      const data = await postJson(`/api/workflows/${workflow.workflowId}/role/revise`, { instruction });
      setWorkflow(data);
      setRoleForm(roleDraftToForm(data.roleDraft));
    } catch {
      setError("Could not revise the role draft.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function confirmRoleAndGenerateMatrix() {
    if (!workflow?.workflowId) return;
    setIsLoading(true);
    setLoadingMessage({
      title: "Risk and regulation agents are mapping the confirmed role.",
      body: "They convert the confirmed role profile into risk evidence, AMLR article traces, competency needs, and rows that all start in human review.",
    });
    setError("");
    try {
      await postJson(`/api/workflows/${workflow.workflowId}/role/approve`, { roleDraft: workflow.roleDraft });
      const data = await postJson(`/api/workflows/${workflow.workflowId}/matrix/generate`, {});
      setWorkflow(data);
      setActiveStep("matrix");
    } catch {
      setError("Could not confirm the role and generate the matrix.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function reviseMatrix(instruction, targetId) {
    if (!workflow?.workflowId || !instruction.trim()) return;
    setIsLoading(true);
    setLoadingMessage({
      title: "Matrix revision agent is applying your instruction.",
      body: "It revises the selected row or whole matrix from your natural-language guidance and marks changed evidence for reviewer confirmation.",
    });
    setError("");
    try {
      const data = await postJson(`/api/workflows/${workflow.workflowId}/matrix/revise`, { instruction, targetId });
      setWorkflow(data);
    } catch {
      setError("Could not revise the matrix.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function directUpdateMatrixRow(updatedRow) {
    if (!updatedRow?.id) return;
    const rowForSave = { ...updatedRow, humanReview: "edited" };
    if (!analysis && workflow?.workflowId) {
      setWorkflow((current) => ({
        ...current,
        riskRegulationMatrix: current.riskRegulationMatrix.map((row) =>
          row.id === rowForSave.id ? rowForSave : row,
        ),
      }));
      try {
        const data = await postJson(`/api/workflows/${workflow.workflowId}/matrix/row`, { row: rowForSave });
        setWorkflow(data);
      } catch {
        setError("Matrix row was edited locally, but the staged workflow could not be saved.");
      }
      return;
    }
    if (!analysis) return;
    const beforeRow = analysis.riskRegulationMatrix.find((row) => row.id === rowForSave.id);
    setAnalysis((current) => ({
      ...current,
      riskRegulationMatrix: current.riskRegulationMatrix.map((row) =>
        row.id === rowForSave.id ? rowForSave : row,
      ),
    }));
    if (analysis.workflowId && beforeRow) {
      try {
        await recordReviewAction({
          artifactType: "matrix",
          targetId: rowForSave.id,
          action: "edited",
          before: beforeRow,
          after: rowForSave,
          comment: "Matrix row edited directly",
        });
      } catch {
        setError("Matrix row was edited locally, but the audit trail could not be saved.");
      }
    }
  }

  async function acceptAllMatrixRows() {
    if (!analysis && workflow?.workflowId) {
      setWorkflow((current) => ({
        ...current,
        riskRegulationMatrix: current.riskRegulationMatrix.map((row) => ({ ...row, humanReview: "accepted" })),
      }));
      try {
        const data = await postJson(`/api/workflows/${workflow.workflowId}/matrix/accept-all`, {});
        setWorkflow(data);
      } catch {
        setError("Rows were accepted locally, but the staged workflow could not be saved.");
      }
      return;
    }
    if (!analysis) return;
    const beforeRows = analysis.riskRegulationMatrix;
    const afterRows = beforeRows.map((row) => ({ ...row, humanReview: "accepted" }));
    setAnalysis((current) => ({ ...current, riskRegulationMatrix: afterRows }));
    if (analysis.workflowId) {
      try {
        await Promise.all(afterRows.map((row, index) => recordReviewAction({
          artifactType: "matrix",
          targetId: row.id,
          action: "accepted",
          before: beforeRows[index],
          after: row,
          comment: "Matrix row accepted via Accept all",
        })));
      } catch {
        setError("Rows were accepted locally, but the audit trail could not be fully saved.");
      }
    }
  }

  async function approveMatrixAndGenerateTraining() {
    if (!workflow?.workflowId) return;
    setIsLoading(true);
    setLoadingMessage({
      title: "Training Designer and Quality Reviewer agents are running.",
      body: "They use the confirmed matrix to generate the training path, LMS-ready assignments, quality review, and audit evidence pack.",
    });
    setError("");
    try {
      await postJson(`/api/workflows/${workflow.workflowId}/matrix/approve`, {});
      const data = await postJson(`/api/workflows/${workflow.workflowId}/training/generate`, {});
      setWorkflow(data);
      if (data.result) {
        safeStorageSet(LAST_RUN_KEY, data.result.workflowId);
        setAnalysis(data.result);
        setActiveStep("training");
        loadHistory();
      }
    } catch {
      setError("Could not confirm the matrix and generate the training path.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function reviseTrainingPlan(instruction) {
    if (!workflow?.workflowId || !instruction.trim()) return;
    setIsLoading(true);
    setLoadingMessage({
      title: "Training Designer Agent is revising the training path.",
      body: "It applies your natural-language instruction to modules, rationale, assessments, and LMS assignment status while keeping the plan traceable to the matrix.",
    });
    setError("");
    try {
      const data = await postJson(`/api/workflows/${workflow.workflowId}/training/revise`, { instruction });
      setWorkflow(data);
      if (data.result) {
        setAnalysis(data.result);
        loadHistory();
      }
    } catch {
      setError("Could not revise the training path.");
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }

  async function switchCountry(targetCountry) {
    if (!targetCountry || targetCountry === selectedCountry) {
      return;
    }
    setCompareAnalysis(null);
    setCompareCountry(null);
    setError("");

    const cached = cachedAnalyses[targetCountry];
    if (cached) {
      setSelectedCountry(targetCountry);
      setAnalysis(cached);
      return;
    }

    // Cache miss — fall back to a live deterministic run so the swap is still
    // fast enough for the demo. The LLM-quality run is what the user got first;
    // subsequent jurisdictions reuse the deterministic engine.
    setSelectedCountry(targetCountry);
    setPrefetchStatus((current) => ({ ...current, [targetCountry]: "loading" }));
    try {
      const body = { ...buildAnalysisBody(targetCountry), useAgent: false };
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error("switch failed");
      }
      const data = await response.json();
      setCachedAnalyses((current) => ({ ...current, [targetCountry]: data }));
      setPrefetchStatus((current) => ({ ...current, [targetCountry]: "ready" }));
      setAnalysis(data);
    } catch (err) {
      setPrefetchStatus((current) => ({ ...current, [targetCountry]: "error" }));
      setError("Could not switch jurisdiction.");
    }
  }

  async function runComparisonAnalysis(targetCountry) {
    if (!analysis || !targetCountry || targetCountry === selectedCountry) {
      return;
    }
    setCompareCountry(targetCountry);

    const cached = cachedAnalyses[targetCountry];
    if (cached) {
      setCompareAnalysis(cached);
      return;
    }

    setCompareAnalysis(null);
    setCompareLoading(true);
    try {
      const body = { ...buildAnalysisBody(targetCountry), useAgent: false };
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error("comparison failed");
      }
      const data = await response.json();
      setCachedAnalyses((current) => ({ ...current, [targetCountry]: data }));
      setPrefetchStatus((current) => ({ ...current, [targetCountry]: "ready" }));
      setCompareAnalysis(data);
    } catch (err) {
      setError("Could not run the comparison workflow.");
      setCompareCountry(null);
    } finally {
      setCompareLoading(false);
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
    if (!analysis && !workflow) {
      return;
    }
    if (!analysis && workflow?.workflowId) {
      setWorkflow((current) => ({
        ...current,
        riskRegulationMatrix: current.riskRegulationMatrix.map((row) =>
          row.id === rowId ? { ...row, humanReview: status } : row,
        ),
      }));
      try {
        const data = await postJson(`/api/workflows/${workflow.workflowId}/matrix/status`, {
          targetId: rowId,
          status,
        });
        setWorkflow(data);
      } catch {
        setError("Review was updated locally, but the staged workflow could not be saved.");
      }
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

  const workingAnalysis = analysis ?? workflowToAnalysis(workflow);
  const currentMatrix = workingAnalysis?.riskRegulationMatrix ?? [];
  const approvedCount = currentMatrix.filter((row) =>
    ["accepted", "edited", "rejected"].includes(row.humanReview),
  ).length;
  const roleConfirmed = ["role_confirmed", "matrix_review", "matrix_confirmed", "complete"].includes(workflow?.status);
  const matrixReady = currentMatrix.length > 0;
  const trainingReady = Boolean(analysis?.trainingPlan);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vidda workflow home">
          <img src={VIDDA_LOGO} alt="Vidda" />
          <span>Compliance Training Engine</span>
        </a>
        <nav className="topnav" aria-label="Workflow sections">
          <button onClick={() => setActiveStep("role")}>Role</button>
          <button onClick={() => setActiveStep("matrix")} disabled={!matrixReady}>Matrix</button>
          <button onClick={() => setActiveStep("training")} disabled={!trainingReady}>Training</button>
          <button onClick={() => setActiveStep("audit")} disabled={!trainingReady}>Audit</button>
          <button onClick={() => setActiveStep("history")}>History</button>
          <button onClick={() => setActiveStep("country-mapping")} disabled={!matrixReady}>Country</button>
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
            <strong>{matrixReady ? `${approvedCount}/${currentMatrix.length}` : roleConfirmed ? "role confirmed" : "role draft"}</strong>
          </div>
          <div className="signal-row">
            <span>Audit readiness</span>
            <strong>{analysis ? `${analysis.qualityReview.overallScore}%` : workflow?.status ?? "pending"}</strong>
          </div>
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace">
        <aside className="sidebar">
          <p className="section-kicker">Workflow</p>
          <StepButton id="role" activeStep={activeStep} setActiveStep={setActiveStep} index="01" label="Enter role information" />
          <StepButton id="matrix" activeStep={activeStep} setActiveStep={setActiveStep} index="02" label="Risk-regulation matrix" disabled={!matrixReady} />
          <StepButton id="training" activeStep={activeStep} setActiveStep={setActiveStep} index="03" label="Training path" disabled={!trainingReady} />
          <StepButton id="audit" activeStep={activeStep} setActiveStep={setActiveStep} index="04" label="Audit & quality" disabled={!trainingReady} />
          <StepButton id="history" activeStep={activeStep} setActiveStep={setActiveStep} index="05" label="History & approvals" />
          <StepButton id="country-mapping" activeStep={activeStep} setActiveStep={setActiveStep} index="06" label="Country regulation interpretation mapping" disabled={!matrixReady} />
        </aside>

        <div className="main-panel">
          {activeStep === "role" && (
            <RoleIntake
              roles={roles}
              selectedRole={selectedRole}
              onPresetSelect={(role) => {
                setSelectedRole(role.id);
                setRoleForm(roleToForm(role));
                setWorkflow(null);
                setAnalysis(null);
              }}
              roleForm={roleForm}
              setRoleForm={setRoleForm}
              workflow={workflow}
              reviseRoleDraft={reviseRoleDraft}
              confirmRoleAndGenerateMatrix={confirmRoleAndGenerateMatrix}
              runAnalysis={runAnalysis}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              job={job}
              nowMs={nowMs}
              selectedCountry={selectedCountry}
              setSelectedCountry={setSelectedCountry}
            />
          )}
          {activeStep === "matrix" && workingAnalysis && (
            <MatrixView
              analysis={workingAnalysis}
              workflowStatus={workflow?.status}
              updateReview={updateReview}
              reviseMatrix={reviseMatrix}
              directUpdateMatrixRow={directUpdateMatrixRow}
              acceptAllMatrixRows={acceptAllMatrixRows}
              approveMatrixAndGenerateTraining={approveMatrixAndGenerateTraining}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              canGenerateTraining={Boolean(workflow?.workflowId) && !analysis}
              selectedCountry={selectedCountry}
              switchCountry={switchCountry}
              job={job}
              nowMs={nowMs}
              prefetchStatus={prefetchStatus}
              compareCountry={compareCountry}
              compareAnalysis={compareAnalysis}
              compareLoading={compareLoading}
              runComparisonAnalysis={runComparisonAnalysis}
              clearComparison={() => {
                setCompareCountry(null);
                setCompareAnalysis(null);
              }}
            />
          )}
          {activeStep === "training" && analysis && (
            <TrainingView
              analysis={analysis}
              reviseTrainingPlan={reviseTrainingPlan}
              approveTrainingForLms={approveTrainingForLms}
              requestTrainingChanges={requestTrainingChanges}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
            />
          )}
          {activeStep === "audit" && analysis && (
            <AuditView
              analysis={analysis}
              approvedCount={approvedCount}
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
          {activeStep === "country-mapping" && workingAnalysis && (
            <CountryInterpretationView
              analysis={workingAnalysis}
              selectedCountry={selectedCountry}
              switchCountry={switchCountry}
              isLoading={isLoading}
              prefetchStatus={prefetchStatus}
              compareCountry={compareCountry}
              compareAnalysis={compareAnalysis}
              compareLoading={compareLoading}
              runComparisonAnalysis={runComparisonAnalysis}
              clearComparison={() => {
                setCompareCountry(null);
                setCompareAnalysis(null);
              }}
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
  workflow,
  reviseRoleDraft,
  confirmRoleAndGenerateMatrix,
  runAnalysis,
  isLoading,
  loadingMessage,
  job,
  nowMs,
  selectedCountry,
  setSelectedCountry,
}) {
  const activeCountry = COUNTRIES.find((c) => c.code === selectedCountry) ?? COUNTRIES[0];
  const [roleInstruction, setRoleInstruction] = useState("");

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

      <div className="country-picker">
        <div className="section-heading inline">
          <p className="section-kicker">National overlay</p>
          <h3>Jurisdiction</h3>
          <p>The same EU regulation lands differently in each member state. Pick a country to layer national law on top of AMLR.</p>
        </div>
        <div className="country-grid">
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              className={`country-card ${selectedCountry === country.code ? "is-selected" : ""}`}
              onClick={() => setSelectedCountry(country.code)}
            >
              <span className="country-flag" aria-hidden="true">{country.flag}</span>
              <strong>{country.name}</strong>
              <small className="country-tagline">{country.tagline}</small>
              <span className="country-conf">Confidence {country.confidence}%</span>
            </button>
          ))}
        </div>
        <p className="country-note">
          Active: {activeCountry.flag} <strong>{activeCountry.name}</strong> — citations, role labels and one mandatory module will be tailored to this jurisdiction.
        </p>
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

      <div className="draft-action-row">
        <button className="primary-action" onClick={runAnalysis} disabled={isLoading || !roleForm.name}>
          {isLoading ? "Working..." : "Create role draft"}
        </button>
        {isLoading && loadingMessage && <WorkingNote message={loadingMessage} />}
      </div>

      {workflow?.roleDraft && (
        <section className="review-workspace" aria-label="Role draft review">
          <div className="review-main">
            <div className="section-heading compact">
              <p className="section-kicker">Human checkpoint 01</p>
              <h3>Confirm role draft</h3>
            </div>
            <ParsedRoleOutput data={workflow.roleDraft} />
            {workflow.roleDraft.clarifyingQuestions?.length > 0 && (
              <div className="question-list">
                <strong>Clarifying questions</strong>
                {workflow.roleDraft.clarifyingQuestions.map((question) => (
                  <span key={question}>{question}</span>
                ))}
              </div>
            )}
          </div>
          <div className="conversation-panel">
            <p className="section-kicker">Natural-language edit</p>
            <div className="prompt-chip-grid" aria-label="Role demo prompts">
              {roleDemoPrompts.map((prompt) => (
                <button
                  type="button"
                  className="prompt-chip"
                  key={prompt.label}
                  onClick={() => setRoleInstruction(prompt.instruction)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
            <textarea
              value={roleInstruction}
              onChange={(event) => setRoleInstruction(event.target.value)}
              rows="7"
              placeholder="Tell the agent what to change or answer its questions. Example: This role is second line, reviews samples, and does not directly onboard customers."
            />
            <div className="action-row">
              <button
                className="secondary-action"
                onClick={async () => {
                  await reviseRoleDraft(roleInstruction);
                  setRoleInstruction("");
                }}
                disabled={isLoading || !roleInstruction.trim()}
              >
                Apply changes
              </button>
              <button className="primary-action compact-action" onClick={confirmRoleAndGenerateMatrix} disabled={isLoading}>
                Confirm role and map risks
              </button>
            </div>
            {isLoading && loadingMessage && <WorkingNote message={loadingMessage} />}
            {workflow.changeSummary?.length > 0 && <ChangeSummary items={workflow.changeSummary} />}
          </div>
        </section>
      )}

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

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} failed`);
  }
  return response.json();
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

function roleDraftToForm(draft) {
  if (!draft) return emptyRoleForm;
  return {
    name: draft.name ?? "",
    team: draft.team ?? "",
    function: draft.function ?? "",
    lineOfDefence: draft.lineOfDefence ?? "",
    responsibilities: (draft.responsibilities ?? []).map((item) => item.text ?? item).join("\n"),
    riskSignals: (draft.riskClues ?? []).join("\n"),
    additionalContext: [
      draft.decisionAuthority ? `Decision authority: ${draft.decisionAuthority}` : "",
      draft.sourceQuality ? `Source quality: ${draft.sourceQuality}` : "",
    ].filter(Boolean).join("\n"),
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

function workflowToAnalysis(workflow) {
  if (!workflow?.riskRegulationMatrix?.length) return null;
  return {
    workflowId: workflow.workflowId,
    role: workflow.role,
    agents: workflow.agents ?? [],
    parsedRole: workflow.roleDraft,
    riskRegulationMatrix: workflow.riskRegulationMatrix ?? [],
    sourcePack: loadedSources,
    changeSummary: workflow.changeSummary ?? [],
  };
}

function ChangeSummary({ items }) {
  if (!items?.length) return null;
  return (
    <div className="change-summary">
      <strong>Latest changes</strong>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function WorkingNote({ message }) {
  if (!message) return null;
  return (
    <div className="working-note" role="status">
      <strong>{message.title}</strong>
      <span>{message.body}</span>
    </div>
  );
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

function MatrixView({
  analysis,
  workflowStatus,
  updateReview,
  reviseMatrix,
  directUpdateMatrixRow,
  acceptAllMatrixRows,
  approveMatrixAndGenerateTraining,
  isLoading,
  loadingMessage,
  canGenerateTraining,
}) {
  const [matrixInstruction, setMatrixInstruction] = useState("");
  const [targetRowId, setTargetRowId] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const matrixRows = sortRiskRowsByLevel(analysis.riskRegulationMatrix);

  function handleReviewAction(row, value) {
    if (value === "edited") {
      setEditingRow(row);
      return;
    }
    if (value === "edit-ai") {
      setTargetRowId(row.id);
      setMatrixInstruction(`Revise this row: ${row.riskScenario}. `);
      window.setTimeout(() => {
        document.getElementById("matrix-ai-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return;
    }
    updateReview(row.id, value);
  }

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
        {matrixRows.map((row) => (
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
              <select value={row.humanReview} onChange={(event) => handleReviewAction(row, event.target.value)}>
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

      {canGenerateTraining && (
        <section id="matrix-ai-editor" className="review-workspace matrix-review is-bottom" aria-label="Matrix review workspace">
          <div>
            <p className="section-kicker">Human checkpoint 02</p>
            <h3>Confirm risk evidence before training design</h3>
            <p className="muted-copy">
              Review the rows first, then accept all, edit one row directly, or ask AI to revise selected evidence before the training agent runs.
            </p>
          </div>
          <div className="conversation-panel">
            <select value={targetRowId} onChange={(event) => setTargetRowId(event.target.value)}>
              <option value="">Apply to whole matrix</option>
              {matrixRows.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.id}: {row.riskScenario}
                </option>
              ))}
            </select>
            <textarea
              value={matrixInstruction}
              onChange={(event) => setMatrixInstruction(event.target.value)}
              rows="5"
              placeholder="Example: The sanctions row should be medium risk because this role only performs initial screening and escalates final decisions."
            />
            <div className="action-row">
              <button className="secondary-action" onClick={acceptAllMatrixRows} disabled={isLoading}>
                Accept all
              </button>
              <button
                className="secondary-action"
                onClick={async () => {
                  await reviseMatrix(matrixInstruction, targetRowId || null);
                  setMatrixInstruction("");
                }}
                disabled={isLoading || !matrixInstruction.trim()}
              >
                Apply AI changes
              </button>
              <button
                className="primary-action compact-action"
                onClick={approveMatrixAndGenerateTraining}
                disabled={isLoading || workflowStatus === "complete"}
              >
                Confirm matrix and generate training
              </button>
            </div>
            {isLoading && loadingMessage && <WorkingNote message={loadingMessage} />}
            {analysis.changeSummary?.length > 0 && <ChangeSummary items={analysis.changeSummary} />}
          </div>
        </section>
      )}

      {editingRow && (
        <MatrixEditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSave={async (updatedRow) => {
            await directUpdateMatrixRow(updatedRow);
            setEditingRow(null);
          }}
        />
      )}
    </div>
  );
}

function CountryInterpretationView({
  analysis,
  selectedCountry,
  switchCountry,
  isLoading,
  prefetchStatus,
  compareCountry,
  compareAnalysis,
  compareLoading,
  runComparisonAnalysis,
  clearComparison,
}) {
  const overlay = analysis.countryOverlay;
  const compareOverlay = compareAnalysis?.countryOverlay;
  const activeCountryCode = selectedCountry || overlay?.code;
  const compareOptions = COUNTRIES.filter((c) => c.code !== activeCountryCode);
  const matrix = sortRiskRowsByLevel(analysis.riskRegulationMatrix);

  return (
    <div className="panel-section">
      <div className="section-heading">
        <p className="section-kicker">National overlay</p>
        <h2>Country regulation interpretation mapping</h2>
        <p>
          The same EU AMLR regulation lands differently in each member state. Switch jurisdiction to
          see how the matrix re-frames — national-law citations layered on AMLR articles, localised
          role labels, and a country-mandatory training module. Side-by-side compare shows the
          regulatory delta at a glance.
        </p>
      </div>

      {!overlay ? (
        <div className="empty-state">
          <p>No country overlay attached to this run. Pick a country on the Role step and re-run the agents.</p>
        </div>
      ) : (
        <>
          <CountryOverlayBanner
            overlay={overlay}
            activeCountryCode={activeCountryCode}
            isLoading={isLoading}
            onSwitch={switchCountry}
            prefetchStatus={prefetchStatus}
            compareOptions={compareOptions}
            compareCountry={compareCountry}
            compareAnalysis={compareAnalysis}
            compareLoading={compareLoading}
            onCompare={runComparisonAnalysis}
            onClearCompare={clearComparison}
          />

          {compareOverlay && compareAnalysis ? (
            <CompareMatrix
              baseAnalysis={analysis}
              baseOverlay={overlay}
              compareAnalysis={compareAnalysis}
              compareOverlay={compareOverlay}
            />
          ) : (
            <div className="matrix-table country-matrix">
              <div className="matrix-header">
                <span>Risk</span>
                <span>Role risk evidence</span>
                <span>AMLR + national citations</span>
                <span>Localised role label</span>
              </div>
              {matrix.map((row) => (
                <div key={row.id} className="matrix-row">
                  <div>
                    <strong>{row.riskScenario}</strong>
                    <div className="risk-meta">
                      <span>Theme: {row.riskTheme}</span>
                      <span>Level: {row.riskLevel}</span>
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
                    {(row.nationalCitations ?? []).map((cit) => (
                      <span
                        key={`${cit.law}-${cit.section}`}
                        className="article-badge national"
                        tabIndex="0"
                        aria-label={`${cit.law} ${cit.section}: ${cit.topic}`}
                      >
                        {overlay.flag} {cit.law} {cit.section}
                        <span className="article-tooltip" role="tooltip">
                          <strong>{cit.law} {cit.section}</strong>
                          <small>{cit.rationale}</small>
                        </span>
                      </span>
                    ))}
                  </div>
                  <div>
                    {row.localRoleLabel ? (
                      <div className="local-role-label" title="Localised role label for this jurisdiction">
                        {overlay.flag} {row.localRoleLabel}
                      </div>
                    ) : (
                      <small className="muted-copy">—</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CountryOverlayBanner({
  overlay,
  activeCountryCode,
  isLoading,
  onSwitch,
  prefetchStatus = {},
  compareOptions,
  compareCountry,
  compareAnalysis,
  compareLoading,
  onCompare,
  onClearCompare,
}) {
  return (
    <section className={`country-overlay-banner country-${overlay.code.toLowerCase()}`} aria-label="National overlay">
      <div className="country-overlay-head">
        <div>
          <span className="country-flag-large" aria-hidden="true">{overlay.flag}</span>
          <div>
            <p className="section-kicker">National overlay</p>
            <h3>{overlay.name}</h3>
            <small>Confidence {overlay.confidence}% · {overlay.confidenceRationale}</small>
          </div>
        </div>
        <div className="country-overlay-meta">
          <div>
            <span>Training default</span>
            <strong>{overlay.trainingFrequencyDefault}</strong>
          </div>
          <div>
            <span>Independent review</span>
            <strong>{overlay.independentReviewLabel}</strong>
          </div>
        </div>
      </div>
      <div className="country-overlay-citations">
        <span>National laws on the stack:</span>
        {overlay.sourceLaws.map((law) => (
          <a key={law.url} href={law.url} target="_blank" rel="noreferrer" className="country-source-link">
            {law.title}
          </a>
        ))}
      </div>
      <div className="country-overlay-switch">
        <span>Switch jurisdiction (cached, instant):</span>
        {COUNTRIES.map((country) => {
          const cacheState = prefetchStatus[country.code];
          const isCurrent = activeCountryCode === country.code;
          const isReady = isCurrent || cacheState === "ready";
          const isWarming = !isCurrent && cacheState === "loading";
          return (
            <button
              key={country.code}
              type="button"
              className={`country-switch-chip ${isCurrent ? "is-active" : ""}`}
              onClick={() => onSwitch && onSwitch(country.code)}
              disabled={isCurrent || isWarming}
              title={isCurrent ? "Currently showing" : isReady ? "Cached — instant swap" : isWarming ? "Pre-fetching…" : "Will fetch on click"}
            >
              {country.flag} {country.name}
              {isCurrent && <small className="chip-status">· now</small>}
              {!isCurrent && isReady && <small className="chip-status ready">· cached</small>}
              {isWarming && <small className="chip-status warming">· warming…</small>}
            </button>
          );
        })}
      </div>
      <div className="country-overlay-compare">
        <span>Or compare side-by-side:</span>
        {compareOptions.map((country) => {
          const cacheState = prefetchStatus[country.code];
          const isWarming = cacheState === "loading";
          return (
            <button
              key={country.code}
              type="button"
              className={`country-compare-chip ${compareCountry === country.code ? "is-active" : ""}`}
              onClick={() => onCompare(country.code)}
              disabled={compareLoading || isWarming}
              title={cacheState === "ready" ? "Cached — instant compare" : isWarming ? "Pre-fetching…" : "Will fetch on click"}
            >
              {country.flag} vs {overlay.flag}
              {cacheState === "ready" && <small className="chip-status ready">· cached</small>}
              {isWarming && <small className="chip-status warming">· warming…</small>}
            </button>
          );
        })}
        {(compareCountry || compareAnalysis) && (
          <button type="button" className="country-compare-clear" onClick={onClearCompare}>
            Clear comparison
          </button>
        )}
        {compareLoading && <span className="compare-loading">Running comparison…</span>}
      </div>
    </section>
  );
}

function CompareMatrix({ baseAnalysis, baseOverlay, compareAnalysis, compareOverlay }) {
  const baseRows = sortRiskRowsByLevel(baseAnalysis.riskRegulationMatrix);
  const compareRows = sortRiskRowsByLevel(compareAnalysis.riskRegulationMatrix);
  const pairs = baseRows.map((row, index) => ({
    base: row,
    compare: compareRows[index] || null,
  }));
  return (
    <div className="compare-matrix">
      <div className="compare-header">
        <div>
          <span>{baseOverlay?.flag} {baseOverlay?.name}</span>
          <small>{baseOverlay?.trainingFrequencyDefault}</small>
        </div>
        <div className="compare-vs">vs</div>
        <div>
          <span>{compareOverlay?.flag} {compareOverlay?.name}</span>
          <small>{compareOverlay?.trainingFrequencyDefault}</small>
        </div>
      </div>
      {pairs.map(({ base, compare }, index) => (
        <div key={base.id} className="compare-row">
          <div className="compare-risk">
            <strong>{index + 1}. {base.riskScenario}</strong>
            <small>{base.riskTheme} · {base.riskLevel}</small>
          </div>
          <div className="compare-pair">
            <CompareCell row={base} overlay={baseOverlay} />
            <CompareCell row={compare} overlay={compareOverlay} />
          </div>
          {compare && (
            <p className="compare-why">
              <span>Why different?</span>{" "}
              {whyCountriesDiffer(base, compare, baseOverlay, compareOverlay)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function MatrixEditModal({ row, onClose, onSave }) {
  const [draft, setDraft] = useState({
    ...row,
    confidence: row.confidence ?? 75,
  });

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="matrix-edit-modal" role="dialog" aria-modal="true" aria-label="Edit matrix row directly">
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Edit direct</p>
            <h3>{row.id}: Matrix row</h3>
          </div>
          <button className="small-action" onClick={onClose}>Close</button>
        </div>

        <div className="modal-form-grid">
          <label>
            <span>Risk scenario</span>
            <textarea
              value={draft.riskScenario}
              onChange={(event) => updateField("riskScenario", event.target.value)}
              rows="3"
            />
          </label>
          <label>
            <span>Role evidence</span>
            <textarea
              value={draft.roleEvidence}
              onChange={(event) => updateField("roleEvidence", event.target.value)}
              rows="3"
            />
          </label>
          <label>
            <span>Risk theme</span>
            <select value={draft.riskTheme} onChange={(event) => updateField("riskTheme", event.target.value)}>
              {["AML", "Sanctions", "Fraud", "Documentation", "Governance"].map((theme) => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Risk level</span>
            <select value={draft.riskLevel} onChange={(event) => updateField("riskLevel", event.target.value)}>
              {["Low", "Medium", "High", "Critical"].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Evidence strength</span>
            <input
              type="number"
              min="0"
              max="100"
              value={draft.confidence}
              onChange={(event) => updateField("confidence", Number(event.target.value))}
            />
          </label>
          <label>
            <span>Training depth</span>
            <input
              value={draft.trainingDepth}
              onChange={(event) => updateField("trainingDepth", event.target.value)}
            />
          </label>
          <label className="wide-field">
            <span>Why it matters</span>
            <textarea
              value={draft.whyItMatters}
              onChange={(event) => updateField("whyItMatters", event.target.value)}
              rows="3"
            />
          </label>
          <label className="wide-field">
            <span>Competency need</span>
            <textarea
              value={draft.competencyNeed}
              onChange={(event) => updateField("competencyNeed", event.target.value)}
              rows="3"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary-action" onClick={onClose}>Cancel</button>
          <button className="primary-action compact-action" onClick={() => onSave({ ...draft, humanReview: "edited" })}>
            Save direct edit
          </button>
        </div>
      </section>
    </div>
  );
}

function CompareCell({ row, overlay }) {
  if (!row || !overlay) {
    return <div className="compare-cell empty">No matching row</div>;
  }
  return (
    <div className="compare-cell">
      <div className="compare-role-label">{overlay.flag} {row.localRoleLabel || overlay.name}</div>
      <div className="compare-articles">
        {row.amlrArticles.map((a) => (
          <span key={a.article} className="article-badge">{a.article}</span>
        ))}
        {(row.nationalCitations ?? []).map((cit) => (
          <span key={`${cit.law}-${cit.section}`} className="article-badge national">
            {overlay.flag} {cit.law} {cit.section}
          </span>
        ))}
      </div>
      <small>{row.competencyNeed}</small>
    </div>
  );
}

function whyCountriesDiffer(baseRow, compareRow, baseOverlay, compareOverlay) {
  if (!baseOverlay || !compareOverlay) return "";
  const baseLaws = (baseRow.nationalCitations ?? []).map((c) => `${c.law} ${c.section}`.trim()).join(", ");
  const compareLaws = (compareRow.nationalCitations ?? []).map((c) => `${c.law} ${c.section}`.trim()).join(", ");
  const baseReview = baseOverlay.independentReviewLabel;
  const compareReview = compareOverlay.independentReviewLabel;
  if (baseReview === compareReview) {
    return `Same risk, different national grounding: ${baseOverlay.name} cites ${baseLaws}; ${compareOverlay.name} cites ${compareLaws}.`;
  }
  return `${baseOverlay.name} requires ${baseReview.toLowerCase()} (${baseLaws}); ${compareOverlay.name} requires ${compareReview.toLowerCase()} (${compareLaws}).`;
}

function TrainingView({
  analysis,
  reviseTrainingPlan,
  approveTrainingForLms,
  requestTrainingChanges,
  isLoading,
  loadingMessage,
}) {
  const [trainingInstruction, setTrainingInstruction] = useState("");
  const allModules = analysis.trainingPlan.quarters.flatMap((quarter) => quarter.modules);
  const overlay = analysis.countryOverlay;
  const mandatoryCount = allModules.filter((module) => module.countryMandatory).length;
  const displayQuarters = annotateDuplicateModuleTitles(analysis.trainingPlan.quarters);
  const trainingApproved = analysis.trainingPlan.lmsAssignments.some(
    (assignment) => assignment.approvalStatus === "approved_for_lms",
  );
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
        {overlay && (
          <div>
            <span>{overlay.flag} {overlay.name} mandatory</span>
            <strong>{mandatoryCount} module{mandatoryCount === 1 ? "" : "s"}</strong>
          </div>
        )}
      </div>

      <div className="quarter-grid">
        {displayQuarters.map((quarter) => (
          <section key={quarter.name} className="quarter-band">
            <h3>{quarter.name}</h3>
            <p>{quarter.focus}</p>
            <ul>
              {quarter.modules.map((module) => (
                <li key={module.moduleId || module.title} className={module.countryMandatory ? "module-country-mandatory" : ""}>
                  <strong>
                    {module.countryMandatory && overlay && (
                      <span className="country-tag" title={`Required by ${overlay.name} national law`}>
                        {overlay.flag} National
                      </span>
                    )}
                    {module.displayTitle || module.title}
                  </strong>
                  <span>{module.whyIncluded}</span>
                  <small>{module.assessment}</small>
                  <details className="module-explain">
                    <summary>Evidence and trace</summary>
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

      <section className="review-workspace matrix-review is-bottom" aria-label="Training review workspace">
        <div>
          <p className="section-kicker">Human checkpoint 03</p>
          <h3>Confirm training path before LMS approval</h3>
          <p className="muted-copy">
            Review modules, assessments and LMS assignment first. Then ask AI to adjust the training path or approve it for LMS rollout.
          </p>
        </div>
        <div className="conversation-panel">
          <textarea
            value={trainingInstruction}
            onChange={(event) => setTrainingInstruction(event.target.value)}
            rows="5"
            placeholder="Example: Add more scenario-based assessment for high-risk onboarding and reduce generic AML awareness modules."
          />
          <div className="action-row">
            <button
              className="secondary-action"
              onClick={async () => {
                await reviseTrainingPlan(trainingInstruction);
                setTrainingInstruction("");
              }}
              disabled={isLoading || !trainingInstruction.trim()}
            >
              Apply AI training changes
            </button>
            <button className="secondary-action" onClick={requestTrainingChanges} disabled={isLoading}>
              Request training changes
            </button>
            <button className="primary-action compact-action" onClick={approveTrainingForLms} disabled={isLoading || trainingApproved}>
              {trainingApproved ? "Training approved for LMS" : "Approve training for LMS"}
            </button>
          </div>
          {isLoading && loadingMessage && <WorkingNote message={loadingMessage} />}
        </div>
      </section>
    </div>
  );
}

function AuditView({
  analysis,
  approvedCount,
  downloadAuditPack,
}) {
  const matrixApproved = approvedCount === analysis.riskRegulationMatrix.length;
  const matrixHasRejected = analysis.riskRegulationMatrix.some((row) => row.humanReview === "rejected");
  const roleApproved = analysis.parsedRole?.approvalStatus === "confirmed" || analysis.executionMode === "staged-human-review";
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
            <StatusBadge value={roleApproved ? "role_confirmed" : "in_review"} />
          </div>
          <div className="checkpoint-item">
            <span>02</span>
            <strong>Risk-regulation matrix</strong>
            <small>{approvedCount}/{analysis.riskRegulationMatrix.length} mappings reviewed</small>
            <StatusBadge value={matrixApproved ? matrixHasRejected ? "changes_requested" : "matrix_approved" : "needs_review"} />
          </div>
          <div className="checkpoint-item">
            <span>03</span>
            <strong>Training path</strong>
            <small>{countTrainingModules(analysis.trainingPlan.quarters)} modules ready for LMS review</small>
            <StatusBadge value={trainingApproved ? "approved_for_lms" : "needs_review"} />
          </div>
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
              <dt>Human reviews</dt>
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
  const [activeArtifactType, setActiveArtifactType] = useState("role_information");
  const detail = selectedRun?.result;
  const matrix = detail?.riskRegulationMatrix ?? [];
  const quarters = detail?.trainingPlan?.quarters ?? [];
  const selectedRunId = selectedRun?.run_id;
  const artifactCards = buildHistoryArtifactCards(selectedRun, detail, matrix, quarters);
  const activeArtifact = artifactCards.find((artifact) => artifact.type === activeArtifactType) ?? artifactCards[0];

  useEffect(() => {
    setActiveArtifactType("role_information");
  }, [selectedRunId]);

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
                  {artifactCards.map((artifact) => (
                    <button
                      key={artifact.type}
                      type="button"
                      className={activeArtifact?.type === artifact.type ? "is-selected" : ""}
                      onClick={() => setActiveArtifactType(artifact.type)}
                      aria-pressed={activeArtifact?.type === artifact.type}
                    >
                      <span>{artifact.title}</span>
                      <strong>{artifact.metric}</strong>
                    </button>
                  ))}
                </div>
                {activeArtifact && (
                  <ArtifactInspector type={activeArtifact.type} title={activeArtifact.title} content={activeArtifact.content} />
                )}
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

function buildHistoryArtifactCards(selectedRun, detail, matrix, quarters) {
  if (!selectedRun) return [];
  const artifactsByType = Object.fromEntries(
    (selectedRun.artifacts ?? []).map((artifact) => [artifact.type, artifact.content]),
  );
  const roleInformation = artifactsByType.role_information ?? detail?.roleInformation ?? {
    sourceRole: selectedRun.role ?? detail?.role,
    parsedRole: artifactsByType.parsed_role ?? detail?.parsedRole,
  };
  return [
    {
      type: "role_information",
      title: "Role information",
      metric: roleInformation?.sourceRole?.team || roleInformation?.sourceRole?.persona || "Stored profile",
      content: roleInformation,
    },
    {
      type: "matrix",
      title: "Risk-regulation matrix",
      metric: `${matrix.length} mappings`,
      content: artifactsByType.matrix ?? matrix,
    },
    {
      type: "training_plan",
      title: "Training path",
      metric: `${quarters.length} phases`,
      content: artifactsByType.training_plan ?? detail?.trainingPlan,
    },
    {
      type: "quality_review",
      title: "Quality review",
      metric: `${artifactsByType.quality_review?.overallScore ?? detail?.qualityReview?.overallScore ?? "--"}%`,
      content: artifactsByType.quality_review ?? detail?.qualityReview,
    },
    {
      type: "audit_pack",
      title: "Audit pack",
      metric: `${artifactsByType.audit_pack?.evidenceItems ?? detail?.auditPack?.evidenceItems ?? "--"} evidence items`,
      content: artifactsByType.audit_pack ?? detail?.auditPack,
    },
  ].filter((artifact) => artifact.content);
}

function ArtifactInspector({ type, title, content }) {
  return (
    <section className="artifact-inspector" aria-label={`${title} artifact preview`}>
      <div className="artifact-inspector-heading">
        <p className="section-kicker">Artifact preview</p>
        <h4>{title}</h4>
      </div>
      {type === "role_information" && <RoleInformationOutput data={content} />}
      {type === "matrix" && <MatrixOutput data={content} />}
      {type === "training_plan" && <TrainingOutput data={content} />}
      {type === "quality_review" && <QualityOutput data={content} />}
      {type === "audit_pack" && <AuditPackOutput data={content} />}
    </section>
  );
}

function RoleInformationOutput({ data }) {
  const sourceRole = data?.sourceRole ?? {};
  const parsedRole = data?.parsedRole;
  return (
    <div className="role-artifact">
      <dl className="compact-dl role-artifact-summary">
        <div>
          <dt>Role</dt>
          <dd>{sourceRole.name || parsedRole?.name || "Unknown role"}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{sourceRole.team || parsedRole?.team || "No team specified"}</dd>
        </div>
        <div>
          <dt>Function</dt>
          <dd>{sourceRole.persona || parsedRole?.function || "Not specified"}</dd>
        </div>
        <div>
          <dt>Line of defence</dt>
          <dd>{sourceRole.lineOfDefence || parsedRole?.lineOfDefence || "Not specified"}</dd>
        </div>
      </dl>
      {sourceRole.description && <p className="muted-copy">{sourceRole.description}</p>}
      {sourceRole.tasks?.length > 0 && (
        <div className="agent-output-list">
          {sourceRole.tasks.slice(0, 6).map((task, index) => (
            <div key={`${task}-${index}`}>
              <strong>Source responsibility</strong>
              <p>{task}</p>
            </div>
          ))}
        </div>
      )}
      {parsedRole && <ParsedRoleOutput data={parsedRole} />}
    </div>
  );
}

function AuditPackOutput({ data }) {
  return (
    <div className="agent-output-grid">
      <div className="agent-output-card wide">
        <span>Summary</span>
        <strong>{data.summary}</strong>
        <small>Quality score {data.qualityScore ?? "--"}%</small>
      </div>
      <div className="agent-output-card">
        <span>Evidence items</span>
        <strong>{data.evidenceItems ?? "--"}</strong>
      </div>
      <div className="agent-output-card">
        <span>AMLR coverage</span>
        <strong>{(data.amlrCoverage ?? []).join(", ") || "Pending"}</strong>
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
    role_confirmed: "Role confirmed",
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
  if (value === "role_confirmed") return "role_confirmed";
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

function sortRiskRowsByLevel(rows = []) {
  return [...(rows ?? [])].sort((a, b) => {
    const levelDelta = (riskLevelOrder[a.riskLevel] ?? 99) - (riskLevelOrder[b.riskLevel] ?? 99);
    if (levelDelta !== 0) return levelDelta;
    const confidenceDelta = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (confidenceDelta !== 0) return confidenceDelta;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

function annotateDuplicateModuleTitles(quarters) {
  const seen = new Map();
  const suffixes = ["scenario practice", "evidence review", "assessment lab", "governance check"];
  return quarters.map((quarter) => ({
    ...quarter,
    modules: (quarter.modules ?? []).map((module) => {
      const title = module.title || "Training module";
      const key = title.toLowerCase();
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count === 0) {
        return module;
      }
      return {
        ...module,
        displayTitle: `${title} - ${suffixes[(count - 1) % suffixes.length]}`,
      };
    }),
  }));
}

export default App;
