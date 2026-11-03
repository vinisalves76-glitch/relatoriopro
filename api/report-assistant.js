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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  try {
    await authenticate(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "A integração ainda não está configurada neste ambiente. Verifique OPENAI_API_KEY na Vercel." });
    const body = req.body || {};
    if (body.action === "transcribe") {
      const encoded = String(body.audioBase64 || "");
      if (!encoded || encoded.length > 4.2 * 1024 * 1024) return res.status(400).json({ error: "Áudio vazio ou acima do limite de 3 MB." });
      const mime = String(body.mimeType || "audio/webm").split(";")[0];
      const extensions = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" };
      if (!extensions[mime]) return res.status(400).json({ error: "Formato de áudio não suportado. Grave em WebM, MP4, MP3, WAV ou OGG." });
      const audio = Buffer.from(encoded, "base64");
      if (audio.length > 3 * 1024 * 1024) return res.status(400).json({ error: "Áudio acima do limite de 20 MB." });
      const form = new FormData();
      form.append("file", new Blob([audio], { type: mime }), "relato." + extensions[mime]);
      form.append("model", "gpt-transcribe");
      form.append("language", "pt");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: form
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Não foi possível transcrever o áudio.");
      return res.status(200).json({ text: result.text || "" });
    }
    if (body.action !== "generate") return res.status(400).json({ error: "Ação não reconhecida." });
    const report = body.report || {};
    const systemPrompt = [
      "Você é um assistente de redação técnica da IRMEN, representante SANY no Brasil.",
      "Organize o relato em português técnico brasileiro para um relatório de campo, inspeção, manutenção ou diagnóstico.",
      "Responda somente JSON válido com as chaves objective, observations, activities, results e conclusion, todas strings.",
      "Use exclusivamente os fatos fornecidos nos campos e no relato do profissional.",
      "NUNCA invente medições, pressões, temperaturas, códigos de falha, peças, testes, procedimentos executados, resultados ou causas.",
      "Não transforme suspeita em diagnóstico confirmado. Preserve expressões de possibilidade e incerteza.",
      "Não complete lacunas com conhecimento genérico como se a atividade tivesse sido realizada. Se não houver informação, deixe o campo vazio.",
      "Melhore clareza, ortografia, organização e linguagem profissional sem alterar o sentido técnico."
    ].join(" ");
    const userPrompt = "Identificação: " + JSON.stringify({
      tipo: report.type, cliente: report.client, equipamento: report.equipment,
      responsável: report.responsible, filial: report.branch, local: report.location, data: report.date
    }) + "\nCampos atuais: " + JSON.stringify(report.fields || {}) + "\nRelato livre: " + String(report.notes || "");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Não foi possível gerar o relatório.");
    const fields = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    for (const key of ["objective", "observations", "activities", "results", "conclusion"]) {
      if (typeof fields[key] !== "string") fields[key] = "";
    }
    return res.status(200).json({ fields });
  } catch (error) {
    console.error("report-assistant:", error);
    return res.status(400).json({ error: error.message || "Falha ao processar a solicitação." });
  }
};