import pytest
import os
import json
from typing import Dict, Any
from fastapi.testclient import TestClient

import server
from server import app, verify_firebase_token

# ─── Mock Firestore Client ───────────────────────────────────────────────────

class MockDocument:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data

    def get(self):
        return self


class MockCollection:
    def __init__(self, store, path):
        self.store = store
        self.path = path

    def document(self, doc_id):
        return MockDocumentReference(self.store, f"{self.path}/{doc_id}")

    def stream(self):
        docs = []
        prefix = self.path + "/"
        for key, val in self.store.items():
            if key.startswith(prefix):
                subpath = key[len(prefix):]
                if "/" not in subpath:
                    docs.append(MockDocument(subpath, val))
        return docs


class MockDocumentReference:
    def __init__(self, store, path):
        self.store = store
        self.path = path

    def get(self):
        data = self.store.get(self.path)
        return MockDocument(self.path.split("/")[-1], data)

    def set(self, data):
        self.store[self.path] = data

    def update(self, data):
        if self.path not in self.store:
            self.store[self.path] = {}
        self.store[self.path].update(data)

    def delete(self):
        if self.path in self.store:
            del self.store[self.path]

    def collection(self, coll_name):
        return MockCollection(self.store, f"{self.path}/{coll_name}")


class MockFirestoreClient:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return MockCollection(self.store, name)


# ─── Test Fixture & Setup ────────────────────────────────────────────────────

mock_token_payload = {"uid": "default_uid", "email": "default@testme.com", "email_verified": True}

def mock_verify_token():
    return mock_token_payload

@pytest.fixture(autouse=True)
def setup_mocks(monkeypatch):
    # Enable Firebase/Firestore behavior in server
    monkeypatch.setattr(server, "FIREBASE_ENABLED", True)
    
    # Inject Mock Firestore Client
    mock_db = MockFirestoreClient()
    monkeypatch.setattr(server, "db", mock_db)

    # Monkeypatch firebase_admin.firestore.client to return mock_db
    try:
        from firebase_admin import firestore
        monkeypatch.setattr(firestore, "client", lambda: mock_db)
    except ImportError:
        pass
    
    # Mock firebase_auth.set_custom_user_claims to prevent real Firebase network calls
    if hasattr(server, "firebase_auth") and server.firebase_auth is not None:
        monkeypatch.setattr(server.firebase_auth, "set_custom_user_claims", lambda uid, claims: None)
    
    # Override FastAPI dependency for token verification
    app.dependency_overrides[verify_firebase_token] = mock_verify_token
    
    yield mock_db
    
    # Clean up overrides
    app.dependency_overrides.clear()


# ─── Unit Tests ──────────────────────────────────────────────────────────────

def test_sync_claims_creates_company(setup_mocks):
    db = setup_mocks
    client = TestClient(app)

    global mock_token_payload
    mock_token_payload = {"uid": "owner_123", "email": "owner@testme.com"}

    # 1. Sync claims (first user from testme.com -> should create company)
    response = client.post("/api/auth/sync-claims", json={})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["companyId"] == "testme.com"

    # Verify company doc exists in mock database
    comp_doc = db.collection("companies").document("testme.com").get()
    assert comp_doc.exists
    assert comp_doc.to_dict()["owner_uid"] == "owner_123"
    assert comp_doc.to_dict()["company_name"] == "testme.com"
    assert "testme.com" in comp_doc.to_dict()["domains"]


def test_sync_claims_mismatch_forces_update(setup_mocks):
    db = setup_mocks
    client = TestClient(app)

    # 1. Setup a user in Firestore with companyId: testme.com
    db.collection("users").document("owner_123").set({
        "displayName": "Test Owner",
        "email": "owner@testme.com",
        "companyId": "testme.com"
    })

    # 2. Mock token payload with cached/legacy claim 'testme'
    global mock_token_payload
    mock_token_payload = {"uid": "owner_123", "email": "owner@testme.com", "companyId": "testme"}

    # 3. Sync claims. It should detect mismatch, force claims update, and return updated=True
    response = client.post("/api/auth/sync-claims", json={})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "updated"
    assert res_data["companyId"] == "testme.com"
    assert res_data["updated"] is True


def test_my_company_and_sharing_endpoints(setup_mocks):
    db = setup_mocks
    client = TestClient(app)

    # Setup company
    db.collection("companies").document("testme.com").set({
        "owner_uid": "owner_123",
        "domains": ["testme.com"],
        "allowed_read_domains": [],
        "allowed_write_domains": [],
        "company_name": "testme.com"
    })

    # 1. Get my company details as owner
    global mock_token_payload
    mock_token_payload = {"uid": "owner_123", "email": "owner@testme.com", "companyId": "testme.com"}
    response = client.get("/api/companies/my-company")
    assert response.status_code == 200
    company_info = response.json()
    assert company_info["is_owner"] is True
    assert company_info["allowed_read_domains"] == []

    # 2. Add partner.com as read allowed domain
    response = client.post("/api/companies/my-company/allowed-domains", json={
        "domain": "partner.com",
        "access_level": "read"
    })
    assert response.status_code == 200

    # 3. Add builder.com as write allowed domain
    response = client.post("/api/companies/my-company/allowed-domains", json={
        "domain": "builder.com",
        "access_level": "write"
    })
    assert response.status_code == 200

    # Verify updated domains
    comp_doc = db.collection("companies").document("testme.com").get()
    assert "partner.com" in comp_doc.to_dict()["allowed_read_domains"]
    assert "builder.com" in comp_doc.to_dict()["allowed_write_domains"]

    # 4. Remove partner.com
    response = client.delete("/api/companies/my-company/allowed-domains?domain=partner.com&access_level=read")
    assert response.status_code == 200
    comp_doc = db.collection("companies").document("testme.com").get()
    assert "partner.com" not in comp_doc.to_dict()["allowed_read_domains"]


def test_configs_sharing_access_control(setup_mocks):
    db = setup_mocks
    client = TestClient(app)

    # Setup testme.com company hub
    db.collection("companies").document("testme.com").set({
        "owner_uid": "owner_123",
        "domains": ["testme.com"],
        "allowed_read_domains": ["partner.com"],
        "allowed_write_domains": ["editor.com"],
        "company_name": "testme.com"
    })

    # Save a configuration in testme.com
    db.collection("companies").document("testme.com").collection("configs").document("test_config").set({
        "stud_spacing_mm": 600.0,
        "region": "US"
    })

    # Scenario A: External user from other.com tries to read -> Rejected (403)
    global mock_token_payload
    mock_token_payload = {"uid": "other_user", "email": "user@other.com", "companyId": "other.com"}
    response = client.get("/api/configs?name=test_config&target_company_id=testme.com")
    assert response.status_code == 403

    # Scenario B: User from partner.com (allowed read) tries to read -> Succeeds
    mock_token_payload = {"uid": "partner_user", "email": "user@partner.com", "companyId": "partner.com"}
    response = client.get("/api/configs?name=test_config&target_company_id=testme.com")
    assert response.status_code == 200
    assert response.json()["stud_spacing_mm"] == 600.0

    # Scenario C: User from partner.com tries to save -> Rejected (403)
    response = client.post("/api/configs?name=test_config&target_company_id=testme.com", json={"stud_spacing_mm": 400.0})
    assert response.status_code == 403

    # Scenario D: User from editor.com (allowed write) tries to save -> Succeeds
    mock_token_payload = {"uid": "editor_user", "email": "user@editor.com", "companyId": "editor.com"}
    response = client.post("/api/configs?name=test_config&target_company_id=testme.com", json={"stud_spacing_mm": 450.0})
    assert response.status_code == 200

    # Verify updated value in testme.com config
    val = db.collection("companies").document("testme.com").collection("configs").document("test_config").get().to_dict()
    assert val["stud_spacing_mm"] == 450.0


def test_projects_sharing_access_control(setup_mocks):
    db = setup_mocks
    client = TestClient(app)

    # Setup testme.com company hub
    db.collection("companies").document("testme.com").set({
        "owner_uid": "owner_123",
        "domains": ["testme.com"],
        "allowed_read_domains": ["partner.com"],
        "allowed_write_domains": ["editor.com"],
        "company_name": "testme.com"
    })

    # Scenario A: User from editor.com saves a project -> Succeeds
    global mock_token_payload
    mock_token_payload = {"uid": "editor_user", "email": "user@editor.com", "companyId": "editor.com"}
    project_payload = {"walls": [{"wall_id": "W1", "length": 4000.0}]}
    response = client.post("/api/walls/project_alpha?target_company_id=testme.com", json=project_payload)
    assert response.status_code == 200

    # Verify project saved in Firestore under testme.com
    proj_doc = db.collection("companies").document("testme.com").collection("walls").document("project_alpha").get()
    assert proj_doc.exists
    assert proj_doc.to_dict()["walls"][0]["wall_id"] == "W1"

    # Scenario B: User from partner.com gets project list and details -> Succeeds
    mock_token_payload = {"uid": "partner_user", "email": "user@partner.com", "companyId": "partner.com"}
    response = client.get("/api/walls?target_company_id=testme.com")
    assert response.status_code == 200
    assert any(p["name"] == "project_alpha" for p in response.json())

    response = client.get("/api/walls/project_alpha?target_company_id=testme.com")
    assert response.status_code == 200
    assert response.json()["walls"][0]["wall_id"] == "W1"

    # Scenario C: User from partner.com tries to delete project -> Rejected (403)
    response = client.delete("/api/walls/project_alpha?target_company_id=testme.com")
    assert response.status_code == 403

    # Scenario D: User from editor.com deletes project -> Succeeds
    mock_token_payload = {"uid": "editor_user", "email": "user@editor.com", "companyId": "editor.com"}
    response = client.delete("/api/walls/project_alpha?target_company_id=testme.com")
    assert response.status_code == 200
    assert not db.collection("companies").document("testme.com").collection("walls").document("project_alpha").get().exists
