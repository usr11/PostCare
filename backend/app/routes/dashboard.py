from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_login import current_user

from app import db
from app.auth import can_access_patient, require_role
from app.models import Alert, Patient, SymptomRecord

dashboard_bp = Blueprint("dashboard", __name__)


READ_ROLES = ("clinician", "admin", "quality_lead", "admissions")
RESOLVE_ROLES = ("clinician", "admin")


def _scope_patients(query):
    """Limita los pacientes a los que el usuario actual puede ver."""
    if current_user.role == "clinician":
        return query.filter(Patient.clinician_id == current_user.id)
    return query


@dashboard_bp.route("/patients", methods=["GET"])
@require_role(*READ_ROLES)
def list_patients():
    """HU-09 C1: por defecto solo pacientes activos.
    `?include_inactive=true` devuelve la lista completa para casos administrativos.
    """
    include_inactive = request.args.get("include_inactive") == "true"
    q = _scope_patients(Patient.query)
    if not include_inactive:
        q = q.filter(Patient.status == "active")
    patients = q.order_by(Patient.created_at.desc()).all()
    return jsonify([p.to_dict() for p in patients])


@dashboard_bp.route("/patients/<int:patient_id>", methods=["GET"])
@require_role(*READ_ROLES)
def get_patient(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403
    records = (
        SymptomRecord.query
        .filter_by(patient_id=patient_id)
        .order_by(SymptomRecord.date.desc())
        .all()
    )
    alerts = (
        Alert.query
        .filter_by(patient_id=patient_id)
        .order_by(Alert.created_at.desc())
        .all()
    )
    return jsonify({
        "patient": patient.to_dict(),
        "records": [r.to_dict() for r in records],
        "alerts": [a.to_dict() for a in alerts],
    })


@dashboard_bp.route("/alerts", methods=["GET"])
@require_role(*READ_ROLES)
def list_alerts():
    status = request.args.get("status", "active")
    query = Alert.query.join(Patient, Alert.patient_id == Patient.id)
    if status != "all":
        query = query.filter(Alert.status == status)
    if current_user.role == "clinician":
        query = query.filter(Patient.clinician_id == current_user.id)
    alerts = query.order_by(Alert.created_at.desc()).all()
    return jsonify([a.to_dict() for a in alerts])


@dashboard_bp.route("/alerts/<int:alert_id>", methods=["GET"])
@require_role(*READ_ROLES)
def get_alert(alert_id):
    alert = db.get_or_404(Alert, alert_id)
    if not can_access_patient(alert.patient):
        return jsonify({"error": "No tienes acceso a esta alerta"}), 403
    return jsonify(alert.to_dict())


@dashboard_bp.route("/alerts/<int:alert_id>/resolve", methods=["POST"])
@require_role(*RESOLVE_ROLES)
def resolve_alert(alert_id):
    """HU 3: cierre de alerta con nota obligatoria, registro de usuario,
    y control de concurrencia mediante optimistic locking."""
    data = request.get_json(silent=True) or {}
    note = (data.get("note") or "").strip()
    expected_version = data.get("version")

    if not note:
        return jsonify({"error": "La nota u observación es obligatoria para cerrar la alerta."}), 400

    alert = db.get_or_404(Alert, alert_id)

    if not can_access_patient(alert.patient):
        return jsonify({"error": "No tienes acceso a esta alerta"}), 403

    if alert.status != "active":
        return jsonify({
            "error": "Esta alerta ya fue cerrada.",
            "alert": alert.to_dict(),
        }), 409

    if expected_version is not None and alert.version != expected_version:
        return jsonify({
            "error": (
                "Otro usuario actualizó esta alerta mientras la editabas. "
                "Recarga para ver los cambios más recientes."
            ),
            "current_version": alert.version,
            "alert": alert.to_dict(),
        }), 409

    alert.status = "resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = current_user.full_name
    alert.resolution_note = note
    alert.version = (alert.version or 1) + 1

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Conflicto al guardar. Intenta de nuevo."}), 409

    patient = db.session.get(Patient, alert.patient_id)
    return jsonify({
        "alert": alert.to_dict(),
        "patient_board_status": patient.board_status if patient else None,
    })


@dashboard_bp.route("/alerts/history/<int:patient_id>", methods=["GET"])
@require_role(*READ_ROLES)
def alert_history(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente"}), 403
    alerts = (
        Alert.query
        .filter_by(patient_id=patient_id)
        .filter(Alert.status.in_(("resolved", "cancelled")))
        .order_by(Alert.resolved_at.desc())
        .limit(50)
        .all()
    )
    return jsonify([a.to_dict() for a in alerts])


@dashboard_bp.route("/stats", methods=["GET"])
@require_role(*READ_ROLES)
def get_stats():
    patient_q = _scope_patients(Patient.query)
    total_patients = patient_q.count()
    active_patients = patient_q.filter(Patient.status == "active").count()

    alert_q = Alert.query
    if current_user.role == "clinician":
        alert_q = alert_q.join(Patient, Alert.patient_id == Patient.id).filter(
            Patient.clinician_id == current_user.id
        )
    active_alerts = alert_q.filter(Alert.status == "active").count()
    sos_alerts = alert_q.filter(
        Alert.alert_type == "sos", Alert.status == "active"
    ).count()

    record_q = SymptomRecord.query
    if current_user.role == "clinician":
        record_q = record_q.join(Patient, SymptomRecord.patient_id == Patient.id).filter(
            Patient.clinician_id == current_user.id
        )
    completed_today = record_q.filter(SymptomRecord.status == "completed").count()
    incomplete_today = record_q.filter(SymptomRecord.status == "incomplete").count()

    return jsonify({
        "total_patients": total_patients,
        "active_patients": active_patients,
        "active_alerts": active_alerts,
        "sos_alerts": sos_alerts,
        "completed_records": completed_today,
        "incomplete_records": incomplete_today,
    })
