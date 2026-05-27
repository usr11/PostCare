"""HU1 — Envío de evidencia visual (foto de herida).

Endpoints:

- POST /api/uploads/wound/<patient_id>  (lado paciente, sin sesión)
    multipart/form-data con campo `file`.
    Valida MIME (jpg/png) + tamaño <= 10MB + integridad (magic bytes).
    Crea registro WoundImage + Message ligado para que aparezca en el chat
    y en el historial clínico.

- GET  /api/uploads/wound/<image_id>     (lado clínico OR paciente dueño)
    Sirve el binario. La autorización se valida:
      - sesión clínica con can_access_patient(), o
      - parámetro ?patient_id=<id> que coincide con la imagen
        (el chat del paciente no tiene sesión; identifica vía URL).

- GET  /api/uploads/wound/patient/<patient_id>  (lado clínico)
    Lista las imágenes del paciente para HU4.
"""

import os
import re
import uuid
from datetime import datetime

from flask import (
    Blueprint,
    abort,
    current_app,
    jsonify,
    request,
    send_file,
)
from flask_login import current_user

from app import db
from app.auth import can_access_patient
from app.models import Message, Patient, WoundImage

uploads_bp = Blueprint("uploads", __name__)


# Magic bytes para validar el contenido real más allá del MIME declarado por el cliente.
_JPEG_MAGIC = (b"\xff\xd8\xff",)
_PNG_MAGIC = (b"\x89PNG\r\n\x1a\n",)


def _safe_ext(filename: str) -> str:
    if not filename:
        return ""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def _detect_mime(head: bytes, declared: str) -> str | None:
    """Devuelve un MIME canónico sólo si el contenido coincide.

    Esto previene archivos con extensión cambiada (p. ej. un PDF con .jpg)
    y archivos corruptos cuyo header no es válido.
    """
    if any(head.startswith(sig) for sig in _JPEG_MAGIC):
        return "image/jpeg"
    if any(head.startswith(sig) for sig in _PNG_MAGIC):
        return "image/png"
    return None


def _ensure_upload_dir(patient_id: int) -> str:
    base = current_app.config["UPLOAD_FOLDER"]
    folder = os.path.join(base, "wounds", str(patient_id))
    os.makedirs(folder, exist_ok=True)
    return folder


@uploads_bp.route("/wound/<int:patient_id>", methods=["POST"])
def upload_wound_image(patient_id):
    patient = db.get_or_404(Patient, patient_id)

    # HU3/HU6: si el paciente está en data_error o no onboarded, bloquea.
    if patient.status != "active" or not patient.onboarded:
        return jsonify({
            "error": (
                "Tu seguimiento aún no está activo. "
                "Comunícate con tu clínica."
            ),
        }), 423

    if "file" not in request.files:
        return jsonify({"error": "Falta el archivo. Envía un campo 'file'."}), 400

    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "No se recibió ningún archivo."}), 400

    # 1) Validación de extensión.
    ext = _safe_ext(f.filename)
    if ext not in current_app.config["ALLOWED_IMAGE_EXTS"]:
        return jsonify({
            "error": "Formato no permitido. Envía una imagen JPG o PNG.",
        }), 400

    # 2) Validación de MIME declarado (defensa en profundidad).
    declared = (f.mimetype or "").lower()
    if declared and declared not in current_app.config["ALLOWED_IMAGE_MIME"]:
        return jsonify({
            "error": "Tipo de archivo no permitido. Envía una imagen JPG o PNG.",
        }), 400

    # 3) Validación de tamaño. Stream-friendly: leemos primero los magic bytes,
    #    luego escribimos chunk-by-chunk con cap.
    max_bytes = current_app.config["MAX_UPLOAD_BYTES"]
    head = f.stream.read(16)
    real_mime = _detect_mime(head, declared)
    if not real_mime:
        return jsonify({
            "error": (
                "El archivo no es una imagen válida o está corrupto. "
                "Intenta con otra foto."
            ),
        }), 400

    folder = _ensure_upload_dir(patient_id)
    final_ext = ".jpg" if real_mime == "image/jpeg" else ".png"
    storage_name = f"{uuid.uuid4().hex}{final_ext}"
    storage_path = os.path.join(folder, storage_name)

    size = len(head)
    try:
        with open(storage_path, "wb") as out:
            out.write(head)
            while True:
                chunk = f.stream.read(64 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    out.close()
                    os.remove(storage_path)
                    return jsonify({
                        "error": (
                            f"La imagen supera el tamaño permitido "
                            f"({max_bytes // (1024 * 1024)} MB). Comprime o reduce la foto."
                        ),
                    }), 413
                out.write(chunk)
    except OSError:
        if os.path.exists(storage_path):
            os.remove(storage_path)
        return jsonify({"error": "No fue posible guardar la imagen."}), 500

    if size == 0:
        os.remove(storage_path)
        return jsonify({"error": "El archivo está vacío."}), 400

    img = WoundImage(
        patient_id=patient_id,
        storage_path=storage_path,
        mime_type=real_mime,
        size_bytes=size,
        original_name=f.filename[:255],
        uploaded_at=datetime.now(),
    )
    db.session.add(img)
    db.session.flush()  # asignar id antes de crear Message

    # Crear un Message asociado para que la imagen aparezca en el chat
    # y en el historial clínico (HU4).
    msg = Message(
        patient_id=patient_id,
        sender="patient",
        text="Foto de herida enviada",
        attachment_type="wound_image",
        attachment_id=img.id,
    )
    db.session.add(msg)
    db.session.commit()

    return jsonify({
        "image": img.to_dict(),
        "message": msg.to_dict(),
        "ack": (
            "Recibimos tu foto. Tu médico la revisará pronto. "
            "Si presentas dolor intenso, fiebre o sangrado, presiona S.O.S."
        ),
    }), 201


@uploads_bp.route("/wound/<int:image_id>", methods=["GET"])
def serve_wound_image(image_id):
    img = db.get_or_404(WoundImage, image_id)

    # Autorización: clínico autenticado con acceso al paciente,
    # o el paciente mismo identificándose por query (?patient_id=<id>).
    authorized = False
    if current_user.is_authenticated:
        authorized = can_access_patient(img.patient)
    else:
        try:
            pid = int(request.args.get("patient_id", "0"))
        except (TypeError, ValueError):
            pid = 0
        authorized = pid == img.patient_id

    if not authorized:
        return jsonify({"error": "No autorizado para ver esta imagen."}), 403

    if not os.path.exists(img.storage_path):
        return jsonify({"error": "Archivo no disponible."}), 410

    # Cache razonable: la imagen es inmutable (UUID por archivo).
    response = send_file(
        img.storage_path,
        mimetype=img.mime_type,
        max_age=3600,
        as_attachment=False,
        download_name=img.original_name or f"wound_{img.id}",
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@uploads_bp.route("/wound/patient/<int:patient_id>", methods=["GET"])
def list_patient_wounds(patient_id):
    patient = db.get_or_404(Patient, patient_id)
    if not current_user.is_authenticated or not can_access_patient(patient):
        return jsonify({"error": "Sesión clínica requerida."}), 401
    images = (
        WoundImage.query
        .filter_by(patient_id=patient_id)
        .order_by(WoundImage.uploaded_at.desc())
        .all()
    )
    return jsonify([i.to_dict() for i in images])


# Manejador específico para 413 (request too large) cuando Flask aborta
# antes de entrar al handler (MAX_CONTENT_LENGTH).
@uploads_bp.app_errorhandler(413)
def _too_large(_e):
    max_mb = current_app.config["MAX_UPLOAD_BYTES"] // (1024 * 1024)
    return jsonify({
        "error": f"La imagen supera el tamaño permitido ({max_mb} MB).",
    }), 413
