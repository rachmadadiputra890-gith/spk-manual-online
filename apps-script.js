export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ status: "error", message: "Method Not Allowed" });
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (!appsScriptUrl) return res.status(500).json({ status: "error", message: "APPS_SCRIPT_URL belum dikonfigurasi di Vercel." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const response = await fetch(appsScriptUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { status: "error", message: "Response Apps Script bukan JSON yang valid.", raw: text }; }
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message || "Gagal meneruskan request ke Apps Script." });
  }
}
