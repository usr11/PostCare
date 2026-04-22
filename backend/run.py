from app import create_app
from app.seed import seed_data

app = create_app()

with app.app_context():
    seed_data()

if __name__ == "__main__":
    app.run(debug=True, port=5001)
