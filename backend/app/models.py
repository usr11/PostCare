from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from app import db


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    @property
    def is_active(self):
        return bool(self.active)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "active": self.active,
        }


class Patient(db.Model):
    __tablename__ = "patients"

    id = db.Column(db.Integer, primary_key=True)
    document_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    surgery_type = db.Column(db.String(100), nullable=False)
    surgery_date = db.Column(db.Date, nullable=False)
    onboarded = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(20), default="pending")
    daily_questionnaire_time = db.Column(db.String(5), default="09:00")
    clinician_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    admitted_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    admitted_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())

    clinician = db.relationship("User", lazy=True, foreign_keys=[clinician_id])
    admitter = db.relationship("User", lazy=True, foreign_keys=[admitted_by])
    symptom_records = db.relationship("SymptomRecord", backref="patient", lazy=True)
    alerts = db.relationship("Alert", backref="patient", lazy=True)

    @property
    def board_status(self):
        active = [a for a in self.alerts if a.status == "active"]
        if any(a.severity == "critical" for a in active):
            return "rojo"
        if active:
            return "amarillo"
        return "verde"

    def to_dict(self):
        return {
            "id": self.id,
            "document_number": self.document_number,
            "name": self.name,
            "phone": self.phone,
            "surgery_type": self.surgery_type,
            "surgery_date": self.surgery_date.isoformat(),
            "onboarded": self.onboarded,
            "status": self.status,
            "daily_questionnaire_time": self.daily_questionnaire_time,
            "board_status": self.board_status,
            "clinician_id": self.clinician_id,
            "clinician_name": self.clinician.full_name if self.clinician else None,
            "admitted_by": self.admitted_by,
            "admitted_by_name": self.admitter.full_name if self.admitter else None,
            "admitted_at": self.admitted_at.isoformat() if self.admitted_at else None,
            "created_at": self.created_at.isoformat(),
        }


class ProtocolQuestion(db.Model):
    __tablename__ = "protocol_questions"

    id = db.Column(db.Integer, primary_key=True)
    surgery_type = db.Column(db.String(100), nullable=False, index=True)
    question_text = db.Column(db.Text, nullable=False)
    order = db.Column(db.Integer, nullable=False)
    options = db.Column(db.JSON, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "surgery_type": self.surgery_type,
            "question_text": self.question_text,
            "order": self.order,
            "options": self.options,
        }


class SymptomRecord(db.Model):
    __tablename__ = "symptom_records"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default="pending")
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    current_question_order = db.Column(db.Integer, default=0)

    answers = db.relationship("SymptomAnswer", backref="record", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "date": self.date.isoformat(),
            "status": self.status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "current_question_order": self.current_question_order,
            "answers": [a.to_dict() for a in self.answers],
        }


class SymptomAnswer(db.Model):
    __tablename__ = "symptom_answers"

    id = db.Column(db.Integer, primary_key=True)
    record_id = db.Column(db.Integer, db.ForeignKey("symptom_records.id"), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey("protocol_questions.id"), nullable=False)
    answer_value = db.Column(db.String(200), nullable=False)
    answered_at = db.Column(db.DateTime, default=lambda: datetime.now())

    question = db.relationship("ProtocolQuestion", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "record_id": self.record_id,
            "question_id": self.question_id,
            "answer_value": self.answer_value,
            "answered_at": self.answered_at.isoformat(),
            "question_text": self.question.question_text if self.question else None,
        }


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    sender = db.Column(db.String(20), nullable=False)
    text = db.Column(db.Text, nullable=False)
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())

    patient = db.relationship("Patient", backref=db.backref("messages", lazy=True))

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "sender": self.sender,
            "text": self.text,
            "read": self.read,
            "created_at": self.created_at.isoformat(),
        }


class Medication(db.Model):
    __tablename__ = "medications"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    dose = db.Column(db.String(100), nullable=False)
    schedule_times = db.Column(db.JSON, nullable=False)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())

    patient = db.relationship("Patient", backref=db.backref("medications", lazy=True))
    reminders = db.relationship("MedicationReminder", backref="medication", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "name": self.name,
            "dose": self.dose,
            "schedule_times": self.schedule_times,
            "active": self.active,
            "created_at": self.created_at.isoformat(),
        }


class MedicationReminder(db.Model):
    __tablename__ = "medication_reminders"

    id = db.Column(db.Integer, primary_key=True)
    medication_id = db.Column(db.Integer, db.ForeignKey("medications.id"), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    scheduled_at = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), default="pending")
    taken_at = db.Column(db.DateTime)
    postponed = db.Column(db.Boolean, default=False)
    postponed_to = db.Column(db.DateTime)

    patient = db.relationship("Patient", backref=db.backref("reminders", lazy=True))

    def to_dict(self):
        return {
            "id": self.id,
            "medication_id": self.medication_id,
            "patient_id": self.patient_id,
            "medication_name": self.medication.name if self.medication else None,
            "medication_dose": self.medication.dose if self.medication else None,
            "scheduled_at": self.scheduled_at.isoformat(),
            "status": self.status,
            "taken_at": self.taken_at.isoformat() if self.taken_at else None,
            "postponed": self.postponed,
            "postponed_to": self.postponed_to.isoformat() if self.postponed_to else None,
        }


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), default="medium")
    status = db.Column(db.String(20), default="active")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now())
    resolved_at = db.Column(db.DateTime)
    resolved_by = db.Column(db.String(120))
    resolution_note = db.Column(db.Text)
    version = db.Column(db.Integer, nullable=False, default=1)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "patient_name": self.patient.name if self.patient else None,
            "alert_type": self.alert_type,
            "message": self.message,
            "severity": self.severity,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolved_by": self.resolved_by,
            "resolution_note": self.resolution_note,
            "version": self.version,
        }
