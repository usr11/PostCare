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


@dashboard_bp.route("/alerts/<int:alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id):
    alert = db.get_or_404(Alert, alert_id)
    alert.status = "resolved"
    alert.resolved_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(alert.to_dict())


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
