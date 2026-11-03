const SUPABASE_URL = "https://vwvesygsudhbaqmayhsz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IcydrqH9qr8WqVpVdfPwoA_sWz1ehMw";

async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Faça login para utilizar o assistente.");
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization }
  });
  if (!response.ok) throw new Error("Sessão inválida ou expirada. Entre novamente.");
  return response.json();
}

const FIELD_KEYS = ["objective", "observations", "activities", "results", "conclusion"];
const SYSTEM_PROMPT = [
  "Você é um assistente de redação técnica da IRMEN, representante SANY no Brasil.",
  "Organize o relato em português técnico brasileiro para um relatório de campo, inspeção, manutenção ou diagnóstico.",
  "Responda somente JSON válido com as chaves objective, observations, activities, results e conclusion, todas strings.",
  "Use exclusivamente os fatos fornecidos nos campos e no relato do profissional.",
  "NUNCA invente medições, pressões, temperaturas, códigos de falha, peças, testes, procedimentos executados, resultados ou causas.",
  "Não transforme suspeita em diagnóstico confirmado. Preserve expressões de possibilidade e incerteza.",
  "Não complete lacunas com conhecimento genérico como se a atividade tivesse sido realizada. Se não houver informação, deixe o campo vazio.",
  "Melhore clareza, ortografia, organização e linguagem profissional sem alterar o sentido técnico."
].join(" ");

function buildUserPrompt(report) {
  return "Identificação: " + JSON.stringify({
    tipo: report.type, cliente: report.client, equipamento: report.equipment,
    responsável: report.responsible, filial: report.branch, local: report.location, data: report.date
  }) + "\nCampos atuais: " + JSON.stringify(report.fields || {}) +
    "\nRelato livre: " + String(report.notes || "");
}

async function generateWithGemini(report, apiKey) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(report) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Falha na geração com Gemini.");
  const content = result.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "{}";
  return JSON.parse(content);
}

async function transcribeWithGemini(audio, mime, apiKey) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: mime, data: audio.toString("base64") } },
        { text: "Transcreva fielmente este áudio em português brasileiro. Retorne somente o texto falado, sem resumir, corrigir ou acrescentar informações." }
      ] }],
      generationConfig: { temperature: 0.1 }
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Não foi possível transcrever o áudio com Gemini.");
  return result.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
}

function normalizeFields(fields) {
  const normalized = {};
  for (const key of FIELD_KEYS) normalized[key] = typeof fields?.[key] === "string" ? fields[key] : "";
  return normalized;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  try {
    await authenticate(req);
    const body = req.body || {};
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

    if (body.action === "transcribe") {
      const encoded = String(body.audioBase64 || "");
      if (!encoded || encoded.length > 3.6 * 1024 * 1024) return res.status(400).json({ error: "Áudio vazio ou acima do limite de 2,5 MB." });
      const mime = String(body.mimeType || "audio/webm").split(";")[0].toLowerCase();
      const supported = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];
      if (!supported.includes(mime)) return res.status(400).json({ error: "Formato não suportado. Grave em WebM, MP4, MP3, WAV ou OGG." });
      const audio = Buffer.from(encoded, "base64");
      if (!audio.length || audio.length > 2.5 * 1024 * 1024) return res.status(400).json({ error: "Áudio vazio ou acima do limite de 2,5 MB." });
      if (!geminiKey) return res.status(503).json({ error: "GEMINI_API_KEY não está configurada na Vercel para este ambiente." });
      const text = await transcribeWithGemini(audio, mime, geminiKey);
      return res.status(200).json({ text, provider: "Gemini" });
    }

    if (body.action !== "generate") return res.status(400).json({ error: "Ação não reconhecida." });
    const report = body.report || {};
    if (!geminiKey) return res.status(503).json({ error: "GEMINI_API_KEY não está configurada na Vercel para este ambiente." });
    const fields = await generateWithGemini(report, geminiKey);
    return res.status(200).json({ fields: normalizeFields(fields), provider: "Gemini" });
  } catch (error) {
    console.error("report-assistant:", error);
    return res.status(400).json({ error: error.message || "Falha ao processar a solicitação." });
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
