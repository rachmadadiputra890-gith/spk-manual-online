# SPK Vercel — Tahap 4

## Arsitektur
Vercel = frontend + proxy API. Google Apps Script = backend/API. Google Spreadsheet = database.

## Perubahan Tahap 4
- Login sekarang menghasilkan session token server-side.
- Session berlaku 8 jam dan disimpan di Script Properties.
- GET data, SAVE, dan DELETE harus memiliki session token.
- SAVE mengisi `Dibuat Oleh` dari session server, bukan mempercayai nilai dari browser.
- DELETE dibatasi untuk role `admin`.
- Nomor SPK baru dibuat di Apps Script menggunakan `LockService` agar tidak bentrok saat dua user menyimpan bersamaan.
- Nomor preview di browser tidak lagi menjadi sumber kebenaran untuk SPK baru; nomor final berasal dari server.
- Apps Script `doGet()` hanya menjadi health endpoint karena frontend sekarang berada di Vercel.

## Deploy Apps Script
1. Buka Apps Script yang terhubung ke Spreadsheet lama.
2. Ganti kode dengan `codegsbaru-stage4.gs`.
3. Pastikan `SPREADSHEET_ID` dikosongkan jika script terikat langsung ke Spreadsheet. Jika standalone, isi ID Spreadsheet lama.
4. Deploy sebagai Web App dan gunakan URL `/exec`.
5. Jika kode Apps Script berubah, buat deployment baru / update deployment agar versi terbaru aktif.

## Deploy Vercel
Set environment variable:
`APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec`

Lalu deploy folder ini ke Vercel.

## Akun awal
Jika `Data_Users` belum ada, Apps Script membuat:
- admin / admin123 / admin
- user / user123 / user

Segera ganti password default setelah login.

## Catatan penting
- Jangan hapus `Data_SPK` atau `Data_Users` lama.
- Password lama masih disimpan sesuai struktur aplikasi saat ini; hashing password dapat menjadi Tahap 5.
- Settings perusahaan masih localStorage di browser dan dapat dipindahkan ke server pada tahap berikutnya.
- Setelah deployment, lakukan uji login, load, create, edit, delete admin, dan delete user (harus ditolak).
