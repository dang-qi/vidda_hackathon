# NotebookLM podcast prompt — Vidda Compliance Training Engine

How to generate a polished **Audio Overview** in [NotebookLM](https://notebooklm.google.com) that pitches the country-overlay feature for the hackathon submission.

---

## Step 1 — Build the notebook

Create a new notebook in NotebookLM. Add these as sources:

1. **`README.md`** — repo overview, including the "Per-country overlay" section
2. **`PRESENTATION-5MIN.md`** — the spoken script (gives the hosts the narrative arc)
3. **`docs/eu-country-aml-mapping-research.md`** — the regulatory research, so the hosts can speak with depth about Sweden / Spain / Germany differences
4. *(Optional)* the original hackathon brief PDF from `Task/` if you want the hosts to reference the evaluation criteria

You can also add the brief snippets in NotebookLM's "Notes" feature — paste in:
- The evaluation weights (25% explainability, 20% regulatory relevance, etc.)
- The AMLR 2027 deadline
- The three roles you want highlighted (KYC Analyst, Customer Advisor, MLRO)

---

## Step 2 — Use this customisation prompt

When NotebookLM offers to generate the Audio Overview, click **"Customise"** and paste:

> Produce an 8–12 minute conversation between two informed hosts — a fintech product expert and a financial-services compliance specialist — about the Vidda Compliance Training Engine and its per-country regulatory overlay.
>
> **Tone:** professional, curious, slightly admiring. Not a sales pitch. The two hosts genuinely understand AML compliance and respect the complexity of the EU regulatory landscape. They are talking to an audience of compliance officers, RegTech buyers, and EU policy people who already know what AMLR is.
>
> **Structure the discussion in five movements:**
>
> 1. **The 2027 problem.** What AMLR 2024/1624 actually requires from regulated entities. Why role-based training is not the same as generic AML e-learning. Why every member state translating the same EU regulation into different national mechanisms is the real operational headache.
>
> 2. **Why "one country at a time" doesn't scale.** Compare the formalised models (Sweden's central function officer + independent review; Spain's OCI + annual external expert review; Germany's Geldwäschebeauftragter + deputy MLRO) and explain why a per-jurisdiction template approach would explode in maintenance cost.
>
> 3. **What Vidda actually did.** A two-layer architecture: shared EU core (AMLR articles 9–14) plus deterministic country overrides for Sweden, Spain, and Germany. Walk through what a compliance officer sees on screen — same role, three jurisdictions, citations and role labels switching instantly because all three are pre-cached after the first agent run. Mention the side-by-side compare view and the auto-generated "why different?" sentences.
>
> 4. **Why this is hard to copy.** Most AI compliance tools are pure prompt-engineered chatbots; Vidda layers a deterministic post-processor under the LLM so national citations, localised role labels, and country-mandatory training modules are structurally guaranteed even if the model drifts. The human-in-the-loop review is wired through every step with a full audit trail. The two-layer model means a new EU member state ships in hours, not weeks.
>
> 5. **What's next.** Honestly discuss the limitations: only three countries shipped so far; deterministic prefetch trades a small prose-quality difference for instant switching; the more proportional jurisdictions like the Netherlands and Ireland will need a different override pattern. End on the 2027 deadline and the realistic scaling path.
>
> **Specific things to mention by name** so the audience can follow along:
> - AMLR (Anti-Money Laundering Regulation 2024/1624)
> - The five agents: Role Parser, Risk Mapper, Regulation Mapper, Training Designer, Quality Reviewer
> - Sweden's **Lag 2017:630** and **FFFS 2017:11**
> - Spain's **Ley 10/2010**, **RD 304/2014**, and **SEPBLAC**
> - Germany's **GwG** and **BaFin**
> - **Centralt funktionsansvarig**, **Representante ante SEPBLAC**, **Geldwäschebeauftragter + Stellvertreter** — pronounce these in their native languages where comfortable
>
> **Avoid:**
> - Generic AI-disruption talking points ("agents are the future of work")
> - Phrases like "game-changing" or "revolutionary"
> - Speculation about competitors by name
> - Implying the tool is a substitute for a Compliance function — it's an assistant to one
> - Reading lists of features in flat sequence; weave them into conversation
>
> **Banter and personality:** the two hosts disagree productively at least twice — for example, on whether the deterministic-post-processor approach is "cheating" versus "engineering discipline", and on whether three countries is enough for a credible demo. Resolve each disagreement with a substantive answer, not a flat compromise.
>
> Open with the 2027 deadline. Close on how this scales to the remaining 24 member states and why an explainable, audit-ready chain matters more than a clever model.

---

## Step 3 — Shorter variant (4–6 minutes)

If 8–12 minutes is too long for the submission, swap the customisation prompt for this tighter version:

> Produce a 4–6 minute conversation between a fintech product expert and a compliance specialist about the Vidda Compliance Training Engine. Focus on three beats only: (1) why AMLR 2027 makes role-based, country-aware training mandatory; (2) what the per-country overlay actually does on screen — Sweden, Spain, Germany — same role, instant swap, layered national citations on AMLR; (3) why the two-layer architecture and deterministic post-processor matter for audit-readiness. Mention specifically: AMLR 2024/1624, Lag 2017:630 / FFFS 2017:11 for Sweden, Ley 10/2010 / RD 304/2014 / SEPBLAC for Spain, GwG / BaFin for Germany, and the Centralt funktionsansvarig / Representante ante SEPBLAC / Geldwäschebeauftragter role labels. Professional, curious tone — not a sales pitch. Open on the 2027 deadline. Close on how this scales to the remaining 24 member states.

---

## Tips

- **Source quality matters most.** NotebookLM weighs the uploaded sources heavily. If you want a specific point emphasised, put it in writing in a source file. The customisation prompt steers tone and structure; the sources steer factual content.
- **Generate twice.** The first take often misses one of the five movements. Regenerate after adjusting the prompt if a key beat is missing.
- **Trim aggressively in post.** NotebookLM tends to add a 20–30 second wind-down at the end. Cut it for tighter submissions.
- **For the hackathon submission video** you can layer the NotebookLM audio under a 30-second screen recording montage as an intro, or use a 60-second excerpt as a "what others are saying" tonal break before your live demo segment.

---

## Optional follow-up: Q&A audio segment

After the main Audio Overview, NotebookLM lets you ask the hosts follow-up questions. Useful prompts for hackathon judges:

- *"Walk me through exactly what the compliance officer sees on screen when they switch from Sweden to Spain — what changes and why."*
- *"How would Vidda handle a country like the Netherlands where the regulator says 'if appropriate by size'?"*
- *"What's the failure mode if the LLM produces a hallucinated regulation citation?"*
- *"What's the realistic timeline for shipping the remaining 24 EU member states?"*

Each of these gives you a 60–90 second self-contained clip you can use as a deep-dive in a longer pitch deck or B-roll over the live demo.
