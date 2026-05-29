import logging
from datetime import datetime

from fastapi import APIRouter
from gov_agent.db import supabase
from gov_agent.models import EligibilityRequest, EligibilityResult

logger = logging.getLogger(__name__)

router = APIRouter()

_SCHEME_RULES = {
    "NSP": {"max_income": 250000},
    "SSP": {"max_income": 250000, "castes": ["SC", "ST", "OBC"], "course_levels": ["post_matric"]},
    "CSSS": {"max_income": 450000, "min_marks": 80.0, "course_levels": ["degree"]},
    "Minority": {"max_income": 200000},
}


def _evaluate_rules(req: EligibilityRequest) -> EligibilityResult:
    schemes: list[str] = []
    reasons: list[str] = []

    income = req.income
    caste = req.caste.upper() if req.caste else ""
    course = req.course_level.lower() if req.course_level else ""
    marks = req.marks_pct

    if income < 250000:
        schemes.append("NSP")
        reasons.append("NSP: income < ₹2.5L ✓")
    else:
        reasons.append("NSP: income ≥ ₹2.5L ✗")

    if income < 250000 and caste in ("SC", "ST", "OBC") and course == "post_matric":
        schemes.append("SSP")
        reasons.append("SSP: SC/ST/OBC + post-matric + income < ₹2.5L ✓")
    else:
        reasons.append("SSP: requires SC/ST/OBC, post-matric, income < ₹2.5L")

    if income < 450000 and marks >= 80.0 and course == "degree":
        schemes.append("CSSS")
        reasons.append("CSSS: marks ≥ 80% + degree + income < ₹4.5L ✓")
    else:
        reasons.append("CSSS: requires degree, marks ≥ 80%, income < ₹4.5L")

    if income < 200000:
        schemes.append("Minority")
        reasons.append("Minority: income < ₹2L ✓")
    else:
        reasons.append("Minority: income ≥ ₹2L ✗")

    return EligibilityResult(eligible=len(schemes) > 0, schemes=schemes, reasons=reasons)


@router.post("/screen", response_model=EligibilityResult)
async def screen_eligibility(req: EligibilityRequest):
    result = _evaluate_rules(req)

    try:
        from gov_agent import rag_engine

        rag_answer = await rag_engine.query_eligibility(
            f"income {req.income} caste {req.caste} course {req.course_level} marks {req.marks_pct}"
        )
        if rag_answer:
            result.reasons.append(f"RAG insight: {rag_answer[:200]}")
    except Exception as e:
        logger.warning("RAG query failed, using fallback rules only: %s", e)

    try:
        supabase.table("eligibility_checks").insert({
            "income": req.income,
            "caste": req.caste,
            "course_level": req.course_level,
            "marks_pct": req.marks_pct,
            "eligible": result.eligible,
            "schemes": result.schemes,
            "reasons": result.reasons,
            "created_at": datetime.now().isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("Failed to save eligibility check: %s", e)

    return result
