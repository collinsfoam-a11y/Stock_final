import requests
import json


def test_login():
    url = "http://localhost:8001/api/auth/login"
    payload = {"username": "admin", "password": "admin123"}
    headers = {"Content-Type": "application/json"}

    print(f"Testing Login at {url}...")
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=5)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    test_login()
