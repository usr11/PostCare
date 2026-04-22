from flask import Blueprint, jsonify, request

from app import db
from app.models import Patient

onboarding_bp = Blueprint("onboarding", __name__)


@onboarding_bp.route("/verify", methods=["POST"])
def verify_document():
    data = request.get_json()
    document = data.get("document_number", "").strip()

    if not document:
        return jsonify({"error": "Número de documento requerido"}), 400

    patient = Patient.query.filter_by(document_number=document).first()

    if not patient:
        return jsonify({
            "found": False,
            "message": "No encuentro este documento. Comunícate con tu clínica.",
        }), 404

    return jsonify({
        "found": True,
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "surgery_type": patient.surgery_type,
            "surgery_date": patient.surgery_date.isoformat(),
        },
    })


@onboarding_bp.route("/confirm", methods=["POST"])
def confirm_identity():
    data = request.get_json()
    patient_id = data.get("patient_id")
    confirmed = data.get("confirmed", False)

    patient = db.get_or_404(Patient, patient_id)

    if not confirmed:
        return jsonify({
            "confirmed": False,
            "message": (
                "Lamentamos el inconveniente. Por favor comunícate con admisiones "
                "al teléfono (601) 123-4567 para corregir tus datos."
            ),
        })

    patient.onboarded = True
    patient.status = "active"
    db.session.commit()

    return jsonify({
        "confirmed": True,
        "message": "¡Bienvenido/a al programa de seguimiento postquirúrgico!",
        "rules": [
            "Recibirás un cuestionario diario sobre tu estado de salud.",
            "Es importante responder todas las preguntas usando los botones proporcionados.",
            "Si presentas una emergencia, usa el botón S.O.S. disponible en todo momento.",
            "El horario de seguimiento es de 8:00 AM a 8:00 PM.",
            "Si no completas el cuestionario en 1 hora, se marcará como incompleto.",
        ],
    })
