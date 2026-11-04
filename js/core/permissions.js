export const PERMISSIONS = [
  ["reports.view", "Visualizar relatórios"],
  ["reports.create", "Criar relatórios"],
  ["reports.edit", "Editar relatórios"],
  ["reports.delete", "Excluir relatórios"],
  ["reports.print", "Imprimir / PDF"],
  ["model.view", "Ver modelo visual"],
  ["model.edit", "Editar modelo visual"]
];

export const ROLE_DEFAULTS = {
  auxiliar_administrativo: PERMISSIONS.map(([key]) => key),
  gerente: PERMISSIONS.map(([key]) => key),
  coordenador: PERMISSIONS.map(([key]) => key),
  instrutor_tecnico: ["reports.view", "reports.create", "reports.print"],
  consultor_tecnico: ["reports.view", "reports.create", "reports.print"]
};

export function hasPermission(profile, permission, master = false) {
  if (master) return true;
  if (!profile || profile.active === false) return false;

  const role = String(profile.role || profile.roleLabel || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[\\s-]+/g, "_");

  const defaults = ROLE_DEFAULTS[role] ||
    (role === "consultor" || role === "consultortecnico"
      ? ROLE_DEFAULTS.consultor_tecnico
      : []);

  const configured = Array.isArray(profile.permissions) && profile.permissions.length
    ? profile.permissions
    : defaults;

  return configured.includes(permission);
}
