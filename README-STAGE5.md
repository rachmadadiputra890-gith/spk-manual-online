# SPK Vercel - Tahap 5

Tahap 5 melanjutkan Stage 4 dengan hardening keamanan dan pemindahan pengaturan perusahaan ke backend.

## Isi
- Vercel: frontend HTML + serverless proxy `/api/apps-script`.
- Google Apps Script: backend/API + session + authorization + nomor SPK server-side.
- Google Spreadsheet: database transaksi, users, dan sheet `App_Settings`.
- Password: migrasi bertahap dari plaintext lama ke SHA-256 + salt. Saat user lama login pertama kali, password diverifikasi lalu plaintext dihapus dan hash disimpan.
- Settings: `nama`, `alamat`, `logo` sekarang disimpan di `App_Settings`, bukan localStorage.
- `getDataSPK()` tidak lagi menelan error menjadi array kosong.

## Update Apps Script
1. Buka Apps Script backend yang sama.
2. Ganti kode dengan `codegsbaru-stage5.gs`.
3. Pastikan `SPREADSHEET_ID` tetap kosong jika script terikat ke Spreadsheet, atau isi ID Spreadsheet jika standalone.
4. Deploy > Manage deployments > Edit Web App > New version > Deploy.
5. Pastikan akses Web App tetap sesuai kebutuhan aplikasi dan salin URL `/exec`.

Jangan hapus `Data_SPK` atau `Data_Users`. Kolom `PasswordHash` dan `Salt` akan dibuat otomatis.

## Default login lama
- admin / admin123
- user / user123

Pada login pertama setelah Stage 5, password plaintext akan dimigrasikan ke hash. Setelah itu kolom Password menjadi kosong.

## Vercel
Environment variable wajib:
`APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec`

Set minimal untuk Production. Jika ingin Preview juga bekerja, set untuk Preview.
Setelah mengubah environment variable, lakukan redeploy.

## Test checklist
- Login admin.
- Login user.
- Login pertama user lama dan cek `Data_Users`: Password kosong, PasswordHash dan Salt terisi.
- Load data SPK.
- Tambah SPK: nomor server-side.
- Edit SPK.
- User tidak bisa delete.
- Admin bisa delete.
- Admin bisa membaca dan menyimpan `App_Settings`.
- Refresh browser: settings tetap dari Spreadsheet.
- Logout lalu akses kembali: token lama tidak boleh digunakan.
