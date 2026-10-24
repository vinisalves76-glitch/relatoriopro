const MAX_FIELD = 6000;

function clean(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD) : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "A integração Gemini não está configurada. Adicione GEMINI_API_KEY nas variáveis de ambiente da Vercel e publique novamente."
    });
  }

  const body = req.body || {};
  const mode = body.mode === "structure" ? "structure" : "improve";
  const fields = body.fields || {};
  const input = {
    client: clean(body.client),
    equipment: clean(body.equipment),
    type: clean(body.type),
    objective: clean(fields.objective),
    observations: clean(fields.observations),
    activities: clean(fields.activities),
    results: clean(fields.results),
    conclusion: clean(fields.conclusion)
  };

  const system = [
    "Você é um redator técnico brasileiro especializado em relatórios de atendimento, manutenção e diagnóstico de máquinas pesadas, com foco em equipamentos SANY.",
    "Responda em português brasileiro e retorne exclusivamente um objeto JSON válido com as chaves string objective, observations, activities, results e conclusion.",
    "Nunca invente medições, pressão, torque, folgas, códigos de falha, testes realizados, peças substituídas, especificações ou resultados. Não transforme hipóteses em fatos.",
    "Preserve todos os fatos fornecidos. Se uma informação estiver ausente, não invente conteúdo para preencher a lacuna. Mantenha vazio o campo sem informação relevante.",
    "Use linguagem profissional, objetiva e apropriada para relatório técnico. Não emita recomendações inseguras."
  ].join(" ");

  const task = mode === "structure"
    ? "Organize as informações fornecidas numa estrutura profissional de relatório. Reordene e melhore a clareza sem acrescentar fatos. Quando faltarem dados necessários, mantenha o campo correspondente vazio em vez de inventar."
    : "Revise e melhore a redação dos campos existentes, mantendo o significado original e a separação entre as seções. Não preencha campos vazios com conteúdo genérico.";

  const user = task + "\n\nDados do relatório (JSON):\n" + JSON.stringify({
    tipo: input.type,
    cliente: input.client,
    equipamento: input.equipment,
    objetivo: input.objective,
    pontos_de_observacao: input.observations,
    atividades_realizadas: input.activities,
    resultados_e_recomendacoes: input.results,
    conclusao: input.conclusion
  });

  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                objective: { type: "STRING" },
                observations: { type: "STRING" },
                activities: { type: "STRING" },
                results: { type: "STRING" },
                conclusion: { type: "STRING" }
              },
              required: ["objective", "observations", "activities", "results", "conclusion"]
            }
          }
        })
      }
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Gemini API error", upstream.status, data.error && data.error.message);
      return res.status(502).json({
        error: upstream.status === 400 || upstream.status === 404
          ? "O Gemini recusou a solicitação: " + String(data.error && data.error.message || "erro de modelo ou parâmetros").slice(0, 240)
          : upstream.status === 401 || upstream.status === 403
            ? "A chave Gemini foi recusada: " + String(data.error && data.error.message || "verifique a chave e as permissões").slice(0, 240)
            : upstream.status === 429
              ? "O Gemini atingiu o limite de uso: " + String(data.error && data.error.message || "confira cotas e faturamento no Google AI Studio").slice(0, 240)
              : "Falha na API Gemini: " + String(data.error && data.error.message || "tente novamente").slice(0, 240)
      });
    }

    const content = data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map(part => part.text || "").join("");
    if (!content) {
      console.error("Gemini returned no text", JSON.stringify(data.promptFeedback || data.candidates && data.candidates[0] && data.candidates[0].finishReason || {}));
      return res.status(502).json({ error: "O Gemini retornou uma resposta vazia. Tente novamente." });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "O Gemini retornou um formato inválido. Tente novamente." });
    }

    const safeResult = {};
    for (const key of ["objective", "observations", "activities", "results", "conclusion"]) {
      safeResult[key] = typeof result[key] === "string" ? result[key].slice(0, MAX_FIELD) : "";
    }
    return res.status(200).json({ result: safeResult });
  } catch (error) {
    console.error("Gemini assistant request failed", error && error.message);
    return res.status(502).json({ error: "Não foi possível conectar ao Gemini. Tente novamente em instantes." });
  }
};
