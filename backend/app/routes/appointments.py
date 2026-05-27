"""Endpoints de citas de control (HU-07).

Lado clínico (auth obligatoria):
- POST   /api/appointments              crear
- GET    /api/appointments/<patient_id> listar todas (incluye pasadas)
- PUT    /api/appointments/<id>         actualizar fecha/lugar
- DELETE /api/appointments/<id>         cancelar

Lado paciente (sin auth, como el resto del flujo del bot):
- GET    /api/appointments/upcoming/<patient_id>     citas con recordatorio listo
- POST   /api/appointments/<id>/confirm              paciente confirma
- POST   /api/appointments/<id>/reschedule           paciente pide reagendar
"""

from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user

from app import db
from app.auth import can_access_patient, require_role
from app.models import Appointment, Patient

appointments_bp = Blueprint("appointments", __name__)


READ_ROLES = ("clinician", "admin", "quality_lead", "admissions")
WRITE_ROLES = ("clinician", "admin", "admissions")


def _parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


# ---------- Clinical side ----------

@appointments_bp.route("", methods=["POST"])
@require_role(*WRITE_ROLES)
def create_appointment():
    data = request.get_json(silent=True) or {}

    patient_id = data.get("patient_id")
    scheduled_at = _parse_datetime(data.get("scheduled_at"))
    location = (data.get("location") or "").strip()
    notes = (data.get("notes") or "").strip() or None

    if not patient_id or not scheduled_at or not location:
        return jsonify({
            "error": "Paciente, fecha/hora y lugar son obligatorios.",
        }), 400

    if scheduled_at <= datetime.now():
        return jsonify({
            "error": "La fecha de la cita debe ser futura.",
        }), 400

    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente."}), 403

    appt = Appointment(
        patient_id=patient_id,
        scheduled_at=scheduled_at,
        location=location,
        notes=notes,
        status="scheduled",
        created_by=current_user.id,
    )
    db.session.add(appt)
    db.session.commit()
    return jsonify(appt.to_dict()), 201


@appointments_bp.route("/<int:patient_id>", methods=["GET"])
@require_role(*READ_ROLES)
def list_for_patient(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente."}), 403

    appts = (
        Appointment.query
        .filter_by(patient_id=patient_id)
        .order_by(Appointment.scheduled_at.desc())
        .all()
    )
    return jsonify([a.to_dict() for a in appts])


@appointments_bp.route("/<int:appt_id>", methods=["PUT"])
@require_role(*WRITE_ROLES)
def update_appointment(appt_id):
    appt = db.get_or_404(Appointment, appt_id)
    if not can_access_patient(appt.patient):
        return jsonify({"error": "No tienes acceso a esta cita."}), 403

    data = request.get_json(silent=True) or {}
    if "scheduled_at" in data:
        new_dt = _parse_datetime(data["scheduled_at"])
        if not new_dt:
            return jsonify({"error": "Fecha/hora inválida."}), 400
        appt.scheduled_at = new_dt
        # Reabrir el recordatorio si cambian la fecha.
        appt.reminder_sent_at = None
        if appt.status in ("confirmed", "reschedule_requested"):
            appt.status = "scheduled"
            appt.confirmed_at = None
            appt.reschedule_requested_at = None
    if "location" in data:
        loc = (data["location"] or "").strip()
        if not loc:
            return jsonify({"error": "Lugar no puede estar vacío."}), 400
        appt.location = loc
    if "notes" in data:
        appt.notes = (data["notes"] or "").strip() or None

    db.session.commit()
    return jsonify(appt.to_dict())


@appointments_bp.route("/<int:appt_id>", methods=["DELETE"])
@require_role(*WRITE_ROLES)
def cancel_appointment(appt_id):
    appt = db.get_or_404(Appointment, appt_id)
    if not can_access_patient(appt.patient):
        return jsonify({"error": "No tienes acceso a esta cita."}), 403

    appt.status = "cancelled"
    db.session.commit()
    return jsonify(appt.to_dict())


# ---------- Patient side (no auth, identifies by patient_id en URL) ----------

@appointments_bp.route("/upcoming/<int:patient_id>", methods=["GET"])
def upcoming_for_patient(patient_id):
    """Devuelve las citas con recordatorio listo y aún sin gestionar por el paciente."""
    db.get_or_404(Patient, patient_id)
    now = datetime.now()
    appts = (
        Appointment.query
        .filter_by(patient_id=patient_id, status="scheduled")
        .filter(Appointment.reminder_sent_at.isnot(None))
        .filter(Appointment.scheduled_at > now)
        .order_by(Appointment.scheduled_at.asc())
        .all()
    )
    return jsonify([a.to_dict() for a in appts])


@appointments_bp.route("/<int:appt_id>/confirm", methods=["POST"])
def confirm_appointment(appt_id):
    appt = db.get_or_404(Appointment, appt_id)
    if appt.status != "scheduled":
        return jsonify({"error": "Esta cita ya fue gestionada."}), 400

    appt.status = "confirmed"
    appt.confirmed_at = datetime.now()
    db.session.commit()

    return jsonify({
        "appointment": appt.to_dict(),
        "message": (
            "¡Perfecto! Hemos confirmado tu asistencia. "
            "Te esperamos en la fecha indicada. Cualquier cambio, escríbenos."
        ),
    })


@appointments_bp.route("/<int:appt_id>/reschedule", methods=["POST"])
def reschedule_appointment(appt_id):
    appt = db.get_or_404(Appointment, appt_id)
    if appt.status != "scheduled":
        return jsonify({"error": "Esta cita ya fue gestionada."}), 400

    appt.status = "reschedule_requested"
    appt.reschedule_requested_at = datetime.now()
    db.session.commit()

    phone = current_app.config["CLINIC_APPOINTMENTS_PHONE"]
    return jsonify({
        "appointment": appt.to_dict(),
        "contact_phone": phone,
        "message": (
            f"Para reagendar tu cita comunícate con el área de citas al {phone}. "
            f"Tu cita queda marcada como 'solicitud de reagendamiento' "
            f"mientras te contactan."
        ),
    })
