"""Shared pytest fixtures for warehouse backend tests."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(client, base_url, email, password):
    r = client.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def manager_token(api_client, base_url):
    return _login(api_client, base_url, "manager@warehouse.com", "Manager@123")["access_token"]


@pytest.fixture(scope="session")
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def employee_login(api_client, base_url):
    return _login(api_client, base_url, "midhun@warehouse.com", "Staff@123")


@pytest.fixture(scope="session")
def employee_token(employee_login):
    return employee_login["access_token"]


@pytest.fixture(scope="session")
def employee_headers(employee_token):
    return {"Authorization": f"Bearer {employee_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def warehouse_employee_login(api_client, base_url):
    # Need warehouse (non-EGA) employee to trigger coverage logic
    return _login(api_client, base_url, "staff_a1@warehouse.com", "Staff@123")


@pytest.fixture(scope="session")
def warehouse_employee_headers(warehouse_employee_login):
    return {
        "Authorization": f"Bearer {warehouse_employee_login['access_token']}",
        "Content-Type": "application/json",
    }
