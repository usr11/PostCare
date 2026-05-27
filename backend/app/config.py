import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, '..', 'postquirurgico.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    CLINIC_NAME = os.getenv("CLINIC_NAME", "Clínica PostCare")
    CLINIC_EMERGENCY_PHONE = os.getenv("CLINIC_EMERGENCY_PHONE", "(601) 555-0123")
    CLINIC_NURSE_LINE = os.getenv("CLINIC_NURSE_LINE", "(601) 555-0124")
    CLINIC_ADMISSIONS_PHONE = os.getenv("CLINIC_ADMISSIONS_PHONE", "(601) 123-4567")
    CLINIC_APPOINTMENTS_PHONE = os.getenv(
        "CLINIC_APPOINTMENTS_PHONE",
        os.getenv("CLINIC_ADMISSIONS_PHONE", "(601) 123-4567"),
    )
    NATIONAL_EMERGENCY_PHONE = os.getenv("NATIONAL_EMERGENCY_PHONE", "123")

    ENABLE_SCHEDULER = os.getenv("ENABLE_SCHEDULER", "1") not in ("0", "false", "False")
