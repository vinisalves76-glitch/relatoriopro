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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "A integração de IA ainda não foi configurada. Adicione OPENAI_API_KEY nas variáveis de ambiente do projeto na Vercel e publique novamente."
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
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        max_completion_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("OpenAI API error", upstream.status, data.error && data.error.message);
      return res.status(502).json({
        error: upstream.status === 401
          ? "A chave da integração de IA é inválida. Confira OPENAI_API_KEY na Vercel."
          : "A IA não conseguiu processar o pedido. Verifique a configuração da API e tente novamente."
      });
    }

    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return res.status(502).json({ error: "A IA retornou uma resposta vazia. Tente novamente." });

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "A IA retornou um formato inválido. Tente novamente." });
    }

    const safeResult = {};
    for (const key of ["objective", "observations", "activities", "results", "conclusion"]) {
      safeResult[key] = typeof result[key] === "string" ? result[key].slice(0, MAX_FIELD) : "";
    }
    return res.status(200).json({ result: safeResult });
  } catch (error) {
    console.error("AI assistant request failed", error && error.message);
    return res.status(502).json({ error: "Não foi possível conectar à IA. Tente novamente em instantes." });
  }
};
