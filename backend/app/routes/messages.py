from flask import Blueprint, jsonify, request

from app import db
from app.models import Message, Patient

messages_bp = Blueprint("messages", __name__)


DOCTOR_PREFIX = "[Aviso Médico]:"


@messages_bp.route("/send", methods=["POST"])
def send_message():
    data = request.get_json()
    patient_id = data.get("patient_id")
    sender = data.get("sender")
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "El mensaje no puede estar vacío"}), 400
    if sender not in ("doctor", "patient"):
        return jsonify({"error": "Sender inválido"}), 400

    db.get_or_404(Patient, patient_id)

    if sender == "doctor" and not text.startswith(DOCTOR_PREFIX):
        text = f"{DOCTOR_PREFIX} {text}"

    message = Message(
        patient_id=patient_id,
        sender=sender,
        text=text,
    )
    db.session.add(message)
    db.session.commit()

    return jsonify(message.to_dict()), 201


@messages_bp.route("/<int:patient_id>", methods=["GET"])
def get_messages(patient_id):
    db.get_or_404(Patient, patient_id)
    after_id = request.args.get("after", 0, type=int)

    query = Message.query.filter_by(patient_id=patient_id)
    if after_id:
        query = query.filter(Message.id > after_id)

    messages = query.order_by(Message.created_at.asc()).all()
    return jsonify([m.to_dict() for m in messages])


@messages_bp.route("/<int:patient_id>/read", methods=["POST"])
def mark_as_read(patient_id):
    db.get_or_404(Patient, patient_id)
    Message.query.filter_by(
        patient_id=patient_id, sender="doctor", read=False
    ).update({"read": True})
    db.session.commit()
    return jsonify({"ok": True})
