from datetime import datetime, timezone

from app import db


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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    symptom_records = db.relationship("SymptomRecord", backref="patient", lazy=True)
    alerts = db.relationship("Alert", backref="patient", lazy=True)

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
    answered_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

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
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

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


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    alert_type = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), default="medium")
    status = db.Column(db.String(20), default="active")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = db.Column(db.DateTime)

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
        }
