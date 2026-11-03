const SUPABASE_URL = "https://vwvesygsudhbaqmayhsz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IcydrqH9qr8WqVpVdfPwoA_sWz1ehMw";

async function authenticate(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Faça login para utilizar o assistente.");
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: authorization },
    signal: AbortSignal.timeout(10000)
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
const OPENAI_MODEL = "gpt-4o-mini";

function isTemporaryGeminiError(status, message) {
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /temporar|overload|high demand|capacity|timeout|timed out|rate.?limit/i.test(message || "");
}

async function requestGemini(payload, apiKey, model) {
  let response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ ...payload, model }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (cause) {
    const error = new Error(cause?.name === "TimeoutError" || cause?.name === "AbortError"
      ? "Tempo limite excedido ao consultar o Gemini."
      : "Não foi possível conectar ao Gemini.");
    error.status = 503;
    error.temporary = true;
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || "Falha na solicitação ao Gemini.");
    error.status = response.status;
    error.temporary = isTemporaryGeminiError(response.status, error.message);
    throw error;
  }
  return result;
}

function extractGeminiText(result) {
  if (typeof result?.output_text === "string") return result.output_text;
  return (result?.steps || [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content || [])
    .filter(item => item.type === "text")
    .map(item => item.text || "")
    .join("");
}

function reportSchema() {
  return {
    type: "object",
    properties: {
      objective: { type: "string" },
      observations: { type: "string" },
      activities: { type: "string" },
      results: { type: "string" },
      conclusion: { type: "string" }
    },
    required: ["objective", "observations", "activities", "results", "conclusion"],
    additionalProperties: false
  };
}

function parseFields(text, provider) {
  if (!text) throw new Error(provider + " não retornou conteúdo para o relatório.");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw new Error(provider + " retornou uma resposta que não pôde ser interpretada."); }
  if (!parsed || typeof parsed !== "object" || FIELD_KEYS.some(key => typeof parsed[key] !== "string")) {
    throw new Error(provider + " retornou campos em formato inválido.");
  }
  return parsed;
}

async function generateWithGemini(report, apiKey) {
  if (!apiKey) throw new Error("Chave do Gemini não configurada.");
  const payload = {
    store: false,
    system_instruction: SYSTEM_PROMPT,
    input: buildUserPrompt(report),
    response_format: { type: "text", mime_type: "application/json", schema: reportSchema() }
  };
  let lastError;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const result = await requestGemini(payload, apiKey, model);
      return { fields: parseFields(extractGeminiText(result), "Gemini"), model, provider: "Gemini" };
    } catch (error) {
      lastError = error;
      console.error("Falha no Gemini (" + model + "):", error.message);
      if (!error.temporary) break;
    }
  }
  throw lastError || new Error("Gemini indisponível.");
}

function extractOpenAIText(result) {
  if (typeof result?.output_text === "string" && result.output_text) return result.output_text;
  return (result?.output || [])
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text || "")
    .join("");
}

async function generateWithOpenAI(report, apiKey) {
  if (!apiKey) throw new Error("OPENAI_API_KEY não está configurada na Vercel.");
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        instructions: SYSTEM_PROMPT,
        input: buildUserPrompt(report),
        text: {
          format: {
            type: "json_schema",
            name: "relatorio_tecnico",
            strict: true,
            schema: reportSchema()
          }
        },
        max_output_tokens: 1800
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (cause) {
    const error = new Error(cause?.name === "TimeoutError" || cause?.name === "AbortError"
      ? "Tempo limite excedido ao consultar o GPT."
      : "Não foi possível conectar ao GPT.");
    error.status = 503;
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || "Falha na solicitação à API GPT.");
    error.status = response.status >= 500 || response.status === 429 ? 503 : 502;
    throw error;
  }
  return { fields: parseFields(extractOpenAIText(result), "GPT"), model: OPENAI_MODEL, provider: "OpenAI GPT" };
}

async function generateReport(report) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY || process.env.GPT_API_KEY;
  let geminiError;
  try {
    return await generateWithGemini(report, geminiKey);
  } catch (error) {
    geminiError = error;
    console.error("Gemini indisponível; acionando contingência OpenAI GPT:", error.message);
  }
  try {
    return await generateWithOpenAI(report, openAIKey);
  } catch (openAIError) {
    const error = new Error(
      "Não foi possível gerar o relatório. O Gemini falhou (" + (geminiError?.message || "indisponível") +
      ") e o GPT também não concluiu (" + (openAIError?.message || "indisponível") + ")."
    );
    error.status = 503;
    throw error;
  }
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
    const generated = await generateReport(report);
    return res.status(200).json({
      fields: normalizeFields(generated.fields),
      provider: generated.provider,
      model: generated.model,
      fallbackUsed: generated.provider !== "Gemini"
    });
  } catch (error) {
    console.error("report-assistant:", error);
    return res.status(error.status === 429 || error.status >= 500 ? 503 : 400).json({ error: error.message || "Falha ao processar a solicitação." });
  }
};
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
