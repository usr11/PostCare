from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app import db
from app.models import Patient, ProtocolQuestion, SymptomAnswer, SymptomRecord

symptoms_bp = Blueprint("symptoms", __name__)


@symptoms_bp.route("/start/<int:patient_id>", methods=["POST"])
def start_questionnaire(patient_id):
    patient = db.get_or_404(Patient, patient_id)

    existing = SymptomRecord.query.filter_by(
        patient_id=patient_id, date=date.today()
    ).first()

    if existing and existing.status == "completed":
        return jsonify({"error": "Ya completaste el cuestionario de hoy."}), 400

    if existing and existing.status == "in_progress":
        now = datetime.now(timezone.utc)
        if existing.started_at and (now - existing.started_at) > timedelta(hours=1):
            existing.status = "incomplete"
            db.session.commit()
            return jsonify({
                "error": "El cuestionario expiró por inactividad.",
                "status": "incomplete",
            }), 400

        question = ProtocolQuestion.query.filter_by(
            surgery_type=patient.surgery_type,
            order=existing.current_question_order,
        ).first()

        return jsonify({
            "record_id": existing.id,
            "question": question.to_dict() if question else None,
            "status": "in_progress",
        })

    record = SymptomRecord(
        patient_id=patient_id,
        date=date.today(),
        status="in_progress",
        started_at=datetime.now(timezone.utc),
        current_question_order=1,
    )
    db.session.add(record)
    db.session.commit()

    first_question = ProtocolQuestion.query.filter_by(
        surgery_type=patient.surgery_type, order=1
    ).first()

    return jsonify({
        "record_id": record.id,
        "question": first_question.to_dict() if first_question else None,
        "status": "in_progress",
        "message": "Hola, es hora de tu seguimiento diario. Vamos a revisar cómo te sientes hoy.",
    })


@symptoms_bp.route("/answer", methods=["POST"])
def submit_answer():
    data = request.get_json()
    record_id = data.get("record_id")
    question_id = data.get("question_id")
    answer_value = data.get("answer_value")

    if not all([record_id, question_id, answer_value]):
        return jsonify({"error": "Datos incompletos"}), 400

    record = db.get_or_404(SymptomRecord, record_id)

    if record.status != "in_progress":
        return jsonify({"error": "Este cuestionario ya no está activo."}), 400

    now = datetime.now(timezone.utc)
    if record.started_at and (now - record.started_at) > timedelta(hours=1):
        record.status = "incomplete"
        db.session.commit()
        return jsonify({
            "error": "El cuestionario expiró por inactividad (más de 1 hora).",
            "status": "incomplete",
        }), 400

    question = db.get_or_404(ProtocolQuestion, question_id)
    valid_options = [opt["value"] for opt in question.options]

    if answer_value not in valid_options:
        return jsonify({
            "error": "Por favor usa las opciones proporcionadas.",
            "question": question.to_dict(),
            "status": "invalid_answer",
        }), 400

    answer = SymptomAnswer(
        record_id=record_id,
        question_id=question_id,
        answer_value=answer_value,
    )
    db.session.add(answer)

    patient = db.get_or_404(Patient, record.patient_id)
    next_order = question.order + 1
    next_question = ProtocolQuestion.query.filter_by(
        surgery_type=patient.surgery_type, order=next_order
    ).first()

    if next_question:
        record.current_question_order = next_order
        db.session.commit()
        return jsonify({
            "question": next_question.to_dict(),
            "status": "in_progress",
        })

    record.status = "completed"
    record.completed_at = now
    db.session.commit()

    return jsonify({
        "question": None,
        "status": "completed",
        "message": (
            "¡Gracias por completar tu seguimiento de hoy! "
            "Tu información ha sido registrada. Cuídate mucho y nos vemos mañana."
        ),
    })


@symptoms_bp.route("/history/<int:patient_id>", methods=["GET"])
def get_history(patient_id):
    db.get_or_404(Patient, patient_id)
    records = (
        SymptomRecord.query
        .filter_by(patient_id=patient_id)
        .order_by(SymptomRecord.date.desc())
        .limit(30)
        .all()
    )
    return jsonify([r.to_dict() for r in records])
