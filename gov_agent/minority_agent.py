from typing import TypedDict, List
from datetime import datetime
from langgraph.graph import StateGraph, END
import random
import string
from gov_agent.application_store import save_latest_application
from gov_agent.db import supabase


class MinorityState(TypedDict):
    name: str
    dob: str
    income: int
    religion: str
    institution: str
    course: str
    marks_pct: float
    media_id: str
    phone: str
    eligible: bool
    missing_fields: List[str]
    submission_result: dict
    error: str


async def check_completeness(state: MinorityState) -> MinorityState:
    required = ["name", "dob", "income", "religion", "institution", "course", "marks_pct", "media_id"]
    state["missing_fields"] = [k for k in required if not state.get(k)]
    return state


async def verify_eligibility(state: MinorityState) -> MinorityState:
    try:
        income_ok = int(state["income"]) < 200000
        religion_ok = state["religion"].capitalize() in ["Muslim", "Sikh", "Christian", "Buddhist", "Parsi", "Jain"]
        marks_ok = float(state["marks_pct"]) >= 50
        state["eligible"] = bool(income_ok and religion_ok and marks_ok)
        if not income_ok:
            state["error"] = "Income ₹{} exceeds ₹2L limit for Minority Scholarship".format(state["income"])
        elif not religion_ok:
            state["error"] = f"Religion {state['religion']} not eligible for Minority Scholarship"
        elif not marks_ok:
            state["error"] = f"Marks {state['marks_pct']}% below 50% requirement"
    except Exception as e:
        state["eligible"] = False
        state["error"] = f"Verification error: {e}"
    return state


async def execute_application(state: MinorityState) -> MinorityState:
    try:
        conf = ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
        confirmation = f"MIN2026{conf}"

        today = datetime.now()
        from datetime import timedelta
        fmt = lambda d: d.strftime("%Y-%m-%d")
        timeline_steps = [
            {"step": "Applied",      "icon": "📝", "date": fmt(today),                      "est_date": fmt(today),                      "done": True},
            {"step": "Under Review", "icon": "🔍", "date": None,                             "est_date": fmt(today + timedelta(days=7)),   "done": False},
            {"step": "Approved",     "icon": "✅", "date": None,                             "est_date": fmt(today + timedelta(days=14)),  "done": False},
            {"step": "Disbursed",    "icon": "💰", "date": None,                             "est_date": fmt(today + timedelta(days=21)),  "done": False},
        ]

        saved_application = save_latest_application(
            phone=state.get("phone", "unknown"),
            portal="minority",
            service="Minority Scholarship",
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


async def handle_error(state: MinorityState) -> MinorityState:
    if not state.get("error"):
        if state.get("missing_fields"):
            state["error"] = "Missing required fields: " + ", ".join(state["missing_fields"])
        elif not state.get("eligible", True):
            state["error"] = "Eligibility check failed"
    return state


def route_completeness(state: MinorityState) -> str:
    return "handle_error" if state.get("missing_fields") else "verify_eligibility"


def route_eligibility(state: MinorityState) -> str:
    return "execute_application" if state.get("eligible") else "handle_error"


workflow = StateGraph(MinorityState)
workflow.add_node("check_completeness", check_completeness)
workflow.add_node("verify_eligibility", verify_eligibility)
workflow.add_node("execute_application", execute_application)
workflow.add_node("handle_error", handle_error)
workflow.set_entry_point("check_completeness")
workflow.add_conditional_edges("check_completeness", route_completeness)
workflow.add_conditional_edges("verify_eligibility", route_eligibility)
workflow.add_edge("execute_application", END)
workflow.add_edge("handle_error", END)
minority_graph = workflow.compile()


async def run_minority_application(data: dict) -> dict:
    state = MinorityState(
        name=data.get("name", ""),
        dob=data.get("dob", ""),
        income=int(data.get("income", 0)) if data.get("income") else 0,
        religion=data.get("religion", ""),
        institution=data.get("institution", ""),
        course=data.get("course", ""),
        marks_pct=float(data.get("marks_pct", 0)) if data.get("marks_pct") else 0,
        media_id=data.get("media_id", ""),
        phone=data.get("phone", ""),
        eligible=False,
        missing_fields=[],
        submission_result={},
        error=""
    )
    result = await minority_graph.ainvoke(state)
    return dict(result)
