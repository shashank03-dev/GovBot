from gov_agent.llm_text_router import generate_text_reply

PM_KISAN_STATUS_URL = "https://pmkisan.gov.in/BeneficiaryStatus_New.aspx"
PM_KISAN_REG_LOOKUP_URL = "https://pmkisan.gov.in/KnowYour_Registration.aspx"

_SYSTEM_PROMPT = (
    "You are a helpful Indian government services assistant. "
    "The user wants to check their PM-KISAN beneficiary status. "
    "The PM-KISAN portal now requires a Registration Number (not Aadhaar) "
    "plus CAPTCHA and OTP to check status online. "
    "Provide a concise, helpful reply that includes:\n"
    "1. The latest PM-KISAN installment info (22nd installment released 13 March 2026, ₹2000 per installment, ₹6000/year)\n"
    "2. How to check status: visit the portal link provided\n"
    "3. If they don't know their registration number, they can look it up using Aadhaar at the registration lookup link\n"
    "Keep the reply short and WhatsApp-friendly (no markdown, use emojis sparingly)."
)


async def check_pm_kisan_status(identifier: str) -> dict:
    """
    Provide PM-KISAN status info using the shared text router.
    The official portal now requires Registration No + CAPTCHA + OTP,
    so direct scraping is no longer possible.
    """
    try:
        prompt = (
            f"User provided identifier: {identifier}\n"
            f"Portal link: {PM_KISAN_STATUS_URL}\n"
            f"Registration lookup link: {PM_KISAN_REG_LOOKUP_URL}\n\n"
            f"Generate a helpful WhatsApp reply for this farmer."
        )
        reply_text = await generate_text_reply(
            prompt,
            task="interactive",
            system_instruction=_SYSTEM_PROMPT,
            temperature=0.3,
            max_output_tokens=512,
        )
        return {
            "status": "info",
            "message": reply_text,
            "portal_url": PM_KISAN_STATUS_URL,
            "reg_lookup_url": PM_KISAN_REG_LOOKUP_URL,
        }

    except Exception:
        return {
            "status": "info",
            "message": (
                "ℹ️ PM-KISAN Status Check\n\n"
                "The PM-KISAN portal now requires your Registration Number "
                "(not Aadhaar) to check status.\n\n"
                f"🔗 Check status: {PM_KISAN_STATUS_URL}\n\n"
                f"Don't know your Registration No?\n"
                f"🔗 Look it up: {PM_KISAN_REG_LOOKUP_URL}\n\n"
                "Latest: 22nd installment released on 13 March 2026.\n"
                "Each installment: ₹2,000 | Annual: ₹6,000"
            ),
            "portal_url": PM_KISAN_STATUS_URL,
            "reg_lookup_url": PM_KISAN_REG_LOOKUP_URL,
        }
