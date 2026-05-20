# Vidda Compliance Training Engine — 5-minute presentation

A ready-to-read script for the live demo or recorded video. Italics are stage directions; everything else is what you say. Total target: **5:00**.

---

## 0:00 — Hook (15 s)

> EU's new Anti-Money Laundering Regulation, **AMLR 2024/1624**, takes full effect in 2027. Every regulated bank in Europe has to prove that **every employee** has training that matches their **actual role risk** — and they have to prove it to a national supervisor in the local language.
>
> Doing that by hand, for thousands of roles across multiple jurisdictions, is the problem we automated.

*Bring up the app on the role intake page.*

---

## 0:15 — The setup (30 s)

> This is the Vidda Compliance Training Engine. Five AI agents take a role description, derive the financial-crime risk it carries, map that risk to AMLR articles, design a year-long training path, and a fifth agent reviews the output for quality and audit-readiness.
>
> Everything is **explainable** — every training module carries a chain back to a specific role risk and a specific regulatory article. That's what makes it auditable, and that's what makes it the opposite of generic compliance e-learning.

*Click on the KYC Analyst role card. Pull attention to the role-card grid and then to the country picker just below.*

---

## 0:45 — The country picker is the differentiator (20 s)

> Here's what nobody else has. The same EU regulation **lands differently in every member state**. Sweden uses an internal review function. Spain mandates an annual external expert audit. Germany requires a deputy MLRO with a documented handover protocol.
>
> So the user picks a jurisdiction — Sweden, Spain, or Germany — and we layer that country's national law on top of the EU core.

*Pick 🇸🇪 Sweden. Click "Run multi-agent workflow".*

---

## 1:05 — The agents run (40 s — narrate over the LLM call)

> Watch the five agents work in sequence. The Role Parser pulls the responsibilities. The Risk Mapper turns those into risk exposures. The Regulation Mapper links each risk to AMLR articles 9 through 14. The Training Designer produces a four-quarter plan. And the Quality Reviewer scores the output before it ever reaches a human.
>
> While they run — three things to notice. First, every step is a structured, JSON-validated output, not free text. Second, every claim cites its source. Third, when the LLM finishes, we **deterministically** layer national law on top — so the country-specific guarantees hold even if the model has a bad day.

*The matrix appears around 1:45 — switch to it.*

---

## 1:45 — The matrix with the Swedish overlay (30 s)

> Here's the result for Sweden. The blue badges are AMLR — articles 11, 12, 13. The **amber badges** are Sweden's national law: **FFFS 2017:11** and **Lag 2017:630**, layered on top of the EU article that already covers it.
>
> The role label here is the Swedish title — **Centralt funktionsansvarig** — because that's what shows up in the Swedish LMS. And every row has a confidence score and a human-review state — accepted, needs review, edited, rejected — fully audited.

*Hover over a national badge to show the tooltip with the "why" rationale.*

---

## 2:15 — The instant country swap (35 s)

> Now watch this. Same role, same EU regulation — but I'm going to switch the jurisdiction.

*Click 🇪🇸 Spain in the "Switch jurisdiction (cached, instant)" row.*

> Instant. The banner re-colors to Spanish red and yellow. The citations swap from FFFS to **Ley 10/2010** and **RD 304/2014**. The role label becomes **Representante ante SEPBLAC** — the Spanish supervisor.
>
> No backend re-run. We pre-cached all three countries when the first analysis completed — about 250 milliseconds per country — so the user can demonstrate the entire EU compliance landscape without ever waiting for an agent.

*Click 🇩🇪 Germany.*

> Germany — black, red, gold. **GwG paragraphs 6, 7, 10**. Role becomes **erste Verteidigungslinie**. Same role, same risk, three completely different regulatory footprints — and a human compliance officer can see exactly **why** each citation applies.

---

## 2:50 — Side-by-side compare (35 s)

> But the real demo moment is this. Compliance teams don't want to swap between views — they want to see two jurisdictions next to each other.

*Click the "🇪🇸 vs 🇩🇪" compare chip.*

> Same five risk rows, both countries side-by-side. And under each row, there's an auto-generated **"Why different?"** sentence — "Spain requires annual external expert review under Ley 10/2010; Germany requires internal audit plus a deputy MLRO under GwG §7."
>
> That sentence isn't from the LLM. It's generated from the structural difference in the two countries' override data — which means it's accurate, citable, and never hallucinates.

---

## 3:25 — Training plan with country-mandatory module (30 s)

*Click the Training tab.*

> And the training plan itself adapts. Here's the four-quarter path, with the EU-core modules plus — highlighted in amber — a **country-mandatory** module that's required by national law and nothing else.
>
> For Spain, that's "External expert review preparation" in Q4. For Germany, it would be the "Deputy MLRO handover protocol" in Q3, because GwG §7 requires a documented deputy. **Different country, different mandatory training, automatically.**
>
> Every module has its own "why" trace — clickable, drillable, linked back to the role risk and AMLR article that justifies it.

---

## 3:55 — The human-in-the-loop and audit-readiness (30 s)

> Crucially this is **not** a chatbot. Every output is a draft that a compliance officer reviews. Each row in the matrix can be accepted, edited directly, edited via natural-language instruction, or rejected. Every action is persisted to a SQLite audit table with before-and-after snapshots.
>
> When the team approves the matrix, the training agent runs. When they approve the training, the LMS assignments get marked ready. There's a downloadable **audit pack** that any national supervisor can ingest as evidence of compliance.

*Briefly open the Audit & Quality tab to show the quality dimensions and coverage score.*

---

## 4:25 — Why this is proprietary (25 s)

> Three things competitors can't easily copy.
>
> One: the **two-layer architecture** — a shared EU core with country overrides — means we add a new member state in hours, not weeks. We've shipped three. The same pattern scales to all 27.
>
> Two: the **deterministic post-processing layer** under the LLM. Citations, role labels, and mandatory modules are structurally guaranteed. Most AI training tools are pure prompt engineering and break under regulator scrutiny.
>
> Three: the **explainability chain** — role evidence → risk → AMLR article → national law → competency → module. Every step traceable, every claim citable.

---

## 4:50 — Close (10 s)

> One regulation. Three jurisdictions. Five agents. A compliance officer can see the entire EU AML landscape for any role in under a minute, with audit-ready evidence at every step.
>
> That's how you meet the 2027 deadline without a hundred new compliance hires.

*End screen.*

---

## Cheat-sheet — visible deltas to point at

| Field | 🇸🇪 Sweden | 🇪🇸 Spain | 🇩🇪 Germany |
|---|---|---|---|
| Banner colour | blue/yellow | red/yellow | black/red/gold |
| Confidence | 88% | 90% | 85% |
| National law citations | FFFS 2017:11 · Lag 2017:630 | Ley 10/2010 · RD 304/2014 · SEPBLAC | GwG §6+§7 · GwG §10 · BaFin AuA |
| Local role label (KYC Analyst) | Centralt funktionsansvarig | Representante ante SEPBLAC | erste Verteidigungslinie |
| Training cadence default | Annual documented role-tailored refresher | Annual plan + external expert review | Annual + incident-based, evidence-heavy |
| Independent review | Internal review function | External expert mandatory | Internal audit + deputy MLRO |
| Country-mandatory module | Independent review evidence pack (Q4) | External expert review preparation (Q4) | Deputy MLRO handover protocol (Q3) |

## Cheat-sheet — questions you might get

| Likely question | Short answer |
|---|---|
| What if the LLM hallucinates a citation? | Citations are structurally enforced by a deterministic post-processor — the LLM cannot invent a national law. |
| How do you add a new country? | Add an entry to `COUNTRY_OVERRIDES` in `backend/app/workflow.py` — about 30 lines of structured data, no model retraining. |
| Why three countries? | We picked the three with the highest source-confidence (88, 90, 85%) from the EU jurisdiction research. The architecture supports all 27. |
| How long for a full run? | ~12–15 s for the first LLM run; instant for every subsequent country swap from cache. |
| Could a compliance officer use it without a developer? | Yes — every step has a human-review checkpoint with edit-direct and edit-via-AI options. No code required. |
| What about updates when regulations change? | The country overrides are versioned data. Updating `COUNTRY_OVERRIDES` triggers re-evaluation; the deterministic re-run is sub-second. |
