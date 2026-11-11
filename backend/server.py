"""CRK Creative Request — FastAPI backend.

Satu service: API di /api, React build (frontend/dist) di /.
Semua aturan bisnis ditegakkan di server.
"""
import csv
import hashlib
import hmac
import io
import logging
import os
import re
import secrets
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

log = logging.getLogger("creative-request")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------- config
MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "creative_request")
USE_MOCK_DB = os.environ.get("USE_MOCK_DB", "false").lower() == "true"
SECRET_KEY = os.environ.get("SECRET_KEY", "ganti-secret-ini")
DEFAULT_ADMIN_PIN = os.environ.get("DEFAULT_ADMIN_PIN", "123456")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
WIB = ZoneInfo("Asia/Jakarta")
SESSION_DAYS = 30

ROOT = Path(__file__).resolve().parent
DIST = ROOT.parent / "frontend" / "dist"

try:
    UPLOAD_DIR = DATA_DIR / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except OSError:  # tanpa Volume (mis. lokal): pakai folder di samping kode
    UPLOAD_DIR = ROOT / "data" / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

if USE_MOCK_DB or not MONGO_URL:
    from mongomock_motor import AsyncMongoMockClient

    client = AsyncMongoMockClient()
    log.warning("DATABASE SEMENTARA (in-memory). Data hilang saat restart. Isi MONGO_URL dan USE_MOCK_DB=false.")
else:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

if SECRET_KEY == "ganti-secret-ini":
    log.warning("SECRET_KEY masih nilai bawaan. Ganti di environment.")
if DEFAULT_ADMIN_PIN == "123456":
    log.warning("DEFAULT_ADMIN_PIN masih nilai bawaan. Ganti di environment.")

app = FastAPI(title="CRK Creative Request")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------- constants
ROLES = ["Requester", "Manager Divisi", "Creative Lead", "Designer", "Admin"]
LEAD_ROLES = {"Creative Lead", "Admin"}
CREATIVE_ROLES = {"Creative Lead", "Designer", "Admin"}

S_DRAFT = "Draft"
S_URGENT = "Menunggu Persetujuan Urgent"
S_SUBMITTED = "Diajukan"
S_INCOMPLETE = "Perlu Dilengkapi"
S_QUEUE = "Antre"
S_WORK = "Dikerjakan"
S_INTERNAL = "Review Internal"
S_REVIEW = "Review Requester"
S_REVISION = "Revisi"
S_APPROVED = "Disetujui"
S_DONE = "Selesai"
S_REJECTED = "Ditolak"
S_CANCELLED = "Batal"

PIPELINE = [S_SUBMITTED, S_INCOMPLETE, S_QUEUE, S_WORK, S_INTERNAL, S_REVIEW, S_REVISION, S_APPROVED, S_DONE]
ACTIVE_FOR_DESIGNER = {S_QUEUE, S_WORK, S_INTERNAL, S_REVIEW, S_REVISION}
CLOSED = {S_APPROVED, S_DONE, S_CANCELLED, S_REJECTED}
MAX_REVISIONS = 2

BRIEF_CHECK_ITEMS = [
    "Tujuan jelas",
    "Copywriting final",
    "Referensi ada",
    "Ukuran & format jelas",
    "Aset tersedia",
    "Tanggal realistis",
]
INTERNAL_REVIEW_ITEMS = [
    "Warna sesuai brand",
    "Logo sesuai aturan",
    "Typography sesuai guideline",
    "Ukuran & format sesuai",
    "Ejaan benar",
    "Food styling sesuai aturan (atau tidak relevan)",
]

BRIEF_FIELDS = [
    "title", "type", "media", "brand", "outlet", "neededDate", "purpose", "objective",
    "audience", "references", "copy", "copyFinal", "copyApprovedBy", "copywriter",
    "assetLink", "useBrandAssets", "outputs", "notes", "urgentReason",
]

DEFAULT_SETTINGS = {
    "id": "main",
    "types": [
        {"name": "Konten Feed / Story / Carousel", "media": "Digital", "minLeadDays": 3, "draftDays": 2, "icon": "image"},
        {"name": "Flyer / Poster / Voucher", "media": "Digital atau Cetak", "minLeadDays": 3, "draftDays": 2, "icon": "ticket"},
        {"name": "Banner / X-Banner / Spanduk / POSM", "media": "Cetak", "minLeadDays": 5, "draftDays": 3, "icon": "flag"},
        {"name": "Menu / Price List", "media": "Digital atau Cetak", "minLeadDays": 5, "draftDays": 3, "icon": "utensils"},
        {"name": "Kemasan / Label / Stiker", "media": "Cetak", "minLeadDays": 10, "draftDays": 5, "icon": "package"},
        {"name": "Video / Reels / Motion", "media": "Video", "minLeadDays": 5, "draftDays": 3, "icon": "clapperboard"},
        {"name": "Deck / Presentasi", "media": "Digital", "minLeadDays": 3, "draftDays": 2, "icon": "presentation"},
        {"name": "Dokumen internal / Template surat", "media": "Digital", "minLeadDays": 2, "draftDays": 1, "icon": "file-text"},
        {"name": "Resize / Adaptasi desain lama", "media": "Digital atau Cetak", "minLeadDays": 1, "draftDays": 1, "icon": "scaling"},
        {"name": "Lainnya", "media": "-", "minLeadDays": None, "draftDays": None, "icon": "sparkles"},
    ],
    "divisions": [
        {"name": "Marketing", "code": "MKT", "color": "#D7191F", "emoji": "📣"},
        {"name": "Operasional", "code": "OPS", "color": "#F2A541", "emoji": "🛒"},
        {"name": "CRM / CS", "code": "CRM", "color": "#2E7D4F", "emoji": "💬"},
        {"name": "HR & GA", "code": "HRGA", "color": "#7A5AF8", "emoji": "🧑‍🤝‍🧑"},
        {"name": "Finance", "code": "FIN", "color": "#0E7490", "emoji": "💰"},
        {"name": "Purchasing", "code": "PUR", "color": "#B45309", "emoji": "📦"},
        {"name": "Expansion", "code": "EXP", "color": "#BE185D", "emoji": "🗺️"},
        {"name": "Produksi / Factory", "code": "PRD", "color": "#4D7C0F", "emoji": "🏭"},
        {"name": "Frozen / Online", "code": "FRZ", "color": "#1D4ED8", "emoji": "🧊"},
        {"name": "Direksi", "code": "DIR", "color": "#1F1A1A", "emoji": "⭐"},
        {"name": "Creative", "code": "CRV", "color": "#F5B800", "emoji": "🎨"},
        {"name": "Lainnya", "code": "LN", "color": "#8A8178", "emoji": "✨"},
    ],
    "sizePresets": [
        {"name": "IG Feed", "size": "1080×1350", "unit": "px", "w": 4, "h": 5},
        {"name": "IG Story", "size": "1080×1920", "unit": "px", "w": 9, "h": 16},
        {"name": "A5 Print", "size": "148×210", "unit": "mm", "w": 148, "h": 210},
        {"name": "A4 Print", "size": "210×297", "unit": "mm", "w": 210, "h": 297},
        {"name": "A3 Poster", "size": "297×420", "unit": "mm", "w": 297, "h": 420},
        {"name": "X-Banner", "size": "60×160", "unit": "cm", "w": 60, "h": 160},
        {"name": "Spanduk", "size": "3×1", "unit": "m", "w": 3, "h": 1},
    ],
    "brands": ["Cimol Bojot AA", "CRK Group", "Lainnya"],
    "workDays": [1, 2, 3, 4, 5, 6],
    "holidays": [],
    "namingPattern": "DDMMYY_Dept_NamaProject_Final",
    "defaultCapacity": 5,
    "briefCheckItems": BRIEF_CHECK_ITEMS,
    "internalReviewItems": INTERNAL_REVIEW_ITEMS,
    "maxRevisions": MAX_REVISIONS,
}

DEFAULT_BRAND_KIT = [
    {"category": "Warna", "title": "Merah Brand", "meta": {"hex": "#D7191F"}, "description": "Warna utama: tombol, judul, angka penting."},
    {"category": "Warna", "title": "Merah Tua", "meta": {"hex": "#B32E26"}, "description": "Header tabel, aksen gelap."},
    {"category": "Warna", "title": "Kuning", "meta": {"hex": "#F5B800"}, "description": "Highlight dan tanda selesai."},
    {"category": "Warna", "title": "Oranye", "meta": {"hex": "#F2A541"}, "description": "Blok hero."},
    {"category": "Warna", "title": "Krem", "meta": {"hex": "#FFF4E0"}, "description": "Latar halaman."},
    {"category": "Warna", "title": "Charcoal", "meta": {"hex": "#1F1A1A"}, "description": "Teks dan judul tebal."},
    {"category": "Font", "title": "Headline", "meta": {"family": "Poppins", "weight": 900}, "description": "Judul dan headline promo."},
    {"category": "Font", "title": "Sub headline", "meta": {"family": "Poppins", "weight": 700}, "description": "Sub judul."},
    {"category": "Font", "title": "Body text", "meta": {"family": "Plus Jakarta Sans", "weight": 500}, "description": "Teks isi dan S&K."},
    {"category": "Brand Guideline", "title": "Brand Guideline", "description": "Tautan belum diisi. Creative Lead mengisi dari halaman ini.", "link": ""},
    {"category": "Logo", "title": "Folder Logo Resmi", "description": "Tautan belum diisi.", "link": ""},
    {"category": "Font", "title": "Folder Font untuk Semua Divisi", "description": "Install agar surat dan dokumen perusahaan satu gaya. Tautan belum diisi.", "link": ""},
    {"category": "Aset Eksternal (B2B)", "title": "Folder Aset untuk Kebutuhan Eksternal", "description": "Tautan belum diisi.", "link": ""},
    {"category": "Aturan", "title": "Aturan pakai logo", "description": "Beri ruang kosong di sekeliling logo, jangan diregangkan, jangan diganti warna, jangan ditumpuk di foto yang ramai."},
]


# ---------------------------------------------------------------- helpers
def err(status: int, msg: str, **extra):
    raise HTTPException(status_code=status, detail={"message": msg, **extra})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_wib() -> date:
    return datetime.now(WIB).date()


def parse_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except Exception:
        err(400, "Format tanggal tidak valid (YYYY-MM-DD).")


def clean(doc: Optional[dict]) -> Optional[dict]:
    if doc:
        doc.pop("_id", None)
    return doc


def is_workday(d: date, st: dict) -> bool:
    return d.isoweekday() in st.get("workDays", [1, 2, 3, 4, 5, 6]) and d.isoformat() not in st.get("holidays", [])


def add_workdays(start: date, n: int, st: dict) -> date:
    d = start
    left = n
    while left > 0:
        d += timedelta(days=1)
        if is_workday(d, st):
            left -= 1
    while not is_workday(d, st):
        d += timedelta(days=1)
    return d


def workdays_between(a: date, b: date, st: dict) -> int:
    """Jumlah hari kerja di (a, b]. Negatif bila b < a."""
    if b < a:
        return -workdays_between(b, a, st)
    n, d = 0, a
    while d < b:
        d += timedelta(days=1)
        if is_workday(d, st):
            n += 1
    return n


def hash_pin(pin: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${h}"


def verify_pin(pin: str, stored: str) -> bool:
    salt = stored.split("$")[0]
    return hmac.compare_digest(hash_pin(pin, salt), stored)


def make_token(uid: str) -> str:
    exp = int(time.time()) + SESSION_DAYS * 86400
    body = f"{uid}.{exp}"
    sig = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_token(token: str) -> Optional[str]:
    try:
        uid, exp, sig = token.rsplit(".", 2)
        good = hmac.new(SECRET_KEY.encode(), f"{uid}.{exp}".encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, good) and int(exp) > time.time():
            return uid
    except Exception:
        pass
    return None


async def get_settings() -> dict:
    st = clean(await db.settings.find_one({"id": "main"}))
    return st or DEFAULT_SETTINGS


async def optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    uid = read_token(authorization[7:])
    if not uid:
        return None
    u = clean(await db.users.find_one({"id": uid, "active": True}))
    return u


async def current_user(u: Optional[dict] = Depends(optional_user)) -> dict:
    if not u:
        err(401, "Silakan masuk dulu.")
    return u


def require_roles(u: dict, roles: set, msg: str = "Anda tidak punya akses untuk tindakan ini."):
    if u["role"] not in roles:
        err(403, msg)


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ["id", "name", "division", "jobTitle", "role", "specialty", "capacity", "avatar", "active", "prefs", "email"]}


def division_code(st: dict, name: str) -> str:
    for d in st["divisions"]:
        if d["name"] == name:
            return d["code"]
    return "LN"


def type_cfg(st: dict, name: str) -> Optional[dict]:
    for t in st["types"]:
        if t["name"] == name:
            return t
    return None


def earliest_safe_date(st: dict, type_name: str) -> Optional[date]:
    t = type_cfg(st, type_name)
    if not t or t.get("minLeadDays") is None:
        return None
    return add_workdays(today_wib(), int(t["minLeadDays"]), st)


def camel(title: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", title or "")
    return "".join(w[:1].upper() + w[1:] for w in words) or "Project"


def suggested_name(st: dict, r: dict, out: dict, idx: int, total: int) -> str:
    d = today_wib().strftime("%d%m%y")
    ext = (out.get("fileFormat") or "png").lower().strip(". ")
    suffix = f"_{camel(out.get('name', ''))}" if total > 1 else ""
    return f"{d}_{division_code(st, r.get('division', ''))}_{camel(r.get('title', ''))}{suffix}_Final.{ext}"


NAME_RE = re.compile(r"^\d{6}_[A-Z]{2,5}_[A-Za-z0-9]+(_[A-Za-z0-9]+)?_Final\.[A-Za-z0-9]+$")


def add_log(r: dict, u: dict, action: str, frm: Optional[str] = None, to: Optional[str] = None, note: str = ""):
    r.setdefault("log", []).append(
        {"at": now_iso(), "by": u["id"], "byName": u["name"], "action": action, "from": frm, "to": to, "note": note}
    )


def set_status(r: dict, u: dict, to: str, action: str, note: str = ""):
    frm = r.get("status")
    # catat waktu yang dihabiskan di sisi requester
    if frm in (S_INCOMPLETE, S_REVIEW) and r.get("statusSince"):
        try:
            since = datetime.fromisoformat(r["statusSince"])
            r["minutesWithRequester"] = int(r.get("minutesWithRequester", 0) + (datetime.now(timezone.utc) - since).total_seconds() / 60)
        except Exception:
            pass
    r["status"] = to
    r["statusSince"] = now_iso()
    r.setdefault("stamps", {})[to] = r["statusSince"]
    add_log(r, u, action, frm, to, note)


def flags(r: dict, st: dict) -> dict:
    overdue = at_risk = False
    days_left = None
    if r.get("deadlineFinal") and r.get("status") not in CLOSED and r.get("status") != S_DRAFT:
        dl = date.fromisoformat(r["deadlineFinal"])
        t = today_wib()
        days_left = workdays_between(t, dl, st)
        overdue = t > dl
        at_risk = (not overdue) and days_left <= 1 and r["status"] in (S_SUBMITTED, S_INCOMPLETE, S_QUEUE, S_WORK, S_REVISION)
    return {"overdue": overdue, "atRisk": at_risk, "daysLeft": days_left}


def can_see_detail(u: Optional[dict], r: dict) -> bool:
    if not u:
        return False
    return u["role"] in CREATIVE_ROLES or u["division"] == r.get("division") or u["id"] == r.get("requesterId")


def is_owner_side(u: dict, r: dict) -> bool:
    """Pengaju, Manager divisi pengaju, atau Admin."""
    return (
        u["id"] == r.get("requesterId")
        or u["role"] == "Admin"
        or (u["role"] == "Manager Divisi" and u["division"] == r.get("division"))
    )


def summary(r: dict, st: dict) -> dict:
    keys = ["id", "code", "title", "division", "type", "media", "status", "isUrgent", "priority", "designerId",
            "designerName", "requesterId", "requesterName", "neededDate", "deadlineFinal", "deadlineDraft",
            "revisionRound", "createdAt", "updatedAt", "thumbnailUrl"]
    out = {k: r.get(k) for k in keys}
    out.update(flags(r, st))
    out["outputsTotal"] = len(r.get("outputs") or [])
    return out


def full(r: dict, st: dict) -> dict:
    out = dict(r)
    out.update(flags(r, st))
    outs = out.get("outputs") or []
    out["suggestedNames"] = [suggested_name(st, r, o, i, len(outs)) for i, o in enumerate(outs)]
    return out


def validate_brief(r: dict, st: dict) -> List[str]:
    miss = []
    if not (r.get("title") or "").strip():
        miss.append("Judul")
    if not type_cfg(st, r.get("type") or ""):
        miss.append("Jenis request")
    if r.get("media") not in ("Digital", "Cetak"):
        miss.append("Media (Digital atau Cetak)")
    if not r.get("neededDate"):
        miss.append("Tanggal dibutuhkan")
    for key, label in [("purpose", "Tujuan"), ("objective", "Objektif"), ("audience", "Target audiens")]:
        if not (r.get(key) or "").strip():
            miss.append(label)
    if not [x for x in (r.get("references") or []) if (x or "").strip()]:
        miss.append("Referensi (minimal 1 tautan atau gambar)")
    copy = r.get("copy") or {}
    if not (copy.get("headline") or "").strip():
        miss.append("Headline (teks final)")
    if not r.get("copyFinal"):
        miss.append("Centang \"Copywriting sudah final dan disetujui\"")
    if not (r.get("copyApprovedBy") or "").strip():
        miss.append("Nama Manager yang menyetujui copywriting")
    if not (r.get("assetLink") or "").strip() and not r.get("useBrandAssets"):
        miss.append("Tautan aset resolusi tinggi (atau pilih gunakan aset brand)")
    outs = r.get("outputs") or []
    if not outs:
        miss.append("Ukuran & format (minimal 1 output)")
    for i, o in enumerate(outs):
        if not (o.get("name") or "").strip() or not (o.get("size") or "").strip() or not (o.get("fileFormat") or "").strip():
            miss.append(f"Output {i + 1}: nama, ukuran, dan format file")
    return miss


async def load_request(rid: str) -> dict:
    r = clean(await db.requests.find_one({"id": rid}))
    if not r:
        err(404, "Request tidak ditemukan.")
    return r


async def save_request(r: dict):
    r["updatedAt"] = now_iso()
    await db.requests.replace_one({"id": r["id"]}, r)


async def next_code() -> str:
    prefix = "CR-" + datetime.now(WIB).strftime("%y%m") + "-"
    mx = 0
    async for d in db.requests.find({"code": {"$regex": f"^{prefix}"}}, {"code": 1}):
        try:
            mx = max(mx, int(d["code"].split("-")[-1]))
        except Exception:
            pass
    return f"{prefix}{mx + 1:03d}"


async def designer_load(uid: str) -> int:
    return await db.requests.count_documents({"designerId": uid, "status": {"$in": list(ACTIVE_FOR_DESIGNER)}})


# ---------------------------------------------------------------- startup
@app.on_event("startup")
async def startup():
    if not await db.settings.find_one({"id": "main"}):
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))
    if not await db.users.find_one({"role": "Admin"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "name": "Admin", "division": "Creative", "jobTitle": "Administrator",
            "role": "Admin", "specialty": "Semua", "capacity": 5, "email": "", "pinHash": hash_pin(DEFAULT_ADMIN_PIN),
            "avatar": {"color": "#1F1A1A", "emoji": "🛠️"}, "prefs": {}, "active": True, "createdAt": now_iso(),
            "failed": 0, "lockedUntil": 0,
        })
    if await db.brandkit.count_documents({}) == 0:
        for i, it in enumerate(DEFAULT_BRAND_KIT):
            await db.brandkit.insert_one({"id": str(uuid.uuid4()), "order": i, "link": "", "meta": {}, **it})


@app.get("/api/health")
async def health():
    return {"ok": True, "mockDb": USE_MOCK_DB or not MONGO_URL}


# ---------------------------------------------------------------- auth
@app.get("/api/auth/names")
async def names():
    out = []
    async for u in db.users.find({"active": True}):
        out.append({"id": u["id"], "name": u["name"], "division": u["division"], "avatar": u.get("avatar")})
    return sorted(out, key=lambda x: x["name"].lower())


@app.post("/api/auth/register")
async def register(body: Dict[str, Any] = Body(...)):
    st = await get_settings()
    name = (body.get("name") or "").strip()
    pin = str(body.get("pin") or "")
    division = body.get("division")
    if len(name) < 2:
        err(400, "Nama minimal 2 huruf.")
    if not re.fullmatch(r"\d{6}", pin):
        err(400, "PIN harus 6 angka.")
    if division not in [d["name"] for d in st["divisions"]]:
        err(400, "Pilih divisi dari daftar.")
    async for u in db.users.find({}):
        if u["name"].lower() == name.lower():
            err(400, "Nama ini sudah terdaftar. Masuk dengan PIN, atau pakai nama lain.")
    u = {
        "id": str(uuid.uuid4()), "name": name, "division": division, "jobTitle": (body.get("jobTitle") or "").strip(),
        "role": "Requester", "specialty": "Semua", "capacity": st.get("defaultCapacity", 5),
        "email": (body.get("email") or "").strip(), "pinHash": hash_pin(pin),
        "avatar": body.get("avatar") or {"color": "#D7191F", "emoji": "🙂"},
        "prefs": {"reduceMotion": False, "sound": False, "darkMode": False},
        "active": True, "createdAt": now_iso(), "failed": 0, "lockedUntil": 0,
    }
    await db.users.insert_one(dict(u))
    return {"token": make_token(u["id"]), "user": public_user(u)}


@app.post("/api/auth/login")
async def login(body: Dict[str, Any] = Body(...)):
    u = clean(await db.users.find_one({"id": body.get("userId"), "active": True}))
    if not u:
        err(400, "Nama tidak ditemukan.")
    if u.get("lockedUntil", 0) > time.time():
        mins = int((u["lockedUntil"] - time.time()) / 60) + 1
        err(423, f"Terlalu banyak PIN salah. Coba lagi dalam {mins} menit.")
    if not verify_pin(str(body.get("pin") or ""), u["pinHash"]):
        failed = u.get("failed", 0) + 1
        upd = {"failed": failed}
        if failed >= 5:
            upd = {"failed": 0, "lockedUntil": time.time() + 15 * 60}
        await db.users.update_one({"id": u["id"]}, {"$set": upd})
        if failed >= 5:
            err(423, "PIN salah 5 kali. Akun dikunci 15 menit.")
        err(400, f"PIN salah. Sisa percobaan: {5 - failed}.")
    await db.users.update_one({"id": u["id"]}, {"$set": {"failed": 0, "lockedUntil": 0}})
    return {"token": make_token(u["id"]), "user": public_user(u)}


@app.get("/api/auth/me")
async def me(u: dict = Depends(current_user)):
    return public_user(u)


@app.put("/api/me/prefs")
async def set_prefs(body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    prefs = {**(u.get("prefs") or {}), **{k: bool(v) for k, v in body.items() if k in ("reduceMotion", "sound", "darkMode")}}
    upd: Dict[str, Any] = {"prefs": prefs}
    if isinstance(body.get("avatar"), dict):
        upd["avatar"] = body["avatar"]
    await db.users.update_one({"id": u["id"]}, {"$set": upd})
    return public_user({**u, **upd})


# ---------------------------------------------------------------- users & settings
@app.get("/api/users")
async def list_users(u: dict = Depends(current_user)):
    out = []
    async for x in db.users.find({}):
        p = public_user(x)
        if u["role"] not in LEAD_ROLES:
            p.pop("email", None)
        if x["role"] in ("Designer", "Creative Lead"):
            p["activeCount"] = await designer_load(x["id"])
        out.append(p)
    return sorted(out, key=lambda x: x["name"].lower())


@app.put("/api/users/{uid}")
async def update_user(uid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES)
    st = await get_settings()
    upd: Dict[str, Any] = {}
    if "role" in body:
        if body["role"] not in ROLES:
            err(400, "Role tidak dikenal.")
        if body["role"] == "Admin" and u["role"] != "Admin":
            err(403, "Hanya Admin yang dapat menjadikan Admin.")
        upd["role"] = body["role"]
    if "specialty" in body:
        if body["specialty"] not in ("Digital", "Cetak", "Video", "Semua"):
            err(400, "Spesialis tidak dikenal.")
        upd["specialty"] = body["specialty"]
    if "capacity" in body:
        upd["capacity"] = max(1, int(body["capacity"]))
    if "division" in body:
        if body["division"] not in [d["name"] for d in st["divisions"]]:
            err(400, "Divisi tidak dikenal.")
        upd["division"] = body["division"]
    if "active" in body:
        upd["active"] = bool(body["active"])
    if body.get("newPin"):
        if not re.fullmatch(r"\d{6}", str(body["newPin"])):
            err(400, "PIN harus 6 angka.")
        upd.update({"pinHash": hash_pin(str(body["newPin"])), "failed": 0, "lockedUntil": 0})
    if not upd:
        err(400, "Tidak ada perubahan.")
    res = await db.users.update_one({"id": uid}, {"$set": upd})
    if not res.matched_count:
        err(404, "Pengguna tidak ditemukan.")
    return public_user(clean(await db.users.find_one({"id": uid})))


@app.get("/api/settings")
async def read_settings():
    st = await get_settings()
    st["statuses"] = PIPELINE
    st["publicBaseUrl"] = PUBLIC_BASE_URL
    return st


@app.put("/api/settings")
async def write_settings(body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES)
    allowed = ["types", "divisions", "sizePresets", "brands", "workDays", "holidays", "namingPattern", "defaultCapacity"]
    upd = {k: body[k] for k in allowed if k in body}
    if "types" in upd:
        for t in upd["types"]:
            if not (t.get("name") or "").strip():
                err(400, "Nama jenis request tidak boleh kosong.")
            for k in ("minLeadDays", "draftDays"):
                if t.get(k) in ("", None):
                    t[k] = None
                else:
                    t[k] = max(0, int(t[k]))
    if upd:
        await db.settings.update_one({"id": "main"}, {"$set": upd})
    return await read_settings()


@app.get("/api/sla")
async def sla(type: str):
    st = await get_settings()
    e = earliest_safe_date(st, type)
    return {"earliestSafeDate": e.isoformat() if e else None, "today": today_wib().isoformat()}


# ---------------------------------------------------------------- requests
def apply_brief(r: dict, body: dict):
    for k in BRIEF_FIELDS:
        if k in body:
            r[k] = body[k]
    if isinstance(r.get("outputs"), list):
        norm = []
        for o in r["outputs"]:
            norm.append({
                "name": (o.get("name") or "").strip(), "size": (o.get("size") or "").strip(),
                "unit": o.get("unit") or "", "orientation": o.get("orientation") or "",
                "fileFormat": (o.get("fileFormat") or "").strip(),
                "fileLink": o.get("fileLink") or "", "fileName": o.get("fileName") or "", "done": bool(o.get("done")),
            })
        r["outputs"] = norm


@app.post("/api/requests")
async def create_request(body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    r: Dict[str, Any] = {
        "id": str(uuid.uuid4()), "code": None, "status": S_DRAFT, "requesterId": u["id"], "requesterName": u["name"],
        "division": u["division"], "brand": "Cimol Bojot AA", "references": [], "copy": {}, "outputs": [],
        "isUrgent": False, "revisionRound": 0, "revisionNotes": [], "previewUrls": [], "reactions": {},
        "briefCheck": {"returnedCount": 0}, "minutesWithRequester": 0, "showInGallery": True, "isPick": False,
        "log": [], "stamps": {}, "createdAt": now_iso(), "updatedAt": now_iso(),
    }
    apply_brief(r, body)
    add_log(r, u, "Draft dibuat")
    await db.requests.insert_one(dict(r))
    return full(r, await get_settings())


@app.get("/api/requests")
async def list_requests(mine: bool = False, u: dict = Depends(current_user)):
    st = await get_settings()
    q: Dict[str, Any] = {}
    if mine:
        q = {"$or": [{"requesterId": u["id"]}, {"designerId": u["id"]}]}
    out = []
    async for r in db.requests.find(q):
        clean(r)
        if r["status"] == S_DRAFT and r["requesterId"] != u["id"]:
            continue
        out.append(summary(r, st))
    return sorted(out, key=lambda x: x["updatedAt"], reverse=True)


@app.get("/api/requests/{rid}")
async def get_request(rid: str, u: dict = Depends(current_user)):
    r = await load_request(rid)
    if not can_see_detail(u, r):
        err(403, "Brief lengkap hanya untuk divisi pengaju dan tim Creative.")
    return full(r, await get_settings())


@app.put("/api/requests/{rid}")
async def update_request(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    r = await load_request(rid)
    if not is_owner_side(u, r):
        err(403, "Hanya pengaju yang dapat mengubah brief.")
    if r["status"] not in (S_DRAFT, S_INCOMPLETE):
        err(400, "Brief sudah terkunci. Perubahan setelah brief diajukan dilakukan lewat \"Minta revisi\".")
    apply_brief(r, body)
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/submit")
async def submit(rid: str, u: dict = Depends(current_user)):
    r = await load_request(rid)
    st = await get_settings()
    if not is_owner_side(u, r):
        err(403, "Hanya pengaju yang dapat mengajukan brief.")
    if r["status"] not in (S_DRAFT, S_INCOMPLETE):
        err(400, "Brief ini sudah diajukan.")
    miss = validate_brief(r, st)
    if miss:
        err(400, f"Brief belum lengkap. Ada {len(miss)} hal yang perlu ditambah.", missing=miss)
    needed = parse_date(r["neededDate"])
    if needed < today_wib():
        err(400, "Tanggal dibutuhkan sudah lewat.")
    earliest = earliest_safe_date(st, r["type"])
    urgent = bool(earliest and needed < earliest)
    if urgent and not (r.get("urgentReason") or "").strip():
        err(400, "Wah, ini dadakan. Isi alasan urgent dulu ya.", missing=["Alasan urgent"],
            earliestSafeDate=earliest.isoformat())
    if not r.get("code"):
        r["code"] = await next_code()
        r["submittedAt"] = now_iso()
    r["isUrgent"] = urgent
    if urgent and not (r.get("urgentApproval") or {}).get("leadAt"):
        r["urgentApproval"] = r.get("urgentApproval") or {"managerId": None, "managerAt": None, "leadId": None, "leadAt": None}
        set_status(r, u, S_URGENT, "Brief diajukan (urgent)", r.get("urgentReason", ""))
    else:
        set_status(r, u, S_SUBMITTED, "Brief diajukan")
    await save_request(r)
    return full(r, st)


@app.post("/api/requests/{rid}/approve-urgent")
async def approve_urgent(rid: str, body: Dict[str, Any] = Body(default={}), u: dict = Depends(current_user)):
    r = await load_request(rid)
    if r["status"] != S_URGENT:
        err(400, "Request ini tidak sedang menunggu persetujuan urgent.")
    ap = r.get("urgentApproval") or {}
    decision = body.get("decision", "setuju")
    is_manager = u["role"] == "Admin" or (u["role"] == "Manager Divisi" and u["division"] == r["division"])
    is_lead = u["role"] in LEAD_ROLES
    if not (is_manager or is_lead):
        err(403, "Persetujuan urgent hanya oleh Manager divisi pengaju dan Creative Lead.")
    if decision == "tolak":
        if not (body.get("note") or "").strip():
            err(400, "Isi alasan penolakan.")
        r["rejectReason"] = body["note"]
        set_status(r, u, S_REJECTED, "Urgent ditolak", body["note"])
    else:
        did = False
        if u["role"] == "Manager Divisi" and u["division"] == r["division"] and not ap.get("managerAt"):
            ap.update({"managerId": u["id"], "managerName": u["name"], "managerAt": now_iso()})
            did = True
        elif u["role"] == "Creative Lead" and not ap.get("leadAt"):
            ap.update({"leadId": u["id"], "leadName": u["name"], "leadAt": now_iso()})
            did = True
        elif u["role"] == "Admin":
            side = body.get("as")
            if side == "manager" and not ap.get("managerAt"):
                ap.update({"managerId": u["id"], "managerName": u["name"], "managerAt": now_iso()})
                did = True
            elif side == "lead" and not ap.get("leadAt"):
                ap.update({"leadId": u["id"], "leadName": u["name"], "leadAt": now_iso()})
                did = True
            else:
                err(400, "Admin: pilih menyetujui sebagai Manager atau Creative Lead.")
        if not did:
            err(400, "Persetujuan dari sisi Anda sudah tercatat.")
        r["urgentApproval"] = ap
        add_log(r, u, "Urgent disetujui")
        if ap.get("managerAt") and ap.get("leadAt"):
            set_status(r, u, S_SUBMITTED, "Urgent disetujui lengkap")
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/check-brief")
async def check_brief(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES, "Cek brief dilakukan oleh Creative Lead.")
    r = await load_request(rid)
    st = await get_settings()
    if r["status"] != S_SUBMITTED:
        if r["status"] == S_URGENT:
            err(400, "Request urgent belum disetujui Manager divisi dan Creative Lead.")
        err(400, "Request ini tidak sedang menunggu cek brief.")
    decision = body.get("decision")
    note = (body.get("note") or "").strip()
    bc = r.get("briefCheck") or {"returnedCount": 0}
    if decision == "kembalikan":
        missing = [m for m in (body.get("missing") or []) if m]
        if not missing:
            err(400, "Centang hal yang belum lengkap sebelum mengembalikan brief.")
        if not note:
            err(400, "Tulis catatan untuk pengaju.")
        bc.update({"missing": missing, "note": note, "by": u["name"], "at": now_iso(),
                   "returnedCount": bc.get("returnedCount", 0) + 1})
        r["briefCheck"] = bc
        set_status(r, u, S_INCOMPLETE, "Brief dikembalikan", note)
    elif decision == "tolak":
        if not note:
            err(400, "Isi alasan penolakan.")
        r["rejectReason"] = note
        set_status(r, u, S_REJECTED, "Request ditolak", note)
    elif decision == "terima":
        if body.get("priority") not in ("Normal", "Tinggi", "Urgent"):
            err(400, "Tetapkan prioritas (Normal, Tinggi, atau Urgent).")
        d = clean(await db.users.find_one({"id": body.get("designerId"), "active": True}))
        if not d or d["role"] not in ("Designer", "Creative Lead"):
            err(400, "Tunjuk desainer dulu sebelum menerima brief.")
        load = await designer_load(d["id"])
        if load >= d.get("capacity", 5) and not body.get("confirm"):
            err(409, f"{d['name']} sudah memegang {load} dari {d.get('capacity', 5)} request. Tetap tugaskan?",
                needsConfirm=True)
        t = type_cfg(st, r["type"]) or {}
        draft_days = t.get("draftDays") if t.get("draftDays") is not None else 2
        r.update({
            "priority": body["priority"], "designerId": d["id"], "designerName": d["name"],
            "acceptedAt": now_iso(), "deadlineFinal": r["neededDate"],
            "deadlineDraft": min(add_workdays(today_wib(), int(draft_days), st), max(parse_date(r["neededDate"]), today_wib())).isoformat(),
        })
        bc.update({"missing": [], "note": note, "by": u["name"], "at": now_iso()})
        r["briefCheck"] = bc
        set_status(r, u, S_QUEUE, "Brief diterima", f"Desainer: {d['name']}")
    else:
        err(400, "Pilih keputusan: terima, kembalikan, atau tolak.")
    await save_request(r)
    return full(r, st)


def require_maker(u: dict, r: dict):
    if not (u["role"] in LEAD_ROLES or u["id"] == r.get("designerId")):
        err(403, "Hanya desainer yang ditugaskan atau Creative Lead.")


@app.post("/api/requests/{rid}/start")
async def start(rid: str, u: dict = Depends(current_user)):
    r = await load_request(rid)
    require_maker(u, r)
    if r["status"] != S_QUEUE:
        err(400, "Hanya request berstatus Antre yang bisa mulai dikerjakan.")
    set_status(r, u, S_WORK, "Mulai dikerjakan")
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/move")
async def move(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    """Dipakai drag-and-drop di papan. Hanya perpindahan tanpa isian yang diizinkan."""
    r = await load_request(rid)
    to = body.get("to")
    if r["status"] == to:
        return full(r, await get_settings())
    if r["status"] == S_QUEUE and to == S_WORK:
        return await start(rid, u)
    err(400, f"Perpindahan {r['status']} → {to} perlu diisi lewat detail request.", openDetail=True)


@app.post("/api/requests/{rid}/to-internal-review")
async def to_internal_review(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    r = await load_request(rid)
    require_maker(u, r)
    if r["status"] not in (S_WORK, S_REVISION):
        err(400, "Hasil hanya bisa dikirim dari status Dikerjakan atau Revisi.")
    url = (body.get("previewUrl") or "").strip()
    if not url:
        err(400, "Lampirkan pratinjau hasil (gambar atau tautan).")
    r.setdefault("previewUrls", []).append({"url": url, "round": r.get("revisionRound", 0), "at": now_iso(), "note": body.get("note", "")})
    r["makerId"] = u["id"] if u["id"] == r.get("designerId") else r.get("designerId")
    for n in r.get("revisionNotes", []):
        n["resolved"] = True
    set_status(r, u, S_INTERNAL, "Hasil dikirim ke review internal")
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/internal-review")
async def internal_review(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, CREATIVE_ROLES, "Review internal dilakukan tim Creative.")
    r = await load_request(rid)
    if r["status"] != S_INTERNAL:
        err(400, "Request ini tidak sedang di review internal.")
    if u["id"] == r.get("designerId"):
        err(400, "Review internal harus oleh orang lain, bukan pembuat desain.")
    if body.get("decision") == "kembali":
        if not (body.get("note") or "").strip():
            err(400, "Tulis catatan untuk desainer.")
        set_status(r, u, S_WORK, "Dikembalikan dari review internal", body["note"])
    else:
        items = body.get("items") or {}
        unticked = [i for i in INTERNAL_REVIEW_ITEMS if not items.get(i)]
        if unticked:
            err(400, "Checklist review internal belum lengkap.", missing=unticked)
        r["internalReview"] = {"items": items, "by": u["name"], "byId": u["id"], "at": now_iso()}
        r["reviewerId"] = u["id"]
        set_status(r, u, S_REVIEW, "Lolos review internal, dikirim ke pengaju")
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/request-revision")
async def request_revision(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    r = await load_request(rid)
    if not is_owner_side(u, r):
        err(403, "Hanya pengaju yang dapat meminta revisi.")
    if r["status"] != S_REVIEW:
        err(400, "Revisi hanya bisa diminta saat status Review Requester.")
    text = (body.get("text") or "").strip()
    if not text:
        err(400, "Tulis catatan revisi supaya desainer tahu apa yang diubah.")
    if r.get("revisionRound", 0) >= MAX_REVISIONS:
        err(400, "Nyawa revisi habis — ajukan request baru ya.", livesLeft=0)
    r["revisionRound"] = r.get("revisionRound", 0) + 1
    r.setdefault("revisionNotes", []).append({
        "id": str(uuid.uuid4()), "round": r["revisionRound"], "authorId": u["id"], "authorName": u["name"],
        "text": text, "link": body.get("link") or "", "resolved": False, "at": now_iso(),
    })
    set_status(r, u, S_REVISION, f"Minta revisi (ronde {r['revisionRound']})", text)
    await save_request(r)
    return full(r, await get_settings())


@app.post("/api/requests/{rid}/approve")
async def approve(rid: str, u: dict = Depends(current_user)):
    r = await load_request(rid)
    if not is_owner_side(u, r):
        err(403, "Hanya pengaju yang dapat menyetujui hasil.")
    if r["status"] != S_REVIEW:
        err(400, "Hasil hanya bisa disetujui saat status Review Requester.")
    r["approvedAt"] = now_iso()
    set_status(r, u, S_APPROVED, "Hasil disetujui pengaju")
    await save_request(r)
    out = full(r, await get_settings())
    out["celebrate"] = "sekali-jadi" if r.get("revisionRound", 0) == 0 else "disetujui"
    return out


@app.post("/api/requests/{rid}/finish")
async def finish(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    r = await load_request(rid)
    st = await get_settings()
    require_maker(u, r)
    if r["status"] != S_APPROVED:
        err(400, "Serah terima hanya setelah hasil disetujui pengaju.")
    outs = body.get("outputs") or []
    cur = r.get("outputs") or []
    if len(outs) != len(cur):
        err(400, "Jumlah output tidak sama dengan brief.")
    miss = []
    if not (body.get("driveFolderLink") or "").strip():
        miss.append("Tautan folder Drive")
    if not (body.get("thumbnailUrl") or "").strip():
        miss.append("Thumbnail untuk galeri")
    warnings = []
    for i, o in enumerate(outs):
        if not (o.get("fileLink") or "").strip() or not (o.get("fileName") or "").strip():
            miss.append(f"Output {i + 1} ({cur[i].get('name')}): tautan file dan nama file")
        elif not NAME_RE.match(o["fileName"].strip()):
            warnings.append(f"Nama file \"{o['fileName']}\" tidak mengikuti pola {st.get('namingPattern')}.")
    if miss:
        err(400, "Serah terima belum lengkap.", missing=miss)
    for i, o in enumerate(outs):
        cur[i].update({"fileLink": o["fileLink"].strip(), "fileName": o["fileName"].strip(), "done": True})
    r.update({
        "outputs": cur, "driveFolderLink": body["driveFolderLink"].strip(), "thumbnailUrl": body["thumbnailUrl"].strip(),
        "showInGallery": bool(body.get("showInGallery", True)), "finishedAt": now_iso(),
    })
    set_status(r, u, S_DONE, "Diserahkan ke pengaju")
    await save_request(r)
    out = full(r, st)
    out["warnings"] = warnings
    return out


@app.post("/api/requests/{rid}/cancel")
async def cancel(rid: str, body: Dict[str, Any] = Body(default={}), u: dict = Depends(current_user)):
    r = await load_request(rid)
    if r["status"] in CLOSED:
        err(400, "Request ini sudah ditutup.")
    lead = u["role"] in LEAD_ROLES
    if not lead:
        if not is_owner_side(u, r):
            err(403, "Hanya pengaju atau Creative Lead yang dapat membatalkan.")
        if r["status"] not in (S_DRAFT, S_URGENT, S_SUBMITTED, S_INCOMPLETE, S_QUEUE):
            err(400, "Request sudah dikerjakan. Hubungi Creative Lead untuk membatalkan.")
    set_status(r, u, S_CANCELLED, "Dibatalkan", body.get("note", ""))
    await save_request(r)
    return full(r, await get_settings())


@app.delete("/api/requests/{rid}")
async def delete_draft(rid: str, u: dict = Depends(current_user)):
    r = await load_request(rid)
    if r["status"] != S_DRAFT or r["requesterId"] != u["id"]:
        err(400, "Hanya draft milik sendiri yang bisa dihapus.")
    await db.requests.delete_one({"id": rid})
    return {"ok": True}


@app.post("/api/requests/{rid}/react")
async def react(rid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    emoji = body.get("emoji")
    if emoji not in ("👏", "🔥", "😍", "💡"):
        err(400, "Reaksi tidak dikenal.")
    r = await load_request(rid)
    if r["status"] != S_DONE or not r.get("showInGallery"):
        err(400, "Reaksi hanya untuk karya di galeri.")
    lst = r.setdefault("reactions", {}).setdefault(emoji, [])
    if u["id"] in lst:
        lst.remove(u["id"])
    else:
        lst.append(u["id"])
    await db.requests.update_one({"id": rid}, {"$set": {"reactions": r["reactions"]}})
    return {"reactions": r["reactions"]}


# ---------------------------------------------------------------- queue, gallery, dashboard
@app.get("/api/queue")
async def queue():
    """Publik: ringkasan antrean untuk semua divisi dan mode Lihat saja."""
    st = await get_settings()
    cards = []
    async for r in db.requests.find({"status": {"$nin": [S_DRAFT, S_CANCELLED, S_REJECTED]}}):
        clean(r)
        if r["status"] == S_DONE and r.get("finishedAt"):
            fin = datetime.fromisoformat(r["finishedAt"])
            if datetime.now(timezone.utc) - fin > timedelta(days=14):
                continue
        cards.append(summary(r, st))
    counts = {s: 0 for s in [S_URGENT] + PIPELINE}
    for c in cards:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    active = [c for c in cards if c["status"] not in (S_DONE, S_APPROVED)]
    return {
        "cards": sorted(cards, key=lambda c: (c.get("deadlineFinal") or c.get("neededDate") or "9999", c["createdAt"])),
        "counts": counts,
        "overdue": sum(1 for c in active if c["overdue"]),
        "atRisk": sum(1 for c in active if c["atRisk"]),
        "active": len(active),
        "statuses": [S_URGENT] + PIPELINE,
        "today": today_wib().isoformat(),
    }


@app.get("/api/gallery")
async def gallery():
    out = []
    async for r in db.requests.find({"status": S_DONE, "showInGallery": True}):
        out.append({
            "id": r["id"], "code": r["code"], "title": r["title"], "division": r["division"], "type": r["type"],
            "designerName": r.get("designerName"), "requesterName": r.get("requesterName"),
            "thumbnailUrl": r.get("thumbnailUrl"), "finishedAt": r.get("finishedAt"),
            "reactions": r.get("reactions") or {}, "isPick": bool(r.get("isPick")),
            "revisionRound": r.get("revisionRound", 0),
        })
    return sorted(out, key=lambda x: (x["isPick"], x["finishedAt"] or ""), reverse=True)


@app.post("/api/gallery/{rid}/pick")
async def pick(rid: str, u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES, "Karya Pilihan ditentukan Creative Lead.")
    r = await load_request(rid)
    new = not r.get("isPick")
    if new:
        await db.requests.update_many({"isPick": True}, {"$set": {"isPick": False}})
    await db.requests.update_one({"id": rid}, {"$set": {"isPick": new}})
    return {"isPick": new}


def pct(a: int, b: int) -> Optional[float]:
    return round(a * 100 / b, 1) if b else None


@app.get("/api/dashboard")
async def dashboard(frm: Optional[str] = None, to: Optional[str] = None, division: Optional[str] = None,
                    u: dict = Depends(current_user)):
    st = await get_settings()
    t = today_wib()
    d_from = parse_date(frm) if frm else t.replace(day=1)
    d_to = parse_date(to) if to else t
    rows = []
    async for r in db.requests.find({"status": {"$ne": S_DRAFT}}):
        clean(r)
        sub = r.get("submittedAt") or r["createdAt"]
        d = datetime.fromisoformat(sub).astimezone(WIB).date()
        if d_from <= d <= d_to and (not division or r["division"] == division):
            r["_d"] = d
            rows.append(r)

    def stats(items: List[dict]) -> dict:
        total = len(items)
        done = [r for r in items if r["status"] == S_DONE]
        on_time = [r for r in done if r.get("finishedAt") and r.get("deadlineFinal")
                   and datetime.fromisoformat(r["finishedAt"]).astimezone(WIB).date() <= date.fromisoformat(r["deadlineFinal"])]
        days = []
        for r in done:
            if r.get("acceptedAt") and r.get("finishedAt"):
                a = datetime.fromisoformat(r["acceptedAt"]).astimezone(WIB).date()
                f = datetime.fromisoformat(r["finishedAt"]).astimezone(WIB).date()
                days.append(workdays_between(a, f, st))
        reviewed = [r for r in items if r["status"] in (S_APPROVED, S_DONE)]
        return {
            "total": total, "selesai": len(done), "onTimePct": pct(len(on_time), len(done)),
            "avgDays": round(sum(days) / len(days), 1) if days else None,
            "avgRevisi": round(sum(r.get("revisionRound", 0) for r in reviewed) / len(reviewed), 2) if reviewed else None,
            "urgentPct": pct(sum(1 for r in items if r.get("isUrgent")), total),
            "returnedPct": pct(sum(1 for r in items if (r.get("briefCheck") or {}).get("returnedCount", 0) > 0), total),
            "avgHoursWithRequester": round(sum(r.get("minutesWithRequester", 0) for r in items) / 60 / total, 1) if total else None,
        }

    per_div = []
    for d in st["divisions"]:
        items = [r for r in rows if r["division"] == d["name"]]
        if items:
            per_div.append({"division": d["name"], "color": d["color"], "emoji": d["emoji"], **stats(items)})
    per_type = []
    for ty in st["types"]:
        n = sum(1 for r in rows if r["type"] == ty["name"])
        if n:
            per_type.append({"type": ty["name"], "total": n})
    per_designer = []
    async for x in db.users.find({"role": {"$in": ["Designer", "Creative Lead"]}, "active": True}):
        per_designer.append({
            "name": x["name"], "specialty": x.get("specialty"), "capacity": x.get("capacity", 5),
            "active": await designer_load(x["id"]),
            "selesai": sum(1 for r in rows if r.get("designerId") == x["id"] and r["status"] == S_DONE),
        })
    weeks: Dict[str, dict] = {}
    for r in rows:
        monday = r["_d"] - timedelta(days=r["_d"].weekday())
        w = weeks.setdefault(monday.isoformat(), {"week": monday.isoformat(), "masuk": 0, "selesai": 0, "urgent": 0})
        w["masuk"] += 1
        w["urgent"] += 1 if r.get("isUrgent") else 0
        w["selesai"] += 1 if r["status"] == S_DONE else 0
    overdue = [summary(r, st) for r in rows if flags(r, st)["overdue"]]
    return {
        "from": d_from.isoformat(), "to": d_to.isoformat(), "totals": stats(rows),
        "perDivision": sorted(per_div, key=lambda x: -x["total"]),
        "perType": sorted(per_type, key=lambda x: -x["total"]),
        "perDesigner": per_designer, "weekly": [weeks[k] for k in sorted(weeks)], "overdue": overdue,
    }


@app.get("/api/export/requests.csv")
async def export_csv(u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Kode", "Judul", "Divisi", "Pengaju", "Jenis", "Media", "Status", "Urgent", "Prioritas", "Desainer",
                "Tanggal dibutuhkan", "Deadline draft", "Ronde revisi", "Brief dikembalikan", "Diajukan", "Selesai"])
    async for r in db.requests.find({"status": {"$ne": S_DRAFT}}):
        w.writerow([r.get("code"), r.get("title"), r.get("division"), r.get("requesterName"), r.get("type"), r.get("media"),
                    r.get("status"), "Ya" if r.get("isUrgent") else "Tidak", r.get("priority") or "", r.get("designerName") or "",
                    r.get("neededDate"), r.get("deadlineDraft") or "", r.get("revisionRound", 0),
                    (r.get("briefCheck") or {}).get("returnedCount", 0), r.get("submittedAt") or "", r.get("finishedAt") or ""])
    data = "﻿" + buf.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=creative-requests.csv"})


# ---------------------------------------------------------------- brand kit
@app.get("/api/brand-kit")
async def brand_kit():
    out = [clean(x) async for x in db.brandkit.find({})]
    return sorted(out, key=lambda x: x.get("order", 0))


@app.post("/api/brand-kit")
async def brand_kit_add(body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES, "Brand Kit diubah oleh Creative Lead.")
    if not (body.get("title") or "").strip() or not body.get("category"):
        err(400, "Judul dan kategori wajib diisi.")
    it = {"id": str(uuid.uuid4()), "category": body["category"], "title": body["title"].strip(),
          "description": body.get("description", ""), "link": body.get("link", ""), "meta": body.get("meta") or {},
          "order": await db.brandkit.count_documents({})}
    await db.brandkit.insert_one(dict(it))
    return it


@app.put("/api/brand-kit/{iid}")
async def brand_kit_edit(iid: str, body: Dict[str, Any] = Body(...), u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES, "Brand Kit diubah oleh Creative Lead.")
    upd = {k: body[k] for k in ("category", "title", "description", "link", "meta", "order") if k in body}
    res = await db.brandkit.update_one({"id": iid}, {"$set": upd})
    if not res.matched_count:
        err(404, "Item tidak ditemukan.")
    return clean(await db.brandkit.find_one({"id": iid}))


@app.delete("/api/brand-kit/{iid}")
async def brand_kit_delete(iid: str, u: dict = Depends(current_user)):
    require_roles(u, LEAD_ROLES, "Brand Kit diubah oleh Creative Lead.")
    await db.brandkit.delete_one({"id": iid})
    return {"ok": True}


# ---------------------------------------------------------------- files
ALLOWED_IMG = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


@app.post("/api/files")
async def upload(file: UploadFile = File(...), u: dict = Depends(current_user)):
    ext = ALLOWED_IMG.get(file.content_type or "")
    if not ext:
        err(400, "Hanya gambar JPG, PNG, WEBP, atau GIF.")
    data = await file.read()
    if len(data) > 1_500_000:
        err(400, "Gambar terlalu besar (maks. 1,5 MB setelah kompres).")
    name = f"{uuid.uuid4().hex}.{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/api/files/{name}"}


@app.get("/api/files/{name}")
async def get_file(name: str):
    if not re.fullmatch(r"[a-f0-9]{32}\.(jpg|png|webp|gif)", name):
        err(404, "Berkas tidak ditemukan.")
    p = UPLOAD_DIR / name
    if not p.exists():
        err(404, "Berkas tidak ditemukan.")
    return FileResponse(p, headers={"Cache-Control": "public, max-age=31536000, immutable"})


# ---------------------------------------------------------------- demo data
@app.post("/api/seed-demo")
async def seed_demo(u: dict = Depends(current_user)):
    require_roles(u, {"Admin"})
    if await db.requests.count_documents({}) > 0:
        err(400, "Data contoh hanya bisa diisi saat belum ada request.")
    st = await get_settings()
    people = [
        ("Agoy", "Creative", "Creative Lead", "Semua", "🎯"), ("Dina", "Creative", "Designer", "Digital", "🖌️"),
        ("Raka", "Creative", "Designer", "Cetak", "🖨️"), ("Sinta", "Marketing", "Requester", "Semua", "📣"),
        ("Budi", "Operasional", "Manager Divisi", "Semua", "🛒"), ("Tari", "Operasional", "Requester", "Semua", "🧾"),
        ("Yoga", "HR & GA", "Requester", "Semua", "🧑‍🤝‍🧑"), ("Lia", "Finance", "Requester", "Semua", "💰"),
    ]
    ids = {}
    for name, div, role, spec, emoji in people:
        ex = None
        async for x in db.users.find({}):
            if x["name"].lower() == name.lower():
                ex = x
        if ex:
            ids[name] = ex["id"]
            continue
        uid = str(uuid.uuid4())
        ids[name] = uid
        color = next((d["color"] for d in st["divisions"] if d["name"] == div), "#D7191F")
        await db.users.insert_one({
            "id": uid, "name": name, "division": div, "jobTitle": role, "role": role, "specialty": spec, "capacity": 5,
            "email": "", "pinHash": hash_pin("123456"), "avatar": {"color": color, "emoji": emoji},
            "prefs": {}, "active": True, "createdAt": now_iso(), "failed": 0, "lockedUntil": 0, "demo": True,
        })
    t = today_wib()
    samples = [
        ("Flyer Promo B1G1 Gajian", "Tari", "Flyer / Poster / Voucher", "Cetak", S_SUBMITTED, None, 6, False, 0),
        ("Poster Lowongan Crew Outlet", "Yoga", "Flyer / Poster / Voucher", "Digital", S_INCOMPLETE, None, 5, False, 0),
        ("X-Banner Opening Kios Baru", "Tari", "Banner / X-Banner / Spanduk / POSM", "Cetak", S_QUEUE, "Raka", 7, False, 0),
        ("Carousel Menu Mozza Duo", "Sinta", "Konten Feed / Story / Carousel", "Digital", S_WORK, "Dina", 3, False, 0),
        ("Voucher Diskon 10K", "Sinta", "Flyer / Poster / Voucher", "Digital", S_WORK, "Dina", 1, True, 0),
        ("Price List Gerobak Desember", "Tari", "Menu / Price List", "Cetak", S_INTERNAL, "Raka", 4, False, 0),
        ("Template Surat Resmi", "Lia", "Dokumen internal / Template surat", "Digital", S_REVIEW, "Dina", 2, False, 1),
        ("Story Hari Guru", "Sinta", "Konten Feed / Story / Carousel", "Digital", S_REVISION, "Dina", 2, False, 2),
        ("Stiker Kemasan Frozen", "Tari", "Kemasan / Label / Stiker", "Cetak", S_APPROVED, "Raka", 9, False, 1),
        ("Banner Event Car Free Day", "Sinta", "Banner / X-Banner / Spanduk / POSM", "Cetak", S_DONE, "Raka", 1, False, 0),
    ]
    n = 0
    for title, who, typ, media, status, designer, days, urgent, rounds in samples:
        n += 1
        requester = clean(await db.users.find_one({"id": ids[who]}))
        needed = add_workdays(t, days, st)
        r = {
            "id": str(uuid.uuid4()), "code": f"CR-{datetime.now(WIB).strftime('%y%m')}-{n:03d}", "status": status,
            "title": title, "requesterId": requester["id"], "requesterName": requester["name"],
            "division": requester["division"], "type": typ, "media": media, "brand": "Cimol Bojot AA", "outlet": "",
            "neededDate": needed.isoformat(), "purpose": "Promo dan informasi ke pelanggan",
            "objective": "Memberitahukan audiens tentang " + title, "audience": "Pelanggan outlet dan pengikut media sosial",
            "references": ["https://drive.google.com/"], "copy": {"headline": title.upper(), "subHeadline": "Khusus minggu ini", "body": "", "terms": "S&K berlaku"},
            "copyFinal": True, "copyApprovedBy": "Budi", "copywriter": "", "assetLink": "", "useBrandAssets": True,
            "outputs": [{"name": "Utama", "size": "1080×1350", "unit": "px", "orientation": "Portrait", "fileFormat": "png", "fileLink": "", "fileName": "", "done": False}],
            "notes": "", "isUrgent": urgent, "urgentReason": "Promo mendadak dari mitra" if urgent else "",
            "revisionRound": rounds, "revisionNotes": [], "previewUrls": [], "reactions": {},
            "briefCheck": {"returnedCount": 1 if status == S_INCOMPLETE else 0, "missing": ["Copywriting final"] if status == S_INCOMPLETE else [], "note": "Teks S&K belum ada." if status == S_INCOMPLETE else ""},
            "minutesWithRequester": 0, "showInGallery": True, "isPick": False, "log": [], "stamps": {},
            "createdAt": now_iso(), "updatedAt": now_iso(), "submittedAt": now_iso(), "statusSince": now_iso(), "demo": True,
        }
        if designer:
            r.update({"designerId": ids[designer], "designerName": designer, "priority": "Urgent" if urgent else "Normal",
                      "acceptedAt": now_iso(), "deadlineFinal": needed.isoformat(), "deadlineDraft": t.isoformat()})
        if status == S_DONE:
            r.update({"finishedAt": now_iso(), "driveFolderLink": "https://drive.google.com/", "thumbnailUrl": "",
                      "acceptedAt": (datetime.now(timezone.utc) - timedelta(days=4)).isoformat()})
        r["log"].append({"at": now_iso(), "by": u["id"], "byName": u["name"], "action": "Data contoh dibuat", "from": None, "to": status, "note": ""})
        await db.requests.insert_one(r)
    return {"ok": True, "users": len(people), "requests": len(samples), "pin": "123456"}


# ---------------------------------------------------------------- frontend (React build)
if DIST.exists():
    @app.get("/{path:path}")
    async def spa(path: str):
        if path.startswith("api/"):
            err(404, "Endpoint tidak ditemukan.")
        f = (DIST / path).resolve()
        if path and f.is_file() and str(f).startswith(str(DIST.resolve())):
            cache = "public, max-age=31536000, immutable" if "/assets/" in str(f) else "no-cache"
            return FileResponse(f, headers={"Cache-Control": cache})
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
