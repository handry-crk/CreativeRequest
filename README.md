# CRK Creative Request

Satu pintu permintaan desain untuk semua divisi. React + Tailwind + Framer Motion (frontend), FastAPI (backend), MongoDB.

## Jalankan lokal
```bash
# backend (tanpa MongoDB: data sementara di memori)
cd backend && pip install -r requirements.txt
USE_MOCK_DB=true uvicorn server:app --reload --port 8000

# frontend (terminal lain) -> http://localhost:5173
cd frontend && npm install && npm run dev
```
Masuk pertama: nama **Admin**, PIN `DEFAULT_ADMIN_PIN` (bawaan 123456). Pendaftaran baru harus disetujui Admin di Pengaturan -> Pengguna.
Data contoh: Pengaturan -> Data -> Isi data contoh.

Uji aturan server: `python backend/test_rules.py http://localhost:8000` (pada database kosong).

## Deploy Railway
1. Unggah folder ini ke repo GitHub baru.
2. Railway -> New Project -> Deploy from GitHub repo (Dockerfile terdeteksi otomatis, satu service).
3. + New -> Database -> MongoDB. Di service app isi variabel dari `.env.example`
   (`MONGO_URL` = `${{MongoDB.MONGO_URL}}`, `USE_MOCK_DB=false`).
4. Tambah Volume di `/data` (gambar unggahan).
5. Settings -> Networking -> Generate Domain, lalu Custom Domain.

## Domain Hostinger
hPanel -> Domains -> DNS Zone -> tambah CNAME `request` ke alamat yang diberi Railway.

## Setelah deploy
1. Masuk sebagai Admin, ganti PIN (Pengaturan -> Pengguna -> Reset PIN).
2. Minta Creative Lead, desainer, dan Manager mendaftar, lalu atur role mereka di Pengaturan -> Pengguna.
3. Cek angka SLA (Pengaturan -> Jenis & SLA) dan isi tautan di Brand Kit.

## Belum termasuk di putaran ini
Lencana & Papan Apresiasi, Timeline Divisi, Mode TV, email/WhatsApp, job terjadwal (auto-approve, backup),
WebSocket (papan memakai polling 8 detik), unggah maskot.
