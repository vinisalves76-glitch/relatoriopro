const admin = require("firebase-admin");

const MASTER_UID = "sQYjYwjn2vOKtXty7NOT9CO43Mk1";

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const error = new Error("Configuração administrativa do Firebase ausente.");
    error.statusCode = 503;
    throw error;
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    const error = new Error("A variável FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido.");
    error.statusCode = 503;
    throw error;
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.app();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const app = getAdminApp();
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: "Sessão administrativa não informada." });

    const decoded = await app.auth().verifyIdToken(match[1]);
    if (decoded.uid !== MASTER_UID) {
      return res.status(403).json({ error: "Somente o usuário mestre pode excluir contas." });
    }

    const targetUid = typeof req.body?.uid === "string" ? req.body.uid.trim() : "";
    if (!targetUid) return res.status(400).json({ error: "Usuário não informado." });
    if (targetUid === MASTER_UID) {
      return res.status(400).json({ error: "A conta mestre é protegida e não pode ser excluída." });
    }

    const db = app.firestore();
    // Confirma que o usuário existe no Authentication antes de iniciar a exclusão.
    await app.auth().getUser(targetUid);

    // Exclui primeiro a conta de autenticação para bloquear novos logins.
    await app.auth().deleteUser(targetUid);

    // Os relatórios, fotos e compromissos são subcoleções de users/{uid};
    // recursiveDelete remove também todos os documentos e subcoleções descendentes.
    await db.recursiveDelete(db.collection("users").doc(targetUid));
    await db.recursiveDelete(db.collection("userProfiles").doc(targetUid));

    return res.status(200).json({
      ok: true,
      message: "Conta removida do Firebase Authentication e dados associados removidos do Firestore."
    });
  } catch (error) {
    console.error("Falha na exclusão de usuário:", error.code || error.statusCode || "erro");
    const status = error.statusCode || (error.code === "auth/user-not-found" ? 404 : 500);
    return res.status(status).json({
      error: status === 503
        ? error.message
        : status === 404
          ? "A conta de autenticação não foi encontrada. Verifique o cadastro antes de continuar."
          : "Não foi possível concluir toda a exclusão. Verifique os registros no Firebase antes de tentar novamente."
    });
  }
};
