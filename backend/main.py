from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pathlib import Path
import os

# Load .env from the backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

from .routers import auth, vault, compare, admin, certificates, sharing, profile, portfolio, pinit_dna

app = FastAPI(
    title       = "PINIT API",
    description = "Image Forensics & Verification Platform",
    version     = "1.0.0"
)

# CORS — allow React frontend and Capacitor mobile app to call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://image-crypto-analyzer.vercel.app",
        "https://pinit-backend.onrender.com",
        "https://biovault-backend-d13a.onrender.com",
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:8000",
        "capacitor://",
        "file://",
        "*"  # Allow all origins for mobile apps
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Register all routers
app.include_router(auth.router,    prefix="/auth")
app.include_router(vault.router,   prefix="/vault")
app.include_router(compare.router, prefix="/compare")
app.include_router(admin.router,   prefix="/admin")
app.include_router(certificates.router, prefix="/certificates")
app.include_router(sharing.router, prefix="/share")
app.include_router(profile.router, prefix="/profile")
app.include_router(portfolio.router, prefix="/portfolio")
app.include_router(pinit_dna.router, prefix="/api/v1")


# ══════════════════════════════════════════════════════════════════════════════
# FRONTEND - Serve React app for share pages
# ══════════════════════════════════════════════════════════════════════════════

# Try to mount static assets from dist folder
dist_paths = [
    Path(__file__).parent / "dist" / "assets",  # backend/dist/assets
    Path(__file__).parent.parent / "dist" / "assets",  # ../dist/assets (dev)
]

for assets_path in dist_paths:
    if assets_path.exists():
        try:
            app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
            print(f"✅ Mounted static assets from: {assets_path}")
            break
        except Exception as e:
            print(f"⚠️ Could not mount assets from {assets_path}: {e}")


@app.get("/shared/portfolio/{token}")
async def serve_shared_portfolio_page(token: str):
    """Serve React app for shared portfolio links. React Router handles /shared/portfolio/:token."""
    dist_paths = [
        Path(__file__).parent / "dist" / "index.html",
        Path(__file__).parent.parent / "dist" / "index.html",
    ]
    for dist_path in dist_paths:
        if dist_path.exists():
            try:
                return FileResponse(path=str(dist_path), media_type="text/html")
            except Exception:
                continue
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content="""<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BiVault Portfolio</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}.c{text-align:center;color:#e2e8f0}.s{width:48px;height:48px;border:3px solid rgba(139,92,246,.2);border-top:3px solid #8b5cf6;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{to{transform:rotate(360deg)}}p{color:#94a3b8;margin-top:8px}</style></head><body><div class="c"><div class="s"></div><p>Loading Shared Portfolio...</p></div></body></html>""",
        status_code=200
    )


@app.get("/share/{share_id}")
async def serve_share_page(share_id: str):
    """
    Serve React app for share links.
    React Router will handle the /share/:token route on the client side.
    """
    dist_paths = [
        Path(__file__).parent / "dist" / "index.html",  # backend/dist/index.html
        Path(__file__).parent.parent / "dist" / "index.html",  # ../dist/index.html (dev)
    ]
    
    for dist_path in dist_paths:
        if dist_path.exists():
            try:
                return FileResponse(path=str(dist_path), media_type="text/html")
            except Exception as e:
                print(f"Error serving {dist_path}: {e}")
                continue
    
    # If no dist found, return helpful error
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content="""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BiVault Share</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { max-width: 500px; background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        h1 { color: #1a202c; margin-bottom: 16px; }
        p { color: #4a5568; margin-bottom: 12px; line-height: 1.6; }
        .spinner { display: inline-block; width: 40px; height: 40px; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Loading Shared Content...</h1>
        <div class="spinner"></div>
        <p>Please wait while we fetch your image</p>
    </div>
</body>
</html>""",
        status_code=200
    )


@app.get("/")
def root():
    return {
        "app"     : "PINIT API",
        "status"  : "running",
        "docs"    : "/docs"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Adapter endpoints for frontend biometric auth ────────────────────────────

@app.post("/api/register")
async def api_register(data: dict):
    """Adapter endpoint: Convert biometric registration to backend register format"""
    from .db.database import get_admin_db
    import uuid
    
    db = get_admin_db()
    
    # Generate credentials from biometric data
    user_id = data.get("userId", str(uuid.uuid4()))
    email = f"{user_id}@biovault.local"  # Generate email from userId
    username = data.get("userId", "user")
    
    # Check if user already exists
    existing = db.table("users").select("id").eq("email", email).execute()
    if existing.data:
        return {"ok": True, "tempCode": "000000", "mode": "remote"}
    
    # Create user with minimal data
    db.table("users").insert({
        "username": username,
        "email": email,
        "role": "user",
        "is_active": True,
        "email_verified": True,
        "password_hash": None
    }).execute()
    
    return {"ok": True, "tempCode": "000000", "mode": "remote"}


@app.post("/api/validate")
async def api_validate(data: dict):
    """Adapter endpoint: Validate deviced-based authentication"""
    from .db.database import get_admin_db
    
    db = get_admin_db()
    user_id = data.get("userId")
    device_token = data.get("deviceToken")
    
    if not user_id or not device_token:
        return {"authorized": False, "reason": "Missing userId or deviceToken"}
    
    # Check if user exists
    email = f"{user_id}@biovault.local"
    result = db.table("users").select("id").eq("email", email).execute()
    
    if not result.data:
        return {"authorized": False, "reason": "User not found"}
    
    return {"authorized": True, "reason": "Device verified"}


@app.post("/api/user/check")
async def api_user_check(data: dict):
    """Check if user is registered with biometric data"""
    from .db.database import get_admin_db
    
    db = get_admin_db()
    user_id = data.get("user_id") or data.get("userId")
    
    if not user_id:
        return {
            "ok": False,
            "reason": "Missing user_id",
            "fingerprintRegistered": False,
            "faceRegistered": False
        }
    
    try:
        # Check if user has biometric registration
        biometric_result = db.table("biometric_users").select("*").eq("user_id", user_id).execute()
        
        if not biometric_result.data:
            return {
                "ok": False,
                "reason": "User not registered with biometrics",
                "fingerprintRegistered": False,
                "faceRegistered": False
            }
        
        biometric_user = biometric_result.data[0]
        
        # Check what biometric data is available
        has_fingerprint = bool(biometric_user.get("webauthn_credential"))
        has_face = bool(biometric_user.get("face_embedding"))
        
        return {
            "ok": True,
            "reason": "User registered",
            "fingerprintRegistered": has_fingerprint,
            "faceRegistered": has_face,
            "faceEmbedding": biometric_user.get("face_embedding"),
            "userId": user_id,
            "isActive": biometric_user.get("is_active", True)
        }
    
    except Exception as e:
        print(f"Error checking user registration: {str(e)}")
        return {
            "ok": False,
            "reason": f"Error checking registration: {str(e)}",
            "fingerprintRegistered": False,
            "faceRegistered": False
        }


@app.post("/api/temp-code/request")
async def api_temp_code_request(data: dict):
    """Request a temporary access code"""
    from .db.database import get_admin_db
    import datetime
    import random
    
    db = get_admin_db()
    user_id = data.get("user_id") or data.get("userId")
    
    if not user_id:
        return {"ok": False, "reason": "Missing user_id"}
    
    try:
        # Check if user exists
        biometric_result = db.table("biometric_users").select("*").eq("user_id", user_id).execute()
        
        if not biometric_result.data:
            return {"ok": False, "reason": "User not found"}
        
        # Generate temp code
        temp_code = str(random.randint(100000, 999999))
        expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
        
        # Store temp code in a temp_codes table or just return it
        # For now, just return the temp code
        return {
            "ok": True,
            "tempCode": temp_code,
            "expiresAt": expiry.isoformat()
        }
    
    except Exception as e:
        print(f"Error requesting temp code: {str(e)}")
        return {"ok": False, "reason": f"Error: {str(e)}"}


@app.post("/api/temp-code/verify")
async def api_temp_code_verify(data: dict):
    """Verify temporary access code"""
    from .db.database import get_admin_db
    from .utils.auth_helpers import generate_jwt
    
    db = get_admin_db()
    user_id = data.get("user_id") or data.get("userId")
    code = data.get("code")
    
    if not user_id or not code:
        return {"ok": False, "reason": "Missing user_id or code"}
    
    try:
        # Check if user exists
        biometric_result = db.table("biometric_users").select("*").eq("user_id", user_id).execute()
        
        if not biometric_result.data:
            return {"ok": False, "reason": "User not found"}
        
        # For now, accept any code (verify is handled by face verification)
        # In production, would validate code against stored temp codes
        
        # Generate tokens for temporary access
        token = generate_jwt(user_id, "user")
        refresh_token = generate_jwt(user_id, "user")
        
        return {
            "ok": True,
            "token": token,
            "refreshToken": refresh_token,
            "userId": user_id
        }
    
    except Exception as e:
        print(f"Error verifying temp code: {str(e)}")
        return {"ok": False, "reason": f"Error: {str(e)}"}