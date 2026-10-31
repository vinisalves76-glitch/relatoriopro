const { createClient } = require("@supabase/supabase-js");

const MASTER_UID = "5c6800f9-426b-44b3-842d-ba6485cc017e";

function clients() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const error = new Error("Configuração administrativa do Supabase ausente. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.");
    error.statusCode = 503;
    throw error;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: "Sessão administrativa não informada." });

    const supabase = clients();
    const { data: authData, error: authError } = await supabase.auth.getUser(match[1]);
    if (authError || !authData?.user) return res.status(401).json({ error: "Sessão inválida ou expirada." });
    if (authData.user.id !== MASTER_UID) {
      return res.status(403).json({ error: "Somente a conta mestre pode excluir usuários." });
    }

    const targetUid = typeof req.body?.uid === "string" ? req.body.uid.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUid)) {
      return res.status(400).json({ error: "Identificador de usuário inválido." });
    }
    if (targetUid === MASTER_UID || targetUid === authData.user.id) {
      return res.status(400).json({ error: "A conta mestre e a própria sessão são protegidas." });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,name,role")
      .eq("id", targetUid)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(404).json({ error: "Perfil não encontrado. Atualize a lista de usuários." });

    const { error: archiveError } = await supabase.rpc("archive_user_business_data", {
      p_target_uid: targetUid,
      p_master_uid: MASTER_UID
    });
    if (archiveError) {
      console.error("Falha ao arquivar dados do usuário:", archiveError.code || "database_error");
      return res.status(409).json({
        error: "Não foi possível arquivar os registros históricos. A conta não foi excluída. Verifique se a migração 007 foi aplicada no Supabase."
      });
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUid);
    if (deleteError) {
      console.error("Falha ao remover usuário do Auth:", deleteError.code || "auth_admin_error");
      return res.status(502).json({
        error: "Os registros foram preservados e arquivados, mas o Supabase Auth não confirmou a exclusão da conta. Não repita a operação antes de verificar o cadastro."
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Conta removida do Supabase Auth. Relatórios, treinamentos e compromissos foram preservados no histórico institucional."
    });
  } catch (error) {
    console.error("Falha na exclusão administrativa:", error.code || error.statusCode || "erro");
    return res.status(error.statusCode || 500).json({
      error: error.statusCode === 503 ? error.message : "Falha interna ao processar a exclusão. Nenhuma confirmação de remoção foi emitida."
    });
  }
};
