// Nama Sheet Database
const SHEET_NAME = "Data_SPK";
const SHEET_USERS = "Data_Users";
const SHEET_SETTINGS = "App_Settings";

// [BARU] Jika script Anda terpisah dari file Spreadsheet, masukkan ID Spreadsheet di sini.
// Biarkan kosong "" jika script ini sudah Anda buat langsung dari dalam file Spreadsheet (Extensions > Apps Script).
const SPREADSHEET_ID = ""; 

// =========================================================
// TAHAP 4 - SESSION + SERVER-SIDE AUTHORIZATION
// =========================================================
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_VERSION = "v1";

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Memastikan Sheet dan Header Tabel SPK Tersedia
function getOrCreateSheet() {
  let ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) throw new Error("Tidak dapat menemukan Spreadsheet. Periksa ID atau gunakan script yang terhubung langsung.");

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      "No SPK", "Tanggal", "Salesman", "Nama Pemesan", "Alamat Pemesan",
      "No Telp", "No HP", "Email", "Kode Unit", "Merek Unit",
      "Tipe Unit", "No Rangka", "No Mesin", "Spec Fisik", "Status Bayar",
      "Harga Jual", "Kesepakatan Bayar", "Kesepakatan Bengkel", "No Polisi", "Dibuat Oleh"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Memastikan Sheet User tersedia. User lama tetap dipertahankan.
function getOrCreateUsersSheet() {
  let ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) throw new Error("Tidak dapat menemukan Spreadsheet.");

  let sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_USERS);
    const headers = ["Nama User", "Password", "Role", "PasswordHash", "Salt"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    // User default hanya dibuat saat sheet belum ada.
    sheet.appendRow(["admin", "admin123", "admin", "", ""]);
    sheet.appendRow(["user", "user123", "user", "", ""]);
  }
  return sheet;
}

function createSession(username, role) {
  const token = Utilities.getUuid();
  const session = {
    username: String(username),
    role: String(role || 'user').toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  PropertiesService.getScriptProperties().setProperty('SESSION_' + token, JSON.stringify(session));
  return token;
}

function getSession(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_' + token);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.expiresAt || Date.now() > Number(session.expiresAt)) {
      PropertiesService.getScriptProperties().deleteProperty('SESSION_' + token);
      return null;
    }
    return session;
  } catch (err) {
    return null;
  }
}

function requireSession(token) {
  const session = getSession(token);
  if (!session) throw new Error('Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
  return session;
}

function requireRole(token, roles) {
  const session = requireSession(token);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (allowed.indexOf(session.role) === -1) throw new Error('Akses ditolak untuk role ' + session.role + '.');
  return session;
}

function logoutSession(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('SESSION_' + token);
  return { status: 'success', message: 'Logout berhasil' };
}

function generateNextNoSPK() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const yyyy = Utilities.formatDate(now, tz, 'yyyy');
  const mm = Utilities.formatDate(now, tz, 'MM');
  const prefix = 'PSN-MNL/' + yyyy + mm + '/';

  let maxUrut = 0;
  for (let i = 1; i < data.length; i++) {
    const no = String(data[i][0] || '').trim();
    if (!no.startsWith(prefix)) continue;
    const n = parseInt(no.substring(prefix.length), 10);
    if (!isNaN(n) && n > maxUrut) maxUrut = n;
  }
  return prefix + String(maxUrut + 1).padStart(4, '0');
}

function bytesToBase64(bytes) { return Utilities.base64Encode(bytes); }

function hashPassword(password, salt) {
  const raw = String(salt) + ':' + String(password);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytesToBase64(digest);
}

function ensureUserPasswordColumns(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 5);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (String(headers[3] || '').trim() !== 'PasswordHash') sheet.getRange(1, 4).setValue('PasswordHash');
  if (String(headers[4] || '').trim() !== 'Salt') sheet.getRange(1, 5).setValue('Salt');
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
}

function migrateLegacyPassword(sheet, rowNumber, plaintextPassword) {
  const salt = Utilities.getUuid();
  const hash = hashPassword(plaintextPassword, salt);
  sheet.getRange(rowNumber, 4, 1, 2).setValues([[PASSWORD_HASH_VERSION + ':' + hash, salt]]);
  sheet.getRange(rowNumber, 2).clearContent();
}

function loginUser(username, password) {
  try {
    if (!username || !password) return { status: 'error', message: 'Username dan password wajib diisi' };
    const sheet = getOrCreateUsersSheet();
    ensureUserPasswordColumns(sheet);
    const data = sheet.getDataRange().getValues();
    const inputUser = String(username).trim();
    const inputPassword = String(password);
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[0]).trim() !== inputUser) continue;
      const storedHash = String(row[3] || '').trim();
      const storedSalt = String(row[4] || '').trim();
      let valid = false;
      if (storedHash && storedSalt) {
        valid = storedHash === PASSWORD_HASH_VERSION + ':' + hashPassword(inputPassword, storedSalt);
      } else {
        valid = String(row[1] || '') === inputPassword;
        if (valid) migrateLegacyPassword(sheet, i + 1, inputPassword);
      }
      if (valid) {
        const role = String(row[2]).trim().toLowerCase();
        const nama = String(row[0]).trim();
        const token = createSession(nama, role);
        return { status: 'success', role: role, nama: nama, token: token, expiresAt: Date.now() + SESSION_TTL_MS };
      }
      break;
    }
    return { status: 'error', message: 'Username atau password salah' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getOrCreateSettingsSheet() {
  let ss = (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') ? SpreadsheetApp.openById(SPREADSHEET_ID.trim()) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Tidak dapat menemukan Spreadsheet.');
  let sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SETTINGS);
    sheet.appendRow(['Key', 'Value', 'Updated At', 'Updated By']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 3, 2).setValues([['nama', 'PT DEALER MOBIL AUTO'], ['alamat', 'Jl. Jenderal Sudirman No. 99, Jakarta'], ['logo', '']]);
  }
  return sheet;
}

function getAppSettings() {
  const sheet = getOrCreateSettingsSheet();
  const rows = sheet.getDataRange().getValues();
  const result = { nama: 'PT DEALER MOBIL AUTO', alamat: 'Jl. Jenderal Sudirman No. 99, Jakarta', logo: '' };
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    if (key && Object.prototype.hasOwnProperty.call(result, key)) result[key] = String(rows[i][1] || '');
  }
  return { status: 'success', data: result };
}

function saveAppSettings(settings, username) {
  if (!settings || typeof settings !== 'object') return { status: 'error', message: 'Pengaturan tidak valid' };
  const current = getAppSettings().data;
  const next = { nama: String(settings.nama != null ? settings.nama : current.nama).trim() || 'PT DEALER MOBIL AUTO', alamat: String(settings.alamat != null ? settings.alamat : current.alamat).trim(), logo: String(settings.logo != null ? settings.logo : current.logo).trim() };
  const sheet = getOrCreateSettingsSheet();
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  Object.keys(next).forEach(key => {
    let rowNumber = -1;
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]).trim() === key) { rowNumber = i + 1; break; }
    if (rowNumber < 0) sheet.appendRow([key, next[key], now, username || '']);
    else sheet.getRange(rowNumber, 2, 1, 3).setValues([[next[key], now, username || '']]);
  });
  return { status: 'success', message: 'Pengaturan berhasil disimpan', data: next };
}

// Menyimpan atau Meng-update Data SPK
function saveDataSPK(trx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!trx) return { status: "error", message: "Data SPK tidak valid" };
    if (!trx.salesman || String(trx.salesman).trim() === "") return { status: "error", message: "Nama Salesman wajib diisi" };
    if (!trx.customer || !trx.customer.nama || String(trx.customer.nama).trim() === "") return { status: "error", message: "Nama Pemesan wajib diisi" };
    if (!trx.customer || !trx.customer.alamat || String(trx.customer.alamat).trim() === "") return { status: "error", message: "Alamat Pemesan wajib diisi" };
    if (!trx.unit || !trx.unit.kode || String(trx.unit.kode).trim() === "") return { status: "error", message: "Kode Unit wajib diisi" };
    if (!trx.unit || !trx.unit.merk || String(trx.unit.merk).trim() === "") return { status: "error", message: "Merek Unit wajib diisi" };
    if (!trx.unit || !trx.unit.tipe || String(trx.unit.tipe).trim() === "") return { status: "error", message: "Tipe Unit wajib diisi" };
    if (!trx.unit || trx.unit.harga === undefined || trx.unit.harga === null || String(trx.unit.harga).trim() === "") return { status: "error", message: "Harga Jual wajib diisi" };

    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    let noSpk = String(trx.noSpk || '').trim();
    let rowIndex = -1;

    // Existing SPK = update. New SPK = ignore browser preview and generate atomically on server.
    if (noSpk) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === noSpk) {
          rowIndex = i + 1;
          break;
        }
      }
    }
    if (rowIndex < 0) noSpk = generateNextNoSPK();

    const rowValues = [
      noSpk,
      trx.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'),
      trx.salesman || "",
      (trx.customer && trx.customer.nama) || "",
      (trx.customer && trx.customer.alamat) || "",
      (trx.customer && trx.customer.telp) || "",
      (trx.customer && trx.customer.hp) || "",
      (trx.customer && trx.customer.email) || "",
      (trx.unit && trx.unit.kode) || "",
      (trx.unit && trx.unit.merk) || "",
      (trx.unit && trx.unit.tipe) || "",
      (trx.unit && trx.unit.rangka) || "",
      (trx.unit && trx.unit.mesin) || "",
      (trx.unit && trx.unit.fisik) || "",
      (trx.unit && trx.unit.status) || "Tunai",
      (trx.unit && trx.unit.harga) || 0,
      trx.kesepakatanBayar || "",
      trx.kesepakatanBengkel || "",
      (trx.unit && trx.unit.polisi) || "",
      trx.dibuatOleh || ""
    ];

    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    else sheet.appendRow(rowValues);

    return { status: "success", message: "Data tersimpan di Database", noSpk: noSpk, id: noSpk };
  } catch (err) {
    return { status: "error", message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// Membaca Seluruh Data SPK dari Google Sheets
function getDataSPK() {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const result = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      result.push({
        id: String(row[0]),
        noSpk: String(row[0]),
        tanggal: String(row[1] || ''),
        salesman: String(row[2] || ''),
        nama1: String(row[19] || ''),
        customer: {
          nama: String(row[3] || ''),
          alamat: String(row[4] || ''),
          telp: String(row[5] || ''),
          hp: String(row[6] || ''),
          email: String(row[7] || '')
        },
        unit: {
          kode: String(row[8] || ''),
          merk: String(row[9] || ''),
          tipe: String(row[10] || ''),
          rangka: String(row[11] || ''),
          mesin: String(row[12] || ''),
          fisik: String(row[13] || ''),
          status: String(row[14] || 'Tunai'),
          harga: Number(row[15]) || 0,
          polisi: String(row[18] || '')
        },
        kesepakatanBayar: String(row[16] || ''),
        kesepakatanBengkel: String(row[17] || ''),
        dibuatOleh: String(row[19] || '')
      });
    }
    return result;
  } catch(err) {
    throw new Error('Gagal membaca data SPK: ' + err.message);
  }
}

// Menghapus Data SPK berdasarkan Nomor SPK
function deleteDataSPK(noSpk) {
  try {
    if (!noSpk) return { status: "error", message: "No SPK kosong" };

    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(noSpk).trim()) {
        sheet.deleteRow(i + 1);
        return { status: "success", message: "Data SPK berhasil dihapus dari Database" };
      }
    }
    return { status: "not_found", message: "SPK tidak ditemukan di Sheet" };
  } catch(err) {
    return { status: "error", message: err.toString() };
  }
}

// Web App Endpoints untuk permintaan HTTP GET
function doGet(e) {
  return jsonResponse({ status: 'success', message: 'SPK API aktif' });
}

// Web App Endpoints untuk permintaan HTTP POST
function doPost(e) {
  try {
    let contents = {};
    if (e && e.postData && e.postData.contents) contents = JSON.parse(e.postData.contents);
    else if (e) contents = e.parameter || {};

    const action = contents.action || '';
    const payload = contents.data || {};
    let result;

    if (action === 'login') {
      result = loginUser(payload.username || contents.username, payload.password || contents.password);
    } else if (action === 'logout') {
      result = logoutSession(payload.token || contents.token);
    } else if (action === 'get') {
      requireSession(payload.token || contents.token);
      result = { status: 'success', data: getDataSPK() };
    } else if (action === 'save') {
      const token = payload.token || contents.token;
      const session = requireRole(token, ['admin', 'user']);
      const trx = Object.assign({}, payload);
      delete trx.token;
      trx.dibuatOleh = session.username;
      result = saveDataSPK(trx);
    } else if (action === 'settings_get') {
      requireSession(payload.token || contents.token);
      result = getAppSettings();
    } else if (action === 'settings_save') {
      const session = requireRole(payload.token || contents.token, ['admin']);
      result = saveAppSettings(payload.settings || {}, session.username);
    } else if (action === 'delete') {
      requireRole(payload.token || contents.token, ['admin']);
      result = deleteDataSPK(payload.noSpk || contents.noSpk);
    } else {
      result = { status: 'error', message: 'Action API tidak dikenali: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message || String(err) });
  }
}
