import { createSupabaseAdapter } from "./core/supabase-adapter.js";
import { initOperationalModule } from "./modules/operational-crud.js";

const SUPABASE_URL = "https://vwvesygsudhbaqmayhsz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IcydrqH9qr8WqVpVdfPwoA_sWz1ehMw";
const MASTER_UID = "5c6800f9-426b-44b3-842d-ba6485cc017e";
const AREA_ID = "arcelormittal-andradas";
const STORE_KEY = "relatoriopro-demo-supervisor-v1";
const DEMO_UID = "demo-supervisor-area";
const $ = id => document.getElementById(id);

const authAdapter = createSupabaseAdapter({ $, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
const authClient = authAdapter.supabase;
const demoFiles = new Map();

function dateOffset(days, withTime = false) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  if (withTime) value.setHours(8 + (Math.abs(days) % 8), 30, 0, 0);
  return withTime ? value.toISOString() : value.toISOString().slice(0, 10);
}
function makeId(prefix) {
  return prefix + "-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
}
function makeSeed() {
  const equipment = [
    { id:"demo-eq-001", area_id:AREA_ID, asset_code:"SKT-001", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT110H", category:"caminhao", current_horimeter:1240.5, status:"available", maintenance_type:null },
    { id:"demo-eq-002", area_id:AREA_ID, asset_code:"SKT-002", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT110H", category:"caminhao", current_horimeter:1765.3, status:"stopped", maintenance_type:null },
    { id:"demo-eq-003", area_id:AREA_ID, asset_code:"SKT-003", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT90S", category:"caminhao", current_horimeter:2480, status:"maintenance", maintenance_type:"preventive" },
    { id:"demo-eq-004", area_id:AREA_ID, asset_code:"SKT-004", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT110H", category:"caminhao", current_horimeter:980.2, status:"available", maintenance_type:null },
    { id:"demo-eq-005", area_id:AREA_ID, asset_code:"SKT-005", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT90S", category:"caminhao", current_horimeter:3190.8, status:"available", maintenance_type:null },
    { id:"demo-eq-006", area_id:AREA_ID, asset_code:"SY-006", description:"Escavadeira hidráulica", brand:"SANY", model:"SY365H", category:"escavadeira", current_horimeter:530.4, status:"available", maintenance_type:null },
    { id:"demo-eq-007", area_id:AREA_ID, asset_code:"SKT-007", description:"Caminhão fora de estrada", brand:"SANY", model:"SKT110H", category:"caminhao", current_horimeter:2105, status:"inactive", maintenance_type:null }
  ];
  const mechanics = [
    { id:"demo-mech-001", name:"Carlos Henrique (DEMO)", email:"carlos.demo@irmen.local", role:"mecanico", active:true, operational_area_id:AREA_ID },
    { id:"demo-mech-002", name:"Marcos Vinícius (DEMO)", email:"marcos.demo@irmen.local", role:"mecanico", active:true, operational_area_id:AREA_ID },
    { id:"demo-mech-003", name:"Rafael Souza (DEMO)", email:"rafael.demo@irmen.local", role:"mecanico", active:true, operational_area_id:AREA_ID },
    { id:"demo-mech-004", name:"André Luiz (DEMO)", email:"andre.demo@irmen.local", role:"mecanico", active:true, operational_area_id:AREA_ID }
  ];
  const controls = [
    { id:"demo-125-001", area_id:AREA_ID, equipment_id:"demo-eq-001", interval_hours:125, last_service_horimeter:1125, enabled:true },
    { id:"demo-125-002", area_id:AREA_ID, equipment_id:"demo-eq-002", interval_hours:125, last_service_horimeter:1500, enabled:true },
    { id:"demo-125-003", area_id:AREA_ID, equipment_id:"demo-eq-003", interval_hours:125, last_service_horimeter:2375, enabled:true },
    { id:"demo-125-004", area_id:AREA_ID, equipment_id:"demo-eq-004", interval_hours:125, last_service_horimeter:875, enabled:true },
    { id:"demo-125-005", area_id:AREA_ID, equipment_id:"demo-eq-005", interval_hours:125, last_service_horimeter:3000, enabled:true },
    { id:"demo-125-006", area_id:AREA_ID, equipment_id:"demo-eq-006", interval_hours:125, last_service_horimeter:500, enabled:true }
  ];
  return {
    operational_equipment: equipment,
    profiles: mechanics,
    operational_125h_control: controls,
    operational_maintenance_events: [
      { id:"demo-event-001", area_id:AREA_ID, equipment_id:"demo-eq-002", event_type:"corrective", description:"Parada para avaliação de vazamento em conexão hidráulica. Registro fictício para demonstração.", occurred_at:dateOffset(-2,true), created_by:DEMO_UID },
      { id:"demo-event-002", area_id:AREA_ID, equipment_id:"demo-eq-003", event_type:"preventive", description:"Inspeção preventiva programada e verificação geral do equipamento.", occurred_at:dateOffset(-6,true), created_by:DEMO_UID },
      { id:"demo-event-003", area_id:AREA_ID, equipment_id:"demo-eq-001", event_type:"inspection", description:"Inspeção visual e conferência dos itens de rotina.", occurred_at:dateOffset(-10,true), created_by:DEMO_UID },
      { id:"demo-event-004", area_id:AREA_ID, equipment_id:"demo-eq-005", event_type:"occurrence", description:"Registro de ocorrência operacional para fins de treinamento.", occurred_at:dateOffset(-15,true), created_by:DEMO_UID }
    ],
    operational_horimeter_readings: [
      { id:"demo-reading-001", area_id:AREA_ID, equipment_id:"demo-eq-001", reading:1230.5, notes:"Leitura de demonstração.", recorded_at:dateOffset(-3,true), created_by:DEMO_UID },
      { id:"demo-reading-002", area_id:AREA_ID, equipment_id:"demo-eq-002", reading:1752.3, notes:"Leitura de demonstração.", recorded_at:dateOffset(-4,true), created_by:DEMO_UID },
      { id:"demo-reading-003", area_id:AREA_ID, equipment_id:"demo-eq-003", reading:2468, notes:"Leitura de demonstração.", recorded_at:dateOffset(-5,true), created_by:DEMO_UID }
    ],
    operational_equipment_status_history: [
      { id:"demo-status-001", area_id:AREA_ID, equipment_id:"demo-eq-002", from_status:"available", to_status:"stopped", reason:"Parada para avaliação", notes:"Histórico fictício.", changed_at:dateOffset(-2,true), changed_by:DEMO_UID },
      { id:"demo-status-002", area_id:AREA_ID, equipment_id:"demo-eq-003", from_status:"available", to_status:"maintenance", reason:"Manutenção preventiva", notes:"Histórico fictício.", changed_at:dateOffset(-6,true), changed_by:DEMO_UID }
    ],
    operational_shift_reports: [
      { id:"demo-shift-001", area_id:AREA_ID, equipment_id:"demo-eq-001", report_date:dateOffset(-1), horimeter:1238, created_by:DEMO_UID, created_by_name:"Supervisor de Área (DEMO)", other_mechanics:["Carlos Henrique (DEMO)"], work_performed:"Inspeção visual e acompanhamento operacional.", anomalies:"Sem anormalidades relevantes registradas neste exemplo.", actions_taken:"Registro de demonstração.", pending_items:"Acompanhar próxima leitura.", final_condition:"available", final_condition_notes:"Equipamento disponível — dado fictício." },
      { id:"demo-shift-002", area_id:AREA_ID, equipment_id:"demo-eq-003", report_date:dateOffset(-3), horimeter:2475, created_by:DEMO_UID, created_by_name:"Supervisor de Área (DEMO)", other_mechanics:["Marcos Vinícius (DEMO)"], work_performed:"Acompanhamento de manutenção preventiva.", anomalies:"Registro fictício para treinamento.", actions_taken:"Acompanhamento da atividade.", pending_items:"Conferência após liberação.", final_condition:"maintenance", final_condition_notes:"Permanece em manutenção — dado fictício." }
    ],
    operational_mechanic_assignments: [
      { id:"demo-assign-001", area_id:AREA_ID, equipment_id:"demo-eq-001", mechanic_id:"demo-mech-001", work_date:dateOffset(1), status:"scheduled", notes:"Demonstração de escala.", created_by:DEMO_UID },
      { id:"demo-assign-002", area_id:AREA_ID, equipment_id:"demo-eq-001", mechanic_id:"demo-mech-002", work_date:dateOffset(1), status:"scheduled", notes:"Demonstração de escala.", created_by:DEMO_UID },
      { id:"demo-assign-003", area_id:AREA_ID, equipment_id:"demo-eq-002", mechanic_id:"demo-mech-003", work_date:dateOffset(2), status:"scheduled", notes:"Demonstração de escala.", created_by:DEMO_UID },
      { id:"demo-assign-004", area_id:AREA_ID, equipment_id:"demo-eq-004", mechanic_id:"demo-mech-004", work_date:dateOffset(3), status:"scheduled", notes:"Demonstração de escala.", created_by:DEMO_UID }
    ],
    operational_125h_services: [
      { id:"demo-service-001", area_id:AREA_ID, equipment_id:"demo-eq-001", service_horimeter:1125, performed_at:dateOffset(-20), checklist:"Inspeção de demonstração", notes:"Registro fictício." },
      { id:"demo-service-002", area_id:AREA_ID, equipment_id:"demo-eq-003", service_horimeter:2375, performed_at:dateOffset(-12), checklist:"Inspeção de demonstração", notes:"Registro fictício." }
    ],
    operational_125h_schedules: [
      { id:"demo-schedule-001", area_id:AREA_ID, equipment_id:"demo-eq-001", planned_for:dateOffset(3), planned_horimeter:1250, responsible_name:"Carlos Henrique (DEMO)", notes:"Agendamento fictício.", is_overdue:false, status:"scheduled", created_by:DEMO_UID },
      { id:"demo-schedule-002", area_id:AREA_ID, equipment_id:"demo-eq-004", planned_for:dateOffset(5), planned_horimeter:1000, responsible_name:"Marcos Vinícius (DEMO)", notes:"Agendamento fictício.", is_overdue:false, status:"scheduled", created_by:DEMO_UID }
    ],
    operational_125h_checklists: [
      { id:"demo-check-001", area_id:AREA_ID, equipment_id:"demo-eq-001", assigned_profile_id:"demo-mech-001", assigned_for:dateOffset(3), status:"assigned", created_by:DEMO_UID, general_notes:"Checklist de demonstração — não representa inspeção real.", created_at:dateOffset(-1,true) },
      { id:"demo-check-002", area_id:AREA_ID, equipment_id:"demo-eq-004", assigned_profile_id:"demo-mech-002", assigned_for:dateOffset(5), status:"in_progress", created_by:DEMO_UID, general_notes:"Checklist de demonstração — não representa inspeção real.", created_at:dateOffset(-2,true) }
    ],
    operational_work_order_activities: [],
    operational_work_orders: []
  };
}

function readStore() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn("[DEMO] Não foi possível ler os dados locais:", error);
  }
  const seeded = makeSeed();
  writeStore(seeded);
  return seeded;
}
function writeStore(value) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); }
  catch (error) { console.warn("[DEMO] Não foi possível persistir os dados locais:", error); }
}
let store = readStore();
const tableRows = table => {
  if (!Array.isArray(store[table])) store[table] = [];
  return store[table];
};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

class DemoQuery {
  constructor(table) {
    this.table = table;
    this.operation = "select";
    this.payload = null;
    this.filters = [];
    this.sorts = [];
    this.maxRows = null;
    this.returning = false;
    this.singleMode = "";
    this.conflict = "";
  }
  select() { if (this.operation === "select") this.returning = true; else this.returning = true; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload, options = {}) { this.operation = "upsert"; this.payload = payload; this.conflict = options.onConflict || ""; return this; }
  delete() { this.operation = "delete"; return this; }
  eq(column, value) { this.filters.push({ column, operator:"eq", value }); return this; }
  neq(column, value) { this.filters.push({ column, operator:"neq", value }); return this; }
  in(column, value) { this.filters.push({ column, operator:"in", value }); return this; }
  gte(column, value) { this.filters.push({ column, operator:"gte", value }); return this; }
  lte(column, value) { this.filters.push({ column, operator:"lte", value }); return this; }
  is(column, value) { this.filters.push({ column, operator:"is", value }); return this; }
  not(column, operator, value) { this.filters.push({ column, operator:"not-" + operator, value }); return this; }
  filter(column, operator, value) { this.filters.push({ column, operator, value }); return this; }
  order(column, options = {}) { this.sorts.push({ column, ascending:options.ascending !== false }); return this; }
  limit(value) { this.maxRows = Number(value); return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  matches(row) {
    return this.filters.every(filter => {
      const actual = row[filter.column];
      const expected = filter.value;
      switch (filter.operator) {
        case "eq": return actual === expected;
        case "neq": return actual !== expected;
        case "in": return Array.isArray(expected) ? expected.includes(actual) : String(expected).replace(/^\(|\)$/g,"").split(",").map(v=>v.replace(/^["']|["']$/g,"").trim()).includes(String(actual));
        case "gte": return String(actual ?? "") >= String(expected ?? "");
        case "lte": return String(actual ?? "") <= String(expected ?? "");
        case "is": return expected === null ? actual == null : actual === expected;
        case "not-is": return expected === null ? actual != null : actual !== expected;
        case "not-in": return !(Array.isArray(expected) ? expected.includes(actual) : String(expected).replace(/^\(|\)$/g,"").split(",").includes(String(actual)));
        default: return true;
      }
    });
  }
  async execute() {
    const rows = tableRows(this.table);
    let result = [];
    if (this.operation === "select") {
      result = rows.filter(row => this.matches(row)).map(clone);
      for (const sort of this.sorts) {
        result.sort((a,b) => {
          const av = a[sort.column], bv = b[sort.column];
          if (av == null && bv == null) return 0;
          if (av == null) return sort.ascending ? -1 : 1;
          if (bv == null) return sort.ascending ? 1 : -1;
          const compared = typeof av === "number" && typeof bv === "number" ? av-bv : String(av).localeCompare(String(bv));
          return sort.ascending ? compared : -compared;
        });
      }
      if (this.maxRows != null) result = result.slice(0, this.maxRows);
    } else if (this.operation === "insert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      result = payloads.map(item => ({ id:item.id || makeId(this.table), created_at:item.created_at || new Date().toISOString(), ...clone(item) }));
      rows.push(...result);
      writeStore(store);
    } else if (this.operation === "upsert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      result = payloads.map(item => {
        const keys = this.conflict ? this.conflict.split(",").map(v=>v.trim()) : ["id"];
        const existing = rows.find(row => keys.every(key => row[key] === item[key]));
        if (existing) { Object.assign(existing, clone(item)); return clone(existing); }
        const added = { id:item.id || makeId(this.table), created_at:item.created_at || new Date().toISOString(), ...clone(item) };
        rows.push(added);
        return clone(added);
      });
      writeStore(store);
    } else if (this.operation === "update") {
      result = rows.filter(row => this.matches(row));
      result.forEach(row => Object.assign(row, clone(this.payload), { updated_at:new Date().toISOString() }));
      result = result.map(clone);
      writeStore(store);
    } else if (this.operation === "delete") {
      const removed = rows.filter(row => this.matches(row));
      store[this.table] = rows.filter(row => !this.matches(row));
      result = removed.map(clone);
      writeStore(store);
    }
    if (this.singleMode) {
      if (this.singleMode === "single" && result.length !== 1) return { data:null, error:{ message:"Era esperado exatamente um registro na demonstração." } };
      result = result[0] || null;
    } else if (this.operation !== "select" && !this.returning) {
      result = null;
    }
    return { data:clone(result), error:null, count:Array.isArray(result) ? result.length : result ? 1 : 0 };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

function updateEquipmentStatus(args) {
  const equipment = tableRows("operational_equipment").find(row => row.id === args.p_equipment_id && row.area_id === args.p_area_id);
  if (!equipment) return { data:null, error:{ message:"Equipamento não encontrado no ambiente de demonstração." } };
  const previous = equipment.status;
  equipment.status = args.p_new_status;
  equipment.maintenance_type = args.p_new_status === "maintenance" ? args.p_maintenance_type : null;
  tableRows("operational_equipment_status_history").push({
    id:makeId("demo-status"), area_id:args.p_area_id, equipment_id:equipment.id, from_status:previous,
    to_status:equipment.status, reason:args.p_reason || "Alteração de status na demonstração",
    notes:args.p_notes || "", changed_at:new Date().toISOString(), changed_by:DEMO_UID
  });
  writeStore(store);
  return { data:clone(equipment), error:null };
}
const demoBackend = {
  from(table) { return new DemoQuery(table); },
  async rpc(name, args = {}) {
    if (name === "list_operational_area_mechanics") {
      const data = tableRows("profiles").filter(row => row.operational_area_id === args.area_key && row.role === "mecanico" && row.active !== false);
      return { data:clone(data), error:null };
    }
    if (name === "create_operational_equipment") {
      const duplicate = tableRows("operational_equipment").some(row => row.area_id === args.p_area_id && row.asset_code.toLowerCase() === String(args.p_asset_code).toLowerCase());
      if (duplicate) return { data:null, error:{ message:"Já existe um equipamento com essa TAG neste ambiente de demonstração." } };
      const item = {
        id:makeId("demo-equipment"), area_id:args.p_area_id, asset_code:args.p_asset_code,
        description:args.p_description, brand:args.p_brand || "SANY", model:args.p_model,
        category:args.p_category, current_horimeter:Number(args.p_current_horimeter || 0),
        status:args.p_status || "available", maintenance_type:args.p_maintenance_type || null,
        created_at:new Date().toISOString(), updated_at:new Date().toISOString(), created_by:DEMO_UID
      };
      tableRows("operational_equipment").push(item);
      tableRows("operational_equipment_status_history").push({
        id:makeId("demo-status"), area_id:args.p_area_id, equipment_id:item.id, from_status:null,
        to_status:item.status, reason:args.p_initial_reason || "Cadastro inicial",
        notes:args.p_initial_notes || "", changed_at:new Date().toISOString(), changed_by:DEMO_UID
      });
      tableRows("operational_125h_control").push({
        id:makeId("demo-125h"), area_id:args.p_area_id, equipment_id:item.id,
        interval_hours:125, last_service_horimeter:item.current_horimeter, enabled:true, updated_by:DEMO_UID
      });
      writeStore(store);
      return { data:clone(item), error:null };
    }
    if (name === "transition_operational_equipment_status") return updateEquipmentStatus(args);
    if (name === "close_operational_work_order") {
      const order = tableRows("operational_work_orders").find(row => row.id === args.p_work_order_id && row.area_id === args.p_area_id);
      if (!order) return { data:null, error:{ message:"Ordem de serviço não encontrada na demonstração." } };
      order.status = "completed";
      order.closure_notes = args.p_closure_notes || "";
      order.remaining_pending = args.p_remaining_pending || "";
      order.completed_at = new Date().toISOString();
      if (args.p_release_equipment) updateEquipmentStatus({ p_area_id:args.p_area_id, p_equipment_id:order.equipment_id, p_new_status:"available", p_reason:args.p_release_reason || "Liberação após encerramento da OS" });
      writeStore(store);
      return { data:clone(order), error:null };
    }
    if (name === "complete_operational_125h_service") {
      const service = {
        id:makeId("demo-service"), area_id:args.p_area_id, equipment_id:args.p_equipment_id,
        service_horimeter:Number(args.p_service_horimeter), performed_at:args.p_performed_at,
        checklist:args.p_checklist || "", notes:args.p_notes || "", created_by:DEMO_UID
      };
      tableRows("operational_125h_services").push(service);
      const control = tableRows("operational_125h_control").find(row => row.equipment_id === args.p_equipment_id && row.area_id === args.p_area_id);
      if (control) { control.last_service_horimeter = service.service_horimeter; control.enabled = true; }
      writeStore(store);
      return { data:clone(service), error:null };
    }
    return { data:null, error:{ message:"Ação não implementada no simulador local: " + name } };
  },
  storage: {
    from(bucket) {
      return {
        async upload(path, file) {
          demoFiles.set(bucket + "/" + path, file);
          return { data:{ path }, error:null };
        },
        async createSignedUrl(path) {
          const file = demoFiles.get(bucket + "/" + path);
          return file ? { data:{ signedUrl:URL.createObjectURL(file) }, error:null } : { data:null, error:{ message:"Arquivo não encontrado nesta sessão de demonstração." } };
        },
        async remove(paths) {
          (paths || []).forEach(path => demoFiles.delete(bucket + "/" + path));
          return { data:paths || [], error:null };
        }
      };
    }
  }
};

function showAccessError(message) {
  $("demoLoading").hidden = true;
  $("demoAccessDenied").hidden = false;
  $("demoAccessMessage").textContent = message;
}
async function startDemo() {
  try {
    const { data:{ session }, error:sessionError } = await authClient.auth.getSession();
    if (sessionError) throw sessionError;
    const user = session?.user;
    if (!user || user.id !== MASTER_UID) throw new Error("A Central DEMO está disponível somente no login ADMIN MASTER.");
    const { data:profile, error:profileError } = await authClient.from("profiles").select("id,role,active").eq("id", MASTER_UID).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== "super_admin" || profile.active === false) throw new Error("Não foi possível validar as permissões do ADMIN MASTER.");
    $("demoLoading").hidden = true;
    $("appShell").hidden = false;
    const demoProfile = {
      id:DEMO_UID, uid:DEMO_UID, name:"Supervisor de Área (DEMO)",
      role:"supervisor_area", roleLabel:"Supervisor de Área — DEMONSTRAÇÃO",
      active:true, operationalAreaId:AREA_ID, permissions:[]
    };
    await initOperationalModule({ supabase:demoBackend, profile:demoProfile, isMaster:false });
    const root = $("gestaoOperacional");
    if (root?.showOperationalSection) root.showOperationalSection("overview");
  } catch (error) {
    console.error("[RelatorioPro DEMO] Falha ao iniciar:", error);
    showAccessError(error.message || "Não foi possível validar o acesso à demonstração.");
  }
}

$("demoReset").addEventListener("click", () => {
  if (!confirm("Restaurar os dados fictícios iniciais? As alterações feitas neste ambiente DEMO serão descartadas.")) return;
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
});
$("demoExit").addEventListener("click", () => {
  window.location.href = "/";
});

startDemo();
