"""Helpers de autorización para HU-08.

`@login_required` (de Flask-Login) cubre "hay sesión".
`@require_role(...)` añade verificación de rol específico.
`can_access_patient(patient)` centraliza la regla de ownership.
"""

from functools import wraps

from flask import jsonify
from flask_login import current_user


def require_role(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({"error": "Sesión requerida"}), 401
            if roles and current_user.role not in roles:
                return jsonify({"error": "No tienes permiso para esta acción"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def can_access_patient(patient):
    """True si el usuario actual puede ver/operar sobre este paciente."""
    if not current_user.is_authenticated or patient is None:
        return False
    if current_user.role == "clinician":
        return patient.clinician_id == current_user.id
    return current_user.role in ("admin", "quality_lead", "admissions")
