from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

from app.config import Config

db = SQLAlchemy()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app)
    db.init_app(app)

    from app.routes.dashboard import dashboard_bp
    from app.routes.onboarding import onboarding_bp
    from app.routes.sos import sos_bp
    from app.routes.symptoms import symptoms_bp

    app.register_blueprint(onboarding_bp, url_prefix="/api/onboarding")
    app.register_blueprint(symptoms_bp, url_prefix="/api/symptoms")
    app.register_blueprint(sos_bp, url_prefix="/api/sos")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")

    with app.app_context():
        db.create_all()

    return app
