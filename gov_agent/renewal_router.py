"""
Renewal Reminder Router
Handles registration and running of renewal reminders for scholarship recipients.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from gov_agent.db import supabase
from gov_agent import whatsapp_sender
from gov_agent import renewal_intelligence

router = APIRouter()


class RenewalRegisterRequest(BaseModel):
    phone: str
    portal: str
    renewal_due_date: str  # YYYY-MM-DD format


class RenewalRegisterResponse(BaseModel):
    registered: bool
    reminder_id: Optional[str] = None
    message: Optional[str] = None


class RenewalRunResponse(BaseModel):
    sent_count: int
    reminders: list[dict]


@router.post("/register", response_model=RenewalRegisterResponse)
async def register_renewal(body: RenewalRegisterRequest):
    """
    Register a renewal reminder for a student.
    Upserts into renewal_reminders table.
    """
    try:
        # Validate date format
        due_date = datetime.strptime(body.renewal_due_date, "%Y-%m-%d").date()

        # Check if reminder already exists
        existing = supabase.table("renewal_reminders")\
            .select("*")\
            .eq("phone", body.phone)\
            .eq("portal", body.portal)\
            .execute()

        if existing.data:
            # Update existing reminder
            result = supabase.table("renewal_reminders")\
                .update({
                    "renewal_due_date": body.renewal_due_date,
                    "sent_at": None,
                    "updated_at": datetime.now().isoformat()
                })\
                .eq("phone", body.phone)\
                .eq("portal", body.portal)\
                .execute()
            reminder_id = result.data[0]["id"] if result.data else None
            return RenewalRegisterResponse(
                registered=True,
                reminder_id=reminder_id,
                message="Renewal reminder updated successfully"
            )
        else:
            # Insert new reminder
            result = supabase.table("renewal_reminders")\
                .insert({
                    "phone": body.phone,
                    "portal": body.portal,
                    "renewal_due_date": body.renewal_due_date,
                    "sent_at": None,
                    "created_at": datetime.now().isoformat()
                })\
                .execute()
            reminder_id = result.data[0]["id"] if result.data else None
            return RenewalRegisterResponse(
                registered=True,
                reminder_id=reminder_id,
                message="Renewal reminder registered successfully"
            )

    except ValueError:
        raise HTTPException(status_code=400, detail={
            "error": "Invalid date format. Use YYYY-MM-DD"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/reminders/{phone}")
async def get_reminders(phone: str):
    """
    Get all renewal reminders for a phone number.
    """
    try:
        result = supabase.table("renewal_reminders")\
            .select("*")\
            .eq("phone", phone)\
            .limit(50)\
            .execute()
        return {"reminders": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.get("/summary/{phone}")
async def get_renewal_summary(phone: str):
    """
    Get combined document expiry and scholarship renewal data for a phone number.
    """
    try:
        return renewal_intelligence.build_summary(phone)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.post("/run-reminders", response_model=RenewalRunResponse)
async def run_renewal_reminders():
    """
    Check for upcoming renewals and send reminders.
    Called via cron job (Supabase pg_cron or external scheduler).
    """
    try:
        today = datetime.now().date()
        threshold_date = today + timedelta(days=30)

        # Query reminders due within 30 days and not yet sent
        result = supabase.table("renewal_reminders")\
            .select("*")\
            .lte("renewal_due_date", threshold_date.isoformat())\
            .is_("sent_at", "null")\
            .limit(200)\
            .execute()

        reminders = result.data or []
        sent_count = 0
        sent_reminders = []

        for reminder in reminders:
            phone = reminder["phone"]
            portal = reminder["portal"]
            due_date = datetime.strptime(reminder["renewal_due_date"], "%Y-%m-%d").date()
            days_until = (due_date - today).days

            # Prepare message
            if days_until <= 0:
                message = (
                    f"🎓 Your {portal} scholarship renewal is due NOW!\n\n"
                    f"Reply RENEW to start your renewal application.\n\n"
                    f"GovBot - Scholarship Assistant"
                )
            else:
                message = (
                    f"🎓 Renewal Reminder!\n\n"
                    f"Your {portal} scholarship renewal opens in {days_until} days.\n"
                    f"Due date: {reminder['renewal_due_date']}\n\n"
                    f"Reply RENEW to start your renewal application.\n\n"
                    f"GovBot - Scholarship Assistant"
                )

            try:
                # Send WhatsApp message
                await whatsapp_sender.send_message(phone, message)

                # Update sent_at timestamp
                supabase.table("renewal_reminders")\
                    .update({"sent_at": datetime.now().isoformat()})\
                    .eq("id", reminder["id"])\
                    .execute()

                sent_count += 1
                sent_reminders.append({
                    "id": reminder["id"],
                    "phone": phone,
                    "portal": portal,
                    "days_until": days_until
                })

            except Exception as e:
                # Log error but continue processing other reminders
                print(f"Failed to send reminder to {phone}: {e}")
                continue

        return RenewalRunResponse(sent_count=sent_count, reminders=sent_reminders)

    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
    """
    Delete a renewal reminder (e.g., after successful renewal).
    """
    try:
        supabase.table("renewal_reminders")\
            .delete()\
            .eq("id", reminder_id)\
            .execute()
        return {"deleted": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
