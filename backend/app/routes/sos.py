from datetime import date, datetime, timezone

from flask import Blueprint, current_app, jsonify, request

from app import db
from app.models import Alert, MedicationReminder, Patient, SymptomRecord

sos_bp = Blueprint("sos", __name__)


def _interrupt_active_flows(patient_id):
    """HU 1: oprimir SOS interrumpe inmediatamente el flujo activo del bot."""
    today = date.today()
    record = (
        SymptomRecord.query
        .filter_by(patient_id=patient_id, date=today, status="in_progress")
        .first()
    )
    if record:
        record.status = "interrupted_by_sos"

    pending = MedicationReminder.query.filter_by(
        patient_id=patient_id, status="pending"
    ).all()
    for r in pending:
        r.status = "paused_by_sos"


def _clinic_contacts():
    return {
        "clinic_name": current_app.config["CLINIC_NAME"],
        "emergency_phone": current_app.config["CLINIC_EMERGENCY_PHONE"],
        "nurse_line": current_app.config["CLINIC_NURSE_LINE"],
        "national_emergency": current_app.config["NATIONAL_EMERGENCY_PHONE"],
    }


@sos_bp.route("/trigger", methods=["POST"])
def trigger_sos():
    data = request.get_json()
    patient_id = data.get("patient_id")
    message = (data.get("message") or "Paciente activó botón de emergencia S.O.S.").strip()

    patient = db.get_or_404(Patient, patient_id)

    _interrupt_active_flows(patient_id)

    alert = Alert(
        patient_id=patient_id,
        alert_type="sos",
        message=message,
        severity="critical",
        status="active",
    )
    db.session.add(alert)
    db.session.commit()

    contacts = _clinic_contacts()
    bot_response = (
        f"{patient.name.split()[0]}, tu alerta de emergencia fue enviada al equipo médico de "
        f"{contacts['clinic_name']}.\n\n"
        f"📞 Líneas de urgencias:\n"
        f"• Urgencias clínica: {contacts['emergency_phone']}\n"
        f"• Enfermería 24/7: {contacts['nurse_line']}\n"
        f"• Emergencias nacionales: {contacts['national_emergency']}\n\n"
        f"Si tu situación es grave, llama de inmediato o dirígete a urgencias.\n"
        f"Si activaste el botón por error, puedes cancelar la falsa alarma."
    )

    return jsonify({
        "alert_id": alert.id,
        "message": bot_response,
        "contacts": contacts,
        "flows_interrupted": True,
    })


@sos_bp.route("/cancel/<int:alert_id>", methods=["POST"])
def cancel_false_alarm(alert_id):
    """HU 1: el paciente puede cancelar una falsa alarma."""
    data = request.get_json(silent=True) or {}
    note = (data.get("note") or "Falsa alarma reportada por el paciente.").strip()

    alert = db.get_or_404(Alert, alert_id)

    if alert.alert_type != "sos":
        return jsonify({"error": "Solo se pueden cancelar alertas SOS."}), 400
    if alert.status != "active":
        return jsonify({"error": "Esta alerta ya fue cerrada."}), 409

    alert.status = "cancelled"
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = "Paciente (falsa alarma)"
    alert.resolution_note = note
    alert.version = (alert.version or 1) + 1
    db.session.commit()

    return jsonify({
        "alert": alert.to_dict(),
        "message": (
            "Hemos registrado la falsa alarma. Si necesitas ayuda en cualquier "
            "momento, vuelve a presionar el botón S.O.S."
        ),
    })
