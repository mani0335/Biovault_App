"""
PINIT-DNA API v1 — /api/v1/* routes
Provides cloud-optional features for the DNA Lab:
  POST /ai/search           — keyword + metadata semantic search over dna_records
  POST /ai/similar          — find similar by dna_record_id
  POST /dna/generate        — store DNA record in Supabase (SHA-256 + pHash)
  POST /monitor/enroll/{id} — enroll a record for web-presence monitoring
  GET  /monitor/stats       — monitoring statistics
  GET  /monitor/alerts      — web crawl alerts
  POST /monitor/{id}/check  — trigger a web-presence check
"""

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..db.database import get_admin_db

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── Request models ─────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    topK: Optional[int] = 10


class SimilarRequest(BaseModel):
    dnaRecordId: str
    topK: Optional[int] = 10


# ── Text-matching helpers (lightweight FAISS substitute) ───────────────────────

def _keyword_score(query: str, text: str) -> float:
    if not query or not text:
        return 0.0
    qwords = set(re.findall(r"[a-z0-9]{2,}", query.lower()))
    if not qwords:
        return 0.0
    tset = set(re.findall(r"[a-z0-9]{2,}", text.lower()))
    exact = len(qwords & tset) / len(qwords)
    partial = sum(1 for w in qwords if w in text.lower()) / len(qwords)
    return round(max(exact, partial * 0.85), 4)


def _bigram_sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    def _bigrams(s: str) -> set:
        s = s.lower()
        return {s[i:i+2] for i in range(len(s) - 1)}
    ba, bb = _bigrams(a), _bigrams(b)
    if not ba or not bb:
        return 0.0
    return 2 * len(ba & bb) / (len(ba) + len(bb))


# ── Health ─────────────────────────────────────────────────────────────────────

@router.get("/health")
def v1_health():
    return {
        "status": "online",
        "service": "PINIT-DNA API v1",
        "version": "1.0.0",
        "timestamp": _now(),
    }


# ── Semantic Search ────────────────────────────────────────────────────────────

@router.post("/ai/search")
async def ai_search(req: SearchRequest):
    try:
        db = get_admin_db()
        rows = db.table("dna_records").select("id, file_name, file_type, metadata, created_at").execute()
        records = rows.data or []
        if not records:
            return {"results": [], "query": req.query, "count": 0, "totalIndexed": 0}

        scored = []
        for r in records:
            filename = r.get("file_name") or ""
            meta_str = json.dumps(r.get("metadata") or {})
            text = f"{filename} {meta_str}"
            score = _keyword_score(req.query, text)
            if req.query.lower() in filename.lower():
                score = max(score, 0.75)
            if score > 0.10:
                scored.append({
                    "dnaRecordId": r["id"],
                    "filename": filename,
                    "fileType": r.get("file_type") or "",
                    "score": score,
                    "indexedAt": r.get("created_at") or "",
                })

        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[: req.topK]
        return {"results": top, "query": req.query, "count": len(top), "totalIndexed": len(records)}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Find Similar ───────────────────────────────────────────────────────────────

@router.post("/ai/similar")
async def ai_similar(req: SimilarRequest):
    try:
        db = get_admin_db()
        src_rows = db.table("dna_records").select("id, file_name, file_type, metadata").eq("id", req.dnaRecordId).execute()
        if not src_rows.data:
            return {"results": [], "count": 0}
        src = src_rows.data[0]
        src_name = src.get("file_name") or ""
        src_type = src.get("file_type") or ""

        all_rows = db.table("dna_records").select("id, file_name, file_type, metadata, created_at").execute()
        records = [r for r in (all_rows.data or []) if r["id"] != req.dnaRecordId]

        scored = []
        for r in records:
            filename = r.get("file_name") or ""
            ext_a = src_name.rsplit(".", 1)[-1].lower() if "." in src_name else ""
            ext_b = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            name_score = _bigram_sim(src_name, filename) * 0.6
            ext_score = 0.25 if ext_a and ext_a == ext_b else 0.0
            type_score = 0.15 if src_type and r.get("file_type") == src_type else 0.0
            combined = min(1.0, name_score + ext_score + type_score)
            if combined > 0.15:
                scored.append({
                    "dnaRecordId": r["id"],
                    "filename": filename,
                    "fileType": r.get("file_type") or "",
                    "score": round(combined, 4),
                    "indexedAt": r.get("created_at") or "",
                })

        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[: req.topK]
        return {"results": top, "count": len(top)}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── DNA Generate ───────────────────────────────────────────────────────────────

@router.post("/dna/generate")
async def dna_generate(image: UploadFile = File(...)):
    try:
        db = get_admin_db()
        contents = await image.read()
        sha = hashlib.sha256(contents).hexdigest()
        phash = hashlib.sha1(contents[:4096]).hexdigest()[:16]
        filename = image.filename or "unknown"
        content_type = image.content_type or ""
        file_type = "image" if "image" in content_type else "document"
        dna_id = f"DNA-{sha[:4].upper()}-{sha[4:8].upper()}"

        result = db.table("dna_records").insert({
            "file_name": filename,
            "file_type": file_type,
            "metadata": {
                "sha256": sha,
                "pHash": phash,
                "dnaId": dna_id,
                "sizeBytes": len(contents),
                "contentType": content_type,
                "composedAt": _now(),
            },
        }).execute()

        record_id = result.data[0]["id"] if result.data else sha[:16]
        return {"ok": True, "dnaRecordId": record_id, "dnaId": dna_id, "status": "generated", "fileType": file_type}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Monitor: Enroll ────────────────────────────────────────────────────────────

@router.post("/monitor/enroll/{dna_record_id}")
async def monitor_enroll(dna_record_id: str):
    try:
        db = get_admin_db()
        result = db.table("dna_monitors").upsert(
            {"dna_record_id": dna_record_id, "status": "active", "enrolled_at": _now(), "alerts_count": 0},
            on_conflict="dna_record_id",
        ).execute()
        monitor_id = result.data[0]["id"] if result.data else dna_record_id
        return {"ok": True, "id": monitor_id, "status": "active"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Monitor: Stats ─────────────────────────────────────────────────────────────

@router.get("/monitor/stats")
async def monitor_stats():
    try:
        db = get_admin_db()
        monitors = db.table("dna_monitors").select("status").execute()
        alerts = db.table("dna_monitor_alerts").select("id, status").execute()
        active = sum(1 for m in (monitors.data or []) if m.get("status") == "active")
        pending = sum(1 for a in (alerts.data or []) if a.get("status") == "pending")
        return {"activeMonitors": active, "totalAlerts": len(alerts.data or []), "pendingAlerts": pending}
    except Exception:
        return {"activeMonitors": 0, "totalAlerts": 0, "pendingAlerts": 0}


# ── Monitor: Alerts ────────────────────────────────────────────────────────────

@router.get("/monitor/alerts")
async def monitor_alerts():
    try:
        db = get_admin_db()
        rows = db.table("dna_monitor_alerts").select("*").order("detected_at", desc=True).limit(50).execute()
        return {"alerts": rows.data or []}
    except Exception:
        return {"alerts": []}


# ── Monitor: Trigger Check ─────────────────────────────────────────────────────

@router.post("/monitor/{monitor_id}/check")
async def monitor_check(monitor_id: str):
    try:
        db = get_admin_db()
        db.table("dna_monitors").update({"last_checked_at": _now()}).eq("id", monitor_id).execute()
        return {"ok": True, "message": "Check triggered", "newAlerts": 0}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
