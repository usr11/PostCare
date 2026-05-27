"""HU4 — Historial Clínico Digital del Paciente.

Endpoint unificado que combina en un único feed ordenado:
  - Mensajes (bot, paciente, médico) incluyendo imágenes (HU1)
  - Alertas (creación, cierre, cancelación, SOS)
  - Recordatorios de medicación (toma, omisión, posponer)
  - Cuestionarios de síntomas (inicio y cierre)
  - Citas de control (creación, confirmación, reagendamiento, cancelación, sin respuesta)

Soporta filtros y paginación cursor-based para historial grande.

Query params:
  - filter=alerts        => sólo eventos críticos
  - from=YYYY-MM-DD      => límite inferior de fecha
  - to=YYYY-MM-DD        => límite superior de fecha
  - limit=N (1..100)     => paginación
  - before=ISO datetime  => cursor (timestamp del último evento ya cargado)
"""

from datetime import datetime, date, time, timedelta

from flask import Blueprint, jsonify, request

from app import db
from app.auth import can_access_patient, require_role
from app.models import (
    Alert,
    Appointment,
    MedicationReminder,
    Message,
    Patient,
    SymptomRecord,
)

timeline_bp = Blueprint("timeline", __name__)


READ_ROLES = ("clinician", "admin", "quality_lead", "admissions")

# Eventos considerados "alerta" para el filtro `?filter=alerts`.
ALERT_EVENT_TYPES = {
    "alert_created",
    "alert_resolved",
    "alert_cancelled",
    "sos_triggered",
    "appointment_no_response",
    "reminder_omitted",
    "questionnaire_incomplete",
}


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except (TypeError, ValueError):
        return None


def _bound_dt(d: date | None, end_of_day: bool) -> datetime | None:
    if d is None:
        return None
    return datetime.combine(d, time.max if end_of_day else time.min)


@timeline_bp.route("/patients/<int:patient_id>/timeline", methods=["GET"])
@require_role(*READ_ROLES)
def patient_timeline(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not can_access_patient(patient):
        return jsonify({"error": "No tienes acceso a este paciente."}), 403

    only_alerts = request.args.get("filter") == "alerts"
    dt_from = _bound_dt(_parse_date(request.args.get("from")), end_of_day=False)
    dt_to = _bound_dt(_parse_date(request.args.get("to")), end_of_day=True)
    before = _parse_dt(request.args.get("before"))
    try:
        limit = int(request.args.get("limit", "50"))
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 100))

    upper = before or dt_to or datetime.now() + timedelta(days=365)
    lower = dt_from or datetime(1970, 1, 1)

    events: list[dict] = []

    def _add(ts, etype, payload, severity="info", actor=None):
        if ts is None:
            return
        if ts > upper or ts < lower:
            return
        events.append({
            "ts": ts.isoformat(),
            "type": etype,
            "severity": severity,
            "actor": actor,
            "payload": payload,
        })

    # --- Mensajes (incluye fotos de herida vía attachment) ---
    msgs = (
        Message.query
        .filter_by(patient_id=patient_id)
        .filter(Message.created_at <= upper, Message.created_at >= lower)
        .order_by(Message.created_at.desc())
        .limit(limit * 4)
        .all()
    )
    for m in msgs:
        d = m.to_dict()
        etype = (
            "wound_image_uploaded"
            if d.get("attachment", {}) and d["attachment"].get("type") == "wound_image"
            else f"message_{m.sender}"
        )
        _add(
            m.created_at,
            etype,
            d,
            severity="info",
            actor=m.sender,
        )

    # --- Alertas ---
    alerts = (
        Alert.query
        .filter_by(patient_id=patient_id)
        .order_by(Alert.created_at.desc())
        .limit(limit * 4)
        .all()
    )
    for a in alerts:
        sev = "critical" if a.severity == "critical" else "warning"
        _add(
            a.created_at,
            "sos_triggered" if a.alert_type == "sos" else "alert_created",
            a.to_dict(),
            severity=sev,
            actor="system",
        )
        if a.resolved_at:
            _add(
                a.resolved_at,
                "alert_cancelled" if a.status == "cancelled" else "alert_resolved",
                a.to_dict(),
                severity="info",
                actor=a.resolved_by or "system",
            )

    # --- Recordatorios de medicación (taken/omitted/postponed) ---
    reminders = (
        MedicationReminder.query
        .filter_by(patient_id=patient_id)
        .order_by(MedicationReminder.scheduled_at.desc())
        .limit(limit * 4)
        .all()
    )
    for r in reminders:
        payload = r.to_dict()
        if r.status == "taken" and r.taken_at:
            _add(r.taken_at, "reminder_taken", payload, severity="info", actor="patient")
        elif r.status == "omitted":
            _add(r.scheduled_at, "reminder_omitted", payload, severity="warning", actor="system")
        elif r.status == "paused_by_sos":
            _add(r.scheduled_at, "reminder_paused_sos", payload, severity="info", actor="system")

    # --- Cuestionarios de síntomas ---
    records = (
        SymptomRecord.query
        .filter_by(patient_id=patient_id)
        .order_by(SymptomRecord.date.desc())
        .limit(limit * 2)
        .all()
    )
    for rec in records:
        if rec.started_at:
            _add(
                rec.started_at,
                "questionnaire_started",
                rec.to_dict(),
                severity="info",
                actor="patient",
            )
        if rec.completed_at:
            _add(
                rec.completed_at,
                "questionnaire_completed",
                rec.to_dict(),
                severity="info",
                actor="patient",
            )
        elif rec.status == "incomplete":
            anchor = rec.started_at or datetime.combine(rec.date, time(23, 59))
            _add(
                anchor,
                "questionnaire_incomplete",
                rec.to_dict(),
                severity="warning",
                actor="system",
            )

    # --- Citas ---
    appts = (
        Appointment.query
        .filter_by(patient_id=patient_id)
        .order_by(Appointment.created_at.desc())
        .limit(limit * 4)
        .all()
    )
    for a in appts:
        payload = a.to_dict()
        _add(a.created_at, "appointment_created", payload, severity="info", actor="clinician")
        if a.confirmed_at:
            _add(a.confirmed_at, "appointment_confirmed", payload, severity="info", actor="patient")
        if a.reschedule_requested_at:
            _add(
                a.reschedule_requested_at,
                "appointment_reschedule_requested",
                payload,
                severity="warning",
                actor="patient",
            )
        if a.status == "cancelled":
            _add(a.scheduled_at, "appointment_cancelled", payload, severity="info", actor="clinician")
        if a.status == "no_response":
            _add(
                a.scheduled_at,
                "appointment_no_response",
                payload,
                severity="warning",
                actor="system",
            )

    # --- Orden global desc + filtro alertas + paginación ---
    events.sort(key=lambda e: e["ts"], reverse=True)
    if only_alerts:
        events = [e for e in events if e["type"] in ALERT_EVENT_TYPES]
    has_more = len(events) > limit
    page = events[:limit]
    next_before = page[-1]["ts"] if page and has_more else None

    return jsonify({
        "events": page,
        "has_more": has_more,
        "next_before": next_before,
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "board_status": patient.board_status,
        },
    })
