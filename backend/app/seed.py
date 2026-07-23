"""Seed the database with enterprise policy suites, workspaces, users and
synthetic history. Schema v2: if a v1 database is detected it is rebuilt
(the platform ships with synthetic demo data only)."""
import random
from datetime import datetime, timedelta

from sqlalchemy import inspect

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .models import (
    SCHEMA_VERSION, Application, AuditLog, PolicySuite, PromptLog, SchemaMeta,
    User, Violation,
)

ALL_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"]
ALL_FILE_TYPES = ["pdf", "docx", "txt", "md", "csv", "xlsx", "json", "xml",
                  "zip", "png", "jpg", "mp3", "mp4", "py", "java", "cpp",
                  "js", "ts", "html", "css", "sql"]
BASIC_FILE_TYPES = ["pdf", "docx", "txt", "md", "csv", "png"]
RAILS_FULL = {"input_rails": True, "output_rails": True, "dialog_rails": True,
              "topical_rails": True, "self_check": True}
RAILS_STANDARD = {"input_rails": True, "output_rails": True,
                  "dialog_rails": False, "topical_rails": True,
                  "self_check": False}

ALL_ROLES = ["Admin", "Manager", "HR", "Healthcare", "Finance", "Developer",
             "Education", "Business", "Travel", "Food", "General User"]


def _guards(financial=False, compliance=True, toxicity=True):
    return {"injection": True, "jailbreak": True, "pii": True, "secrets": True,
            "compliance": compliance, "toxicity": toxicity,
            "financial": financial}


# The eight enterprise default policy suites
POLICIES = [
    dict(
        name="Open Policy", category="general", risk_level="low",
        description=("Lowest-restriction suite for public experimentation, "
                     "research, brainstorming and creative work. Minimal "
                     "filtering, light compression, highest creativity — "
                     "confidential data is not allowed here."),
        authority_levels=["intern", "employee", "senior", "manager", "admin"],
        roles=ALL_ROLES,
        guardrails=_guards(compliance=False, toxicity=True),
        rails_config=RAILS_STANDARD,
        blocked_topics=["confidential", "internal only", "trade secret"],
        compliance_tags=[],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["search", "summarize", "export", "brainstorm"],
        max_tokens=8192, compression_level="low", compression_target=10,
        upload_max_mb=25, logging_level="minimal",
        response_strictness="relaxed", temperature_limit=1.0,
    ),
    dict(
        name="Client Collaboration Policy", category="client", risk_level="medium",
        description=("For client meetings, proposals, presentations and "
                     "business conversations. Medium guardrails, professional "
                     "tone, PII masking, confidentiality reminders and full "
                     "conversation logging."),
        authority_levels=["intern", "employee", "senior", "manager", "director", "admin"],
        roles=ALL_ROLES,
        guardrails=_guards(),
        rails_config=RAILS_STANDARD,
        blocked_topics=["unreleased pricing", "internal margins"],
        compliance_tags=["NDA"],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["search", "summarize", "export", "present"],
        max_tokens=4096, compression_level="medium", compression_target=20,
        upload_max_mb=50, logging_level="verbose",
        response_strictness="professional", temperature_limit=0.7,
    ),
    dict(
        name="Budget & Procurement Policy", category="finance", risk_level="high",
        description=("Finance, purchasing, invoices, expense reports and "
                     "vendor communication. Strong financial compliance, "
                     "sensitive-number detection, spreadsheet optimization, "
                     "audit logging and restricted tool access."),
        authority_levels=["manager", "director", "admin"],
        roles=["Finance", "Manager", "Admin", "Business"],
        guardrails=_guards(financial=True),
        rails_config=RAILS_FULL,
        blocked_topics=["insider trading", "front running", "kickback"],
        compliance_tags=["SOX", "PCI-DSS"],
        allowed_file_types=["pdf", "csv", "xlsx", "xls", "json", "docx", "txt"],
        allowed_models=ALL_MODELS[1:],
        tool_permissions=["summarize", "export"],
        max_tokens=4096, compression_level="high", compression_target=30,
        upload_max_mb=40, logging_level="verbose",
        response_strictness="strict", temperature_limit=0.4,
    ),
    dict(
        name="Junior Employee Policy", category="seniority", risk_level="high",
        description=("For interns, fresh graduates and junior analysts. "
                     "Strict prompt filtering, limited upload size, restricted "
                     "external tools, maximum safety, heavy prompt "
                     "optimization and supervision-grade logging."),
        authority_levels=["intern", "employee", "admin"],
        roles=ALL_ROLES,
        guardrails=_guards(),
        rails_config=RAILS_FULL,
        blocked_topics=["salary data", "credentials", "production database"],
        compliance_tags=["Supervised"],
        allowed_file_types=BASIC_FILE_TYPES,
        allowed_models=ALL_MODELS[:2],
        tool_permissions=["summarize"],
        max_tokens=2048, compression_level="maximum", compression_target=40,
        upload_max_mb=5, logging_level="supervised",
        response_strictness="strict", temperature_limit=0.5,
    ),
    dict(
        name="Senior Professional Policy", category="seniority", risk_level="medium",
        description=("For senior engineers, researchers and architects. "
                     "Balanced freedom, advanced coding access, larger context "
                     "window, medium compression, extended file support."),
        authority_levels=["employee", "senior", "manager", "director", "admin"],
        roles=["Developer", "Business", "Admin", "Manager", "Healthcare",
               "Finance", "Education"],
        guardrails=_guards(toxicity=False),
        rails_config=RAILS_STANDARD,
        blocked_topics=[],
        compliance_tags=[],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["search", "summarize", "export", "code", "analyze"],
        max_tokens=8192, compression_level="medium", compression_target=20,
        upload_max_mb=100, logging_level="standard",
        response_strictness="professional", temperature_limit=0.8,
    ),
    dict(
        name="Manager Policy", category="seniority", risk_level="medium",
        description=("For managers and team leads. Project planning, document "
                     "generation, meeting summaries, higher upload limits, "
                     "broader AI capabilities and department analytics."),
        authority_levels=["manager", "director", "admin"],
        roles=["Manager", "Admin", "HR", "Business"],
        guardrails=_guards(),
        rails_config=RAILS_STANDARD,
        blocked_topics=["individual performance ratings"],
        compliance_tags=["Internal"],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["search", "summarize", "export", "plan",
                          "analytics:department"],
        max_tokens=8192, compression_level="medium", compression_target=20,
        upload_max_mb=150, logging_level="standard",
        response_strictness="professional", temperature_limit=0.7,
    ),
    dict(
        name="Director Policy", category="executive", risk_level="high",
        description=("For department heads and executives. High context "
                     "limits, executive reports, strategic planning, "
                     "confidential analytics, cross-department visibility and "
                     "advanced reporting."),
        authority_levels=["director", "admin"],
        roles=["Admin", "Manager", "Business", "Finance", "HR"],
        guardrails=_guards(financial=True),
        rails_config=RAILS_FULL,
        blocked_topics=[],
        compliance_tags=["Confidential", "SOX"],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["search", "summarize", "export", "plan", "report",
                          "analytics:cross-department"],
        max_tokens=16384, compression_level="low", compression_target=12,
        upload_max_mb=250, logging_level="verbose",
        response_strictness="professional", temperature_limit=0.6,
    ),
    dict(
        name="Administrator Policy", category="admin", risk_level="critical",
        description=("Full enterprise access: guardrail management, policy "
                     "editing, user management, system analytics, audit logs, "
                     "model routing and token analytics. No UI restrictions — "
                     "still protected by the security rails."),
        authority_levels=["admin"],
        roles=["Admin"],
        guardrails=_guards(financial=True),
        rails_config=RAILS_FULL,
        blocked_topics=[],
        compliance_tags=["Privileged"],
        allowed_file_types=ALL_FILE_TYPES, allowed_models=ALL_MODELS,
        tool_permissions=["*"],
        max_tokens=16384, compression_level="low", compression_target=10,
        upload_max_mb=500, logging_level="verbose",
        response_strictness="professional", temperature_limit=0.9,
    ),
]

# Enterprise workspaces: each behaves differently (system prompt, guardrail
# emphasis, token strategy, accent, curated example prompts).
WORKSPACES = [
    dict(key="hr", name="HR", icon="users", accent="#8b5cf6",
         description="Resume analysis, employee documentation and policy drafting.",
         system_prompt=("You are the HR workspace assistant. You help with resume "
                        "analysis, employee documentation, onboarding flows and "
                        "policy drafting. Never reveal one employee's data to "
                        "another. Format output as clean business documents."),
         guardrail_profile={"pii": "strict", "notes": "employee-data protection"},
         suggested_policies=["Client Collaboration Policy", "Manager Policy"],
         token_strategy="document-optimized",
         example_prompts=["Draft a remote-work policy section on equipment",
                          "Summarize this resume against a senior analyst role",
                          "Write onboarding checklist for a new hire's first week"]),
    dict(key="healthcare", name="Healthcare", icon="heart-pulse", accent="#ef4444",
         description="HIPAA-aware clinical documentation with PHI protection.",
         system_prompt=("You are the Healthcare workspace assistant operating "
                        "under HIPAA awareness. Optimize medical terminology, "
                        "protect patient records, and never retain or repeat "
                        "patient identifiers. Use clinical documentation "
                        "structure where appropriate."),
         guardrail_profile={"pii": "strict", "compliance": "HIPAA",
                            "notes": "patient-record protection"},
         suggested_policies=["Client Collaboration Policy", "Senior Professional Policy"],
         token_strategy="terminology-preserving",
         example_prompts=["Structure a SOAP note from this visit summary",
                          "Explain HbA1c targets for a patient handout",
                          "De-identify this discharge summary"]),
    dict(key="finance", name="Finance", icon="landmark", accent="#0ea5e9",
         description="Financial compliance, budgets, invoices and spreadsheets.",
         system_prompt=("You are the Finance workspace assistant. Handle budget "
                        "calculations, invoices and spreadsheet-style data with "
                        "precision; show calculations, flag assumptions and "
                        "follow financial compliance (SOX/PCI) practices."),
         guardrail_profile={"financial": "strict", "compliance": "SOX/PCI",
                            "notes": "sensitive-number detection"},
         suggested_policies=["Budget & Procurement Policy"],
         token_strategy="table-optimized",
         example_prompts=["Build a quarterly budget variance summary table",
                          "Check this invoice total against line items",
                          "Draft a vendor payment-terms negotiation email"]),
    dict(key="education", name="Education", icon="graduation-cap", accent="#f59e0b",
         description="Lesson planning, quiz generation and tutoring support.",
         system_prompt=("You are the Education workspace assistant. Create "
                        "lesson plans, quizzes and rubrics appropriate to the "
                        "stated level. Never produce exam answers for "
                        "cheating; encourage understanding."),
         guardrail_profile={"notes": "classroom-safe"},
         suggested_policies=["Open Policy", "Client Collaboration Policy"],
         token_strategy="balanced",
         example_prompts=["Plan a 45-minute lesson on photosynthesis",
                          "Generate a 10-question quiz on World War I",
                          "Create a grading rubric for a persuasive essay"]),
    dict(key="coding", name="Coding", icon="code", accent="#22c55e",
         description="Code formatting, repository summarization and documentation.",
         system_prompt=("You are the Coding workspace assistant. Produce "
                        "idiomatic, well-formatted code with brief rationale. "
                        "Summarize repositories, generate documentation and "
                        "review diffs. Never include credentials in examples."),
         guardrail_profile={"secrets": "strict", "notes": "credential masking"},
         suggested_policies=["Senior Professional Policy", "Open Policy"],
         token_strategy="code-preserving",
         example_prompts=["Refactor this function for readability",
                          "Write a README section for our API module",
                          "Summarize what this SQL migration changes"]),
    dict(key="business", name="Business", icon="briefcase", accent="#3987e5",
         description="Market analysis, reports and operational planning.",
         system_prompt=("You are the Business workspace assistant. Deliver "
                        "market analysis, structured reports and operational "
                        "plans with executive-ready formatting: summary first, "
                        "then detail, then recommended actions."),
         guardrail_profile={"notes": "strategy confidentiality"},
         suggested_policies=["Manager Policy", "Director Policy"],
         token_strategy="report-optimized",
         example_prompts=["Draft a one-page market entry analysis for Brazil",
                          "Turn these bullet notes into a board memo",
                          "Build a SWOT for our subscription pricing change"]),
    dict(key="travel", name="Travel", icon="plane", accent="#06b6d4",
         description="Itinerary generation, logistics and expense estimation.",
         system_prompt=("You are the Travel workspace assistant. Generate "
                        "itineraries with realistic timing, estimate expenses "
                        "in tables, and respect corporate travel policy "
                        "constraints when stated."),
         guardrail_profile={"notes": "expense compliance"},
         suggested_policies=["Open Policy", "Client Collaboration Policy"],
         token_strategy="balanced",
         example_prompts=["Plan a 3-day client visit itinerary in Singapore",
                          "Estimate expenses for a week-long conference trip",
                          "Summarize our flight options into a comparison table"]),
    dict(key="food", name="Food", icon="utensils", accent="#f97316",
         description="Nutrition guidance, recipes and meal planning.",
         system_prompt=("You are the Food workspace assistant. Provide "
                        "nutrition information, recipes and meal plans with "
                        "clear ingredient lists, portions and macros where "
                        "relevant. Note allergens explicitly."),
         guardrail_profile={"notes": "allergen awareness"},
         suggested_policies=["Open Policy"],
         token_strategy="balanced",
         example_prompts=["Create a 5-day high-protein meal plan",
                          "Suggest a menu for a 40-person office lunch",
                          "Break down macros for this smoothie recipe"]),
    dict(key="legal", name="Legal", icon="scale", accent="#a78bfa",
         description="Contract summaries and clause extraction.",
         system_prompt=("You are the Legal workspace assistant. Summarize "
                        "contracts, extract clauses and flag unusual terms. "
                        "Always add that output is not legal advice."),
         guardrail_profile={"pii": "strict", "notes": "privileged content"},
         suggested_policies=["Director Policy", "Client Collaboration Policy"],
         token_strategy="clause-preserving",
         example_prompts=["Extract termination clauses from this MSA",
                          "Summarize this NDA in plain language",
                          "Compare indemnification language in these two drafts"]),
    dict(key="research", name="Research", icon="flask-conical", accent="#10b981",
         description="Literature review and structured synthesis.",
         system_prompt=("You are the Research workspace assistant. Synthesize "
                        "sources into structured reviews with explicit "
                        "citations of the provided material and clear "
                        "separation of evidence from interpretation."),
         guardrail_profile={"notes": "source fidelity"},
         suggested_policies=["Open Policy", "Senior Professional Policy"],
         token_strategy="context-preserving",
         example_prompts=["Structure a literature review outline on LLM safety",
                          "Extract methods sections from these abstracts",
                          "Summarize conflicting findings across these papers"]),
    dict(key="marketing", name="Marketing", icon="megaphone", accent="#ec4899",
         description="Campaigns, copywriting and brand voice.",
         system_prompt=("You are the Marketing workspace assistant. Produce "
                        "campaign concepts and copy in the stated brand voice; "
                        "offer variants and call out claims that need "
                        "substantiation."),
         guardrail_profile={"notes": "claim substantiation"},
         suggested_policies=["Open Policy", "Client Collaboration Policy"],
         token_strategy="balanced",
         example_prompts=["Write 3 subject lines for our launch email",
                          "Draft LinkedIn copy announcing our Series B",
                          "Create a tagline exploration for a security product"]),
    dict(key="support", name="Customer Support", icon="headset", accent="#eab308",
         description="Grounded replies with tone controls.",
         system_prompt=("You are the Customer Support workspace assistant. "
                        "Draft grounded, empathetic replies using only the "
                        "provided context; never promise unannounced features "
                        "or refunds beyond policy."),
         guardrail_profile={"pii": "strict", "notes": "customer-data care"},
         suggested_policies=["Client Collaboration Policy", "Junior Employee Policy"],
         token_strategy="balanced",
         example_prompts=["Draft a reply to a double-billing complaint",
                          "Turn this bug explanation into a customer update",
                          "Write a polite escalation acknowledgement"]),
    dict(key="analytics", name="Analytics", icon="bar-chart-3", accent="#64748b",
         description="Data exploration and KPI narratives.",
         system_prompt=("You are the Analytics workspace assistant. Explore "
                        "data described or attached, narrate KPIs precisely, "
                        "and distinguish correlation from causation. Prefer "
                        "tables for numbers."),
         guardrail_profile={"notes": "metric integrity"},
         suggested_policies=["Manager Policy", "Senior Professional Policy"],
         token_strategy="table-optimized",
         example_prompts=["Narrate this week-over-week KPI movement",
                          "Suggest cohorts to explain churn increase",
                          "Turn this CSV summary into an executive readout"]),
]

USERS = [
    # name, username, email, password, employee_id, role, dept, authority, policy
    ("Alex Morgan", "alex.morgan", "admin@promptineering.io", "admin123",
     "EMP-0001", "Admin", "Platform", "admin", "Administrator Policy"),
    ("Priya Sharma", "priya.sharma", "priya@promptineering.io", "demo123",
     "EMP-0107", "Manager", "Operations", "manager", "Manager Policy"),
    ("Victor Hale", "victor.hale", "victor@promptineering.io", "demo123",
     "EMP-0042", "Business", "Strategy", "director", "Director Policy"),
    ("Daniel Reyes", "daniel.reyes", "daniel@promptineering.io", "demo123",
     "EMP-0231", "Finance", "Finance", "manager", "Budget & Procurement Policy"),
    ("Sofia Rossi", "sofia.rossi", "sofia@promptineering.io", "demo123",
     "EMP-0310", "Healthcare", "Clinical", "senior", "Senior Professional Policy"),
    ("Ken Watanabe", "ken.watanabe", "ken@promptineering.io", "demo123",
     "EMP-0288", "Developer", "Engineering", "senior", "Senior Professional Policy"),
    ("Amara Okafor", "amara.okafor", "amara@promptineering.io", "demo123",
     "EMP-0356", "HR", "People", "employee", "Client Collaboration Policy"),
    ("Lucas Meyer", "lucas.meyer", "lucas@promptineering.io", "demo123",
     "EMP-0412", "Education", "Learning", "employee", "Open Policy"),
    ("Chen Wei", "chen.wei", "chen@promptineering.io", "demo123",
     "EMP-0498", "Business", "Strategy", "employee", "Senior Professional Policy"),
    ("Maria Garcia", "maria.garcia", "maria@promptineering.io", "demo123",
     "EMP-0533", "General User", "Field", "intern", "Junior Employee Policy"),
    ("Noah Kim", "noah.kim", "noah@promptineering.io", "demo123",
     "EMP-0561", "Developer", "Engineering", "intern", "Junior Employee Policy"),
    ("Fatima Ali", "fatima.ali", "fatima@promptineering.io", "demo123",
     "EMP-0577", "Travel", "Logistics", "employee", "Client Collaboration Policy"),
    ("Emma Laurent", "emma.laurent", "emma@promptineering.io", "demo123",
     "EMP-0602", "Food", "Hospitality", "employee", "Open Policy"),
]

VIOLATION_TYPES = [
    ("pii", "medium", "Email address redacted from prompt"),
    ("pii", "high", "SSN detected and redacted"),
    ("secret", "critical", "API key masked before model access"),
    ("injection", "high", "Prompt injection signature blocked"),
    ("compliance", "medium", "Blocked topic under active policy"),
    ("jailbreak", "high", "Jailbreak framing rejected"),
    ("financial", "high", "Bank identifier masked under procurement policy"),
]


def ensure_schema():
    """Rebuild the demo database when a pre-v2 schema is found."""
    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("users")}
        if "username" not in columns:
            Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        rng = random.Random(42)
        db.add(SchemaMeta(version=SCHEMA_VERSION))

        policies = {}
        for spec in POLICIES:
            p = PolicySuite(applications=[w["key"] for w in WORKSPACES], **spec)
            db.add(p)
            policies[spec["name"]] = p
        db.flush()

        for w in WORKSPACES:
            db.add(Application(**w))

        users = []
        for (name, username, email, pwd, emp_id, role, dept,
             authority, policy_name) in USERS:
            u = User(
                name=name, username=username, email=email,
                employee_id=emp_id, password_hash=hash_password(pwd),
                role=role, department=dept, authority=authority,
                policy_id=policies[policy_name].id,
                storage_used_mb=round(rng.uniform(4, 480), 1),
                created_at=datetime.utcnow() - timedelta(days=rng.randint(30, 400)),
                last_login=datetime.utcnow() - timedelta(hours=rng.randint(1, 96)),
            )
            db.add(u)
            users.append(u)
        db.flush()

        now = datetime.utcnow()
        app_keys = [w["key"] for w in WORKSPACES]
        for _ in range(420):
            user = rng.choice(users)
            created = now - timedelta(
                days=rng.uniform(0, 30), hours=rng.uniform(0, 24))
            tokens_in = rng.randint(40, 1800)
            saved = int(tokens_in * rng.uniform(0.08, 0.42))
            blocked = rng.random() < 0.06
            risk = (rng.uniform(85, 100) if blocked
                    else rng.uniform(30, 70) if rng.random() < 0.18
                    else rng.uniform(0, 25))
            level = ("critical" if risk >= 90 else "high" if risk >= 65
                     else "medium" if risk >= 35 else "low")
            log = PromptLog(
                user_id=user.id, application=rng.choice(app_keys),
                policy_id=user.policy_id,
                original_prompt="(seeded demo activity)",
                optimized_prompt="(seeded demo activity)",
                response="" if blocked else "(seeded demo response)",
                model=rng.choice(ALL_MODELS),
                tokens_in=tokens_in,
                tokens_out=0 if blocked else rng.randint(80, 2400),
                tokens_saved=saved,
                compression_pct=round(saved / tokens_in * 100, 1),
                risk_score=round(risk, 1), risk_level=level,
                latency_ms=rng.randint(240, 3600), blocked=blocked,
                stages=[], created_at=created,
            )
            db.add(log)
            db.flush()
            if blocked or (level in ("medium", "high") and rng.random() < 0.5):
                vtype, severity, detail = rng.choice(VIOLATION_TYPES)
                db.add(Violation(
                    user_id=user.id, prompt_log_id=log.id, vtype=vtype,
                    severity=severity, detail=detail, created_at=created,
                ))

        events = ["auth.login", "auth.logout", "policy.updated", "user.updated",
                  "prompt.processed", "file.uploaded", "export.download",
                  "admin.settings"]
        for _ in range(160):
            user = rng.choice(users)
            db.add(AuditLog(
                actor_id=user.id, actor_email=user.email,
                event=rng.choice(events),
                detail="Seeded demonstration event",
                ip=f"10.24.{rng.randint(0,255)}.{rng.randint(1,254)}",
                created_at=now - timedelta(days=rng.uniform(0, 30)),
            ))

        db.commit()
    finally:
        db.close()
