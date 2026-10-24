const MAX_TEXT = 8000;

function clean(value, max = MAX_TEXT) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function section(title, value) {
  const text = clean(value);
  if (!text) return "";
  return `<tr><td style="padding:12px 14px;border:1px solid #e1e5e9;background:#f5f6f7;font-weight:700;width:220px;vertical-align:top">${escapeHtml(title)}</td><td style="padding:12px 14px;border:1px solid #e1e5e9;white-space:pre-wrap;vertical-align:top">${escapeHtml(text)}</td></tr>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return res.status(503).json({
      error: "O envio de e-mail ainda não está configurado. Na Vercel, configure RESEND_API_KEY e EMAIL_FROM com uma conta Resend e um remetente verificado; depois publique novamente."
    });
  }

  const body = req.body || {};
  const to = clean(body.to, 254);
  const cc = clean(body.cc, 254);
  const subject = clean(body.subject, 180) || "Relatório técnico — IRMEN SANY";
  const message = clean(body.message, 3000);
  const report = body.report && typeof body.report === "object" ? body.report : {};

  if (!validEmail(to)) {
    return res.status(400).json({ error: "Informe um endereço de e-mail válido para o destinatário." });
  }
  if (cc && !validEmail(cc)) {
    return res.status(400).json({ error: "O endereço de cópia (CC) não é válido." });
  }
  if (/[\r\n]/.test(subject)) {
    return res.status(400).json({ error: "O assunto informado não é válido." });
  }

  const title = clean(report.type, 120) || "Relatório técnico";
  const company = clean(report.company, 120) || "IRMEN";
  const details = [
    section("Tipo de atendimento", title),
    section("Data", report.date),
    section("Cliente", report.client),
    section("Equipamento", report.equipment),
    section("Responsável técnico", report.responsible),
    section("Filial / departamento", report.branch),
    section("Local do atendimento", report.location),
    section("Objetivo", report.objective),
    section("Pontos de observação", report.observations),
    section("Atividades realizadas", report.activities),
    section("Resultados e recomendações", report.results),
    section("Conclusão", report.conclusion)
  ].join("");

  if (!details) {
    return res.status(400).json({ error: "O relatório está vazio. Preencha os dados antes de enviar." });
  }

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#20242b">
    <div style="max-width:850px;margin:0 auto;background:#fff;border:1px solid #dfe3e8;border-radius:8px;overflow:hidden">
      <div style="padding:22px 24px;background:#20242b;color:#fff;border-bottom:5px solid #e4a900">
        <div style="font-size:22px;font-weight:700">${escapeHtml(company)}</div>
        <div style="margin-top:5px;font-size:13px;color:#d6d9de">RelatorioPro | Soluções técnicas SANY</div>
      </div>
      <div style="padding:22px 24px">
        <h2 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h2>
        <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(message || "Segue o relatório técnico para conhecimento e acompanhamento.")}</p>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin-top:18px">${details}</table>
        <p style="font-size:12px;color:#68717d;margin-top:18px">Mensagem enviada pelo RelatorioPro IRMEN. As evidências fotográficas não estão anexadas a este e-mail.</p>
      </div>
    </div>
  </body></html>`;

  try {
    const payload = {
      from,
      to: [to],
      subject,
      html
    };
    if (cc) payload.cc = [cc];

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend email error:", response.status, result && result.message ? result.message : "provider error");
      return res.status(502).json({
        error: "O serviço de e-mail recusou o envio. Verifique a chave do Resend e se o remetente está verificado."
      });
    }

    return res.status(200).json({ ok: true, id: result.id || null });
  } catch (error) {
    console.error("Email send failed:", error && error.message ? error.message : "unknown error");
    return res.status(502).json({ error: "Não foi possível conectar ao serviço de e-mail. Tente novamente." });
  }
};
