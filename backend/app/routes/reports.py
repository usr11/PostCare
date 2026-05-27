"""Reporte de cumplimiento (HU-12).

Mide encuestas respondidas vs ignoradas en un rango de fechas.

- Respondidas: SymptomRecord.status == "completed"
- Ignoradas: SymptomRecord.status en ("incomplete", "pending")
- "interrupted_by_sos" e "in_progress" se excluyen del cálculo (no
  son ni respondidas ni ignoradas todavía).
"""

from collections import OrderedDict
from datetime import date

from flask import Blueprint, jsonify, request

from app import db
from app.auth import require_role
from app.models import Patient, SymptomRecord

reports_bp = Blueprint("reports", __name__)


REPORT_ROLES = ("quality_lead", "admin")
RESPONDED_STATUSES = {"completed"}
IGNORED_STATUSES = {"incomplete", "pending"}


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


@reports_bp.route("/compliance", methods=["GET"])
@require_role(*REPORT_ROLES)
def compliance():
    date_from = _parse_date(request.args.get("from"))
    date_to = _parse_date(request.args.get("to"))

    if not date_from or not date_to:
        return jsonify({
            "error": "Debes proporcionar 'from' y 'to' en formato YYYY-MM-DD.",
        }), 400

    if date_from > date_to:
        return jsonify({
            "error": "La fecha de inicio no puede ser posterior a la fecha de fin.",
        }), 400

    records = (
        SymptomRecord.query
        .filter(SymptomRecord.date >= date_from)
        .filter(SymptomRecord.date <= date_to)
        .all()
    )

    responded = sum(1 for r in records if r.status in RESPONDED_STATUSES)
    ignored = sum(1 for r in records if r.status in IGNORED_STATUSES)
    total = responded + ignored

    by_day = OrderedDict()
    for r in records:
        if r.status not in RESPONDED_STATUSES and r.status not in IGNORED_STATUSES:
            continue
        day = r.date.isoformat()
        bucket = by_day.setdefault(day, {"date": day, "responded": 0, "ignored": 0})
        if r.status in RESPONDED_STATUSES:
            bucket["responded"] += 1
        else:
            bucket["ignored"] += 1

    return jsonify({
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "totals": {
            "responded": responded,
            "ignored": ignored,
            "total": total,
            "responded_pct": round(responded / total * 100, 1) if total else 0,
            "ignored_pct": round(ignored / total * 100, 1) if total else 0,
        },
        "by_day": sorted(by_day.values(), key=lambda x: x["date"]),
    })
