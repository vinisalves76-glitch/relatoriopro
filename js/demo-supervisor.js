import { initOperationalModule } from "./modules/operational-crud.js";

const MASTER_UID = "5c6800f9-426b-44b3-842d-ba6485cc017e";
const AREA_ID = "arcelormittal-andradas";
const STORE_KEY = "relatoriopro-demo-supervisor-v1";
const DEMO_UID = "demo-supervisor-area";
const $ = id => document.getElementById(id);

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
      { id:"demo-assign-today", area_id:AREA_ID, equipment_id:"demo-eq-001", mechanic_id:"demo-mech-001", work_date:dateOffset(0), status:"scheduled", notes:"Escala fictícia para simulação do fluxo completo.", created_by:DEMO_UID },
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
    operational_work_orders: [],
    trainings: [
      { id:"demo-manual-skt110h", title:"Manual de Operação e Manutenção — SKT110H", category:"Manual técnico", description:"Documento demonstrativo local para navegação da biblioteca técnica.", status:"published", version:1, updated_at:dateOffset(-15), legacy_data:{docType:"technical_manual",equipment:"SKT110H",system:"Geral",category:"Manual de operação e manutenção",fileName:"Manual-SKT110H-DEMO.pdf",path:"demo/manual-skt110h.pdf",language:"Português"} },
      { id:"demo-pop-inspecao", title:"Inspeção diária do caminhão SKT110H", category:"POP — Inspeção", description:"Procedimento fictício para testar a consulta de POPs no perfil Mecânico.", status:"published", version:1, updated_at:dateOffset(-5), legacy_data:{docType:"pop",equipment:"SKT110H",system:"Inspeção",category:"POP — Inspeção",code:"POP-DEMO-001",procedure:"Realizar a inspeção conforme o procedimento aprovado da empresa. Este conteúdo é fictício e serve apenas para testar a interface.",steps:[{title:"Preparar o equipamento",description:"Estacionar em local seguro, aplicar freio e seguir o procedimento de bloqueio aplicável."},{title:"Inspeção visual",description:"Verificar vazamentos, danos aparentes e condições gerais."},{title:"Registrar resultados",description:"Documentar as observações e comunicar qualquer anormalidade."}]} }
    ]
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
          if(file)return { data:{ signedUrl:URL.createObjectURL(file) }, error:null };
          if(String(path).startsWith("demo/"))return { data:{ signedUrl:"data:text/plain;charset=utf-8,"+encodeURIComponent("ARQUIVO FICTÍCIO DA DEMONSTRAÇÃO IRMEN\\n\\nEste documento é apenas um exemplo local para testar a navegação. Não representa manual oficial SANY.") }, error:null };
          return { data:null, error:{ message:"Arquivo não encontrado nesta sessão de demonstração." } };
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
  $("demoSelection").hidden = true;
  $("appShell").hidden = true;
  $("demoAccessDenied").hidden = false;
  $("demoAccessMessage").textContent = message;
}
const DEMO_ROLE_CONFIG = {
  supervisor_area:{label:"Supervisor de Área",tables:["operational_equipment","operational_shift_reports","operational_mechanic_assignments","operational_125h_checklists"]},
  mecanico:{label:"Mecânico",tables:["operational_mechanic_assignments","operational_shift_reports","operational_125h_checklists","operational_equipment"]},
  instrutor_tecnico:{label:"Instrutor Técnico",tables:["demo_training_records","demo_training_materials","demo_appointments","demo_reports"]},
  consultor_tecnico:{label:"Consultor Técnico",tables:["demo_service_calls","demo_reports","operational_equipment","demo_appointments"]},
  super_admin:{label:"Administrador Master",tables:["demo_users","demo_reports","demo_appointments","demo_training_records","demo_approvals"]},
  gerente:{label:"Gerente",tables:["demo_users","demo_reports","demo_appointments","demo_training_records","demo_approvals"]},
  coordenador:{label:"Coordenador",tables:["demo_users","demo_reports","demo_appointments","demo_training_records","demo_approvals"]},
  auxiliar_administrativo:{label:"Auxiliar Administrativo",tables:["demo_reports","demo_appointments","demo_users","demo_service_calls"]}
};
const DEMO_TABLE_LABELS={operational_equipment:"Equipamentos",operational_shift_reports:"Relatórios de turno",operational_mechanic_assignments:"Escala de mecânicos",operational_125h_checklists:"Checklists 125h",demo_training_records:"Treinamentos",demo_training_materials:"Materiais técnicos",demo_appointments:"Agenda",demo_reports:"Relatórios técnicos",demo_service_calls:"Atendimentos",demo_users:"Equipe",demo_approvals:"Aprovações"};
function escapeDemo(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function statusDemo(value){return ({active:"Ativo",scheduled:"Programado",confirmed:"Confirmado",completed:"Concluído",review:"Em revisão",pending:"Pendente",published:"Publicado",open:"Aberto",in_progress:"Em andamento",assigned:"Atribuído",inactive:"Inativo"}[value]||String(value));}
function ensureDemoCollections(){
 const defaults={
  demo_training_records:[{id:"demo-tr-001",title:"Inspeção diária de caminhões SKT110H",responsible:"Ana Paula Ribeiro (DEMO)",status:"published",date:dateOffset(-4),notes:"Treinamento fictício com checklist de inspeção."},{id:"demo-tr-002",title:"Sistema hidráulico — fundamentos",responsible:"Eduarda Lima (DEMO)",status:"pending",date:dateOffset(-1),notes:"Material em revisão para demonstração."}],
  demo_training_materials:[{id:"demo-mat-001",title:"Guia de inspeção do trem de força",responsible:"Instrutor DEMO",status:"published",date:dateOffset(-8),notes:"Arquivo demonstrativo; não representa manual oficial."}],
  demo_appointments:[{id:"demo-ap-001",title:"Treinamento de inspeção SKT110H",responsible:"Ana Paula Ribeiro (DEMO)",status:"scheduled",date:dateOffset(1),notes:"Agenda fictícia — Centro de Treinamento IRMEN."},{id:"demo-ap-002",title:"Acompanhamento técnico SY365H",responsible:"Bruno Martins (DEMO)",status:"confirmed",date:dateOffset(2),notes:"Cliente de demonstração."}],
  demo_reports:[{id:"demo-rep-001",title:"Inspeção de rotina — SKT110H",responsible:"Carlos Henrique (DEMO)",status:"completed",date:dateOffset(-2),notes:"Relatório fictício de inspeção visual."},{id:"demo-rep-002",title:"Diagnóstico inicial — SY365H",responsible:"Bruno Martins (DEMO)",status:"review",date:dateOffset(-1),notes:"Registro de demonstração sem diagnóstico real."}],
  demo_service_calls:[{id:"demo-call-001",title:"Atendimento técnico — SKT110H",responsible:"Bruno Martins (DEMO)",status:"in_progress",date:dateOffset(-1),notes:"Cliente fictício. Relato: avaliação de ruído anormal."}],
  demo_users:[{id:"demo-user-001",title:"Carlos Henrique",responsible:"Mecânico",status:"active",date:dateOffset(-30),notes:"Área: ArcelorMittal Andradas (DEMO)."},{id:"demo-user-002",title:"Ana Paula Ribeiro",responsible:"Instrutora técnica",status:"active",date:dateOffset(-25),notes:"Área: Treinamento (DEMO)."}],
  demo_approvals:[{id:"demo-apr-001",title:"Treinamento de inspeção SKT110H",responsible:"Ana Paula Ribeiro (DEMO)",status:"pending",date:dateOffset(-1),notes:"Aguardando aprovação fictícia."}]
 };
 for(const [table,rows] of Object.entries(defaults))if(!Array.isArray(store[table]))store[table]=clone(rows);
 writeStore(store);
}
function openGenericRoleDemo(role){
 document.querySelectorAll(".operational-main-tab").forEach(button=>button.hidden=true);
 ensureDemoCollections();
 const config=DEMO_ROLE_CONFIG[role],root=$("gestaoOperacional");
 let currentTable=config.tables[0];
 root.innerHTML='<div class="demo-workspace"><div class="demo-workspace-head"><div><span class="demo-mode-tag">PERFIL SIMULADO</span><h1>'+config.label+'</h1><p>As ações são salvas somente neste navegador. Nenhuma gravação é enviada ao banco.</p></div><button class="light" id="demoWorkspaceBack">Trocar perfil</button></div><div class="demo-local-stats" id="demoLocalStats"></div><nav class="demo-local-tabs" id="demoLocalTabs">'+config.tables.map((table,i)=>'<button type="button" class="'+(i===0?"active":"")+'" data-demo-table="'+table+'">'+DEMO_TABLE_LABELS[table]+'</button>').join("")+'</nav><section id="demoLocalContent"></section></div>';
 const content=$("demoLocalContent");
 function renderStats(){$("demoLocalStats").innerHTML=config.tables.map(table=>'<div><span>'+DEMO_TABLE_LABELS[table]+'</span><strong>'+tableRows(table).length+'</strong></div>').join("");}
 function renderTable(){
  const rows=tableRows(currentTable);
  content.innerHTML='<div class="demo-local-toolbar"><div><h2>'+DEMO_TABLE_LABELS[currentTable]+'</h2><p>Dados fictícios · armazenamento local</p></div><button class="primary" id="demoLocalAdd">＋ Novo registro</button></div><div class="demo-local-list">'+(rows.length?rows.map(row=>'<article class="demo-local-record"><div class="demo-local-record-top"><div><h3>'+escapeDemo(row.title||row.asset_code||"Registro")+'</h3><span class="demo-local-id">'+escapeDemo(row.id)+'</span></div><span class="demo-local-status">'+escapeDemo(statusDemo(row.status||"active"))+'</span></div><p><strong>Responsável:</strong> '+escapeDemo(row.responsible||row.responsible_name||"Equipe DEMO")+' · <strong>Data:</strong> '+escapeDemo(row.date||row.work_date||row.report_date||"—")+'</p><p>'+escapeDemo(row.notes||row.description||row.general_notes||row.model||"")+'</p><div class="demo-local-actions"><button class="light" data-demo-edit="'+escapeDemo(row.id)+'">Editar</button><button class="light" data-demo-status="'+escapeDemo(row.id)+'">Alterar status</button><button class="danger" data-demo-delete="'+escapeDemo(row.id)+'">Excluir</button></div></article>').join(""):'<div class="demo-local-empty">Nenhum registro. Clique em Novo registro para começar.</div>')+'</div>';
  $("demoLocalAdd").onclick=()=>openEditor(null);
 }
 function openEditor(record){
  const current=record||{};
  content.innerHTML='<form class="demo-local-form" id="demoLocalForm"><h2>'+(record?"Editar registro":"Novo registro")+'</h2><p>Este formulário grava apenas no ambiente DEMO deste navegador.</p><label>Título / descrição<input name="title" required maxlength="120" value="'+escapeDemo(current.title||current.asset_code||"")+'"></label><div class="demo-local-form-grid"><label>Responsável<input name="responsible" value="'+escapeDemo(current.responsible||current.responsible_name||"")+'"></label><label>Data<input name="date" type="date" value="'+escapeDemo(current.date||current.work_date||dateOffset(0))+'"></label></div><div class="demo-local-form-grid"><label>Status<select name="status"><option value="active">Ativo</option><option value="scheduled">Programado</option><option value="confirmed">Confirmado</option><option value="in_progress">Em andamento</option><option value="pending">Pendente</option><option value="review">Em revisão</option><option value="completed">Concluído</option><option value="published">Publicado</option></select></label><label>Equipamento / TAG<input name="equipment" value="'+escapeDemo(current.asset_code||current.equipment||"")+'"></label></div><label>Observações<textarea name="notes" rows="4">'+escapeDemo(current.notes||current.description||current.general_notes||"")+'</textarea></label><div class="demo-local-actions"><button class="primary" type="submit">Salvar no ambiente DEMO</button><button class="light" id="demoLocalCancel" type="button">Cancelar</button></div></form>';
  const form=$("demoLocalForm");form.elements.status.value=current.status||"active";
  form.onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form).entries());const payload={...current,title:data.title.trim(),responsible:data.responsible,date:data.date,status:data.status,notes:data.notes,updated_at:new Date().toISOString()};if(currentTable==="operational_equipment"){payload.asset_code=data.equipment||data.title;payload.model=current.model||"SKT110H";payload.area_id=AREA_ID;payload.brand="SANY";payload.current_horimeter=Number(current.current_horimeter||0);}if(currentTable==="operational_mechanic_assignments"){payload.work_date=data.date;payload.responsible_name=data.responsible;payload.area_id=AREA_ID;}if(currentTable==="operational_shift_reports"){payload.report_date=data.date;payload.work_performed=data.notes;payload.area_id=AREA_ID;payload.created_by=DEMO_UID;}if(currentTable==="operational_125h_checklists"){payload.assigned_for=data.date;payload.general_notes=data.notes;payload.area_id=AREA_ID;payload.created_by=DEMO_UID;}if(currentTable==="demo_users")payload.role=data.responsible;const rows=tableRows(currentTable);if(record){const index=rows.findIndex(row=>row.id===record.id);if(index>=0)rows[index]=payload;}else rows.unshift({...payload,id:makeId("demo-record"),created_at:new Date().toISOString()});writeStore(store);renderStats();renderTable();};
  $("demoLocalCancel").onclick=renderTable;
 }
 $("demoLocalTabs").onclick=event=>{const button=event.target.closest("[data-demo-table]");if(!button)return;currentTable=button.dataset.demoTable;$("demoLocalTabs").querySelectorAll("button").forEach(item=>item.classList.toggle("active",item===button));renderTable();};
 content.onclick=event=>{const edit=event.target.closest("[data-demo-edit]"),remove=event.target.closest("[data-demo-delete]"),status=event.target.closest("[data-demo-status]");if(edit){const row=tableRows(currentTable).find(item=>item.id===edit.dataset.demoEdit);if(row)openEditor(row);return;}if(remove){if(!confirm("Excluir este registro fictício?"))return;store[currentTable]=tableRows(currentTable).filter(row=>row.id!==remove.dataset.demoDelete);writeStore(store);renderStats();renderTable();return;}if(status){const row=tableRows(currentTable).find(item=>item.id===status.dataset.demoStatus);if(row){row.status=row.status==="completed"?"in_progress":"completed";writeStore(store);renderStats();renderTable();}}};
 $("demoWorkspaceBack").onclick=()=>{$("appShell").hidden=true;$("demoSelection").hidden=false;};
 renderStats();renderTable();
}
async function openRoleDemo(role){
 $("demoSelection").hidden=true;$("appShell").hidden=false;
 const isOperationalRole=role==="supervisor_area"||role==="mecanico";
 document.querySelectorAll(".operational-main-tab").forEach(button=>button.hidden=role!=="supervisor_area");
 if(role!=="supervisor_area"&&role!=="mecanico"){openGenericRoleDemo(role);return;}
 const demoMechanic=tableRows("profiles").find(item=>item.id==="demo-mech-001");
 const demoProfile=role==="mecanico"
  ?{id:demoMechanic.id,uid:demoMechanic.id,name:demoMechanic.name,role:"mecanico",roleLabel:"Mecânico — DEMONSTRAÇÃO",active:true,operationalAreaId:AREA_ID,permissions:[]}
  :{id:DEMO_UID,uid:DEMO_UID,name:"Supervisor de Área (DEMO)",role:"supervisor_area",roleLabel:"Supervisor de Área — DEMONSTRAÇÃO",active:true,operationalAreaId:AREA_ID,permissions:[]};
 try{
  await initOperationalModule({supabase:demoBackend,profile:demoProfile,isMaster:false});
  const root=$("gestaoOperacional");
  document.querySelectorAll(".operational-main-tab").forEach(button=>button.addEventListener("click",()=>{if(root?.showOperationalSection)root.showOperationalSection(button.dataset.operationalSection);}));
  if(role==="supervisor_area"&&root?.showOperationalSection)root.showOperationalSection("overview");
  if(role==="mecanico"){
   document.querySelectorAll(".operational-main-tab").forEach(button=>{button.hidden=true;button.style.display="none";});
   document.querySelectorAll(".mechanic-main-tab").forEach(button=>button.hidden=false);
   const overview=document.querySelector('.mechanic-main-tab[data-mechanic-section="overview"]');
   overview?.click();
  }
 }catch(error){console.error("[RelatorioPro DEMO] Falha ao abrir "+role+":",error);showAccessError(error.message||"Não foi possível abrir a demonstração.");}
}
async function startDemo() {
  try {
    // Lê somente a sessão persistida no navegador. Não inicializa cliente Supabase,
    // não faz chamadas HTTP e não consulta tabelas, RPCs ou Storage.
    const raw = localStorage.getItem("sb-vwvesygsudhbaqmayhsz-auth-token");
    const stored = raw ? JSON.parse(raw) : null;
    const session = stored?.currentSession || stored;
    let userId = session?.user?.id || "";
    if (!userId && session?.access_token) {
      try {
        const payload = session.access_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
        userId = JSON.parse(atob(payload)).sub || "";
      } catch (_) {}
    }
    if (userId !== MASTER_UID) throw new Error("A Central DEMO está disponível somente no login ADMIN MASTER. Entre no sistema principal com a conta master e abra a DEMO novamente.");
    $("demoLoading").hidden = true;
    $("demoSelection").hidden = false;
  } catch (error) {
    console.error("[RelatorioPro DEMO] Falha ao validar acesso local:", error);
    showAccessError(error.message || "Não foi possível validar o acesso à demonstração.");
  }
}
document.querySelectorAll("[data-demo-role]").forEach(button=>button.addEventListener("click",()=>openRoleDemo(button.dataset.demoRole)));
$("demoProfiles").addEventListener("click",()=>{$("appShell").hidden=true;$("demoSelection").hidden=false;});

$("demoReset").addEventListener("click", () => {
  if (!confirm("Restaurar os dados fictícios iniciais? As alterações feitas neste ambiente DEMO serão descartadas.")) return;
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
});
$("demoExit").addEventListener("click", () => {
  window.location.href = "/";
});

startDemo();
