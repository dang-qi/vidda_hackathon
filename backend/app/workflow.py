from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


AMLR_ARTICLES = {
    "9": {
        "title": "Scope of internal policies, procedures and controls",
        "summary": "Requires written AML/CFT policies, controls, communication, training policy, monitoring, remediation, and auditability.",
    },
    "10": {
        "title": "Business-wide risk assessment",
        "summary": "Requires documented, up-to-date risk assessment based on risk variables, customer base, products, channels, geographies, and new activity.",
    },
    "11": {
        "title": "Compliance functions",
        "summary": "Defines compliance manager/officer responsibilities, resources, reporting, independence, SAR reporting, and access to information.",
    },
    "12": {
        "title": "Awareness of requirements",
        "summary": "Requires specific, ongoing, function-appropriate training that helps employees recognize suspicious operations and know how to proceed.",
    },
    "13": {
        "title": "Integrity of employees",
        "summary": "Requires assessment of skills, knowledge, expertise, integrity, conflicts, and repeat checks based on role risk.",
    },
    "14": {
        "title": "Reporting of breaches and protection of reporting persons",
        "summary": "Requires internal reporting channels and protection for people reporting breaches.",
    },
}

SOURCE_PACK = [
    {
        "name": "Hackathon challenge overview",
        "file": "Vidda Solutions Learning Program Generation - Hackathon Information for developers.pdf",
        "coverage": "Evaluation criteria, workflow expectations, risk-based training examples and LMS expectations.",
        "status": "Loaded",
    },
    {
        "name": "Role descriptions",
        "file": "Vidda Solutions Learning Program Generation - Role Descriptions Hackathon.pdf",
        "coverage": "Five role profiles with tasks, responsibilities, competencies and inherent AML risk exposure.",
        "status": "Loaded",
    },
    {
        "name": "AMLR 2024/1624 extract",
        "file": "Vidda Solutions Learning Program Generation - AMLR 1624.pdf",
        "coverage": "Articles 9-14 covering controls, risk assessment, compliance functions, training, integrity and breach reporting.",
        "status": "Loaded",
    },
]


ROLE_CATALOG = [
    {
        "id": "kyc-analyst",
        "name": "KYC Analyst",
        "team": "AML/KYC Compliance",
        "persona": "First line financial crime analyst",
        "description": "Verifies customer identities, performs CDD/EDD, investigates beneficial ownership, screens PEPs, sanctions and adverse media, conducts periodic reviews, and escalates suspicious activity.",
        "tasks": [
            "Validate ID, proof of address and corporate records for new clients.",
            "Assess geography, business type and transaction patterns to assign a customer risk rating.",
            "Perform enhanced due diligence for high-risk customers, including source of wealth and source of funds analysis.",
            "Screen customers and related parties against sanctions, PEP and adverse media sources.",
            "Document research, analysis and decisions for audit, risk and compliance review.",
            "Escalate suspicious indicators to Compliance or the MLRO.",
        ],
        "lineOfDefence": "First line control function",
        "riskSignals": ["High-risk customer onboarding", "CDD/EDD judgement", "Beneficial ownership", "Screening decisions", "Documentation and escalation"],
    },
    {
        "id": "customer-advisor",
        "name": "Customer Advisor",
        "team": "Customer Operations",
        "persona": "Customer-facing operations staff",
        "description": "Acts as the primary customer contact, handles onboarding support, account queries, complaint logging, document refreshes, data updates and escalation of unusual customer behaviour.",
        "tasks": [
            "Respond to customer enquiries across phone, email and digital channels.",
            "Guide customers through onboarding and collect identification documentation.",
            "Recognise and escalate potential fraud or unusual customer behaviour.",
            "Log and manage complaints within regulatory timeframes.",
            "Update customer records in line with GDPR and internal data protection policy.",
            "Support outbound contact for reviews and document refresh requests.",
        ],
        "lineOfDefence": "First line customer contact",
        "riskSignals": ["Weak onboarding verification", "High interaction volume", "Fraud red flags", "Escalation dependency", "Customer data handling"],
    },
    {
        "id": "tm-analyst",
        "name": "Transaction Monitoring Analyst",
        "team": "Fraud & Financial Crime / AML DDI",
        "persona": "Alert investigation analyst",
        "description": "Reviews automated transaction monitoring alerts, investigates suspicious patterns, documents case decisions, escalates SAR-threshold cases and contributes to quality assurance.",
        "tasks": [
            "Review daily transaction monitoring alerts against customer risk profiles and expected behaviour.",
            "Investigate flagged activity and gather supporting evidence.",
            "Determine whether alerts should be discounted, monitored or escalated.",
            "Prepare accurate investigation notes and case records for audit purposes.",
            "Escalate SAR-threshold cases to the nominated officer.",
            "Identify typologies and emerging patterns in transaction activity.",
        ],
        "lineOfDefence": "First line financial crime monitoring",
        "riskSignals": ["Missed suspicious alerts", "Alert fatigue", "SAR escalation timing", "Investigation rationale quality", "Typology recognition"],
    },
    {
        "id": "mlro",
        "name": "Money Laundering Reporting Officer",
        "team": "Risk and Compliance",
        "persona": "Senior accountable compliance role",
        "description": "Oversees the financial crime framework, SAR reporting, policy standards, Board reporting, regulatory engagement, risk assessment, training oversight and second line challenge.",
        "tasks": [
            "Design and review Fraud and Financial Crime policies and standards.",
            "Report to senior management and the Board on financial crime risk profile and controls.",
            "Lead group-wide financial crime risk assessment and control effectiveness review.",
            "Review escalations including sanctions, PEP and adverse media decisions.",
            "Investigate, discount or submit suspicious activity reports.",
            "Design and monitor financial crime training content and staff compliance.",
        ],
        "lineOfDefence": "Second line accountable function",
        "riskSignals": ["SAR decision accountability", "Board reporting", "Framework oversight", "Regulatory engagement", "Training governance"],
    },
    {
        "id": "aml-ddi-manager",
        "name": "AML DDI Manager",
        "team": "AML Due Diligence and Investigations",
        "persona": "AML/KYC operations manager",
        "description": "Manages AML/KYC checks on delivery partners and suppliers, oversees alerts and reviews, manages GDPR-related data controls, quality checks and analyst coaching.",
        "tasks": [
            "Manage KYC/AML search process for new requests, alerts, periodic reviews and exits.",
            "Provide business partner support for Delivery Partner AML checks.",
            "Manage data asset register to monitor and control GDPR requirements.",
            "Contribute to internal reporting for AML DDI matters.",
            "Perform operational quality checking and first-line operational risk compliance.",
            "Coach and develop analyst-level team members.",
        ],
        "lineOfDefence": "First line manager with oversight duties",
        "riskSignals": ["Third-party risk", "Periodic review failure", "GDPR and AML data controls", "Quality checking", "Analyst coaching"],
    },
]


ROLE_BY_ID = {role["id"]: role for role in ROLE_CATALOG}


COUNTRY_OVERRIDES: dict[str, dict[str, Any]] = {
    "SE": {
        "code": "SE",
        "name": "Sweden",
        "flag": "🇸🇪",
        "confidence": 88,
        "confidenceRationale": "Swedish law already uses explicit AML functions, documented role-tailored training and an independent review function.",
        "roleLabelMap": {
            "kyc-analyst": "KYC-analytiker (centralt funktionsansvarig)",
            "customer-advisor": "Kundtjänsthandläggare",
            "tm-analyst": "Transaktionsövervakningsanalytiker",
            "mlro": "Centralt funktionsansvarig + särskilt utsedd befattningshavare",
            "aml-ddi-manager": "AML-chef (DDI)",
        },
        "additionalCitations": [
            {"law": "FFFS 2017:11", "section": "Ch. 4 §1-3", "topic": "training cadence and role-tailored coverage"},
            {"law": "Lag 2017:630", "section": "Ch. 6 §1-3", "topic": "central function and independent review"},
        ],
        "trainingFrequencyDefault": "Annual documented role-tailored refresher",
        "independentReviewRequirement": "internal_review_function",
        "independentReviewLabel": "Independent review function (internal)",
        "mandatoryModuleHint": {
            "title": "Independent review evidence pack",
            "quarter": "Q4",
            "whyIncluded": "Required by Lag 2017:630 Ch. 6 — Finansinspektionen expects evidence of role-tailored training and an organisationally independent review function.",
            "assessment": "Evidence pack reviewed by central function officer",
        },
        "sourceLaws": [
            {"title": "Lag (2017:630) on measures against money laundering and terrorist financing", "url": "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2017630-om-atgarder-mot-penningtvatt-och_sfs-2017-630/"},
            {"title": "FFFS 2017:11 — Finansinspektionen's regulations", "url": "https://www.fi.se/contentassets/423320243f35401f97aa85d5562df59c/fs1711.pdf"},
        ],
    },
    "ES": {
        "code": "ES",
        "name": "Spain",
        "flag": "🇪🇸",
        "confidence": 90,
        "confidenceRationale": "Spanish law (Ley 10/2010) explicitly requires an Internal Control Body (OCI), an annual training plan and an annual external expert review.",
        "roleLabelMap": {
            "kyc-analyst": "Analista KYC (representante ante SEPBLAC)",
            "customer-advisor": "Asesor de cliente",
            "tm-analyst": "Analista de monitorización de transacciones",
            "mlro": "OCI + Representante ante SEPBLAC",
            "aml-ddi-manager": "Director de cumplimiento AML",
        },
        "additionalCitations": [
            {"law": "Ley 10/2010", "section": "art. 26", "topic": "Internal Control Body (OCI) and annual training plan"},
            {"law": "RD 304/2014", "section": "art. 28-30", "topic": "annual external expert review"},
            {"law": "SEPBLAC manual", "section": "—", "topic": "supervisor expectations"},
        ],
        "trainingFrequencyDefault": "Annual formal training plan + annual external expert review",
        "independentReviewRequirement": "external_expert_mandatory",
        "independentReviewLabel": "Annual external expert review (mandatory)",
        "mandatoryModuleHint": {
            "title": "External expert review preparation",
            "quarter": "Q4",
            "whyIncluded": "Spanish AML regime requires an annual external expert review (RD 304/2014 art. 28). Staff must be able to evidence the training programme to the external expert.",
            "assessment": "Mock external expert interview + evidence pack",
        },
        "sourceLaws": [
            {"title": "Ley 10/2010 — prevención del blanqueo de capitales", "url": "https://www.boe.es/buscar/act.php?id=BOE-A-2010-6737"},
            {"title": "Real Decreto 304/2014", "url": "https://www.boe.es/buscar/act.php?id=BOE-A-2014-4742"},
        ],
    },
    "DE": {
        "code": "DE",
        "name": "Germany",
        "flag": "🇩🇪",
        "confidence": 85,
        "confidenceRationale": "GwG and BaFin practice already formalise the Geldwäschebeauftragter (MLRO), internal safeguarding measures and structured training paths.",
        "roleLabelMap": {
            "kyc-analyst": "KYC-Analyst (erste Verteidigungslinie)",
            "customer-advisor": "Kundenberater",
            "tm-analyst": "Transaktionsüberwachungs-Analyst",
            "mlro": "Geldwäschebeauftragter + Stellvertreter",
            "aml-ddi-manager": "AML-Abteilungsleiter (DDI)",
        },
        "additionalCitations": [
            {"law": "GwG", "section": "§6 + §7", "topic": "internal safeguarding measures and Geldwäschebeauftragter"},
            {"law": "GwG", "section": "§10", "topic": "customer due diligence requirements"},
            {"law": "BaFin AuA", "section": "—", "topic": "interpretation and application notes"},
        ],
        "trainingFrequencyDefault": "Annual + incident-based with documented evidence",
        "independentReviewRequirement": "internal_audit_with_deputy",
        "independentReviewLabel": "Internal audit + deputy MLRO handover",
        "mandatoryModuleHint": {
            "title": "Deputy MLRO handover protocol",
            "quarter": "Q3",
            "whyIncluded": "GwG §7 requires a deputy Geldwäschebeauftragter; BaFin expects a documented handover protocol ensuring continuity of the MLRO function.",
            "assessment": "Handover simulation reviewed by MLRO",
        },
        "sourceLaws": [
            {"title": "Geldwäschegesetz (GwG)", "url": "https://www.gesetze-im-internet.de/gwg_2017/BJNR182210017.html"},
            {"title": "BaFin — Auslegungs- und Anwendungshinweise zum GwG", "url": "https://www.bafin.de/SharedDocs/Downloads/DE/Auslegungsentscheidung/dl_ae_auas_gw.pdf"},
        ],
    },
}


def get_country_override(country_code: str | None) -> dict[str, Any] | None:
    if not country_code:
        return None
    return COUNTRY_OVERRIDES.get(country_code.upper())


def get_role(role_id: str | None, custom_role: dict[str, Any] | None = None) -> dict[str, Any]:
    if custom_role:
        return {
            "id": "custom-role",
            "name": custom_role.get("name") or "Custom Role",
            "team": custom_role.get("team") or "Imported role",
            "persona": "Imported role description",
            "description": custom_role.get("description") or "",
            "tasks": _split_tasks(custom_role.get("description") or ""),
            "lineOfDefence": "To be confirmed by reviewer",
            "riskSignals": [],
        }
    if not role_id or role_id not in ROLE_BY_ID:
        raise KeyError("Unknown role")
    return ROLE_BY_ID[role_id]


def run_workflow(role: dict[str, Any], country_code: str | None = None) -> dict[str, Any]:
    parsed = role_parser_agent(role)
    risks = risk_mapper_agent(role, parsed)
    matrix = regulation_mapper_agent(risks)
    training = training_designer_agent(role, matrix)
    quality = quality_reviewer_agent(role, matrix, training)

    result: dict[str, Any] = {
        "workflowId": f"wf_{uuid4().hex[:10]}",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "role": {
            "id": role["id"],
            "name": role["name"],
            "team": role["team"],
            "persona": role["persona"],
            "lineOfDefence": role["lineOfDefence"],
        },
        "roleInformation": {
            "sourceRole": role,
            "parsedRole": parsed,
        },
        "agents": [
            {
                "name": "Role Parser Agent",
                "status": "complete",
                "summary": f"Extracted {len(parsed['responsibilities'])} responsibilities and {len(parsed['riskClues'])} risk clues.",
            },
            {
                "name": "Risk Mapper Agent",
                "status": "complete",
                "summary": f"Mapped {len(risks)} role-specific risk exposures across AML, sanctions, fraud, documentation and governance.",
            },
            {
                "name": "Regulation Mapper Agent",
                "status": "complete",
                "summary": "Linked role risks to AMLR Articles 9-14 with explainable evidence.",
            },
            {
                "name": "Training Designer Agent",
                "status": "complete",
                "summary": f"Generated a {len(training['quarters'])}-quarter role-based training path and LMS assignments.",
            },
            {
                "name": "Quality Reviewer Agent",
                "status": "complete",
                "summary": f"Overall confidence score: {quality['overallScore']}%. {len(quality['reviewFlags'])} review flags require human confirmation.",
            },
        ],
        "parsedRole": parsed,
        "riskRegulationMatrix": matrix,
        "trainingPlan": training,
        "qualityReview": quality,
        "auditPack": build_audit_pack(role, matrix, quality),
        "sourcePack": source_pack(),
    }
    apply_country_overrides(result, country_code)
    return result


def role_parser_agent(role: dict[str, Any]) -> dict[str, Any]:
    responsibilities = [
        {
            "text": task,
            "evidence": task,
            "humanReview": "accepted" if role["id"] != "custom-role" else "needs-evidence",
        }
        for task in role["tasks"][:8]
    ]
    return {
        "function": role["persona"],
        "lineOfDefence": role["lineOfDefence"],
        "responsibilities": responsibilities,
        "riskClues": role["riskSignals"] or _infer_risk_clues(role["description"]),
        "decisionAuthority": infer_decision_authority(role),
        "sourceQuality": "provided role pack" if role["id"] != "custom-role" else "user-provided text",
    }


def risk_mapper_agent(role: dict[str, Any], parsed: dict[str, Any]) -> list[dict[str, Any]]:
    templates = {
        "kyc-analyst": [
            risk("AML", "High", "Enhanced due diligence failure", "Handles high-risk customer onboarding, CDD/EDD and source of wealth/source of funds analysis.", "Weak analysis can allow illegitimate customers to remain undetected."),
            risk("Sanctions", "High", "Screening decision error", "Screens customers and related parties against sanctions, PEP and adverse media sources.", "False negatives or poor match rationale can create sanctions and reputational exposure."),
            risk("Documentation", "High", "Audit trail weakness", "Documents research, analysis and escalation decisions.", "Incomplete rationale weakens regulator, audit and MLRO review."),
            risk("Governance", "Medium", "Escalation judgement", "Escalates suspicious indicators to Compliance or the MLRO.", "Failure to escalate breaks the chain of defence."),
        ],
        "customer-advisor": [
            risk("AML", "Medium", "Onboarding verification weakness", "Guides customers through onboarding and collects identification documentation.", "Weak front-door verification can allow illegitimate customers to enter."),
            risk("Fraud", "High", "Missed social engineering or unusual behaviour", "Recognises and escalates potential fraud or unusual customer behaviour.", "Customer-facing staff may be targeted or may miss subtle red flags."),
            risk("Documentation", "Medium", "Customer record inaccuracy", "Updates customer records and logs complaints.", "Poor records undermine due diligence refreshes and complaint audit trails."),
            risk("Governance", "Medium", "Escalation protocol dependency", "Relies on procedures to escalate unusual behaviour.", "The role needs clear thresholds and confidence to proceed correctly."),
        ],
        "tm-analyst": [
            risk("AML", "High", "Incorrect alert disposition", "Reviews transaction monitoring alerts against profiles and expected behaviour.", "Missed alerts directly enable layering and integration."),
            risk("Fraud", "Medium", "Emerging typology blind spot", "Identifies typologies and emerging patterns in transaction activity.", "Fraud and AML patterns can overlap and evolve quickly."),
            risk("Documentation", "High", "Poor investigation rationale", "Prepares investigation notes and case records for audit purposes.", "Weak notes reduce SAR quality and make decisions hard to defend."),
            risk("Governance", "High", "Late SAR escalation", "Escalates SAR-threshold cases to the nominated officer.", "Delay can breach reporting expectations and internal SLA controls."),
        ],
        "mlro": [
            risk("Governance", "Critical", "Framework oversight failure", "Designs and reviews financial crime policies, standards and control effectiveness.", "Blind spots cascade across all lines of defence."),
            risk("AML", "Critical", "SAR decision failure", "Investigates, discounts or submits suspicious activity reports.", "Wrong SAR decisions carry severe regulatory and personal accountability exposure."),
            risk("Documentation", "High", "Board MI inaccuracy", "Reports to senior management and the Board on financial crime risk profile and controls.", "Inaccurate MI can lead to flawed strategic decisions."),
            risk("Sanctions", "High", "Escalation approval error", "Reviews sanctions, PEP and adverse media escalations.", "High-risk approval decisions must align with policy and risk appetite."),
            risk("Governance", "High", "Training governance gap", "Designs and monitors financial crime training content and staff compliance.", "Training coverage must be risk-based, documented and monitored."),
        ],
        "aml-ddi-manager": [
            risk("AML", "High", "Third-party due diligence weakness", "Manages KYC/AML checks on delivery partners and suppliers.", "Third-party relationships are a known financial crime vulnerability."),
            risk("Documentation", "High", "Periodic review control gap", "Manages periodic reviews, alerts, closures and exits.", "Lapsed reviews can leave non-compliant partners active."),
            risk("Governance", "High", "Quality assurance propagation", "Performs quality checking and coaches analysts.", "Managerial errors can propagate across analyst decisions."),
            risk("Documentation", "Medium", "Data control weakness", "Manages data asset register and GDPR-related controls.", "Data failures create dual AML and privacy exposure."),
        ],
    }
    if role["id"] in templates:
        return templates[role["id"]]

    inferred = []
    text = " ".join([role["description"], *role["tasks"]]).lower()
    if any(word in text for word in ["customer", "onboarding", "kyc", "due diligence"]):
        inferred.append(risk("AML", "Medium", "Customer due diligence exposure", role["description"][:220], "The role appears to touch onboarding or due diligence activity."))
    if any(word in text for word in ["sanction", "pep", "screening"]):
        inferred.append(risk("Sanctions", "High", "Screening exposure", role["description"][:220], "The role appears to participate in sanctions or PEP screening."))
    if any(word in text for word in ["report", "board", "policy", "compliance"]):
        inferred.append(risk("Governance", "Medium", "Compliance governance exposure", role["description"][:220], "The role appears to own compliance reporting or policy responsibilities."))
    if not inferred:
        inferred.append(risk("Documentation", "Medium", "General compliance documentation exposure", role["description"][:220], "The source role requires human confirmation before training assignment."))
    return inferred


def regulation_mapper_agent(risks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for index, item in enumerate(risks, start=1):
        articles = map_articles(item)
        rows.append(
            {
                "id": f"map-{index}",
                "riskTheme": item["theme"],
                "riskLevel": item["level"],
                "riskScenario": item["scenario"],
                "roleEvidence": item["evidence"],
                "whyItMatters": item["impact"],
                "amlrArticles": articles,
                "competencyNeed": competency_for(item),
                "trainingDepth": depth_for_level(item["level"]),
                "confidence": confidence_for(item),
                "humanReview": "needs-review" if item["level"] in ["Critical", "High"] else "accepted",
            }
        )
    rows.sort(key=lambda r: r.get("confidence", 0), reverse=True)
    return rows


def training_designer_agent(role: dict[str, Any], matrix: list[dict[str, Any]]) -> dict[str, Any]:
    modules = role_specific_modules(role["id"], matrix)
    quarters = [
        {
            "name": "Q1 Foundation",
            "focus": "Build regulatory literacy and role-specific risk awareness.",
            "modules": modules[:3],
        },
        {
            "name": "Q2 Application",
            "focus": "Apply standards through role scenarios and documented decisions.",
            "modules": modules[3:6],
        },
        {
            "name": "Q3 Deepening",
            "focus": "Handle complex cases, edge conditions and cross-functional escalation.",
            "modules": modules[6:9],
        },
        {
            "name": "Q4 Embedding",
            "focus": "Evidence behavioural change through QA, assessment and refresh planning.",
            "modules": modules[9:12],
        },
    ]
    training = {
        "title": f"{role['name']} role-based AMLR training path",
        "philosophy": "Risk exposure drives depth; AMLR traceability drives content; human approval preserves accountability.",
        "quarters": quarters,
        "lmsAssignments": [
            {
                "learnerGroup": role["name"],
                "status": "Ready for approval",
                "approvalStatus": "draft",
                "lmsStatus": "Not assigned",
                "owner": "Compliance Manager",
                "dueWindow": "Year 1 phased rollout",
                "mandatoryModules": len(modules),
                "assessment": "Scenario-based competency check",
                "refreshCycle": "Annual, or earlier after regulation, typology or internal finding changes",
            }
        ],
    }
    return enrich_training_plan(training, matrix)


def quality_reviewer_agent(role: dict[str, Any], matrix: list[dict[str, Any]], training: dict[str, Any]) -> dict[str, Any]:
    article_count = len({article["article"] for row in matrix for article in row["amlrArticles"]})
    high_risk_rows = len([row for row in matrix if row["riskLevel"] in ["High", "Critical"]])
    review_flags = [
        {
            "severity": "high",
            "message": f"{row['riskScenario']} is {row['riskLevel'].lower()} risk and should be explicitly approved by a compliance reviewer.",
            "target": row["id"],
        }
        for row in matrix
        if row["humanReview"] == "needs-review"
    ]
    if role["id"] == "custom-role":
        review_flags.append(
            {
                "severity": "medium",
                "message": "Custom role source text needs reviewer confirmation before LMS rollout.",
                "target": "role-source",
            }
        )
    regulatory = min(100, 58 + article_count * 9)
    specificity = min(100, 64 + len(matrix) * 6)
    evidence = min(100, 66 + len([row for row in matrix if row["roleEvidence"]]) * 5)
    human_ready = max(55, 92 - high_risk_rows * 5)
    overall = round((regulatory * 0.3) + (specificity * 0.25) + (evidence * 0.25) + (human_ready * 0.2))
    return {
        "overallScore": overall,
        "dimensions": [
            {"name": "Regulatory coverage", "score": regulatory},
            {"name": "Role specificity", "score": specificity},
            {"name": "Evidence strength", "score": evidence},
            {"name": "Human review readiness", "score": human_ready},
        ],
        "reviewFlags": review_flags,
        "gapAnalysis": [
            "Confirm high-risk mappings before LMS assignment.",
            "Add organisation-specific policy references before production use.",
            "Run annual refresh when AMLR, internal typologies or QA findings change.",
        ],
    }


def build_audit_pack(role: dict[str, Any], matrix: list[dict[str, Any]], quality: dict[str, Any]) -> dict[str, Any]:
    return {
        "summary": f"{role['name']} training is traceable from role responsibilities to risk exposure, AMLR obligations and competency outcomes.",
        "evidenceItems": len(matrix),
        "amlrCoverage": sorted({article["article"] for row in matrix for article in row["amlrArticles"]}),
        "humanApprovalRequired": len([row for row in matrix if row["humanReview"] == "needs-review"]),
        "qualityScore": quality["overallScore"],
    }


def map_articles(item: dict[str, Any]) -> list[dict[str, str]]:
    mapping = {
        "AML": ["9", "10", "12"],
        "Sanctions": ["9", "11", "12"],
        "Fraud": ["9", "10", "12"],
        "Documentation": ["9", "12", "13"],
        "Governance": ["9", "11", "12"],
    }
    article_ids = mapping.get(item["theme"], ["9", "12"])
    if item["level"] == "Critical" and "13" not in article_ids:
        article_ids.append("13")
    return [
        {
            "article": f"Article {article_id}",
            "title": AMLR_ARTICLES[article_id]["title"],
            "rationale": AMLR_ARTICLES[article_id]["summary"],
        }
        for article_id in article_ids
    ]


def role_specific_modules(role_id: str, matrix: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = [
        ("AMLR role obligations briefing", "Article trace: Articles 9, 10, 11 and 12", "Knowledge check"),
        ("Risk-based decision making", "Explains how role risk changes training depth", "Scenario quiz"),
        ("Escalation and reporting standards", "Shows when and how to proceed on suspicious activity", "Escalation simulation"),
        ("Documentation and audit trail writing", "Builds regulator-ready reasoning", "Case note assessment"),
    ]
    role_modules = {
        "kyc-analyst": [
            ("CDD and EDD case handling", "Mapped to high-risk onboarding and EDD exposure", "EDD file review"),
            ("Beneficial ownership and control structures", "Mapped to complex ownership risk", "Ownership chart exercise"),
            ("Source of funds and source of wealth narratives", "Mapped to plausibility judgement", "Narrative challenge"),
            ("PEP, sanctions and adverse media screening", "Mapped to screening decision risk", "False-positive rationale"),
        ],
        "customer-advisor": [
            ("Front-line AML/KYC awareness", "Mapped to onboarding and document collection", "Customer scenario quiz"),
            ("Fraud red flags in customer contact", "Mapped to social engineering and unusual behaviour", "Call scenario"),
            ("Tipping-off awareness", "Mapped to safe customer communication", "Conversation simulation"),
            ("Vulnerable customer and data handling", "Mapped to GDPR and customer trust exposure", "Manager review"),
        ],
        "tm-analyst": [
            ("Transaction monitoring workflow", "Mapped to alert disposition risk", "Alert triage exercise"),
            ("Suspicious pattern and typology recognition", "Mapped to emerging AML/fraud typologies", "Pattern analysis"),
            ("SAR threshold and escalation timing", "Mapped to nominated officer escalation", "Timed case decision"),
            ("Investigation note quality", "Mapped to audit and SAR quality", "QA sampling"),
        ],
        "mlro": [
            ("AML framework ownership and governance", "Mapped to Article 11 compliance function duties", "Framework review"),
            ("SAR decision oversight", "Mapped to accountable reporting duties", "Decision board"),
            ("Board MI and regulator briefing", "Mapped to governance and external accountability", "Board memo"),
            ("Training governance and effectiveness monitoring", "Mapped to AMLR Article 12 documented training", "Coverage review"),
        ],
        "aml-ddi-manager": [
            ("Third-party AML/KYC due diligence", "Mapped to delivery partner and supplier risk", "Partner file review"),
            ("Periodic review control management", "Mapped to lapsed review risk", "Control checklist"),
            ("Quality assurance calibration", "Mapped to analyst coaching and QA duties", "Calibration workshop"),
            ("Data asset and evidence handling", "Mapped to AML documentation and GDPR exposure", "Record review"),
        ],
    }
    modules = base + role_modules.get(role_id, [])
    while len(modules) < 12:
        row = matrix[(len(modules) - len(base)) % len(matrix)]
        modules.append(
            (
                f"{row['riskScenario']} practical lab",
                f"Mapped to {row['riskTheme']} {row['riskLevel'].lower()} risk",
                row["competencyNeed"],
            )
        )
    return [
        module_with_trace(title, why, assessment, matrix, index)
        for index, (title, why, assessment) in enumerate(modules[:12])
    ]


def module_with_trace(
    title: str,
    why: str,
    assessment: str,
    matrix: list[dict[str, Any]],
    index: int,
) -> dict[str, Any]:
    row = matrix[index % len(matrix)]
    articles = [article["article"] for article in row["amlrArticles"]]
    return {
        "moduleId": f"module-{index + 1}",
        "title": title,
        "whyIncluded": why,
        "whyExpanded": (
            f"Assigned because the role has {row['riskLevel'].lower()} {row['riskTheme'].lower()} "
            f"exposure: {row['riskScenario']}. The module builds the competency needed to "
            f"{row['competencyNeed'].lower()}"
        ),
        "sourceRiskId": row["id"],
        "roleEvidence": row["roleEvidence"],
        "amlrTrace": articles,
        "competencyNeed": row["competencyNeed"],
        "competencyType": competency_type_for(title, row),
        "assessment": assessment,
        "approvalStatus": "draft",
        "lmsStatus": "Pending approval",
    }


def enrich_training_plan(training: dict[str, Any], matrix: list[dict[str, Any]]) -> dict[str, Any]:
    if not matrix:
        return training
    module_index = 0
    for quarter in training.get("quarters", []):
        enriched_modules = []
        for module in quarter.get("modules", []):
            row = matrix[module_index % len(matrix)]
            articles = [article["article"] for article in row.get("amlrArticles", [])]
            module = {
                **module,
                "moduleId": module.get("moduleId") or f"module-{module_index + 1}",
                "whyExpanded": module.get("whyExpanded") or (
                    f"Assigned because the role evidence maps to {row['riskScenario']} "
                    f"and requires {row['competencyNeed'].lower()}"
                ),
                "sourceRiskId": module.get("sourceRiskId") or row["id"],
                "roleEvidence": module.get("roleEvidence") or row["roleEvidence"],
                "amlrTrace": module.get("amlrTrace") or articles,
                "competencyNeed": module.get("competencyNeed") or row["competencyNeed"],
                "competencyType": module.get("competencyType") or competency_type_for(module.get("title", ""), row),
                "approvalStatus": module.get("approvalStatus") or "draft",
                "lmsStatus": module.get("lmsStatus") or "Pending approval",
            }
            enriched_modules.append(module)
            module_index += 1
        quarter["modules"] = enriched_modules
    for assignment in training.get("lmsAssignments", []):
        assignment.setdefault("approvalStatus", "draft")
        assignment.setdefault("lmsStatus", "Not assigned")
        assignment.setdefault("owner", "Compliance Manager")
        assignment.setdefault("dueWindow", "Year 1 phased rollout")
    ensure_unique_module_titles(training)
    return training


def ensure_unique_module_titles(training: dict[str, Any]) -> None:
    seen: dict[str, int] = {}
    suffixes = ["scenario practice", "evidence review", "assessment lab", "governance check"]
    for quarter in training.get("quarters", []):
        for module in quarter.get("modules", []):
            title = str(module.get("title") or "Training module").strip()
            key = title.lower()
            count = seen.get(key, 0)
            if count:
                suffix = suffixes[(count - 1) % len(suffixes)]
                module["title"] = f"{title} - {suffix}"
            seen[key] = count + 1


def apply_country_overrides(result: dict[str, Any], country_code: str | None) -> dict[str, Any]:
    """Layer country-specific national-law context onto a workflow result.

    Additive only — never replaces existing AMLR fields. Idempotent: re-applying
    the same country code does not duplicate the mandatory module.
    """
    override = get_country_override(country_code)
    if not override:
        return result

    result["countryOverlay"] = {
        "code": override["code"],
        "name": override["name"],
        "flag": override["flag"],
        "confidence": override["confidence"],
        "confidenceRationale": override["confidenceRationale"],
        "trainingFrequencyDefault": override["trainingFrequencyDefault"],
        "independentReviewRequirement": override["independentReviewRequirement"],
        "independentReviewLabel": override["independentReviewLabel"],
        "additionalCitations": override["additionalCitations"],
        "sourceLaws": override["sourceLaws"],
    }

    role_id = result.get("role", {}).get("id", "")
    local_role_label = override["roleLabelMap"].get(role_id, "")

    for row in result.get("riskRegulationMatrix", []) or []:
        row["nationalCitations"] = [
            {
                "law": cit["law"],
                "section": cit["section"],
                "topic": cit["topic"],
                "rationale": f"{cit['law']} {cit['section']} layers {cit['topic']} requirements on top of AMLR for {override['name']}.",
            }
            for cit in override["additionalCitations"]
        ]
        if local_role_label:
            row["localRoleLabel"] = local_role_label

    training = result.get("trainingPlan", {}) or {}
    quarters = training.get("quarters", []) or []
    hint = override["mandatoryModuleHint"]
    target_quarter = next(
        (q for q in quarters if q.get("name", "").upper().startswith(hint["quarter"].upper())),
        quarters[-1] if quarters else None,
    )
    if target_quarter is not None:
        module_id = f"country-{override['code'].lower()}-mandatory"
        modules = target_quarter.get("modules", []) or []
        already_present = any(m.get("moduleId") == module_id for m in modules)
        if not already_present:
            modules.append({
                "moduleId": module_id,
                "title": hint["title"],
                "whyIncluded": hint["whyIncluded"],
                "whyExpanded": hint["whyIncluded"],
                "amlrTrace": [cit["law"] for cit in override["additionalCitations"]],
                "competencyNeed": "Country-mandatory compliance evidence",
                "competencyType": "Knowledge",
                "assessment": hint["assessment"],
                "approvalStatus": "draft",
                "lmsStatus": "Country-required — pending approval",
                "countryMandatory": True,
                "countryCode": override["code"],
            })
            target_quarter["modules"] = modules

    if local_role_label:
        for assignment in training.get("lmsAssignments", []) or []:
            assignment["learnerGroup"] = local_role_label

    return result


def competency_type_for(title: str, row: dict[str, Any]) -> str:
    text = f"{title} {row.get('competencyNeed', '')}".lower()
    if any(word in text for word in ["judge", "decision", "rationale", "escalation", "scenario"]):
        return "Judgement"
    if any(word in text for word in ["write", "documentation", "case", "screening", "analysis", "workflow"]):
        return "Skill"
    return "Knowledge"


def source_pack() -> list[dict[str, str]]:
    return [dict(source) for source in SOURCE_PACK]


def risk(theme: str, level: str, scenario: str, evidence: str, impact: str) -> dict[str, str]:
    return {
        "theme": theme,
        "level": level,
        "scenario": scenario,
        "evidence": evidence,
        "impact": impact,
    }


def competency_for(item: dict[str, Any]) -> str:
    theme = item["theme"]
    if theme == "AML":
        return "Recognise AML risk, apply risk-based judgement, and escalate suspicious indicators."
    if theme == "Sanctions":
        return "Interpret screening results, document match rationale, and manage sanctions escalation."
    if theme == "Fraud":
        return "Detect unusual behaviour and fraud typologies, then follow escalation protocol."
    if theme == "Documentation":
        return "Write clear, complete and regulator-ready decision rationales."
    if theme == "Governance":
        return "Operate controls, reporting lines and accountability mechanisms consistently."
    return "Apply role-specific AMLR requirements in day-to-day work."


def depth_for_level(level: str) -> str:
    return {
        "Critical": "Expert pathway with simulation, QA and senior sign-off",
        "High": "Deep pathway with applied scenarios and competency assessment",
        "Medium": "Standard pathway with scenario checks and annual refresh",
        "Low": "Awareness pathway with knowledge check",
    }.get(level, "Standard pathway")


def confidence_for(item: dict[str, Any]) -> int:
    base = {"Critical": 89, "High": 84, "Medium": 77, "Low": 69}.get(item["level"], 72)
    return min(95, base + (4 if item["evidence"] else 0))


def infer_decision_authority(role: dict[str, Any]) -> str:
    text = " ".join([role["name"], role["description"], *role["tasks"]]).lower()
    if "mlro" in text or "board" in text or "policy" in text:
        return "High: owns or approves governance, SAR, policy or Board-level decisions."
    if "manager" in text or "quality" in text or "coach" in text:
        return "Medium-high: oversees quality and directs analyst behaviour."
    if "escalate" in text or "determine" in text or "review" in text:
        return "Medium: makes case decisions and escalation recommendations."
    return "Low-medium: identifies issues and follows escalation protocols."


def _split_tasks(description: str) -> list[str]:
    sentences = [part.strip(" .") for part in description.replace("\n", " ").split(".") if part.strip()]
    return sentences[:8] or ["Review source role text and confirm responsibilities."]


def _infer_risk_clues(description: str) -> list[str]:
    text = description.lower()
    clues = []
    for keyword, label in [
        ("customer", "Customer exposure"),
        ("onboarding", "Onboarding exposure"),
        ("sanction", "Sanctions exposure"),
        ("fraud", "Fraud exposure"),
        ("report", "Reporting exposure"),
        ("policy", "Policy exposure"),
        ("data", "Data handling exposure"),
    ]:
        if keyword in text:
            clues.append(label)
    return clues or ["Needs human review"]
