from flask import Flask, jsonify
from flask_cors import CORS
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os

from app.config import Config

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()


@login_manager.user_loader
def _load_user(user_id):
    from app.models import User
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def _unauthorized():
    return jsonify({"error": "Sesión requerida"}), 401


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, supports_credentials=True)
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from app.routes.admissions import admissions_bp
    from app.routes.auth import auth_bp
    from app.routes.chat import chat_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.medications import medications_bp
    from app.routes.messages import messages_bp
    from app.routes.onboarding import onboarding_bp
    from app.routes.protocols import protocols_bp
    from app.routes.reports import reports_bp
    from app.routes.sos import sos_bp
    from app.routes.symptoms import symptoms_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admissions_bp, url_prefix="/api/admissions")
    app.register_blueprint(protocols_bp, url_prefix="/api")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(onboarding_bp, url_prefix="/api/onboarding")
    app.register_blueprint(symptoms_bp, url_prefix="/api/symptoms")
    app.register_blueprint(sos_bp, url_prefix="/api/sos")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(messages_bp, url_prefix="/api/messages")
    app.register_blueprint(medications_bp, url_prefix="/api/medications")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")

    if app.config.get("ENABLE_SCHEDULER", True):
        from app.scheduler import start_scheduler
        start_scheduler(app)

    return app
