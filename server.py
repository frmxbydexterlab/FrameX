"""
LGSF Framing Engine — Web Platform Server

FastAPI backend serving the interactive web UI and framing engine API.
Run with: python server.py

Auth:  All /api/* write endpoints require a valid Firebase ID token
       passed as:  Authorization: Bearer <token>
       Token is verified server-side via firebase-admin SDK.
"""

import json
import os
import sys
import urllib.parse
import base64
import logging

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# Ensure our src package is importable
sys.path.insert(0, os.path.dirname(__file__))

from src.models import (
    Wall, Opening, OpeningType, FramingConfig,
    ProfileType, MemberType, WallLayer, WallJoin
)
from src.framing_engine import frame_wall, load_config
from src.exporter import export_to_json
from src.join_detector import detect_and_trim_joins
from src.security import encrypt_data, decrypt_data

logger = logging.getLogger("framex")

# ─── Firebase Admin SDK initialisation ──────────────────────────────────────────
# The Firebase Admin SDK verifies ID tokens issued by Firebase Auth without
# making a network call on every request (uses cached Google public keys).
#
# Service account key path can be set via env var GOOGLE_APPLICATION_CREDENTIALS
# OR the file can be placed at:  ./firebase-service-account.json
# If neither is present the server falls back to unauthenticated mode (dev only).

db = None

try:
    import firebase_admin
    from firebase_admin import credentials, auth as firebase_auth

    _sa_path = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        os.path.join(os.path.dirname(__file__), "firebase-service-account.json")
    )

    if not firebase_admin._apps:  # avoid re-init on hot-reload
        if os.path.exists(_sa_path):
            cred = credentials.Certificate(_sa_path)
            firebase_admin.initialize_app(cred)
            logger.info("[auth] Firebase Admin SDK initialised with service account")
        else:
            # Fallback: Application Default Credentials (Google Cloud environments)
            firebase_admin.initialize_app()
            logger.warning(
                "[auth] No service-account key found — using Application Default Credentials. "
                "Place firebase-service-account.json next to server.py for local dev."
            )

    FIREBASE_ENABLED = True
    try:
        from firebase_admin import firestore
        db = firestore.client()
    except Exception as fs_err:
        logger.error(f"[auth] Failed to initialise Firestore client globally: {fs_err}")
        db = None

except ImportError:
    logger.warning(
        "[auth] firebase-admin not installed — auth is DISABLED. "
        "Run: pip install firebase-admin"
    )
    FIREBASE_ENABLED = False
except Exception as e:
    logger.error(f"[auth] Firebase Admin init failed: {e} — auth is DISABLED")
    FIREBASE_ENABLED = False


# ─── Auth Dependency ──────────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)

async def verify_firebase_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme)
) -> Dict[str, Any]:
    """
    FastAPI dependency that validates the Firebase ID token in the
    Authorization: Bearer <token> header.

    Returns the decoded token payload (dict) on success.
    Raises HTTP 401 on missing/invalid token when FIREBASE_ENABLED=True.
    In dev mode (FIREBASE_ENABLED=False) returns an empty dict.
    """
    if not FIREBASE_ENABLED:
        # Dev fallback: auth disabled, allow all
        return {"uid": "dev", "email": "dev@localhost"}

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header. Expected: Bearer <Firebase ID token>"
        )

    try:
        # clock_skew_seconds absorbs minor clock drift between local machine and Firebase servers
        decoded = firebase_auth.verify_id_token(credentials.credentials, clock_skew_seconds=5)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has expired. Please re-authenticate.")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Firebase ID token has been revoked.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase ID token: {str(e)}")


app = FastAPI(
    title="LGSF Framing Engine",
    version="1.0.0",
    description="FrameX — LGSF framing computation API. Protected endpoints require Firebase Auth."
)

# ─── CORS ─────────────────────────────────────────────────────────────────
# Restrict to your production domain when deploying.
_ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    # Add your production domain here, e.g.:
    # "https://framex.yourdomain.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Pydantic request/response models ───────────────────────────────────────

class WallLayerInput(BaseModel):
    function: str = "Other"
    function_name: str = ""
    material_name: str = ""
    thickness_mm: float = 0.0
    is_structural: bool = False

class OpeningInput(BaseModel):
    type: str = "window"
    x_offset: float
    width: float
    height: float
    sill_height: float = 0.0
    label: Optional[str] = None
    config_overrides: Optional[Dict[str, Any]] = None

class WallInput(BaseModel):
    wall_id: str
    label: str = ""
    length: float
    height: float
    thickness: float = 92.08
    height_start: Optional[float] = None
    height_end: Optional[float] = None
    base_start: Optional[float] = None
    base_end: Optional[float] = None
    origin_x: float = 0.0
    origin_y: float = 0.0
    origin_z: float = 0.0
    direction_x: float = 1.0
    direction_y: float = 0.0
    openings: List[OpeningInput] = []
    layers: List[WallLayerInput] = []  # Compound structure layers from Revit (optional)
    fire_rating: str = ""
    revit_parameters: Dict[str, Any] = {}
    config_name: Optional[str] = None
    config_overrides: Optional[Dict[str, Any]] = None  # Per-wall overrides

class FrameRequest(BaseModel):
    walls: List[WallInput]
    config_name: Optional[str] = "us_default"
    config_overrides: Optional[Dict[str, Any]] = None
    join_overrides: Optional[Dict[str, str]] = None
    custom_profiles: Optional[List[Dict[str, Any]]] = None


class WexParseRequest(BaseModel):
    data: str  # Base64 string


class SyncClaimsRequest(BaseModel):
    companyId: Optional[str] = None


class AllowedDomainRequest(BaseModel):
    domain: str
    access_level: str  # "read" or "write"



# ─── Health check (public) ─────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    """Public health check endpoint. Returns auth mode and server status."""
    return {
        "status": "ok",
        "auth_enabled": FIREBASE_ENABLED,
        "version": "1.0.0"
    }


@app.post("/api/auth/sync-claims")
def sync_claims(req: SyncClaimsRequest, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """
    Verifies the Firebase ID token and ensures the user has a 'companyId' custom claim.
    Reads the Firestore user document first. If different from the current claim,
    updates the custom claim in Firebase Auth.
    """
    if not FIREBASE_ENABLED:
        return {"status": "ok", "companyId": "dev_company", "updated": False}

    uid = decoded_token.get("uid")
    email = decoded_token.get("email", "")
    current_company_id = decoded_token.get("companyId")

    db = None
    try:
        from firebase_admin import firestore
        db = firestore.client()
    except Exception as e:
        logger.error(f"[auth] Error initializing firestore client: {e}")

    # 1. Try to fetch from Firestore users/{uid}
    company_id = None
    if db:
        try:
            user_doc = db.collection("users").document(uid).get()
            if user_doc.exists:
                company_id = user_doc.to_dict().get("companyId")
        except Exception as e:
            logger.error(f"[auth] Error fetching user doc from firestore: {e}")

    # 2. Check if client provided one in the request body
    if not company_id:
        company_id = req.companyId

    # 3. Fallback to email domain
    if not company_id:
        if email and "@" in email:
            domain = email.split("@")[1].strip().lower()
            if domain:
                company_id = domain
        if not company_id:
            company_id = "unknown"

    # If the user's token already has this company ID, no need to update it
    if current_company_id == company_id:
        return {"status": "ok", "companyId": current_company_id, "updated": False}

    # Ensure company document exists in Firestore
    if db and company_id != "unknown":
        try:
            comp_ref = db.collection("companies").document(company_id)
            comp_doc = comp_ref.get()
            if not comp_doc.exists:
                comp_ref.set({
                    "owner_uid": uid,
                    "domains": [company_id],
                    "allowed_read_domains": [],
                    "allowed_write_domains": [],
                    "company_name": company_id
                })
                logger.info(f"[auth] Created company hub document for {company_id} owned by {uid}")
            else:
                # Add domain if missing
                data = comp_doc.to_dict()
                domains = data.get("domains", [])
                if company_id not in domains:
                    domains.append(company_id)
                    comp_ref.update({"domains": domains})
        except Exception as e:
            logger.error(f"[auth] Error initializing company document in Firestore: {e}")

    # Set custom claim in Firebase Auth
    try:
        firebase_auth.set_custom_user_claims(uid, {"companyId": company_id})
        logger.info(f"[auth] Updated custom claim companyId={company_id} for user uid={uid} (was {current_company_id})")
        return {"status": "updated", "companyId": company_id, "updated": True}
    except Exception as e:
        logger.error(f"[auth] Failed to set custom claims: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set custom claims: {str(e)}")


@app.get("/api/companies/my-company")
def get_my_company(decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Get metadata for the logged-in user's company hub."""
    if not FIREBASE_ENABLED:
        return {
            "company_id": "dev_company",
            "owner_uid": "dev_owner",
            "domains": ["dev_company"],
            "allowed_read_domains": [],
            "allowed_write_domains": [],
            "company_name": "Development Company Hub",
            "is_owner": True
        }

    company_id = get_company_id(decoded_token)
    uid = decoded_token.get("uid")

    if db:
        try:
            doc_ref = db.collection("companies").document(company_id)
            doc = doc_ref.get()
            if doc.exists:
                data = doc.to_dict()
                owner_uid = data.get("owner_uid")
                return {
                    "company_id": company_id,
                    "owner_uid": owner_uid,
                    "domains": data.get("domains", []),
                    "allowed_read_domains": data.get("allowed_read_domains", []),
                    "allowed_write_domains": data.get("allowed_write_domains", []),
                    "company_name": data.get("company_name", company_id),
                    "is_owner": (uid == owner_uid)
                }
        except Exception as e:
            logger.error(f"[auth] Error retrieving company: {e}")
            raise HTTPException(status_code=500, detail="Failed to retrieve company hub details.")

    raise HTTPException(status_code=404, detail="Company hub not found.")


@app.post("/api/companies/my-company/allowed-domains")
def add_allowed_domain(req: AllowedDomainRequest, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Add another company domain to either allowed_read_domains or allowed_write_domains (owner only)."""
    if not FIREBASE_ENABLED:
        return {"status": "ok", "message": "Firebase is disabled. Allowed domain ignored."}

    company_id = get_company_id(decoded_token)
    uid = decoded_token.get("uid")
    target_domain = req.domain.strip().lower()
    access_level = req.access_level.strip().lower()

    if access_level not in ("read", "write"):
        raise HTTPException(status_code=400, detail="access_level must be either 'read' or 'write'.")

    if db:
        try:
            doc_ref = db.collection("companies").document(company_id)
            doc = doc_ref.get()
            if not doc.exists:
                raise HTTPException(status_code=404, detail="Company hub not found.")

            data = doc.to_dict()
            if data.get("owner_uid") != uid:
                raise HTTPException(status_code=403, detail="Only the company hub owner can modify sharing permissions.")

            field_name = "allowed_read_domains" if access_level == "read" else "allowed_write_domains"
            lst = data.get(field_name, [])

            if target_domain not in lst:
                lst.append(target_domain)
                doc_ref.update({field_name: lst})

            return {"status": "success", "domain": target_domain, "access_level": access_level}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[auth] Error adding allowed domain: {e}")
            raise HTTPException(status_code=500, detail="Failed to add allowed domain.")

    raise HTTPException(status_code=500, detail="Firestore is not available.")


@app.delete("/api/companies/my-company/allowed-domains")
def remove_allowed_domain(domain: str, access_level: str, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Remove another company domain from allowed_read_domains or allowed_write_domains (owner only)."""
    if not FIREBASE_ENABLED:
        return {"status": "ok", "message": "Firebase is disabled. Request ignored."}

    company_id = get_company_id(decoded_token)
    uid = decoded_token.get("uid")
    target_domain = domain.strip().lower()
    access_level = access_level.strip().lower()

    if access_level not in ("read", "write"):
        raise HTTPException(status_code=400, detail="access_level must be either 'read' or 'write'.")

    if db:
        try:
            doc_ref = db.collection("companies").document(company_id)
            doc = doc_ref.get()
            if not doc.exists:
                raise HTTPException(status_code=404, detail="Company hub not found.")

            data = doc.to_dict()
            if data.get("owner_uid") != uid:
                raise HTTPException(status_code=403, detail="Only the company hub owner can modify sharing permissions.")

            field_name = "allowed_read_domains" if access_level == "read" else "allowed_write_domains"
            lst = data.get(field_name, [])

            if target_domain in lst:
                lst.remove(target_domain)
                doc_ref.update({field_name: lst})

            return {"status": "success", "domain": target_domain, "access_level": access_level}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[auth] Error removing allowed domain: {e}")
            raise HTTPException(status_code=500, detail="Failed to remove allowed domain.")

    raise HTTPException(status_code=500, detail="Firestore is not available.")


# ─── API Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/wex/parse", dependencies=[Depends(verify_firebase_token)])
def parse_wex(request: WexParseRequest):
    """Decrypts and decompresses a .wex base64 payload and returns the JSON."""
    try:
        cipher_bytes = base64.b64decode(request.data)
        plain_text = decrypt_data(cipher_bytes)
        return json.loads(plain_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse .wex file: {str(e)}")

def get_config_path(name: str) -> str:
    """Get the safe configuration file path, URL-encoding the name to allow special symbols like slashes on Windows."""
    # E.g. '3 5/8"' -> '3%205%2F8%22'
    safe_name = urllib.parse.quote(name, safe='')
    return os.path.join(os.path.dirname(__file__), "configs", f"{safe_name}.json")


def get_company_id(decoded_token: Any) -> str:
    if not isinstance(decoded_token, dict):
        return "unknown"
    company_id = decoded_token.get("companyId")
    if not company_id:
        uid = decoded_token.get("uid")
        email = decoded_token.get("email", "")
        if uid and db:
            try:
                user_doc = db.collection("users").document(uid).get()
                if user_doc.exists:
                    company_id = user_doc.to_dict().get("companyId")
            except Exception as e:
                logger.error(f"[configs] Error fetching user doc from firestore: {e}")
        if not company_id and email and "@" in email:
            domain = email.split("@")[1].strip().lower()
            if domain:
                company_id = domain
        if not company_id:
            company_id = "unknown"
    return company_id


def verify_company_access(decoded_token: Dict[str, Any], target_company_id: str, write_access: bool = False) -> None:
    """
    Verifies if the user is authorized to access target_company_id.
    - If write_access is True, user must belong to target_company_id OR user's email domain must be in target_company_id's allowed_write_domains.
    - If write_access is False, user must belong to target_company_id OR user's email domain must be in target_company_id's allowed_read_domains OR allowed_write_domains.
    Raises HTTPException on failure.
    """
    if not FIREBASE_ENABLED:
        return  # Dev fallback: allow all
        
    user_company_id = get_company_id(decoded_token)
    if user_company_id == target_company_id:
        return
        
    if db:
        try:
            doc_ref = db.collection("companies").document(target_company_id)
            doc = doc_ref.get()
            if not doc.exists:
                raise HTTPException(status_code=404, detail=f"Company hub '{target_company_id}' not found.")
            
            data = doc.to_dict()
            allowed_read = data.get("allowed_read_domains", [])
            allowed_write = data.get("allowed_write_domains", [])
            
            # Resolve user's domain from email
            email = decoded_token.get("email", "")
            user_domain = None
            if email and "@" in email:
                user_domain = email.split("@")[-1].strip().lower()
                
            if not user_domain:
                raise HTTPException(status_code=403, detail="Could not resolve user email domain.")
                
            if write_access:
                if user_domain in allowed_write:
                    return
            else:
                if user_domain in allowed_read or user_domain in allowed_write:
                    return
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[auth] Error verifying company access: {e}")
            raise HTTPException(status_code=500, detail="Internal auth verification error.")
            
    raise HTTPException(status_code=403, detail=f"Access to company hub '{target_company_id}' is denied.")


@app.get("/api/configs")
def list_configs(name: Optional[str] = None, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """List available config files, or get a specific one if 'name' is provided."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=False)

    if name is not None:
        # 1. Check if it's one of the read-only defaults
        if name in ["us_default", "stretch_sample"]:
            config_path = get_config_path(name)
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    return json.load(f)
        
        # 2. Check Firestore
        if db:
            try:
                doc_ref = db.collection("companies").document(company_id).collection("configs").document(name)
                doc = doc_ref.get()
                if doc.exists:
                    return doc.to_dict()
            except Exception as e:
                logger.error(f"Error fetching config '{name}' from Firestore: {e}")

        # 3. Fallback to local files if any (backwards compatibility)
        config_path = get_config_path(name)
        if os.path.exists(config_path):
            with open(config_path, "r") as f:
                return json.load(f)

        raise HTTPException(status_code=404, detail=f"Config '{name}' not found")

    # Listing configs
    configs = []
    # 1. Add defaults from the configs/ directory
    for default_name in ["us_default", "stretch_sample"]:
        config_path = get_config_path(default_name)
        if os.path.exists(config_path):
            configs.append({"name": default_name, "filename": f"{default_name}.json"})

    # 2. Add configs from Firestore
    if db:
        try:
            configs_ref = db.collection("companies").document(company_id).collection("configs")
            docs = configs_ref.stream()
            seen_names = {"us_default", "stretch_sample"}
            for doc in docs:
                cfg_name = doc.id
                if cfg_name not in seen_names:
                    configs.append({"name": cfg_name, "filename": f"{cfg_name}.json"})
        except Exception as e:
            logger.error(f"Error streaming configs from Firestore: {e}")

    return configs


@app.post("/api/configs")
def save_config(name: str, config: Dict[str, Any], target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Save a config with the given name."""
    if name in ["us_default", "stretch_sample"]:
        raise HTTPException(status_code=400, detail=f"Cannot overwrite the default '{name}' configuration")
    
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=True)
    
    # Save to Firestore
    if db:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("configs").document(name)
            doc_ref.set(config)
            return {"status": "saved", "name": name}
        except Exception as e:
            logger.error(f"Error saving config to Firestore: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

    # Fallback to local file if Firestore is not available
    config_path = get_config_path(name)
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)
    return {"status": "saved", "name": name}


@app.delete("/api/configs")
def delete_config(name: str, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Delete a config with the given name."""
    if name in ["us_default", "stretch_sample"]:
        raise HTTPException(status_code=400, detail=f"Cannot delete default config '{name}'")
    
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=True)
    
    # Delete from Firestore
    deleted_from_firestore = False
    if db:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("configs").document(name)
            if doc_ref.get().exists:
                doc_ref.delete()
                deleted_from_firestore = True
        except Exception as e:
            logger.error(f"Error deleting config from Firestore: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete config: {str(e)}")

    # Also delete local file if it exists
    config_path = get_config_path(name)
    deleted_local = False
    if os.path.exists(config_path):
        os.remove(config_path)
        deleted_local = True

    if deleted_from_firestore or deleted_local:
        return {"status": "deleted", "name": name}
        
    raise HTTPException(status_code=404, detail=f"Config '{name}' not found")


@app.get("/api/walls")
def list_walls(target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """List available wall JSON files from Firestore or tests directory fallback."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=False)

    walls = []
    # 1. Fetch from Firestore
    if db:
        try:
            walls_ref = db.collection("companies").document(company_id).collection("walls")
            docs = walls_ref.stream()
            for doc in docs:
                walls.append({"name": doc.id, "filename": f"{doc.id}.json", "source": "firestore"})
        except Exception as e:
            logger.error(f"Error streaming walls from Firestore: {e}")

    # 2. Add local tests/ directory files if they aren't overridden and it's dev_company
    # Or as fallback if no walls are in Firestore yet
    if not walls or company_id == "dev_company":
        tests_dir = os.path.join(os.path.dirname(__file__), "tests")
        if os.path.exists(tests_dir):
            seen_names = {w["name"] for w in walls}
            for f in os.listdir(tests_dir):
                if f.endswith(".json"):
                    name = f.replace(".json", "")
                    if name not in seen_names:
                        walls.append({"name": name, "filename": f, "source": "local"})
    return walls


@app.get("/api/walls/wex/{name}")
def get_wex_wall(name: str, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Parse and return a .wex wall file from tests directory."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=False)
    
    wex_path = os.path.join(os.path.dirname(__file__), "tests", f"{name}.wex")
    if not os.path.exists(wex_path):
        raise HTTPException(status_code=404, detail=f"Wex file '{name}' not found")
    try:
        with open(wex_path, "rb") as f:
            cipher_bytes = f.read()
        plain_text = decrypt_data(cipher_bytes)
        return json.loads(plain_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse .wex file: {str(e)}")


@app.get("/api/walls/{name}")
def get_walls(name: str, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Get walls data from Firestore or local tests folder."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=False)

    # 1. Try Firestore
    if db:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("walls").document(name)
            doc = doc_ref.get()
            if doc.exists:
                return doc.to_dict()
        except Exception as e:
            logger.error(f"Error fetching wall '{name}' from Firestore: {e}")

    # 2. Try Local Fallback
    walls_path = os.path.join(os.path.dirname(__file__), "tests", f"{name}.json")
    if not os.path.exists(walls_path):
        raise HTTPException(status_code=404, detail=f"Wall file '{name}' not found")
    with open(walls_path, "r") as f:
        return json.load(f)


@app.post("/api/walls/{name}")
def save_walls(name: str, walls_data: Dict[str, Any], target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Save walls (project) JSON to Firestore."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=True)

    if db:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("walls").document(name)
            payload = walls_data if isinstance(walls_data, dict) else {"walls": walls_data}
            doc_ref.set(payload)
            return {"status": "saved", "name": name}
        except Exception as e:
            logger.error(f"Error saving wall project '{name}' to Firestore: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save wall project: {str(e)}")

    # Fallback to local files if Firestore is not available
    walls_path = os.path.join(os.path.dirname(__file__), "tests", f"{name}.json")
    with open(walls_path, "w") as f:
        json.dump(walls_data, f, indent=2)
    return {"status": "saved", "name": name}


@app.delete("/api/walls/{name}")
def delete_walls(name: str, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Delete walls (project) JSON from Firestore."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=True)

    deleted_from_firestore = False
    if db:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("walls").document(name)
            if doc_ref.get().exists:
                doc_ref.delete()
                deleted_from_firestore = True
        except Exception as e:
            logger.error(f"Error deleting wall project '{name}' from Firestore: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete wall project: {str(e)}")

    # Fallback to delete local file if it exists
    walls_path = os.path.join(os.path.dirname(__file__), "tests", f"{name}.json")
    deleted_local = False
    if os.path.exists(walls_path):
        os.remove(walls_path)
        deleted_local = True

    if deleted_from_firestore or deleted_local:
        return {"status": "deleted", "name": name}

    raise HTTPException(status_code=404, detail=f"Wall project '{name}' not found")


def _load_framing_config(name: str, company_id: str, fallback_base: Optional[FramingConfig] = None) -> FramingConfig:
    import copy
    
    # 1. Check if name is default config on disk
    if name in ["us_default", "stretch_sample"]:
        path = get_config_path(name)
        if os.path.exists(path):
            return load_config(path)
            
    # 2. Check Firestore
    if db and company_id:
        try:
            doc_ref = db.collection("companies").document(company_id).collection("configs").document(name)
            doc = doc_ref.get()
            if doc.exists:
                return FramingConfig.from_dict(doc.to_dict())
        except Exception as e:
            logger.error(f"[configs] Error loading config '{name}' from Firestore: {e}")
            
    # 3. Fallback to local files if any
    path = get_config_path(name)
    if os.path.exists(path):
        return load_config(path)
        
    # 4. Final fallback to base config or new FramingConfig
    if fallback_base:
        return copy.copy(fallback_base)
    return FramingConfig()


def _parse_and_split_request(request: FrameRequest, decoded_token: Optional[Dict[str, Any]] = None) -> tuple:
    """Parse walls and configs, splitting walls where length exceeds max_length if control joins are enabled."""
    company_id = get_company_id(decoded_token)
    base_config = _load_framing_config(request.config_name, company_id)

    walls = []
    configs = []
    inputs = []

    for wall_input in request.walls:
        import copy
        
        wall_config_name = wall_input.config_name or request.config_name or "us_default"
        config = _load_framing_config(wall_config_name, company_id, fallback_base=base_config)

        has_revit = (
            getattr(config, "stud_revit_family", "") != ""
            or getattr(config, "track_revit_family", "") != ""
            or getattr(config, "top_track_revit_family", "") != ""
            or getattr(config, "bottom_track_revit_family", "") != ""
        )
        has_custom_modes = (
            getattr(config, "end_stud_mode", "default") != "default"
            or getattr(config, "king_stud_profile_mode", "default") != "default"
            or getattr(config, "top_track_mode", "default") != "default"
            or getattr(config, "bottom_track_mode", "default") != "default"
        )

        if wall_config_name == "us_default" and wall_input.thickness > 0 and not (has_revit or has_custom_modes):
            config.stud_depth_mm = wall_input.thickness
            config.track_depth_mm = wall_input.thickness

        if request.config_overrides:
            config.apply_overrides(request.config_overrides, ignore_depth=False)

        if wall_input.config_overrides:
            config.apply_overrides(wall_input.config_overrides, ignore_depth=False)

        # Parse layers
        layers = []
        for l in wall_input.layers:
            layers.append(WallLayer(
                function=l.function,
                function_name=l.function_name,
                material_name=l.material_name,
                thickness_mm=l.thickness_mm,
                is_structural=l.is_structural,
            ))

        # Check if control join splitting is active
        max_len = config.control_join_max_length_mm
        gap = config.control_join_gap_mm
        
        if max_len > 0.0 and wall_input.length > max_len:
            # Splitting behavior
            h_start_val = wall_input.height_start if wall_input.height_start is not None else wall_input.height
            h_end_val = wall_input.height_end if wall_input.height_end is not None else wall_input.height
            b_start_val = wall_input.base_start if wall_input.base_start is not None else 0.0
            b_end_val = wall_input.base_end if wall_input.base_end is not None else 0.0

            def get_split_height_at(x):
                if wall_input.length <= 0:
                    return h_start_val
                t = x / wall_input.length
                t = max(0.0, min(1.0, t))
                return h_start_val + t * (h_end_val - h_start_val)

            def get_split_base_at(x):
                if wall_input.length <= 0:
                    return b_start_val
                t = x / wall_input.length
                t = max(0.0, min(1.0, t))
                return b_start_val + t * (b_end_val - b_start_val)

            start_from = (config.control_join_start_from or "start").lower()
            intervals = []
            
            if start_from == "equal":
                import math
                N = math.ceil((wall_input.length + gap) / (max_len + gap))
                if N < 1:
                    N = 1
                remaining_length = wall_input.length - (N - 1) * gap
                if remaining_length > 0:
                    panel_len = remaining_length / N
                    for i in range(N):
                        s = i * (panel_len + gap)
                        e = s + panel_len
                        intervals.append((s, e))
                else:
                    intervals.append((0.0, wall_input.length))
            elif start_from == "end":
                temp_intervals = []
                u = wall_input.length
                while u > 0:
                    v = max(0.0, u - max_len)
                    p_len = u - v
                    if p_len <= 0:
                        break
                    temp_intervals.append((v, u))
                    u = v - gap
                intervals = list(reversed(temp_intervals))
            else: # "start" (default)
                t_curr = 0.0
                while t_curr < wall_input.length:
                    t_end = min(wall_input.length, t_curr + max_len)
                    p_len = t_end - t_curr
                    if p_len <= 0:
                        break
                    intervals.append((t_curr, t_end))
                    t_curr = t_end + gap
            
            if not intervals:
                intervals.append((0.0, wall_input.length))

            for panel_idx, (t_curr, t_end) in enumerate(intervals, start=1):
                panel_len = t_end - t_curr
                # Filter and adjust openings for this segment
                openings = []
                for i, op in enumerate(wall_input.openings):
                    op_type = OpeningType.DOOR if op.type.lower() == "door" else OpeningType.WINDOW
                    # Center of the opening
                    x_center = op.x_offset + op.width / 2.0
                    
                    if t_curr <= x_center < t_end:
                        x_local = op.x_offset - t_curr
                        local_w = op.width
                        # Clip boundary cases
                        if x_local < 0:
                            local_w += x_local
                            x_local = 0.0
                        if x_local + local_w > panel_len:
                            local_w = panel_len - x_local
                        
                        if local_w > 50.0: # Keep if it is not completely chopped
                            label = op.label or (f"D{i+1}" if op_type == OpeningType.DOOR else f"W{i+1}")
                            openings.append(Opening(
                                opening_type=op_type,
                                x_offset=round(x_local, 2),
                                width=round(local_w, 2),
                                height=op.height,
                                sill_height=op.sill_height,
                                label=label,
                                config_overrides=op.config_overrides or {},
                            ))
                
                # New origin calculations
                origin_x = wall_input.origin_x + t_curr * wall_input.direction_x
                origin_y = wall_input.origin_y + t_curr * wall_input.direction_y
                origin_z = wall_input.origin_z
                
                wall_id = f"{wall_input.wall_id}_P{panel_idx}"
                label = f"{wall_input.label or wall_input.wall_id} - Panel {panel_idx}"
                
                height_start_panel = get_split_height_at(t_curr)
                height_end_panel = get_split_height_at(t_end)
                base_start_panel = get_split_base_at(t_curr)
                base_end_panel = get_split_base_at(t_end)
                max_height_panel = max(height_start_panel, height_end_panel)

                child_wall = Wall(
                    wall_id=wall_id,
                    label=label,
                    length=panel_len,
                    height=max_height_panel,
                    height_start=height_start_panel,
                    height_end=height_end_panel,
                    base_start=base_start_panel,
                    base_end=base_end_panel,
                    thickness=wall_input.thickness,
                    openings=openings,
                    layers=copy.deepcopy(layers),
                    fire_rating=wall_input.fire_rating,
                    revit_parameters=copy.deepcopy(wall_input.revit_parameters),
                    origin_x=origin_x,
                    origin_y=origin_y,
                    origin_z=origin_z,
                    direction_x=wall_input.direction_x,
                    direction_y=wall_input.direction_y,
                    config_name=wall_config_name,
                    config_overrides=wall_input.config_overrides,
                )
                
                walls.append(child_wall)
                configs.append(copy.deepcopy(config))
                
                # Construct child input model for serialization/bookkeeping mapping
                child_input = WallInput(
                    wall_id=wall_id,
                    label=label,
                    length=panel_len,
                    height=max_height_panel,
                    height_start=height_start_panel,
                    height_end=height_end_panel,
                    base_start=base_start_panel,
                    base_end=base_end_panel,
                    thickness=wall_input.thickness,
                    openings=[
                        OpeningInput(
                            type=o.opening_type.value,
                            x_offset=o.x_offset,
                            width=o.width,
                            height=o.height,
                            sill_height=o.sill_height,
                            label=o.label,
                            config_overrides=o.config_overrides,
                        )
                        for o in openings
                    ],
                    layers=wall_input.layers,
                    fire_rating=wall_input.fire_rating,
                    revit_parameters=wall_input.revit_parameters,
                    origin_x=origin_x,
                    origin_y=origin_y,
                    origin_z=origin_z,
                    direction_x=wall_input.direction_x,
                    direction_y=wall_input.direction_y,
                    config_name=wall_input.config_name,
                    config_overrides=wall_input.config_overrides,
                )
                inputs.append(child_input)
        else:
            # Standard single wall parsing (no split)
            openings = []
            for i, op in enumerate(wall_input.openings):
                op_type = OpeningType.DOOR if op.type.lower() == "door" else OpeningType.WINDOW
                label = op.label or (f"D{i+1}" if op_type == OpeningType.DOOR else f"W{i+1}")
                openings.append(Opening(
                    opening_type=op_type,
                    x_offset=op.x_offset,
                    width=op.width,
                    height=op.height,
                    sill_height=op.sill_height,
                    label=label,
                    config_overrides=op.config_overrides or {},
                ))

            wall = Wall(
                wall_id=wall_input.wall_id,
                label=wall_input.label or wall_input.wall_id,
                length=wall_input.length,
                height=wall_input.height,
                height_start=wall_input.height_start if wall_input.height_start is not None else wall_input.height,
                height_end=wall_input.height_end if wall_input.height_end is not None else wall_input.height,
                base_start=wall_input.base_start if wall_input.base_start is not None else 0.0,
                base_end=wall_input.base_end if wall_input.base_end is not None else 0.0,
                thickness=wall_input.thickness,
                openings=openings,
                layers=layers,
                fire_rating=wall_input.fire_rating,
                revit_parameters=wall_input.revit_parameters,
                origin_x=wall_input.origin_x,
                origin_y=wall_input.origin_y,
                origin_z=wall_input.origin_z,
                direction_x=wall_input.direction_x,
                direction_y=wall_input.direction_y,
                config_name=wall_config_name,
                config_overrides=wall_input.config_overrides,
            )
            walls.append(wall)
            configs.append(config)
            inputs.append(wall_input)

    return walls, configs, inputs


def calculate_wall_corners(wall, all_walls):
    start_neg = 0.0
    start_pos = 0.0
    end_neg = wall.length
    end_pos = wall.length

    t_half = wall.thickness / 2.0

    for join in wall.joins:
        other_id = join.continuing_wall_id if join.is_stopped_wall else join.stopped_wall_id
        other_wall = next((w for w in all_walls if w.wall_id == other_id), None)
        if other_wall is None:
            continue

        # Directions
        du_x, du_y = wall.direction_x, wall.direction_y
        no_x, no_y = -other_wall.direction_y, other_wall.direction_x

        # Dot products
        # normal of this wall: (-du_y, du_x)
        n_dot_no = (-du_y) * no_x + du_x * no_y
        u_dot_no = du_x * no_x + du_y * no_y

        if abs(u_dot_no) > 1e-4:
            m = n_dot_no / u_dot_no
        else:
            m = 0.0

        if join.is_stopped_wall:
            is_start = join.is_start
        else:
            is_start = (join.intersection_x < wall.length / 2.0)

        if is_start:
            start_neg = -(-t_half) * m
            start_pos = -(t_half) * m
        else:
            end_neg = wall.length - (-t_half) * m
            end_pos = wall.length - (t_half) * m

    return {
        "start_neg_z": round(start_neg, 2),
        "start_pos_z": round(start_pos, 2),
        "end_neg_z": round(end_neg, 2),
        "end_pos_z": round(end_pos, 2)
    }


@app.post("/api/frame")
def run_framing(request: FrameRequest, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Run the framing engine and return member data for visualization. Requires auth."""
    # 1. Parse and split walls based on control join rules
    walls, configs, inputs = _parse_and_split_request(request, decoded_token)

    # 2. Run join detection (trims geometry and populates joins)
    main_config = configs[0] if configs else None
    detect_and_trim_joins(walls, main_config, request.join_overrides)

    # 3. Frame each wall
    results = []
    for wall, config, wall_input in zip(walls, configs, inputs):
        result = frame_wall(wall, config, custom_profiles=request.custom_profiles)

        # Serialize members for the frontend
        # Serialize members for the frontend
        members_data = []
        for m in result.members:
            members_data.append({
                "type": m.member_type.value,
                "label": m.label,
                "profile": m.profile.value if isinstance(m.profile, ProfileType) else str(m.profile),
                "start": {"x": round(m.start.x, 2), "y": round(m.start.y, 2)},
                "end": {"x": round(m.end.x, 2), "y": round(m.end.y, 2)},
                "length_mm": round(m.length_mm, 2),
                "depth_mm": round(m.depth_mm, 2),
                "flange_mm": round(m.flange_mm, 2),
                "gauge_mm": round(m.gauge_mm, 2),
                "is_vertical": m.is_vertical,
                "rotation": m.rotation,
                "z_offset": round(m.z_offset, 2),
                "parent_opening": m.parent_opening,
                "FRMX_Comment": m.frmx_comment,
                "revit_family_name": m.revit_family_name,
                "revit_symbol_name": m.revit_symbol_name,
            })

        results.append({
            "wall_id": wall_input.wall_id,
            "label": wall_input.label or wall_input.wall_id,
            "length_mm": round(wall.length, 2),
            "height_mm": round(wall.height, 2),
            "height_start": round(wall.height_start, 2) if wall.height_start is not None else round(wall.height, 2),
            "height_end": round(wall.height_end, 2) if wall.height_end is not None else round(wall.height, 2),
            "base_start": round(wall.base_start, 2) if wall.base_start is not None else 0.0,
            "base_end": round(wall.base_end, 2) if wall.base_end is not None else 0.0,
            "thickness_mm": round(wall.thickness, 2),
            "origin_x": round(wall.origin_x, 2),
            "origin_y": round(wall.origin_y, 2),
            "direction_x": wall.direction_x,
            "direction_y": wall.direction_y,
            "openings": [
                {
                    "type": o.opening_type.value,
                    "x_offset": o.x_offset,
                    "width": o.width,
                    "height": o.height,
                    "sill_height": o.sill_height,
                    "label": o.label,
                    "x_right": o.x_right,
                    "y_top": o.y_top,
                    "config_overrides": o.config_overrides,
                }
                for o in wall.openings
            ],
            "joins": [
                {
                    "join_type": j.join_type,
                    "stopped_wall_id": j.stopped_wall_id,
                    "continuing_wall_id": j.continuing_wall_id,
                    "is_stopped_wall": j.is_stopped_wall,
                    "is_start": j.is_start,
                    "intersection_x": round(j.intersection_x, 2),
                    "stopped_wall_end_x": round(j.stopped_wall_end_x, 2),
                    "stopped_wall_thickness": round(j.stopped_wall_thickness, 2),
                    "continuing_wall_thickness": round(j.continuing_wall_thickness, 2),
                    "angle_deg": round(j.angle_deg, 2)
                }
                for j in wall.joins
            ],
            "corners": calculate_wall_corners(wall, walls),
            "members": members_data,
            "summary": result.summary(),
            "validation_errors": wall.validate(),
        })

    inputs_data = []
    for wall_input in inputs:
        inputs_data.append({
            "wall_id": wall_input.wall_id,
            "label": wall_input.label,
            "length": wall_input.length,
            "height": wall_input.height,
            "height_start": wall_input.height_start if wall_input.height_start is not None else wall_input.height,
            "height_end": wall_input.height_end if wall_input.height_end is not None else wall_input.height,
            "base_start": wall_input.base_start if wall_input.base_start is not None else 0.0,
            "base_end": wall_input.base_end if wall_input.base_end is not None else 0.0,
            "thickness": wall_input.thickness,
            "openings": [
                {
                    "type": o.type,
                    "x_offset": o.x_offset,
                    "width": o.width,
                    "height": o.height,
                    "sill_height": o.sill_height,
                    "label": o.label,
                    "config_overrides": o.config_overrides
                }
                for o in wall_input.openings
            ],
            "layers": [
                {
                    "function": l.function,
                    "function_name": l.function_name,
                    "material_name": l.material_name,
                    "thickness_mm": l.thickness_mm,
                    "is_structural": l.is_structural
                }
                for l in wall_input.layers
            ],
            "fire_rating": wall_input.fire_rating,
            "revit_parameters": wall_input.revit_parameters,
            "origin_x": wall_input.origin_x,
            "origin_y": wall_input.origin_y,
            "origin_z": wall_input.origin_z,
            "direction_x": wall_input.direction_x,
            "direction_y": wall_input.direction_y,
            "config_name": wall_input.config_name,
            "config_overrides": wall_input.config_overrides,
        })

    return {"walls": results, "inputs": inputs_data}


@app.post("/api/export")
def export_framing(request: FrameRequest, target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Run framing engine and return Revit-compatible encrypted/compressed data. Requires auth."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=True)

    # 1. Parse and split walls based on control join rules
    walls, configs, _ = _parse_and_split_request(request, decoded_token)

    # 2. Run join detection
    main_config = configs[0] if configs else None
    detect_and_trim_joins(walls, main_config, request.join_overrides)

    # 3. Frame all walls
    framing_results = []
    for wall, config in zip(walls, configs):
        framing_results.append(frame_wall(wall, config, custom_profiles=request.custom_profiles))

    # Create company specific output directory
    company_output_dir = os.path.join(os.path.dirname(__file__), "output", company_id)
    os.makedirs(company_output_dir, exist_ok=True)

    # Use the existing exporter to generate Revit-compatible JSON
    output_path = os.path.join(company_output_dir, "web_export.json")
    export_to_json(framing_results, output_path)

    with open(output_path, "r", encoding="utf-8") as f:
        revit_json = json.load(f)

    if "metadata" in revit_json:
        revit_json["metadata"]["config_name"] = request.config_name

    # Resave the updated json so the download gets it if using native endpoint
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(revit_json, f, indent=4)

    # Encrypt and compress the JSON payload
    json_str = json.dumps(revit_json)
    encrypted_bytes = encrypt_data(json_str)
    base64_str = base64.b64encode(encrypted_bytes).decode('utf-8')

    return {"data": base64_str, "filename": "revit_framing_data.frmx"}

@app.get("/api/download_export")
def download_export(target_company_id: Optional[str] = None, decoded_token: Dict[str, Any] = Depends(verify_firebase_token)):
    """Serve the generated export file natively as an encrypted .frmx attachment. Requires auth."""
    company_id = target_company_id or get_company_id(decoded_token)
    verify_company_access(decoded_token, company_id, write_access=False)

    # Try company-specific file first
    output_path = os.path.join(os.path.dirname(__file__), "output", company_id, "web_export.json")
    if not os.path.exists(output_path):
        # Fallback to legacy global file
        output_path = os.path.join(os.path.dirname(__file__), "output", "web_export.json")

    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="No export file available.")
    
    with open(output_path, "r", encoding="utf-8") as f:
        json_str = f.read()

    encrypted_bytes = encrypt_data(json_str)
    
    # Save the encrypted file in company directory
    company_output_dir = os.path.join(os.path.dirname(__file__), "output", company_id)
    os.makedirs(company_output_dir, exist_ok=True)
    frmx_path = os.path.join(company_output_dir, "web_export.frmx")
    with open(frmx_path, "wb") as f:
        f.write(encrypted_bytes)

    return FileResponse(
        path=frmx_path,
        filename="revit_framing_data.frmx",
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=revit_framing_data.frmx"}
    )




# ─── Serve static web files ─────────────────────────────────────────────────

web_dir = os.path.join(os.path.dirname(__file__), "web")
app.mount("/static", StaticFiles(directory=web_dir), name="static")

# Serve custom join preview images (create dir if missing — safe for Cloud Run)
join_previews_dir = os.path.join(os.path.dirname(__file__), "join preview images")
os.makedirs(join_previews_dir, exist_ok=True)
app.mount("/join-previews", StaticFiles(directory=join_previews_dir), name="join-previews")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(web_dir, "index.html"))


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("\n  LGSF Web Platform starting...")
    print("  Open http://localhost:8000 in your browser\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
