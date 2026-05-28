from typing import TypedDict, List
from datetime import datetime
from langgraph.graph import StateGraph, END
from gov_agent.application_store import save_latest_application
from gov_agent import portal_agent
import asyncio
import hashlib


def _parse_dob(value: str) -> datetime:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError("DOB must be DD/MM/YYYY or YYYY-MM-DD")


class ApplicationState(TypedDict):
    name: str
    dob: str
    income: int
    aadhaar_number: str
    phone: str
    media_id: str
    portal: str
    doc_path: str
    eligible: bool
    missing_fields: List[str]
    submission_result: dict
    error: str


async def check_completeness(state: ApplicationState) -> ApplicationState:
    required = ["name", "dob", "income", "media_id"]
    state["missing_fields"] = [k for k in required if not state.get(k)]

    # FRAUD DETECTION: run early, before eligibility check
    aadhaar = state.get("aadhaar_number", "")
    if aadhaar and not state.get("missing_fields"):
        from gov_agent.db import supabase
        aadhaar_hash = hashlib.sha256(aadhaar.encode()).hexdigest()
        phone = state.get("phone") or state.get("media_id", "unknown")
        try:
            existing = supabase.table("fraud_flags").select("*").eq("aadhaar_hash", aadhaar_hash).execute()
            if existing.data:
                known_phones = existing.data[0].get("phones", [])
                if phone not in known_phones:
                    supabase.table("fraud_flags").update({
                        "phones": known_phones + [phone],
                        "flagged_at": datetime.now().isoformat()
                    }).eq("aadhaar_hash", aadhaar_hash).execute()
                    state["error"] = "Duplicate Aadhaar detected across multiple phone numbers. Application blocked."
                    state["missing_fields"] = ["__fraud__"]
            else:
                supabase.table("fraud_flags").insert({
                    "aadhaar_hash": aadhaar_hash,
                    "phones": [phone],
                    "portal": state.get("portal", "nsp")
                }).execute()
        except Exception as fraud_err:
            pass  # never block a legitimate application on DB error
    return state


async def verify_eligibility(state: ApplicationState) -> ApplicationState:
    try:
        dob_date = _parse_dob(state["dob"])
        today = datetime.now()
        age = (today - dob_date).days // 365
        income_ok = int(state["income"]) < 250000
        age_ok = 17 <= age <= 25
        state["eligible"] = bool(income_ok and age_ok)
        if not income_ok:
            state["error"] = "Income ₹{} exceeds ₹2.5L limit".format(
                state["income"])
        elif not age_ok:
            state["error"] = f"Age {age} outside 17-25 range"
    except Exception as e:
        state["eligible"] = False
        state["error"] = f"Verification error: {e}"
    return state


async def execute_application(state: ApplicationState) -> ApplicationState:
    try:
        import random
        import string
        from gov_agent.db import supabase

        conf = ''.join(random.choices(
            string.ascii_uppercase + string.digits, k=12))
        confirmation = f"NSP2026{conf}"

        today = datetime.now()
        fmt = lambda d: d.strftime("%Y-%m-%d")
        from datetime import timedelta
        timeline_steps = [
            {"step": "Applied",      "icon": "📝", "date": fmt(today),                "est_date": fmt(today),                 "done": True},
            {"step": "Under Review", "icon": "🔍", "date": None,                       "est_date": fmt(today + timedelta(days=7)),  "done": False},
            {"step": "Approved",     "icon": "✅", "date": None,                       "est_date": fmt(today + timedelta(days=14)), "done": False},
            {"step": "Disbursed",    "icon": "💰", "date": None,                       "est_date": fmt(today + timedelta(days=21)), "done": False},
        ]

        saved_application = save_latest_application(
            phone=state.get("phone") or state.get("media_id", "unknown"),
            portal="nsp",
            service="NSP Scholarship",
            status="submitted",
            timeline_steps=timeline_steps,
            confirmation_number_factory=lambda: confirmation,
            db_client=supabase,
        )

        state["submission_result"] = {
            "status": "success",
            "confirmation_number": saved_application["confirmation_number"]
        }
    except Exception as e:
        state["error"] = str(e)
    return state


async def handle_error(state: ApplicationState) -> ApplicationState:
    if not state.get("error"):
        if state.get("missing_fields"):
            state["error"] = "Missing required fields: " + \
                ", ".join(state["missing_fields"])
        elif not state.get("eligible", True):
            state["error"] = "Eligibility check failed"
    return state


def route_completeness(state: ApplicationState) -> str:
    return "handle_error" if state.get(
        "missing_fields") else "verify_eligibility"


def route_eligibility(state: ApplicationState) -> str:
    return "execute_application" if state.get("eligible") else "handle_error"


workflow = StateGraph(ApplicationState)
workflow.add_node("check_completeness", check_completeness)
workflow.add_node("verify_eligibility", verify_eligibility)
workflow.add_node("execute_application", execute_application)
workflow.add_node("handle_error", handle_error)
workflow.set_entry_point("check_completeness")
workflow.add_conditional_edges("check_completeness", route_completeness)
workflow.add_conditional_edges("verify_eligibility", route_eligibility)
workflow.add_edge("execute_application", END)
workflow.add_edge("handle_error", END)
graph = workflow.compile()


async def run_application(data: dict) -> dict:
    state = ApplicationState(
        name=data.get("name", ""),
        dob=data.get("dob", ""),
        income=int(data.get("income", 0)) if data.get("income") else 0,
        aadhaar_number=data.get("aadhaar_number", ""),
        phone=data.get("phone", ""),
        portal=data.get("portal", "nsp"),
        media_id=data.get("media_id", ""),
        doc_path="",
        eligible=False,
        missing_fields=[],
        submission_result={},
        error=""
    )
    result = await graph.ainvoke(state)  # type: ignore
    return dict(result)
