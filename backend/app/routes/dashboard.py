from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from app import db
from app.models import Alert, Patient, SymptomRecord

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/patients", methods=["GET"])
def list_patients():
    patients = Patient.query.order_by(Patient.created_at.desc()).all()
    return jsonify([p.to_dict() for p in patients])


@dashboard_bp.route("/patients/<int:patient_id>", methods=["GET"])
def get_patient(patient_id):
    patient = db.get_or_404(Patient, patient_id)
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
def list_alerts():
    status = request.args.get("status", "active")
    query = Alert.query
    if status != "all":
        query = query.filter_by(status=status)
    alerts = query.order_by(Alert.created_at.desc()).all()
    return jsonify([a.to_dict() for a in alerts])


@dashboard_bp.route("/alerts/<int:alert_id>", methods=["GET"])
def get_alert(alert_id):
    alert = db.get_or_404(Alert, alert_id)
    return jsonify(alert.to_dict())


@dashboard_bp.route("/alerts/<int:alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id):
    """HU 3: cierre de alerta con nota obligatoria, registro de usuario,
    y control de concurrencia mediante optimistic locking."""
    data = request.get_json(silent=True) or {}
    note = (data.get("note") or "").strip()
    resolved_by = (data.get("resolved_by") or "").strip()
    expected_version = data.get("version")

    if not note:
        return jsonify({"error": "La nota u observación es obligatoria para cerrar la alerta."}), 400
    if not resolved_by:
        return jsonify({"error": "Debes identificarte para cerrar la alerta."}), 400

    alert = db.get_or_404(Alert, alert_id)

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
    alert.resolved_by = resolved_by
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
def alert_history(patient_id):
    db.get_or_404(Patient, patient_id)
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
def get_stats():
    total_patients = Patient.query.count()
    active_patients = Patient.query.filter_by(status="active").count()
    active_alerts = Alert.query.filter_by(status="active").count()
    sos_alerts = Alert.query.filter_by(alert_type="sos", status="active").count()
    completed_today = SymptomRecord.query.filter_by(status="completed").count()
    incomplete_today = SymptomRecord.query.filter_by(status="incomplete").count()

    return jsonify({
        "total_patients": total_patients,
        "active_patients": active_patients,
        "active_alerts": active_alerts,
        "sos_alerts": sos_alerts,
        "completed_records": completed_today,
        "incomplete_records": incomplete_today,
    })
