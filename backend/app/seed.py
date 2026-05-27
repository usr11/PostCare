"""Seed de datos para demostración de las HU.

Hay dos puntos de entrada:

- ``seed_data()``  → se ejecuta al inicio de ``run.py`` y es idempotente:
  garantiza que existan usuarios y protocolos básicos si la BD está vacía.

- ``demo_seed()``  → carga un escenario rico para la presentación
  (clínicos con pacientes asignados, semáforo rojo/amarillo/verde,
  citas próximas, cuestionarios para reporte de cumplimiento).
  Está pensado para correrse contra una BD limpia (ver ``reset.py``).
"""

from datetime import date, datetime, timedelta

from app import db
from app.models import (
    Alert,
    Appointment,
    Medication,
    Message,
    Patient,
    ProtocolQuestion,
    SymptomAnswer,
    SymptomRecord,
    User,
)


# ----------------------------------------------------------------------------
#  Usuarios y protocolos (compartidos por seed_data y demo_seed)
# ----------------------------------------------------------------------------

USERS = [
    # email, password, full_name, role
    ("admin@postcare.co",       "admin123",      "Administrador",        "admin"),
    ("admisiones@postcare.co",  "admisiones123", "Admisiones PostCare",  "admissions"),
    ("calidad@postcare.co",     "calidad123",    "Jefe de Calidad",      "quality_lead"),
    ("dra.perez@postcare.co",   "clinico123",    "Dra. Laura Pérez",     "clinician"),
    ("dr.gomez@postcare.co",    "clinico123",    "Dr. Andrés Gómez",     "clinician"),
]


YES_NO = [
    {"label": "Sí", "value": "si"},
    {"label": "No", "value": "no"},
]
PAIN_SCALE = [
    {"label": "Sin dolor", "value": "0"},
    {"label": "Leve (1-3)", "value": "leve"},
    {"label": "Moderado (4-6)", "value": "moderado"},
    {"label": "Severo (7-10)", "value": "severo"},
]
TEMP_OPTIONS = [
    {"label": "Normal (menor a 37.5°C)", "value": "normal"},
    {"label": "Fiebre leve (37.5-38°C)", "value": "fiebre_leve"},
    {"label": "Fiebre alta (mayor a 38°C)", "value": "fiebre_alta"},
    {"label": "No me he tomado la temperatura", "value": "no_medida"},
]
GENERAL_STATE = [
    {"label": "Bien, me siento mejor", "value": "mejor"},
    {"label": "Igual que ayer", "value": "igual"},
    {"label": "Peor que ayer", "value": "peor"},
]

COMMON_QUESTIONS = [
    ("¿Cómo calificarías tu nivel de dolor hoy?", 1, PAIN_SCALE),
    ("¿Has notado enrojecimiento, hinchazón o secreción en la herida?", 2, YES_NO),
    ("¿Has podido tomar todos tus medicamentos según lo indicado?", 3, YES_NO),
    ("¿Cómo ha estado tu temperatura?", 4, TEMP_OPTIONS),
    ("¿Has presentado náuseas o vómito?", 5, YES_NO),
    ("¿Cómo te sientes en general comparado con ayer?", 6, GENERAL_STATE),
]

SURGERY_TYPES = ["Apendicectomía", "Colecistectomía", "Hernia Inguinal"]


def _seed_users():
    if User.query.first():
        return
    for email, pwd, name, role in USERS:
        u = User(email=email, full_name=name, role=role)
        u.set_password(pwd)
        db.session.add(u)
    db.session.commit()


def _seed_protocols():
    if ProtocolQuestion.query.first():
        return
    for surgery_type in SURGERY_TYPES:
        for text, order, options in COMMON_QUESTIONS:
            db.session.add(ProtocolQuestion(
                surgery_type=surgery_type,
                question_text=text,
                order=order,
                options=options,
            ))
    db.session.commit()


def _backfill_clinician_assignments():
    """Asigna en round-robin los pacientes sin clínico (para entornos
    con datos preexistentes)."""
    clinicians = User.query.filter_by(role="clinician", active=True).order_by(User.id).all()
    if not clinicians:
        return
    unassigned = Patient.query.filter_by(clinician_id=None).all()
    for i, p in enumerate(unassigned):
        p.clinician_id = clinicians[i % len(clinicians)].id
    if unassigned:
        db.session.commit()


def seed_data():
    """Seed mínimo idempotente. Llamado por run.py al arranque."""
    _seed_users()
    _seed_protocols()
    if Patient.query.first():
        _backfill_clinician_assignments()
        return
    # Si no hay pacientes, dejamos la BD lista pero vacía de pacientes:
    # quien quiera datos de demo debe correr scripts/reset.py
    return


# ----------------------------------------------------------------------------
#  demo_seed — escenario rico para la presentación
# ----------------------------------------------------------------------------

def _admin_id():
    u = User.query.filter_by(email="admin@postcare.co").first()
    return u.id if u else None


def _admissions_id():
    u = User.query.filter_by(email="admisiones@postcare.co").first()
    return u.id if u else None


def _clinicians():
    return {
        u.email: u
        for u in User.query.filter_by(role="clinician").order_by(User.id).all()
    }


def _make_patient(
    *, doc, name, phone, surgery_type, surgery_offset_days,
    onboarded, status, clinician, daily_time="09:00",
):
    today = date.today()
    return Patient(
        document_number=doc,
        name=name,
        phone=phone,
        surgery_type=surgery_type,
        surgery_date=today + timedelta(days=surgery_offset_days),
        onboarded=onboarded,
        status=status,
        clinician_id=clinician.id if clinician else None,
        daily_questionnaire_time=daily_time,
        admitted_by=_admissions_id(),
        admitted_at=datetime.now() - timedelta(days=max(0, -surgery_offset_days)),
    )


def _compliance_records(patient, q_by_protocol):
    """Genera ~7 días de SymptomRecord para alimentar HU-12 (cumplimiento).

    Mezcla completados, incompletos y un pending, para que el donut
    muestre porcentajes informativos.
    """
    today = date.today()
    plan = [
        ("completed", -6),
        ("completed", -5),
        ("incomplete", -4),
        ("completed", -3),
        ("completed", -2),
        ("incomplete", -1),
        ("pending",    0),
    ]
    questions = q_by_protocol.get(patient.surgery_type, [])
    for status, offset in plan:
        d = today + timedelta(days=offset)
        rec = SymptomRecord(
            patient_id=patient.id,
            date=d,
            status=status,
            started_at=datetime.combine(d, datetime.min.time()).replace(hour=9)
            if status != "pending" else None,
            completed_at=datetime.combine(d, datetime.min.time()).replace(hour=9, minute=12)
            if status == "completed" else None,
            current_question_order=len(questions) if status == "completed" else 2,
        )
        db.session.add(rec)
        db.session.flush()

        if status == "completed":
            for q in questions:
                # Damos una respuesta plausible por defecto
                default = q.options[0]["value"]
                db.session.add(SymptomAnswer(
                    record_id=rec.id, question_id=q.id, answer_value=default,
                ))


def _questions_by_protocol():
    out = {}
    for q in ProtocolQuestion.query.order_by(ProtocolQuestion.surgery_type, ProtocolQuestion.order):
        out.setdefault(q.surgery_type, []).append(q)
    return out


def demo_seed():
    """Carga el escenario de demostración. Asume BD limpia salvo usuarios/protocolos."""
    _seed_users()
    _seed_protocols()

    if Patient.query.first():
        raise RuntimeError(
            "Ya existen pacientes. Corre 'python reset.py' para limpiar antes."
        )

    clinicians = _clinicians()
    perez = clinicians.get("dra.perez@postcare.co")
    gomez = clinicians.get("dr.gomez@postcare.co")

    # --- Pacientes -----------------------------------------------------------
    # HU-09 (semáforo): mezclamos verde/amarillo/rojo via alertas.
    # HU-08 (multi-clinico): repartimos entre Dra. Pérez y Dr. Gómez.
    p_maria = _make_patient(
        doc="1234567890", name="María García López", phone="+573001234567",
        surgery_type="Apendicectomía", surgery_offset_days=-5,
        onboarded=True, status="active", clinician=perez,
    )
    p_carlos = _make_patient(
        doc="0987654321", name="Carlos Rodríguez Pérez", phone="+573109876543",
        surgery_type="Colecistectomía", surgery_offset_days=-3,
        onboarded=True, status="active", clinician=perez,
    )
    p_ana = _make_patient(
        doc="1122334455", name="Ana Martínez Ruiz", phone="+573201122334",
        surgery_type="Hernia Inguinal", surgery_offset_days=-2,
        onboarded=True, status="active", clinician=perez,
    )
    p_luis = _make_patient(
        doc="2233445566", name="Luis Hernández Vega", phone="+573145566778",
        surgery_type="Apendicectomía", surgery_offset_days=-4,
        onboarded=True, status="active", clinician=gomez,
    )
    p_sofia = _make_patient(
        doc="3344556677", name="Sofía Ramírez Castro", phone="+573123456789",
        surgery_type="Colecistectomía", surgery_offset_days=-6,
        onboarded=True, status="active", clinician=gomez,
    )

    # Paciente PENDIENTE — sirve para la demo del bot: ingresa documento,
    # confirma identidad, hace onboarding y queda activo durante la demo.
    p_diego = _make_patient(
        doc="5566778899", name="Diego Castro Núñez", phone="+573009998877",
        surgery_type="Apendicectomía", surgery_offset_days=-1,
        onboarded=False, status="pending", clinician=gomez,
    )

    db.session.add_all([p_maria, p_carlos, p_ana, p_luis, p_sofia, p_diego])
    db.session.commit()

    # --- Alertas (HU-09 semáforo) -------------------------------------------
    # Ana en ROJO: alerta crítica abierta (simula SOS reciente)
    db.session.add(Alert(
        patient_id=p_ana.id,
        alert_type="sos",
        message="Paciente activó botón S.O.S. — reporta dolor intenso.",
        severity="critical",
        status="active",
    ))
    # Carlos en AMARILLO: alerta media abierta
    db.session.add(Alert(
        patient_id=p_carlos.id,
        alert_type="symptom",
        message="Reporta enrojecimiento e hinchazón en la herida.",
        severity="medium",
        status="active",
    ))
    # Sofía en AMARILLO: alerta media abierta
    db.session.add(Alert(
        patient_id=p_sofia.id,
        alert_type="symptom",
        message="Dolor moderado persistente y náuseas.",
        severity="medium",
        status="active",
    ))
    # Una alerta ya RESUELTA para enriquecer historial / línea de tiempo
    resolved = Alert(
        patient_id=p_maria.id,
        alert_type="symptom",
        message="Reportó cuestionario incompleto el día 2 postquirúrgico.",
        severity="medium",
        status="resolved",
        resolved_at=datetime.now() - timedelta(days=1),
        resolved_by="Dra. Laura Pérez",
        resolution_note="Se llamó a la paciente. Refiere mejoría. Continúa esquema.",
    )
    db.session.add(resolved)

    # --- Medicamentos --------------------------------------------------------
    db.session.add_all([
        Medication(patient_id=p_maria.id, name="Acetaminofén", dose="500 mg",
                   schedule_times=["08:00", "14:00", "20:00"]),
        Medication(patient_id=p_maria.id, name="Amoxicilina", dose="875 mg",
                   schedule_times=["09:00", "21:00"]),
        Medication(patient_id=p_carlos.id, name="Ibuprofeno", dose="400 mg",
                   schedule_times=["07:00", "15:00", "23:00"]),
        Medication(patient_id=p_ana.id, name="Cefalexina", dose="500 mg",
                   schedule_times=["06:00", "14:00", "22:00"]),
    ])

    # --- Citas (HU-07) -------------------------------------------------------
    now = datetime.now()
    creator_id = _admissions_id() or _admin_id()

    # Cita lista para confirmar AHORA (≤24h, recordatorio ya enviado):
    # el bot del paciente la mostrará en cuanto entre al chat.
    db.session.add(Appointment(
        patient_id=p_maria.id,
        scheduled_at=now + timedelta(hours=18),
        location="Consultorio 305 — Clínica PostCare",
        notes="Control postquirúrgico día 7. Llevar resultados de laboratorio.",
        status="scheduled",
        reminder_sent_at=now,
        created_by=creator_id,
    ))
    # Cita para Diego (paciente pendiente) — útil si demuestras todo
    # el flujo: alta → onboarding → recordatorio de cita.
    db.session.add(Appointment(
        patient_id=p_diego.id,
        scheduled_at=now + timedelta(hours=22),
        location="Consultorio 210 — Clínica PostCare",
        notes="Primera consulta de control.",
        status="scheduled",
        reminder_sent_at=now,
        created_by=creator_id,
    ))
    # Cita futura (>24h) — aparecerá cuando el scheduler la active.
    db.session.add(Appointment(
        patient_id=p_carlos.id,
        scheduled_at=now + timedelta(days=3),
        location="Consultorio 402",
        notes="Retiro de puntos.",
        status="scheduled",
        created_by=creator_id,
    ))
    # Cita ya confirmada por el paciente (para mostrar el estado verde
    # en el panel del médico).
    db.session.add(Appointment(
        patient_id=p_luis.id,
        scheduled_at=now + timedelta(days=2),
        location="Consultorio 101",
        notes="Control general.",
        status="confirmed",
        reminder_sent_at=now - timedelta(hours=12),
        confirmed_at=now - timedelta(hours=11),
        created_by=creator_id,
    ))

    # --- Conversación inicial (para que el historial no salga vacío) --------
    db.session.add(Message(
        patient_id=p_maria.id, sender="bot",
        text="Hola María, soy PostCare Bot. ¿Cómo te has sentido hoy?",
        created_at=now - timedelta(hours=4),
    ))
    db.session.add(Message(
        patient_id=p_maria.id, sender="patient",
        text="Hola, hoy me siento mejor que ayer. Gracias.",
        created_at=now - timedelta(hours=4, minutes=-2),
    ))
    db.session.add(Message(
        patient_id=p_carlos.id, sender="doctor",
        text="[Aviso Médico]: Carlos, recuerda mantener limpia la zona de la herida.",
        created_at=now - timedelta(hours=20),
    ))

    db.session.commit()

    # --- Cuestionarios de cumplimiento (HU-12) -------------------------------
    q_by_protocol = _questions_by_protocol()
    for p in (p_maria, p_carlos, p_ana, p_luis, p_sofia):
        _compliance_records(p, q_by_protocol)
    db.session.commit()
