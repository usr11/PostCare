from datetime import date

from app import db
from app.models import Medication, Patient, ProtocolQuestion


def seed_data():
    if Patient.query.first():
        return

    patients = [
        Patient(
            document_number="1234567890",
            name="María García López",
            phone="3001234567",
            surgery_type="Apendicectomía",
            surgery_date=date(2026, 4, 18),
        ),
        Patient(
            document_number="0987654321",
            name="Carlos Rodríguez Pérez",
            phone="3109876543",
            surgery_type="Colecistectomía",
            surgery_date=date(2026, 4, 19),
        ),
        Patient(
            document_number="1122334455",
            name="Ana Martínez Ruiz",
            phone="3201122334",
            surgery_type="Hernia Inguinal",
            surgery_date=date(2026, 4, 20),
        ),
    ]
    db.session.add_all(patients)

    yes_no = [
        {"label": "Sí", "value": "si"},
        {"label": "No", "value": "no"},
    ]
    pain_scale = [
        {"label": "Sin dolor", "value": "0"},
        {"label": "Leve (1-3)", "value": "leve"},
        {"label": "Moderado (4-6)", "value": "moderado"},
        {"label": "Severo (7-10)", "value": "severo"},
    ]
    temp_options = [
        {"label": "Normal (menor a 37.5°C)", "value": "normal"},
        {"label": "Fiebre leve (37.5-38°C)", "value": "fiebre_leve"},
        {"label": "Fiebre alta (mayor a 38°C)", "value": "fiebre_alta"},
        {"label": "No me he tomado la temperatura", "value": "no_medida"},
    ]
    general_state = [
        {"label": "Bien, me siento mejor", "value": "mejor"},
        {"label": "Igual que ayer", "value": "igual"},
        {"label": "Peor que ayer", "value": "peor"},
    ]

    common_questions = [
        ("¿Cómo calificarías tu nivel de dolor hoy?", 1, pain_scale),
        ("¿Has notado enrojecimiento, hinchazón o secreción en la herida?", 2, yes_no),
        ("¿Has podido tomar todos tus medicamentos según lo indicado?", 3, yes_no),
        ("¿Cómo ha estado tu temperatura?", 4, temp_options),
        ("¿Has presentado náuseas o vómito?", 5, yes_no),
        ("¿Cómo te sientes en general comparado con ayer?", 6, general_state),
    ]

    for surgery_type in ["Apendicectomía", "Colecistectomía", "Hernia Inguinal"]:
        for text, order, options in common_questions:
            db.session.add(ProtocolQuestion(
                surgery_type=surgery_type,
                question_text=text,
                order=order,
                options=options,
            ))

    db.session.commit()

    medications = [
        Medication(
            patient_id=1,
            name="Acetaminofén",
            dose="500 mg",
            schedule_times=["08:00", "14:00", "20:00"],
        ),
        Medication(
            patient_id=1,
            name="Amoxicilina",
            dose="875 mg",
            schedule_times=["09:00", "21:00"],
        ),
        Medication(
            patient_id=2,
            name="Ibuprofeno",
            dose="400 mg",
            schedule_times=["07:00", "15:00", "23:00"],
        ),
        Medication(
            patient_id=3,
            name="Cefalexina",
            dose="500 mg",
            schedule_times=["06:00", "14:00", "22:00"],
        ),
    ]
    db.session.add_all(medications)
    db.session.commit()
