"""Limpia la BD y los archivos subidos, aplica migraciones y carga el demo seed.

Uso (desde /backend con el venv activo):

    python reset.py                # limpia y recarga el seed de demo
    python reset.py --empty        # sólo usuarios y protocolos, sin pacientes

Después puedes correr ``python run.py`` para levantar el backend.

CUIDADO: borra la base de datos sqlite y todo el directorio /uploads.
"""

import os
import shutil
import sys

from flask_migrate import stamp as alembic_stamp

from app import create_app, db
from app.config import Config
from app.seed import demo_seed, seed_data


BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _delete_sqlite_db():
    uri = Config.SQLALCHEMY_DATABASE_URI
    if not uri.startswith("sqlite:///"):
        print(f"[reset] DATABASE_URL no es sqlite ({uri}); abortando.")
        sys.exit(1)
    path = uri.replace("sqlite:///", "", 1)
    # Resolver rutas relativas a la carpeta /backend.
    if not os.path.isabs(path):
        path = os.path.abspath(os.path.join(BASE_DIR, path))
    if os.path.exists(path):
        os.remove(path)
        print(f"[reset] BD borrada: {path}")
    else:
        print(f"[reset] No había BD previa en {path}")


def _delete_uploads():
    folder = Config.UPLOAD_FOLDER
    if not os.path.isabs(folder):
        folder = os.path.abspath(os.path.join(BASE_DIR, folder))
    if os.path.exists(folder):
        shutil.rmtree(folder)
        print(f"[reset] Uploads borrados: {folder}")
    else:
        print(f"[reset] No había uploads en {folder}")


def main():
    empty = "--empty" in sys.argv

    _delete_sqlite_db()
    _delete_uploads()

    app = create_app()
    with app.app_context():
        # El baseline alembic está vacío (sólo "stampea" un esquema existente).
        # Para una BD limpia: creamos todas las tablas desde los modelos y
        # marcamos la revisión HEAD como aplicada, así futuras migraciones
        # incrementales siguen funcionando.
        db.create_all()
        alembic_stamp(revision="head")
        print("[reset] Esquema creado y alembic marcado en HEAD.")

        if empty:
            seed_data()
            print("[reset] Listo: usuarios y protocolos, sin pacientes.")
        else:
            demo_seed()
            print("[reset] Listo: escenario de demostración cargado.")


if __name__ == "__main__":
    main()
