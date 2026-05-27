"""Endpoints de protocolos (HU-13).

- Listar protocolos disponibles (derivados de ProtocolQuestion.surgery_type).
- Cambiar el protocolo asignado a un paciente.
"""

from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from app import db
from app.auth import can_access_patient, require_role
from app.models import Patient, ProtocolQuestion, SymptomRecord

protocols_bp = Blueprint("protocols", __name__)


READ_ROLES = ("clinician", "admin", "quality_lead", "admissions")
WRITE_ROLES = ("clinician", "admin", "admissions")


@protocols_bp.route("/protocols", methods=["GET"])
@require_role(*READ_ROLES)
def list_protocols():
    rows = (
        db.session.query(
            ProtocolQuestion.surgery_type,
            func.count(ProtocolQuestion.id).label("question_count"),
        )
        .group_by(ProtocolQuestion.surgery_type)
        .order_by(ProtocolQuestion.surgery_type.asc())
        .all()
    )
    return jsonify([
        {"surgery_type": s, "question_count": int(c)} for s, c in rows
    ])


@protocols_bp.route("/patients/<int:patient_id>/protocol", methods=["PUT"])
@require_role(*WRITE_ROLES)
def assign_protocol(patient_id):
    data = request.get_json(silent=True) or {}
    surgery_type = (data.get("surgery_type") or "").strip()

    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403

    if not surgery_type:
        return jsonify({"error": "surgery_type es requerido."}), 400

    exists = (
        db.session.query(ProtocolQuestion.id)
        .filter_by(surgery_type=surgery_type)
        .first()
    )
    if not exists:
        return jsonify({
            "error": f"El protocolo '{surgery_type}' no existe.",
        }), 400

    if patient.surgery_type == surgery_type:
        return jsonify(patient.to_dict())

    in_progress = (
        SymptomRecord.query
        .filter_by(patient_id=patient.id, date=date.today(), status="in_progress")
        .first()
    )
    if in_progress:
        return jsonify({
            "error": (
                "Hay un cuestionario en curso hoy. No se puede cambiar el "
                "protocolo hasta que se complete o expire."
            ),
        }), 409

    patient.surgery_type = surgery_type
    db.session.commit()
    return jsonify(patient.to_dict())
