"""Endpoints de admisiones (HU-14).

- Crear pacientes nuevos
- Asignar/reasignar al clínico responsable
- Listar clínicos disponibles para el dropdown del form
"""

import re
from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user

from app import db
from app.auth import require_role
from app.models import Patient, ProtocolQuestion, User

admissions_bp = Blueprint("admissions", __name__)


ADMIN_ROLES = ("admissions", "admin")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# E.164-ish: '+' + 7..15 dígitos. Cubre indicativos como +57 (Colombia).
PHONE_RE = re.compile(r"^\+\d{7,15}$")


def _existing_surgery_types():
    rows = db.session.query(ProtocolQuestion.surgery_type).distinct().all()
    return {r[0] for r in rows}


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


@admissions_bp.route("/clinicians", methods=["GET"])
@require_role(*ADMIN_ROLES, "clinician", "quality_lead")
def list_clinicians():
    clinicians = (
        User.query
        .filter_by(role="clinician", active=True)
        .order_by(User.full_name.asc())
        .all()
    )
    return jsonify([
        {"id": c.id, "full_name": c.full_name, "email": c.email}
        for c in clinicians
    ])


@admissions_bp.route("/patients", methods=["POST"])
@require_role(*ADMIN_ROLES)
def create_patient():
    data = request.get_json(silent=True) or {}

    document_number = (data.get("document_number") or "").strip()
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    surgery_type = (data.get("surgery_type") or "").strip()
    surgery_date = _parse_date(data.get("surgery_date"))
    daily_time = (data.get("daily_questionnaire_time") or "09:00").strip()
    clinician_id = data.get("clinician_id")

    if not document_number or not name or not phone or not surgery_type or not surgery_date:
        return jsonify({
            "error": "Documento, nombre, teléfono, protocolo y fecha de cirugía son obligatorios."
        }), 400

    if not PHONE_RE.match(phone):
        return jsonify({
            "error": "El teléfono debe incluir el indicativo de país (ej. +573001234567).",
        }), 400

    if not TIME_RE.match(daily_time):
        return jsonify({"error": "Hora del cuestionario debe tener formato HH:MM."}), 400

    if surgery_type not in _existing_surgery_types():
        return jsonify({
            "error": f"El protocolo '{surgery_type}' no existe.",
        }), 400

    existing = Patient.query.filter_by(document_number=document_number).first()
    if existing:
        if existing.status == "active":
            return jsonify({
                "error": "Este documento ya pertenece a un paciente activo.",
            }), 409
        return jsonify({
            "error": (
                "Este documento ya está registrado en el sistema "
                f"(estado actual: {existing.status})."
            ),
        }), 409

    if clinician_id is not None:
        clinician = db.session.get(User, clinician_id)
        if not clinician or clinician.role != "clinician" or not clinician.active:
            return jsonify({"error": "Clínico inválido."}), 400

    patient = Patient(
        document_number=document_number,
        name=name,
        phone=phone,
        surgery_type=surgery_type,
        surgery_date=surgery_date,
        daily_questionnaire_time=daily_time,
        clinician_id=clinician_id,
        admitted_by=current_user.id,
        admitted_at=datetime.now(),
    )
    db.session.add(patient)
    db.session.commit()

    return jsonify(patient.to_dict()), 201


@admissions_bp.route("/patients/<int:patient_id>/assign", methods=["POST"])
@require_role(*ADMIN_ROLES)
def assign_clinician(patient_id):
    data = request.get_json(silent=True) or {}
    clinician_id = data.get("clinician_id")

    patient = db.get_or_404(Patient, patient_id)

    if clinician_id in (None, "", 0):
        patient.clinician_id = None
        db.session.commit()
        return jsonify(patient.to_dict())

    clinician = db.session.get(User, clinician_id)
    if not clinician or clinician.role != "clinician" or not clinician.active:
        return jsonify({"error": "Clínico inválido."}), 400

    patient.clinician_id = clinician.id
    db.session.commit()
    return jsonify(patient.to_dict())


@admissions_bp.route("/patients", methods=["GET"])
@require_role(*ADMIN_ROLES)
def list_all_patients():
    """Vista de admisiones: ve todos los pacientes con su asignación."""
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return jsonify([p.to_dict() for p in patients])
