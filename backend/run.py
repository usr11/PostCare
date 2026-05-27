from app import create_app
from app.seed import seed_data

app = create_app()

if __name__ == "__main__":
    with app.app_context():
        seed_data()
    app.run(debug=True, port=5001)
