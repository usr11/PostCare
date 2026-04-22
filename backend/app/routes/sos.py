from flask import Blueprint, jsonify, request

from app import db
from app.models import Alert, Patient

sos_bp = Blueprint("sos", __name__)


@sos_bp.route("/trigger", methods=["POST"])
def trigger_sos():
    data = request.get_json()
    patient_id = data.get("patient_id")
    message = data.get("message", "Paciente activó botón de emergencia S.O.S.")

    patient = db.get_or_404(Patient, patient_id)

    alert = Alert(
        patient_id=patient_id,
        alert_type="sos",
        message=message,
        severity="critical",
        status="active",
    )
    db.session.add(alert)
    db.session.commit()

    return jsonify({
        "alert_id": alert.id,
        "message": (
            "Tu alerta de emergencia ha sido enviada al equipo médico. "
            "Si tu situación es grave, llama al 123 o dirígete a urgencias de inmediato."
        ),
    })
