"""Migración manual ligera para SQLite — agrega columnas que no existen.

Flask-SQLAlchemy.create_all() no aplica ALTER TABLE sobre tablas ya creadas.
Para evitar romper datos existentes en dev, hacemos checks y aplicamos cambios.
"""

from sqlalchemy import inspect, text

from app import db


def _column_exists(table, column):
    inspector = inspect(db.engine)
    return any(c["name"] == column for c in inspector.get_columns(table))


def run_migrations():
    statements = []

    if not _column_exists("alerts", "resolved_by"):
        statements.append("ALTER TABLE alerts ADD COLUMN resolved_by VARCHAR(120)")
    if not _column_exists("alerts", "resolution_note"):
        statements.append("ALTER TABLE alerts ADD COLUMN resolution_note TEXT")
    if not _column_exists("alerts", "version"):
        statements.append("ALTER TABLE alerts ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
    if not _column_exists("patients", "daily_questionnaire_time"):
        statements.append(
            "ALTER TABLE patients ADD COLUMN daily_questionnaire_time VARCHAR(5) DEFAULT '09:00'"
        )

    if not statements:
        return

    with db.engine.begin() as conn:
        for s in statements:
            conn.execute(text(s))
