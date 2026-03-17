from app.agents.state import AgentState
from app.ueba.middleware import secure_call
from datetime import datetime, timedelta
from database import execute_query, supabase
import uuid

# ==========================================
# 💾 MOCK DATABASE (Global Memory)
# ==========================================
# Stores all confirmed bookings to prevent double-booking.
BOOKINGS_DB = []

# ==========================================
# 🛠️ SERVICE LOGIC (Unchanged)
# ==========================================
class SchedulerService:
    
    @staticmethod
    def get_all_bookings():
        """
        Helper method for the API to fetch data for the Frontend.
        """
        try:
            return execute_query(
                "SELECT booking_id, vehicle_id, scheduled_date, status, priority FROM service_bookings ORDER BY scheduled_date ASC",
                fetch=True,
            )
        except Exception:
            return BOOKINGS_DB

    @staticmethod
    def find_next_available_slot(target_date_str):
        """
        Loops through standard work hours (09:00 - 17:00) 
        to find a slot that isn't already in BOOKINGS_DB.
        """
        # Define working hours (09:00 to 17:00)
        possible_slots = [f"{h:02d}:00" for h in range(9, 18)]
        
        taken_times = set()

        try:
            rows = execute_query(
                """
                SELECT scheduled_date
                FROM service_bookings
                WHERE DATE(scheduled_date) = %s
                  AND status != 'cancelled'
                ORDER BY scheduled_date ASC
                """,
                (target_date_str,),
                fetch=True,
            )
            for row in rows:
                scheduled = row.get("scheduled_date")
                if scheduled is not None:
                    taken_times.add(scheduled.strftime("%H:%M") if hasattr(scheduled, "strftime") else str(scheduled)[11:16])
        except Exception:
            taken_times = {b['slot_time'] for b in BOOKINGS_DB if b['slot_date'] == target_date_str}
        
        # Find first slot NOT in taken_times
        for slot in possible_slots:
            if slot not in taken_times:
                return slot
        
        return None # No slots available today

    @staticmethod
    def book_slot(vehicle_id: str, priority: str):
        """
        Determines slot based on priority, CHECKS AVAILABILITY, and saves to Mock DB.
        """
        print(f"📅 [System] Calculating slot for {vehicle_id} (Priority: {priority})...")
        
        # 1. Determine Initial Target Date based on Priority
        now = datetime.now()
        
        target_date = now + timedelta(days=1)
        
        service_note = f"Repair ({priority})"
        formatted_date = target_date.strftime("%Y-%m-%d")

        # 2. SMART LOGIC: Find a Real Available Time (Collision Detection)
        available_time = SchedulerService.find_next_available_slot(formatted_date)
        
        while not available_time:
            print(f"⚠️ [System] Date {formatted_date} is full! Checking next day...")
            target_date = target_date + timedelta(days=1)
            formatted_date = target_date.strftime("%Y-%m-%d")
            available_time = SchedulerService.find_next_available_slot(formatted_date)

        full_slot_str = f"{formatted_date} {available_time}"
        scheduled_at = datetime.strptime(full_slot_str, "%Y-%m-%d %H:%M")

        # 3. Create Booking Record
        new_booking = {
            "booking_id": f"BK-{uuid.uuid4().hex[:8].upper()}", 
            "vehicle_id": vehicle_id,
            "slot_date": formatted_date,
            "slot_time": available_time,
            "service_type": service_note,
            "priority": priority,
            "status": "CONFIRMED",
            "timestamp": now.isoformat()
        }
        
        # 4. Save to DB with in-memory fallback
        try:
            supabase.table("service_bookings").insert({
                "booking_id": new_booking["booking_id"],
                "vehicle_id": vehicle_id,
                "scheduled_date": scheduled_at.isoformat(),
                "service_type": service_note,
                "status": "confirmed",
                "priority": priority.lower(),
            }).execute()

            supabase.table("vehicles").update({
                "status": "scheduled",
                "next_service_date": scheduled_at.isoformat(),
            }).eq("vehicle_id", vehicle_id).execute()
        except Exception as e:
            print(f"⚠️ [Scheduler] DB booking persistence failed, using in-memory fallback: {e}")
            BOOKINGS_DB.append(new_booking)

        print(f"💾 [DB] Booking saved: {new_booking['booking_id']} | {full_slot_str}")
        
        # 5. Return result
        return {
            "booking_id": new_booking["booking_id"],
            "slot": full_slot_str,
            "type": service_note
        }

# ==========================================
# 🤖 AGENT NODE (Updated Logic)
# ==========================================
def scheduling_node(state: AgentState) -> AgentState:
    print("🗓️ [Scheduler] Analyzing priority for booking...")
    
    # Get Priority from the upstream Agent (Diagnosis Agent)
    # Default is "Medium" if not found
    priority = state.get("priority_level", "Medium")
    
    # ---------------------------------------------------------
    # 🧠 CONFIRMATION-FIRST SCHEDULING LOGIC
    # ---------------------------------------------------------
    customer_decision = str(state.get("customer_decision") or "").strip().upper()
    should_book = customer_decision in {"BOOKED", "YES", "CONFIRMED"}

    if not should_book:
        print(
            f"⏸️ [Scheduler] Booking skipped for priority '{priority}'. "
            f"Awaiting explicit customer YES/CONFIRMED decision (current='{customer_decision or 'PENDING'}')."
        )
        return state

    print(f"👤 [Scheduler] Customer explicitly authorized booking for {priority} priority.")

    # ---------------------------------------------------------
    # ⚡ EXECUTE BOOKING (Only if should_book is True)
    # ---------------------------------------------------------
    if should_book:
        agent_name = "SchedulingAgent"
        v_id = state.get("vehicle_id", "Unknown-ID")

        try:
            # Securely call the booking service
            booking_result = secure_call(
                agent_name,
                "SchedulerService",
                SchedulerService.book_slot,
                v_id,
                priority
            )
            
            # EXTRACT DATA AND UPDATE STATE
            state["booking_id"] = booking_result["booking_id"]
            state["selected_slot"] = booking_result["slot"]
            state["scheduled_date"] = booking_result["slot"]
            
            print(f"✅ [Scheduler] CONFIRMED! Date: {booking_result['slot']} (ID: {booking_result['booking_id']})")
            
        except PermissionError as e:
            state["error_message"] = str(e)
            print(f"⛔ [UEBA] BLOCKED: {e}")

    return state