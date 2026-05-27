"""Scheduler de tareas en segundo plano.

HU 4: dispara recordatorios de medicamentos a la hora exacta y marca
"Omitida" tras 2h sin confirmación.

HU 5: dispara el cuestionario diario en la hora configurada por paciente.
"""

import logging
from datetime import date, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger("postcare.scheduler")
_scheduler = None


def _generate_reminders():
    from app import db
    from app.models import Medication, MedicationReminder

    today = date.today()
    meds = Medication.query.filter_by(active=True).all()
    created = 0

    for med in meds:
        for time_str in med.schedule_times or []:
            try:
                hour, minute = map(int, time_str.split(":"))
            except (ValueError, AttributeError):
                continue
            scheduled = datetime(today.year, today.month, today.day, hour, minute)
            exists = MedicationReminder.query.filter_by(
                medication_id=med.id, scheduled_at=scheduled
            ).first()
            if not exists:
                db.session.add(MedicationReminder(
                    medication_id=med.id,
                    patient_id=med.patient_id,
                    scheduled_at=scheduled,
                ))
                created += 1

    if created:
        db.session.commit()
        logger.info("scheduler: generated %d reminders", created)


def _expire_overdue_reminders():
    from app import db
    from app.models import MedicationReminder

    cutoff = datetime.now() - timedelta(hours=2)
    overdue = (
        MedicationReminder.query
        .filter_by(status="pending")
        .filter(MedicationReminder.scheduled_at <= cutoff)
        .all()
    )
    for r in overdue:
        r.status = "omitted"
    if overdue:
        db.session.commit()
        logger.info("scheduler: marked %d reminders as omitted", len(overdue))


def _create_daily_symptom_records():
    """A la hora configurada por paciente, crear el SymptomRecord pendiente del día.

    El cuestionario inicia formalmente cuando el paciente lo abra (no podemos
    push-notificar sin app móvil real), pero el record queda creado para
    aparecer como pendiente en el panel y en el chat al abrirlo.
    """
    from app import db
    from app.models import Patient, SymptomRecord

    now = datetime.now()
    current = now.strftime("%H:%M")
    today = now.date()

    patients = Patient.query.filter_by(onboarded=True, status="active").all()
    created = 0

    for p in patients:
        if (p.daily_questionnaire_time or "09:00") != current:
            continue
        existing = SymptomRecord.query.filter_by(
            patient_id=p.id, date=today
        ).first()
        if existing:
            continue
        db.session.add(SymptomRecord(
            patient_id=p.id,
            date=today,
            status="pending",
            current_question_order=0,
        ))
        created += 1

    if created:
        db.session.commit()
        logger.info("scheduler: scheduled %d daily questionnaires", created)


def _send_appointment_reminders():
    """HU-07/HU2: marca el recordatorio de citas cuando faltan ≤ 24h.

    El paciente las descubre vía polling en /api/appointments/upcoming/<id>.
    Idempotencia: sólo se marcan citas con reminder_sent_at NULL.
    """
    from app import db
    from app.models import Appointment

    now = datetime.now()
    window_end = now + timedelta(hours=24)

    appts = (
        Appointment.query
        .filter_by(status="scheduled")
        .filter(Appointment.reminder_sent_at.is_(None))
        .filter(Appointment.scheduled_at > now)
        .filter(Appointment.scheduled_at <= window_end)
        .all()
    )
    for a in appts:
        a.reminder_sent_at = now
    if appts:
        db.session.commit()
        logger.info("scheduler: marked %d appointment reminders", len(appts))


def _mark_no_response_appointments():
    """HU2: marca como `no_response` las citas cuyo recordatorio fue
    enviado, la fecha programada ya pasó (con margen de 2h para reportes
    tardíos), y el paciente no confirmó ni pidió reagendar.

    Trazabilidad: el estado queda visible en el dashboard y el historial.
    """
    from app import db
    from app.models import Appointment

    cutoff = datetime.now() - timedelta(hours=2)
    stale = (
        Appointment.query
        .filter_by(status="scheduled")
        .filter(Appointment.reminder_sent_at.isnot(None))
        .filter(Appointment.scheduled_at < cutoff)
        .all()
    )
    for a in stale:
        a.status = "no_response"
    if stale:
        db.session.commit()
        logger.info("scheduler: marked %d appointments as no_response", len(stale))


def _expire_pending_questionnaires():
    """Marca cuestionarios in_progress no respondidos por más de 1 hora."""
    from app import db
    from app.models import SymptomRecord

    cutoff = datetime.now() - timedelta(hours=1)
    expired = (
        SymptomRecord.query
        .filter_by(status="in_progress")
        .filter(SymptomRecord.started_at <= cutoff)
        .all()
    )
    for r in expired:
        r.status = "incomplete"
    if expired:
        db.session.commit()
        logger.info("scheduler: marked %d questionnaires as incomplete", len(expired))


def _wrap_with_app_context(app, fn):
    def runner():
        with app.app_context():
            try:
                fn()
            except Exception as exc:
                logger.exception("scheduler job failed: %s", exc)
    return runner


def start_scheduler(app):
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    sched = BackgroundScheduler(daemon=True, timezone="America/Bogota")

    sched.add_job(
        _wrap_with_app_context(app, _generate_reminders),
        "interval", minutes=1, id="generate_reminders",
        max_instances=1, coalesce=True,
    )
    sched.add_job(
        _wrap_with_app_context(app, _expire_overdue_reminders),
        "interval", minutes=1, id="expire_reminders",
        max_instances=1, coalesce=True,
    )
    sched.add_job(
        _wrap_with_app_context(app, _create_daily_symptom_records),
        "cron", minute="*", id="create_daily_questionnaires",
        max_instances=1, coalesce=True,
    )
    sched.add_job(
        _wrap_with_app_context(app, _expire_pending_questionnaires),
        "interval", minutes=5, id="expire_questionnaires",
        max_instances=1, coalesce=True,
    )
    sched.add_job(
        _wrap_with_app_context(app, _send_appointment_reminders),
        "interval", minutes=1, id="appointment_reminders",
        max_instances=1, coalesce=True,
    )
    sched.add_job(
        _wrap_with_app_context(app, _mark_no_response_appointments),
        "interval", minutes=15, id="appointment_no_response",
        max_instances=1, coalesce=True,
    )

    sched.start()
    _scheduler = sched
    logger.info("scheduler: started")
    return sched
