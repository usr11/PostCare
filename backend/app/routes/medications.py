from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request

from app import db
from app.auth import can_access_patient, require_role
from app.models import Medication, MedicationReminder, Patient

medications_bp = Blueprint("medications", __name__)


CLINIC_READ = ("clinician", "admin", "quality_lead", "admissions")
CLINIC_WRITE = ("clinician", "admin")


@medications_bp.route("/<int:patient_id>", methods=["GET"])
@require_role(*CLINIC_READ)
def list_medications(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403
    meds = Medication.query.filter_by(patient_id=patient_id, active=True).all()
    return jsonify([m.to_dict() for m in meds])


@medications_bp.route("/", methods=["POST"])
@require_role(*CLINIC_WRITE)
def add_medication():
    data = request.get_json()
    patient_id = data.get("patient_id")
    name = data.get("name", "").strip()
    dose = data.get("dose", "").strip()
    schedule_times = data.get("schedule_times", [])

    if not all([patient_id, name, dose, schedule_times]):
        return jsonify({"error": "Todos los campos son requeridos"}), 400

    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403

    med = Medication(
        patient_id=patient_id,
        name=name,
        dose=dose,
        schedule_times=schedule_times,
    )
    db.session.add(med)
    db.session.commit()

    return jsonify(med.to_dict()), 201


@medications_bp.route("/<int:med_id>", methods=["DELETE"])
@require_role(*CLINIC_WRITE)
def deactivate_medication(med_id):
    med = db.get_or_404(Medication, med_id)
    if not can_access_patient(med.patient):
        return jsonify({"error": "No tienes acceso a este medicamento"}), 403
    med.active = False
    db.session.commit()
    return jsonify({"ok": True})


@medications_bp.route("/reminders/<int:patient_id>", methods=["GET"])
def get_pending_reminders(patient_id):
    db.get_or_404(Patient, patient_id)
    _generate_todays_reminders(patient_id)
    _expire_overdue_reminders(patient_id)

    now = datetime.now()
    reminders = (
        MedicationReminder.query
        .filter_by(patient_id=patient_id, status="pending")
        .filter(MedicationReminder.scheduled_at <= now)
        .order_by(MedicationReminder.scheduled_at.asc())
        .all()
    )
    return jsonify([r.to_dict() for r in reminders])


@medications_bp.route("/reminders/<int:reminder_id>/take", methods=["POST"])
def confirm_take(reminder_id):
    reminder = db.get_or_404(MedicationReminder, reminder_id)
    if reminder.status != "pending":
        return jsonify({"error": "Este recordatorio ya no está pendiente."}), 400

    reminder.status = "taken"
    reminder.taken_at = datetime.now()
    db.session.commit()

    return jsonify({
        "reminder": reminder.to_dict(),
        "message": f"Toma de {reminder.medication.name} registrada correctamente.",
    })


@medications_bp.route("/reminders/<int:reminder_id>/postpone", methods=["POST"])
def postpone_reminder(reminder_id):
    reminder = db.get_or_404(MedicationReminder, reminder_id)
    if reminder.status != "pending":
        return jsonify({"error": "Este recordatorio ya no está pendiente."}), 400
    if reminder.postponed:
        return jsonify({"error": "Este recordatorio ya fue pospuesto una vez."}), 400

    now = datetime.now()
    reminder.postponed = True
    reminder.postponed_to = now + timedelta(hours=1)
    reminder.scheduled_at = reminder.postponed_to
    db.session.commit()

    return jsonify({
        "reminder": reminder.to_dict(),
        "message": "Recordatorio pospuesto por 1 hora.",
    })


@medications_bp.route("/reminders/history/<int:patient_id>", methods=["GET"])
@require_role(*CLINIC_READ)
def reminder_history(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403
    reminders = (
        MedicationReminder.query
        .filter_by(patient_id=patient_id)
        .order_by(MedicationReminder.scheduled_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([r.to_dict() for r in reminders])


def _generate_todays_reminders(patient_id):
    meds = Medication.query.filter_by(patient_id=patient_id, active=True).all()
    today = date.today()

    for med in meds:
        for time_str in med.schedule_times:
            hour, minute = map(int, time_str.split(":"))
            scheduled = datetime(
                today.year, today.month, today.day,
                hour, minute,
            )

            exists = MedicationReminder.query.filter_by(
                medication_id=med.id,
                scheduled_at=scheduled,
            ).first()

            if not exists:
                db.session.add(MedicationReminder(
                    medication_id=med.id,
                    patient_id=patient_id,
                    scheduled_at=scheduled,
                ))

    db.session.commit()


def _expire_overdue_reminders(patient_id):
    now = datetime.now()
    cutoff = now - timedelta(hours=2)

    overdue = (
        MedicationReminder.query
        .filter_by(patient_id=patient_id, status="pending")
        .filter(MedicationReminder.scheduled_at <= cutoff)
        .all()
    )

    for r in overdue:
        r.status = "omitted"

    if overdue:
        db.session.commit()
