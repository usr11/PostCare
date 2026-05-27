from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user

from app.models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email y contraseña son requeridos"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Credenciales inválidas"}), 401
    if not user.active:
        return jsonify({"error": "Usuario desactivado"}), 403

    login_user(user, remember=True)
    return jsonify({"user": user.to_dict()})


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})


@auth_bp.route("/me", methods=["GET"])
def me():
    if not current_user.is_authenticated:
        return jsonify({"user": None}), 200
    return jsonify({"user": current_user.to_dict()})
