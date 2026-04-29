import os
from datetime import date

from flask import Blueprint, jsonify, request
from groq import Groq

from app import db
from app.models import Patient

chat_bp = Blueprint("chat", __name__)

_SYSTEM = """Eres PostCare Bot, un asistente de seguimiento postquirúrgico empático y cálido.
Acompañas a pacientes colombianos durante su recuperación después de una cirugía.

Datos del paciente con quien hablas:
- Nombre: {name}
- Tipo de cirugía: {surgery_type}
- Fecha de cirugía: {surgery_date}
- Días desde la cirugía: {days}

Reglas de comportamiento:
1. Habla siempre en español latinoamericano, de manera cercana y cálida, como un amigo experto en salud.
2. Sé conciso: máximo 3-4 oraciones por respuesta.
3. Si el paciente menciona síntomas graves (dolor intenso, fiebre alta, sangrado abundante, dificultad para respirar, mareo severo, herida infectada o cualquier emergencia), termina tu respuesta con el marcador exacto [SUGERIR_SOS] y dile explícitamente que presione el botón rojo S.O.S.
4. Si el paciente se siente bien o está mejorando, alégrate genuinamente y anímalo con calidez.
5. Nunca diagnostiques ni recetes medicamentos. Ante síntomas preocupantes orienta a buscar ayuda médica.
6. Si el paciente hace preguntas sobre su recuperación, responde de forma general y tranquilizadora, recordándole seguir las indicaciones de su médico."""


@chat_bp.route("/ai", methods=["POST"])
def ai_chat():
    data = request.get_json()
    patient_id = data.get("patient_id")
    message = data.get("message", "").strip()
    history = data.get("history", [])

    if not message:
        return jsonify({"error": "Mensaje vacío"}), 400

    patient = db.get_or_404(Patient, patient_id)

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "pega_tu_api_key_aqui":
        return jsonify({"error": "IA no configurada. Agrega GROQ_API_KEY al archivo .env"}), 503

    days = (date.today() - patient.surgery_date).days
    system_content = _SYSTEM.format(
        name=patient.name,
        surgery_type=patient.surgery_type,
        surgery_date=patient.surgery_date.isoformat(),
        days=days,
    )

    client = Groq(api_key=api_key)
    messages = [{"role": "system", "content": system_content}]
    messages.extend(history[-10:])  # últimos 10 turnos para no exceder tokens
    messages.append({"role": "user", "content": message})

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=350,
        temperature=0.75,
    )

    reply = completion.choices[0].message.content
    suggest_sos = "[SUGERIR_SOS]" in reply
    reply_clean = reply.replace("[SUGERIR_SOS]", "").strip()

    return jsonify({"reply": reply_clean, "suggest_sos": suggest_sos})
