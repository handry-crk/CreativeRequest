"""Uji aturan server. Jalankan server dulu (USE_MOCK_DB=true), lalu:
    python test_rules.py http://localhost:8000
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
ADMIN_PIN = sys.argv[2] if len(sys.argv) > 2 else "123456"
ok = fail = 0


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or "null")


def check(name, cond, info=""):
    global ok, fail
    if cond:
        ok += 1
        print("  OK  ", name)
    else:
        fail += 1
        print("  GAGAL", name, info)


def msg(res):
    return (res[1] or {}).get("detail", {}).get("message", "") if isinstance(res[1], dict) else ""


def reg(name, division):
    s, d = call("POST", "/api/auth/register", {"name": name, "division": division, "pin": "111111"})
    assert s == 200, d
    return d["token"], d["user"]["id"]


def workday_plus(n):
    d = date.today()
    while n > 0:
        d += timedelta(days=1)
        if d.isoweekday() != 7:
            n -= 1
    return d.isoformat()


BRIEF = {
    "title": "Promo B1G1", "type": "Flyer / Poster / Voucher", "media": "Digital", "neededDate": workday_plus(5),
    "purpose": "Promo flyer", "objective": "Memberitahukan audiens promo B1G1", "audience": "Pelanggan outlet",
    "references": ["https://contoh.id/ref"], "copy": {"headline": "BELI 1 GRATIS 1"}, "copyFinal": True,
    "copyApprovedBy": "Budi", "useBrandAssets": True,
    "outputs": [{"name": "Feed", "size": "1080x1350", "unit": "px", "fileFormat": "png"}],
}

names = call("GET", "/api/auth/names")[1]
admin_id = [n for n in names if n["name"] == "Admin"][0]["id"]
admin = call("POST", "/api/auth/login", {"userId": admin_id, "pin": ADMIN_PIN})[1]["token"]

tari, tari_id = reg("Tari T", "Operasional")
budi, budi_id = reg("Budi T", "Operasional")
lia, lia_id = reg("Lia T", "Finance")
agoy, agoy_id = reg("Agoy T", "Creative")
dina, dina_id = reg("Dina T", "Creative")
raka, raka_id = reg("Raka T", "Creative")
call("PUT", f"/api/users/{budi_id}", {"role": "Manager Divisi"}, admin)
call("PUT", f"/api/users/{agoy_id}", {"role": "Creative Lead"}, admin)
call("PUT", f"/api/users/{dina_id}", {"role": "Designer", "specialty": "Digital", "capacity": 1}, admin)
call("PUT", f"/api/users/{raka_id}", {"role": "Designer", "specialty": "Cetak"}, admin)

print("Pengajuan")
s, r = call("POST", "/api/requests", BRIEF, tari)
rid = r["id"]
s, r = call("POST", f"/api/requests/{rid}/submit", None, tari)
check("Flyer 5 hari kerja -> Diajukan", s == 200 and r["status"] == "Diajukan", r)
check("Kode CR-YYMM-001", r.get("code", "").endswith("-001"), r.get("code"))

s, r2 = call("POST", "/api/requests", {**BRIEF, "copyFinal": False, "references": [], "outputs": []}, tari)
res = call("POST", f"/api/requests/{r2['id']}/submit", None, tari)
check("Brief tidak lengkap ditolak dengan daftar", res[0] == 400 and len(res[1]["detail"]["missing"]) == 3, res)

print("Urgent")
s, u = call("POST", "/api/requests", {**BRIEF, "title": "Dadakan", "neededDate": workday_plus(1)}, tari)
uid = u["id"]
res = call("POST", f"/api/requests/{uid}/submit", None, tari)
check("Urgent tanpa alasan ditolak", res[0] == 400 and "dadakan" in msg(res).lower(), res)
call("PUT", f"/api/requests/{uid}", {"urgentReason": "Promo mitra mendadak"}, tari)
s, u = call("POST", f"/api/requests/{uid}/submit", None, tari)
check("Urgent -> Menunggu Persetujuan Urgent", u.get("status") == "Menunggu Persetujuan Urgent", u)
res = call("POST", f"/api/requests/{uid}/check-brief", {"decision": "terima", "priority": "Urgent", "designerId": raka_id}, agoy)
check("Cek brief sebelum persetujuan urgent ditolak", res[0] == 400, res)
res = call("POST", f"/api/requests/{uid}/approve-urgent", {}, lia)
check("Divisi lain tidak bisa menyetujui urgent", res[0] == 403, res)
s, u = call("POST", f"/api/requests/{uid}/approve-urgent", {}, budi)
check("Manager setuju, masih menunggu Lead", u.get("status") == "Menunggu Persetujuan Urgent", u)
s, u = call("POST", f"/api/requests/{uid}/approve-urgent", {}, agoy)
check("Lead setuju -> Diajukan", u.get("status") == "Diajukan" and u["isUrgent"], u)

print("Cek brief")
res = call("POST", f"/api/requests/{rid}/check-brief", {"decision": "kembalikan", "note": "kurang"}, agoy)
check("Kembalikan tanpa centang ditolak", res[0] == 400, res)
res = call("POST", f"/api/requests/{rid}/check-brief", {"decision": "terima", "priority": "Normal"}, tari)
check("Requester tidak bisa cek brief", res[0] == 403, res)
s, r = call("POST", f"/api/requests/{rid}/check-brief", {"decision": "kembalikan", "missing": ["Copywriting final"], "note": "S&K belum ada"}, agoy)
check("Kembalikan -> Perlu Dilengkapi", r.get("status") == "Perlu Dilengkapi" and not r.get("deadlineFinal"), r)
call("PUT", f"/api/requests/{rid}", {"copy": {"headline": "BELI 1 GRATIS 1", "terms": "S&K berlaku"}}, tari)
s, r = call("POST", f"/api/requests/{rid}/submit", None, tari)
check("Ajukan ulang -> Diajukan, kode tetap", r.get("status") == "Diajukan" and r["code"].endswith("-001"), r)
res = call("POST", f"/api/requests/{rid}/check-brief", {"decision": "terima", "priority": "Normal"}, agoy)
check("Terima tanpa desainer ditolak", res[0] == 400, res)
s, r = call("POST", f"/api/requests/{rid}/check-brief", {"decision": "terima", "priority": "Normal", "designerId": dina_id}, agoy)
check("Terima -> Antre dengan deadline", r.get("status") == "Antre" and r.get("deadlineDraft") and r.get("deadlineFinal") == BRIEF["neededDate"], r)
res = call("POST", f"/api/requests/{uid}/check-brief", {"decision": "terima", "priority": "Urgent", "designerId": dina_id}, agoy)
check("Desainer penuh -> peringatan 409", res[0] == 409 and res[1]["detail"].get("needsConfirm"), res)
s, u = call("POST", f"/api/requests/{uid}/check-brief", {"decision": "terima", "priority": "Urgent", "designerId": dina_id, "confirm": True}, agoy)
check("Dengan confirm tetap bisa", u.get("status") == "Antre", u)

print("Akses")
res = call("GET", f"/api/requests/{rid}", None, lia)
check("Finance tidak bisa buka brief Operasional", res[0] == 403, res)
q = call("GET", "/api/queue")[1]
check("Antrean publik menampilkan ringkasan", any(c["id"] == rid for c in q["cards"]) and "purpose" not in q["cards"][0], q["cards"][:1])
res = call("PUT", f"/api/requests/{rid}", {"purpose": "ubah"}, tari)
check("Brief terkunci setelah diterima", res[0] == 400, res)

print("Produksi")
res = call("POST", f"/api/requests/{rid}/move", {"to": "Selesai"}, dina)
check("Drag ke status tidak sah ditolak", res[0] == 400, res)
res = call("POST", f"/api/requests/{rid}/move", {"to": "Dikerjakan"}, raka)
check("Desainer lain tidak bisa memulai", res[0] == 403, res)
s, r = call("POST", f"/api/requests/{rid}/move", {"to": "Dikerjakan"}, dina)
check("Antre -> Dikerjakan lewat drag", r.get("status") == "Dikerjakan", r)
res = call("POST", f"/api/requests/{rid}/to-internal-review", {}, dina)
check("Kirim hasil tanpa pratinjau ditolak", res[0] == 400, res)
s, r = call("POST", f"/api/requests/{rid}/to-internal-review", {"previewUrl": "https://contoh.id/v1.png"}, dina)
check("-> Review Internal", r.get("status") == "Review Internal", r)
ITEMS = {i: True for i in call("GET", "/api/settings")[1]["internalReviewItems"]}
res = call("POST", f"/api/requests/{rid}/internal-review", {"items": ITEMS}, dina)
check("Reviewer = pembuat ditolak", res[0] == 400, res)
part = dict(ITEMS)
part[list(part)[0]] = False
res = call("POST", f"/api/requests/{rid}/internal-review", {"items": part}, agoy)
check("Checklist kurang 1 ditolak", res[0] == 400, res)
s, r = call("POST", f"/api/requests/{rid}/internal-review", {"items": ITEMS}, agoy)
check("-> Review Requester", r.get("status") == "Review Requester", r)

print("Revisi")
res = call("POST", f"/api/requests/{rid}/request-revision", {"text": ""}, tari)
check("Revisi tanpa catatan ditolak", res[0] == 400, res)
res = call("POST", f"/api/requests/{rid}/request-revision", {"text": "x"}, lia)
check("Divisi lain tidak bisa minta revisi", res[0] == 403, res)
for rnd in (1, 2):
    s, r = call("POST", f"/api/requests/{rid}/request-revision", {"text": f"Revisi {rnd}"}, tari)
    check(f"Revisi ronde {rnd}", r.get("status") == "Revisi" and r["revisionRound"] == rnd, r)
    call("POST", f"/api/requests/{rid}/to-internal-review", {"previewUrl": f"https://contoh.id/v{rnd + 1}.png"}, dina)
    call("POST", f"/api/requests/{rid}/internal-review", {"items": ITEMS}, agoy)
res = call("POST", f"/api/requests/{rid}/request-revision", {"text": "Revisi 3"}, tari)
check("Revisi ke-3 ditolak", res[0] == 400 and "Nyawa revisi habis" in msg(res), res)

print("Serah terima")
res = call("POST", f"/api/requests/{rid}/finish", {}, dina)
check("Selesai sebelum disetujui ditolak", res[0] == 400, res)
s, r = call("POST", f"/api/requests/{rid}/approve", None, tari)
check("Pengaju setuju -> Disetujui", r.get("status") == "Disetujui", r)
sugg = r["suggestedNames"][0]
check("Saran nama file DDMMYY_OPS_PromoB1G1_Final.png", sugg == date.today().strftime("%d%m%y") + "_OPS_PromoB1G1_Final.png", sugg)
res = call("POST", f"/api/requests/{rid}/finish", {"driveFolderLink": "https://drive", "thumbnailUrl": "/t.png", "outputs": [{"fileLink": "", "fileName": ""}]}, dina)
check("Output tanpa tautan ditolak", res[0] == 400, res)
res = call("POST", f"/api/requests/{rid}/finish", {"driveFolderLink": "https://drive", "outputs": [{"fileLink": "https://f", "fileName": sugg}]}, dina)
check("Tanpa thumbnail ditolak", res[0] == 400, res)
s, r = call("POST", f"/api/requests/{rid}/finish", {"driveFolderLink": "https://drive", "thumbnailUrl": "/t.png", "outputs": [{"fileLink": "https://f", "fileName": "asal.png"}]}, dina)
check("Selesai; nama tidak sesuai pola hanya peringatan", r.get("status") == "Selesai" and len(r["warnings"]) == 1, r)

print("Galeri & dashboard")
g = call("GET", "/api/gallery")[1]
check("Karya tampil di galeri", any(x["id"] == rid for x in g), g)
s, x = call("POST", f"/api/requests/{rid}/react", {"emoji": "🔥"}, lia)
check("Reaksi tercatat", s == 200 and lia_id in x["reactions"]["🔥"], x)
res = call("POST", f"/api/gallery/{rid}/pick", None, tari)
check("Karya Pilihan hanya oleh Lead", res[0] == 403, res)
s, d = call("GET", "/api/dashboard", None, agoy)
ops = [p for p in d["perDivision"] if p["division"] == "Operasional"][0]
check("Dashboard: 2 request Operasional, 50% urgent, 50% brief dikembalikan",
      ops["total"] == 2 and ops["urgentPct"] == 50.0 and ops["returnedPct"] == 50.0 and d["totals"]["onTimePct"] == 100.0, ops)

print("Login")
for i in range(4):
    call("POST", "/api/auth/login", {"userId": lia_id, "pin": "000000"})
res = call("POST", "/api/auth/login", {"userId": lia_id, "pin": "000000"})
check("5 PIN salah -> terkunci", res[0] == 423, res)
res = call("POST", "/api/auth/login", {"userId": lia_id, "pin": "111111"})
check("PIN benar tetap terkunci 15 menit", res[0] == 423, res)

print(f"\n{ok} lolos, {fail} gagal")
sys.exit(1 if fail else 0)
