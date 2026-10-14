"""Test client for core AuraSync routes (Auth, Jobs, Reports, Audio)."""

from __future__ import annotations

import io
import json
import struct
import unittest

from fastapi.testclient import TestClient
from app.main import app

class TestAppRoutes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

    def test_signup_and_me(self):
        email = f"user_{id(self)}@acme.io"
        signup_resp = self.client.post(
            "/api/v1/auth/signup",
            json={"fullName": "Test User", "email": email, "password": "password123", "purpose": "Enterprise"},
        )
        self.assertEqual(signup_resp.status_code, 200)
        data = signup_resp.json()["data"]
        token = data["accessToken"]

        me_resp = self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["data"]["user"]["email"], email)


if __name__ == "__main__":
    unittest.main()
