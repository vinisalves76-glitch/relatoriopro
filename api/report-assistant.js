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

async function generateWithOpenAI(report, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini", temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: buildUserPrompt(report) }]
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Falha na geração com GPT.");
  return JSON.parse(result.choices?.[0]?.message?.content || "{}");
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

async function transcribeWithOpenAI(audio, mime, apiKey) {
  const extensions = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), "relato." + extensions[mime]);
  form.append("model", "gpt-transcribe");
  form.append("language", "pt");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: form
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Não foi possível transcrever o áudio com GPT.");
  return result.text || "";
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
    const openAIKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

    if (body.action === "transcribe") {
      const encoded = String(body.audioBase64 || "");
      if (!encoded || encoded.length > 3.6 * 1024 * 1024) return res.status(400).json({ error: "Áudio vazio ou acima do limite de 2,5 MB." });
      const mime = String(body.mimeType || "audio/webm").split(";")[0].toLowerCase();
      const supported = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"];
      if (!supported.includes(mime)) return res.status(400).json({ error: "Formato não suportado. Grave em WebM, MP4, MP3, WAV ou OGG." });
      const audio = Buffer.from(encoded, "base64");
      if (!audio.length || audio.length > 2.5 * 1024 * 1024) return res.status(400).json({ error: "Áudio vazio ou acima do limite de 2,5 MB." });
      if (geminiKey) {
        try { return res.status(200).json({ text: await transcribeWithGemini(audio, mime, geminiKey), provider: "Gemini" }); }
        catch (error) { if (!openAIKey) throw error; console.warn("Gemini transcription failed; trying OpenAI:", error.message); }
      }
      if (openAIKey) return res.status(200).json({ text: await transcribeWithOpenAI(audio, mime, openAIKey), provider: "GPT" });
      return res.status(503).json({ error: "Configure GEMINI_API_KEY ou OPENAI_API_KEY nas variáveis de ambiente da Vercel." });
    }

    if (body.action !== "generate") return res.status(400).json({ error: "Ação não reconhecida." });
    const report = body.report || {};
    let fields, provider;
    if (geminiKey) {
      try { fields = await generateWithGemini(report, geminiKey); provider = "Gemini"; }
      catch (error) { if (!openAIKey) throw error; console.warn("Gemini generation failed; trying OpenAI:", error.message); }
    }
    if (!fields && openAIKey) { fields = await generateWithOpenAI(report, openAIKey); provider = "GPT"; }
    if (!fields) return res.status(503).json({ error: "Configure GEMINI_API_KEY ou OPENAI_API_KEY nas variáveis de ambiente da Vercel." });
    return res.status(200).json({ fields: normalizeFields(fields), provider });
  } catch (error) {
    console.error("report-assistant:", error);
    return res.status(400).json({ error: error.message || "Falha ao processar a solicitação." });
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
