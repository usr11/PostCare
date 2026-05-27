"""Comandos CLI registrados en la app Flask.

Uso (con el venv activo, desde /backend):

    flask --app run reset-db          # limpia BD + uploads + carga demo
    flask --app run reset-db --empty  # sólo usuarios y protocolos
    flask --app run seed-demo         # recarga el demo sin borrar uploads
    flask --app run db-status         # imprime resumen rápido

Si exportas FLASK_APP=run.py puedes omitir el --app:

    export FLASK_APP=run.py
    flask reset-db
"""

import os
import shutil

import click
from flask.cli import with_appcontext
from flask_migrate import stamp as alembic_stamp

from app import db
from app.config import Config
from app.models import (
    Alert,
    Appointment,
    Patient,
    SymptomRecord,
    User,
    WoundImage,
)
from app.seed import demo_seed, seed_data


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _delete_sqlite_db():
    uri = Config.SQLALCHEMY_DATABASE_URI
    if not uri.startswith("sqlite:///"):
        click.echo(f"[reset] DATABASE_URL no es sqlite ({uri}); abortando.")
        raise click.Abort()
    path = uri.replace("sqlite:///", "", 1)
    if not os.path.isabs(path):
        path = os.path.abspath(os.path.join(BASE_DIR, "app", path))
    # En algunos entornos la ruta queda con '/..' en medio: normalizar.
    path = os.path.normpath(path)
    if os.path.exists(path):
        os.remove(path)
        click.echo(f"[reset] BD borrada: {path}")


def _delete_uploads():
    folder = Config.UPLOAD_FOLDER
    if not os.path.isabs(folder):
        folder = os.path.abspath(os.path.join(BASE_DIR, folder))
    if os.path.exists(folder):
        shutil.rmtree(folder)
        click.echo(f"[reset] Uploads borrados: {folder}")


@click.command("reset-db")
@click.option(
    "--empty",
    is_flag=True,
    default=False,
    help="No cargues pacientes de demo; sólo usuarios y protocolos.",
)
@click.option(
    "--keep-uploads",
    is_flag=True,
    default=False,
    help="No borrar /uploads (conserva fotos previamente subidas).",
)
@with_appcontext
def reset_db_cmd(empty, keep_uploads):
    """Limpia BD (y opcionalmente /uploads), aplica esquema y carga seed."""
    # Cerrar la sesión SQLAlchemy antes de borrar el archivo.
    db.session.remove()
    db.engine.dispose()

    _delete_sqlite_db()
    if not keep_uploads:
        _delete_uploads()

    db.create_all()
    alembic_stamp(revision="head")
    click.echo("[reset] Esquema creado y alembic marcado en HEAD.")

    if empty:
        seed_data()
        click.echo("[reset] Listo: usuarios y protocolos, sin pacientes.")
    else:
        demo_seed()
        click.echo("[reset] Listo: escenario de demostración cargado.")


@click.command("seed-demo")
@with_appcontext
def seed_demo_cmd():
    """Carga el demo seed contra una BD que ya está vacía de pacientes."""
    demo_seed()
    click.echo("Demo seed cargado.")


@click.command("db-status")
@with_appcontext
def db_status_cmd():
    """Resumen rápido del contenido de la BD."""
    click.echo(f"Usuarios:    {User.query.count()}")
    click.echo(f"Pacientes:   {Patient.query.count()}")
    click.echo(f"Alertas:     {Alert.query.filter_by(status='active').count()} activas")
    click.echo(f"Citas:       {Appointment.query.count()}")
    click.echo(f"Cuestionarios: {SymptomRecord.query.count()}")
    click.echo(f"Imágenes:    {WoundImage.query.count()}")


def register_cli(app):
    app.cli.add_command(reset_db_cmd)
    app.cli.add_command(seed_demo_cmd)
    app.cli.add_command(db_status_cmd)
