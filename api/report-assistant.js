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

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.7-flash";

function isTemporaryGeminiError(status, message) {
  if ([500, 502, 503, 504].includes(status)) return true;
  return status === 429 && /rate.?limit|too many requests|temporar|overload/i.test(message || "");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestGemini(payload, apiKey) {
  const delays = [800, 1800, 3500];
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) return result;
      const message = result.error?.message || "Falha na solicitação ao Gemini.";
      const error = new Error(message);
      error.status = response.status;
      error.temporary = isTemporaryGeminiError(response.status, message);
      throw error;
    } catch (error) {
      lastError = error;
      if (!error.temporary || attempt === delays.length) break;
      await wait(delays[attempt]);
    }
  }
  throw lastError;
}

async function runWithModelFallback(payload, apiKey) {
  try {
    const result = await requestGemini({ ...payload, model: PRIMARY_MODEL }, apiKey);
    return { result, model: PRIMARY_MODEL };
  } catch (primaryError) {
    if (!primaryError.temporary) throw primaryError;
    console.warn("Gemini 3.8 Flash temporariamente indisponível; tentando modelo de contingência.");
    try {
      const result = await requestGemini({ ...payload, model: FALLBACK_MODEL }, apiKey);
      return { result, model: FALLBACK_MODEL };
    } catch (fallbackError) {
      const error = new Error("O Gemini 3.8 Flash está temporariamente sobrecarregado e o modelo de contingência também não respondeu. Aguarde alguns instantes e tente novamente. Detalhe: " + (fallbackError.message || primaryError.message));
      error.status = fallbackError.status || primaryError.status || 503;
      throw error;
    }
  }
}

function extractModelText(result) {
  return (result.steps || [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text || "")
    .join("");
}

async function generateWithGemini(report, apiKey) {
  const schema = {
    type: "object",
    properties: {
      objective: { type: "string" },
      observations: { type: "string" },
      activities: { type: "string" },
      results: { type: "string" },
      conclusion: { type: "string" }
    },
    required: ["objective", "observations", "activities", "results", "conclusion"]
  };
  const { result, model } = await runWithModelFallback({
    store: false,
    system_instruction: SYSTEM_PROMPT,
    input: buildUserPrompt(report),
    response_format: { type: "text", mime_type: "application/json", schema }
  }, apiKey);
  const content = extractModelText(result);
  if (!content) throw new Error("Gemini não retornou conteúdo para o relatório.");
  return { fields: JSON.parse(content), model };
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

    if (body.action !== "generate") return res.status(400).json({ error: "Ação não reconhecida." });
    const report = body.report || {};
    if (!geminiKey) return res.status(503).json({ error: "GEMINI_API_KEY não está configurada na Vercel para este ambiente." });
    const generated = await generateWithGemini(report, geminiKey);
    return res.status(200).json({ fields: normalizeFields(generated.fields), provider: "Gemini", model: generated.model });
  } catch (error) {
    console.error("report-assistant:", error);
    return res.status(error.status === 429 || error.status >= 500 ? 503 : 400).json({ error: error.message || "Falha ao processar a solicitação." });
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
