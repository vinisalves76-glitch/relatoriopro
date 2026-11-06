import { init125hMaintenanceModule } from "./maintenance-125h.js";
import { initMechanicShiftReports } from "./operational-shift-reports.js";
import { initMechanicSchedule } from "./operational-mechanic-schedule.js";

const AREA_DEFAULT = "arcelormittal-andradas";
const AREA_LABEL = "ArcelorMittal Andradas";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateTime = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
const dateOnly = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const statusLabel = value => ({available:"Produzindo",stopped:"Parado",maintenance:"Em manutenção",inactive:"Inativo",open:"Aberta",in_progress:"Em andamento",waiting:"Aguardando recurso",completed:"Concluída",cancelled:"Cancelada",low:"Baixa",normal:"Normal",high:"Alta",critical:"Crítica",preventive:"Preventiva",corrective:"Corretiva",inspection:"Inspeção",occurrence:"Ocorrência",activity:"Atividade",pending:"Pendência",impediment:"Impedimento",closure:"Encerramento"}[value] || value || "—");
const statusClass = value => ({available:"success",stopped:"danger",maintenance:"warning",inactive:"muted",open:"info",in_progress:"warning",waiting:"warning",completed:"success",cancelled:"muted",critical:"danger",high:"danger",normal:"info",low:"muted"}[value] || "info");
const maintenanceTypeLabel = value => ({preventive:"Preventiva",corrective:"Corretiva",tire_shop:"Borracharia"}[value] || "");
const equipmentStatusLabel = (status,type) => status==="maintenance" ? maintenanceTypeLabel(type)||"Em manutenção" : statusLabel(status);
const localDateTime = value => value ? new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : "";

export async function initOperationalModule({supabase, profile, isMaster: masterAccess = false}) {
  const root = document.getElementById("gestaoOperacional");
  if (!root || !supabase || !profile || profile.active === false) return;
  const liveRoot = () => document.getElementById("gestaoOperacional") || root;
  // Todos os seletores do módulo devem ficar limitados ao contêiner da Gestão Operacional.
  // document.querySelector podia perder os elementos quando a navegação substituía a página.
  const $ = selector => liveRoot().querySelector(selector);
  const isMaster = !!masterAccess || profile.role === "super_admin";
  const isSupervisor = profile.role === "supervisor_area";
  const isMechanic = profile.role === "mecanico";
  if (isMechanic) { await initMechanicShiftReports({supabase,profile,root}); return; }
  if (!isMaster && !isSupervisor) return;
  if (isSupervisor && !profile.operationalAreaId) throw new Error("Supervisor sem área operacional vinculada.");
  const fixedArea = isSupervisor ? profile.operationalAreaId : null;
  const state = {areas:[], areaId:fixedArea || AREA_DEFAULT, equipment:[], orders:[], events:[], readings:[], statusHistory:[], shiftReports:[], activities:[], controls125h:[], controls125hAvailable:false, overviewPeriod:90, busy:false};
  root.innerHTML = `
    <style>
      #gestaoOperacional .go-live-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0}
      #gestaoOperacional .go-live-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;padding:16px}
      #gestaoOperacional .go-live-card h3{margin:0 0 8px;font-size:15px}
      #gestaoOperacional .go-live-card p{margin:0;color:var(--muted,#68737d);font-size:13px}
      #gestaoOperacional .go-live-card strong{font-size:27px;display:block;margin-top:8px}
      #gestaoOperacional .go-live-table{width:100%;border-collapse:collapse;min-width:680px}
      #gestaoOperacional .go-live-table th,#gestaoOperacional .go-live-table td{padding:12px 10px;border-bottom:1px solid var(--line,#e5e9ed);text-align:left;font-size:13px;vertical-align:middle}
      #gestaoOperacional .go-live-table th{color:var(--muted,#68737d);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      #gestaoOperacional .go-live-table-wrap{overflow:auto;background:var(--panel,#fff);border:1px solid var(--line,#e5e9ed);border-radius:12px}
      #gestaoOperacional .go-live-actions{display:flex;gap:6px;flex-wrap:wrap}
      #gestaoOperacional .go-live-actions button{padding:7px 10px;font-size:12px}
      #gestaoOperacional .go-live-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #gestaoOperacional .go-live-form-grid .full{grid-column:1/-1}
      #gestaoOperacional .go-live-form-grid label{display:block;font-size:12px;font-weight:650;margin-bottom:5px}
      #gestaoOperacional .go-live-form-grid input,#gestaoOperacional .go-live-form-grid select,#gestaoOperacional .go-live-form-grid textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--surface,#fff);color:inherit}
      #gestaoOperacional .go-live-empty{padding:28px;text-align:center;color:var(--muted,#68737d)}
      #gestaoOperacional .go-live-modal{position:fixed;inset:0;z-index:10020;background:#101820a8;display:grid;place-items:center;padding:16px}
      #gestaoOperacional .go-live-dialog{width:min(680px,100%);max-height:90vh;overflow:auto;background:#fff;color:#17212b;border-radius:14px;padding:22px;box-shadow:0 20px 70px #0004}
      #gestaoOperacional .go-live-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      #gestaoOperacional .go-live-dialog-head h2{font-size:20px;margin:0}
      #gestaoOperacional .go-live-dialog-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
      #gestaoOperacional .go-live-status{display:inline-block;padding:4px 8px;border-radius:20px;background:#edf1f4;font-size:11px;font-weight:700}
      #gestaoOperacional .go-live-status.success{background:#e2f5e9;color:#17663a}#gestaoOperacional .go-live-status.warning{background:#fff2d6;color:#875600}#gestaoOperacional .go-live-status.danger{background:#ffe4e1;color:#a32b21}#gestaoOperacional .go-live-status.info{background:#e5efff;color:#28549a}
      #gestaoOperacional .go-timeline{display:grid;gap:12px;margin:12px 0}
      #gestaoOperacional .go-timeline-item{border-left:3px solid #4779a8;padding:2px 0 2px 14px}
      #gestaoOperacional .go-timeline-item p{margin:6px 0;color:#52606d;white-space:pre-wrap}
      #gestaoOperacional .go-live-dialog-foot:empty{display:none}
      #gestaoOperacional .go-live-error{padding:12px;border-radius:8px;background:#fff0ee;color:#a32b21;margin:12px 0}
      #gestaoOperacional .bi-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:8px 0 16px}
      #gestaoOperacional .bi-head h2{margin:0 0 4px;font-size:21px}
      #gestaoOperacional .bi-head p{margin:0;color:var(--muted,#68737d);font-size:13px}
      #gestaoOperacional .bi-period{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-period select{padding:8px 10px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--panel,#fff);color:inherit}
      #gestaoOperacional .bi-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
      #gestaoOperacional .bi-kpi{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:11px;padding:14px;min-width:0}
      #gestaoOperacional .bi-kpi span{display:block;font-size:12px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-kpi strong{display:block;font-size:26px;line-height:1.2;margin:7px 0 4px;font-weight:760}
      #gestaoOperacional .bi-kpi small{font-size:11px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-kpi.alert strong{color:#b42318}
      #gestaoOperacional .bi-kpi.warn strong{color:#9a6700}
      #gestaoOperacional .bi-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,1fr);gap:12px;margin:12px 0}
      #gestaoOperacional .bi-panel{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:11px;padding:15px;min-width:0}
      #gestaoOperacional .bi-panel h3{font-size:14px;margin:0 0 5px}
      #gestaoOperacional .bi-panel .bi-sub{font-size:11px;color:var(--muted,#68737d);margin:0 0 14px}
      #gestaoOperacional .bi-bars{display:grid;gap:10px}
      #gestaoOperacional .bi-bar-row{display:grid;grid-template-columns:minmax(95px,130px) 1fr 34px;align-items:center;gap:8px;font-size:12px}
      #gestaoOperacional .bi-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-bar-track{height:9px;background:var(--surface,#edf1f4);border-radius:20px;overflow:hidden}
      #gestaoOperacional .bi-bar-fill{height:100%;border-radius:20px;background:#4779a8}
      #gestaoOperacional .bi-bar-fill.danger{background:#c54d42}
      #gestaoOperacional .bi-bar-fill.warning{background:#d69a27}
      #gestaoOperacional .bi-bar-fill.success{background:#3b9870}
      #gestaoOperacional .bi-bar-value{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
      #gestaoOperacional .bi-table{width:100%;border-collapse:collapse;min-width:600px}
      #gestaoOperacional .bi-table th,#gestaoOperacional .bi-table td{padding:10px 8px;border-bottom:1px solid var(--line,#e5e9ed);font-size:12px;text-align:left}
      #gestaoOperacional .bi-table th{font-size:10px;text-transform:uppercase;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-note{font-size:11px;color:var(--muted,#68737d);padding:10px 12px;border-radius:8px;background:var(--surface,#f5f7f9);margin-top:12px}
      #gestaoOperacional .bi-empty{padding:16px;text-align:center;color:var(--muted,#68737d);font-size:12px}
      #gestaoOperacional .bi-pie-wrap{display:flex;align-items:center;gap:20px;min-height:180px;flex-wrap:wrap}
      #gestaoOperacional .bi-pie{width:158px;height:158px;flex:0 0 158px;border-radius:50%;position:relative;background:conic-gradient(#dce3e9 0 100%)}
      #gestaoOperacional .bi-pie:after{content:"";position:absolute;inset:29px;border-radius:50%;background:var(--panel,#fff);box-shadow:0 0 0 1px var(--line,#e5e9ed)}
      #gestaoOperacional .bi-pie-center{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}
      #gestaoOperacional .bi-pie-center strong{font-size:25px;line-height:1.1}
      #gestaoOperacional .bi-pie-center span{font-size:10px;color:var(--muted,#68737d);margin-top:3px}
      #gestaoOperacional .bi-legend{display:grid;gap:9px;flex:1;min-width:145px}
      #gestaoOperacional .bi-legend-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}
      #gestaoOperacional .bi-legend-label{display:flex;align-items:center;gap:7px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-dot{width:9px;height:9px;border-radius:3px;display:inline-block;flex:0 0 9px}
      #gestaoOperacional .bi-section-title{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin:22px 0 10px}
      #gestaoOperacional .bi-section-title h3{margin:0;font-size:16px}
      #gestaoOperacional .bi-section-title p{margin:3px 0 0;font-size:11px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #gestaoOperacional .bi-metric{border:1px solid var(--line,#dfe4e8);background:var(--panel,#fff);border-radius:11px;padding:14px;min-width:0}
      #gestaoOperacional .bi-metric .bi-metric-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
      #gestaoOperacional .bi-metric strong{font-size:23px;display:block;margin:9px 0 4px}
      #gestaoOperacional .bi-metric span{font-size:11px;color:var(--muted,#68737d)}
      #gestaoOperacional .bi-metric small{font-size:10px;color:var(--muted,#68737d);display:block;line-height:1.45}
      #gestaoOperacional .bi-tag{font-size:9px;padding:4px 7px;border-radius:20px;background:#fff2d6;color:#875600;font-weight:750;white-space:nowrap}
      @media(max-width:900px){#gestaoOperacional .bi-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){#gestaoOperacional .bi-pie-wrap{justify-content:center;gap:12px}#gestaoOperacional .bi-pie{width:136px;height:136px;flex-basis:136px}#gestaoOperacional .bi-metric-grid{grid-template-columns:1fr}}

      @media(max-width:900px){#gestaoOperacional .bi-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#gestaoOperacional .bi-layout{grid-template-columns:1fr}}
      @media(max-width:480px){#gestaoOperacional .bi-kpi{padding:11px}#gestaoOperacional .bi-kpi strong{font-size:22px}#gestaoOperacional .bi-bar-row{grid-template-columns:92px 1fr 26px;gap:6px}}

      @media(max-width:600px){#gestaoOperacional .go-live-form-grid{grid-template-columns:1fr}#gestaoOperacional .go-live-form-grid .full{grid-column:auto}#gestaoOperacional .go-live-dialog{padding:16px}}
    </style>
    <div class="go-page-head"><h1>Gestão Operacional</h1></div>
    <div id="goLiveFeedback" role="status" aria-live="polite"></div>
        <section class="go-panel active" data-live-panel="overview"><div id="goLiveOverview"></div></section>
        <section class="go-panel" data-live-panel="equipment" hidden>
      <div class="go-section-heading"><div><h2>Equipamentos</h2><p>Cadastro, situação operacional e horímetros.</p></div><button class="primary" type="button" id="goLiveAddEquipment">＋ Cadastrar equipamento</button></div>
      <div class="go-filters"><input id="goLiveEquipmentSearch" type="search" placeholder="Buscar TAG do equipamento, modelo ou descrição"><select id="goLiveEquipmentStatus"><option value="">Todos os status</option><option value="available">Produzindo</option><option value="stopped">Parado</option><option value="maintenance">Em manutenção</option><option value="inactive">Inativo</option></select></div>
      <div class="go-table-wrap"><table class="go-table go-live-table"><thead><tr><th>TAG do equipamento</th><th>Equipamento</th><th>Horímetro</th><th>Status</th><th>Ações</th></tr></thead><tbody id="goLiveEquipmentRows"></tbody></table></div>
    </section>
    <section class="go-panel" data-live-panel="maintenance125" hidden><div id="goLive125h"></div></section>
    <section class="go-panel" data-live-panel="mechanicSchedule" hidden><div id="goLiveMechanicSchedule"></div></section>
    <section class="go-panel" data-live-panel="events" hidden>
      <div class="go-section-heading"><div><h2>Relatórios de final de turno</h2><p>Um relatório por equipamento e data, com identificação do responsável e participantes.</p></div><button class="primary" type="button" id="goLiveAddEvent">＋ Registrar relatório de final de turno</button></div>
      <div class="go-table-wrap"><table class="go-table go-live-table"><thead><tr><th>Data</th><th>Equipamento</th><th>Responsável</th><th>Horímetro</th><th>Condição final</th><th>Serviços realizados</th></tr></thead><tbody id="goLiveEventRows"></tbody></table></div>
    </section>
    <div id="goLiveModalHost"></div>
  `;
  const reportTab=document.querySelector('.operational-main-tab[data-operational-section="events"]');
  if(reportTab){reportTab.hidden=false;reportTab.style.display="";}
  const scheduleTab=document.querySelector('.operational-main-tab[data-operational-section="mechanicSchedule"]');
  if(scheduleTab){scheduleTab.hidden=!isSupervisor;scheduleTab.style.display=isSupervisor?"":"none";}
  if(isSupervisor) await initMechanicSchedule({supabase,profile,areaId:fixedArea||AREA_DEFAULT,root:$("#goLiveMechanicSchedule")});
  const setFeedback = (message, error=false) => { const el=$("#goLiveFeedback"); if(el){el.textContent=message;el.classList.toggle("go-live-error",error);} };
  const areaLabel = id => state.areas.find(a=>a.id===id)?.name || (id===AREA_DEFAULT?AREA_LABEL:id);
  const activeArea = () => state.areas.find(a=>a.id===state.areaId);
  const switchTab = name => {
    liveRoot().querySelectorAll("[data-live-panel]").forEach(p=>{const active=p.dataset.livePanel===name;p.hidden=!active;p.classList.toggle("active",active)});
    document.querySelectorAll(".operational-main-tab").forEach(b=>b.classList.toggle("active",b.dataset.operationalSection===name));
  };
  liveRoot().showOperationalSection = switchTab;
  async function loadData() {
    if(state.busy)return;
    state.busy=true;
    try {
      if(!state.areas.length){
        // A interface atual trabalha com a área inicial única. Não consulta
        // operational_areas: isso evita depender de GRANT SELECT nessa tabela
        // para montar a tela. O acesso aos dados continua protegido pelas RLS
        // das tabelas operacionais, sempre filtradas pela área vinculada.
        const resolvedAreaId=fixedArea||AREA_DEFAULT;
        state.areas=[{id:resolvedAreaId,name:resolvedAreaId===AREA_DEFAULT?AREA_LABEL:resolvedAreaId,active:true}];
        if(!state.areas.some(a=>a.id===state.areaId))state.areaId=resolvedAreaId;
      }
      const area=activeArea();
      if(!area)throw new Error("Área operacional não encontrada ou inativa.");
      const [equipment,events,readings,statusHistory,shiftReports]=await Promise.all([
        supabase.from("operational_equipment").select("*").eq("area_id",state.areaId).order("asset_code"),
        supabase.from("operational_maintenance_events").select("*").eq("area_id",state.areaId).order("occurred_at",{ascending:false}),
        supabase.from("operational_horimeter_readings").select("*").eq("area_id",state.areaId).order("recorded_at",{ascending:false}),
        supabase.from("operational_equipment_status_history").select("*").eq("area_id",state.areaId).order("changed_at",{ascending:false}),
        supabase.from("operational_shift_reports").select("*").eq("area_id",state.areaId).order("report_date",{ascending:false})
      ]);
      // O banco principal é o ambiente de trabalho. Caso as tabelas auxiliares
      // de histórico ainda não existam, mantém a Gestão Operacional disponível
      // com os dados operacionais existentes, sem bloquear o módulo.
      for(const result of [equipment,events,readings])if(result.error)throw result.error;
      for(const result of [statusHistory,shiftReports]){
        if(result.error && !["PGRST205","42P01"].includes(result.error.code))throw result.error;
      }
      state.equipment=equipment.data||[];state.orders=[];state.events=events.data||[];state.readings=readings.data||[];
      state.statusHistory=statusHistory.error?[]:(statusHistory.data||[]);
      state.shiftReports=shiftReports.error?[]:(shiftReports.data||[]);
      state.activities=[];
      const controls125h = await supabase.from("operational_125h_control").select("equipment_id,last_service_horimeter,interval_hours,enabled").eq("area_id",state.areaId);
      state.controls125hAvailable=!controls125h.error;
      state.controls125h=controls125h.error?[]:(controls125h.data||[]);
      render();
      setFeedback("");
    } catch(error) { setFeedback(error.message||"Falha ao carregar dados operacionais.",true); throw error; }
    finally { state.busy=false; }
  }
  const equipmentName = id => {const e=state.equipment.find(x=>x.id===id);return e?[e.asset_code,e.model].filter(Boolean).join(" · "):"Equipamento não localizado";};
  function render() {

    const activeEquipment=state.equipment.filter(e=>e.status!=="inactive");
    const available=activeEquipment.filter(e=>e.status==="available").length;
    const stopped=activeEquipment.filter(e=>["stopped","maintenance"].includes(e.status)).length;
    const due125=state.controls125h.filter(c=>c.enabled&&activeEquipment.some(e=>e.id===c.equipment_id)&&Number(c.last_service_horimeter||0)+Number(c.interval_hours||125)-Number(activeEquipment.find(e=>e.id===c.equipment_id)?.current_horimeter||0)<=25);
    const overdue125=due125.filter(c=>Number(c.last_service_horimeter||0)+Number(c.interval_hours||125)-Number(activeEquipment.find(e=>e.id===c.equipment_id)?.current_horimeter||0)<=0).length;
    const periodStart=new Date();periodStart.setDate(periodStart.getDate()-state.overviewPeriod);
    const periodEvents=state.events.filter(e=>e.occurred_at&&new Date(e.occurred_at)>=periodStart);

    const eventTypes=[["preventive","Preventivas","#31966b"],["corrective","Corretivas","#d45b50"],["inspection","Inspeções","#4779a8"],["occurrence","Ocorrências","#d69a27"]];
    const equipmentTypes=[["available","Produzindo","#31966b"],["stopped","Parados","#d45b50"],["maintenance","Em manutenção","#d69a27"]];
    const pieData=(items,source,key)=>items.map(([value,label,color])=>({label,color,count:source.filter(x=>x[key]===value).length})).filter(x=>x.count>0);
    const eventPie=pieData(eventTypes,periodEvents,"event_type");
    const equipmentPie=pieData(equipmentTypes,activeEquipment,"status");

    const pieMarkup=(items,total,label)=>{let cursor=0;const slices=items.map(x=>{const from=cursor;cursor+=total?x.count/total*100:0;return x.color+" "+from+"% "+cursor+"%";}).join(", ")||"#dce3e9 0% 100%";return '<div class="bi-pie-wrap"><div class="bi-pie" style="background:conic-gradient('+slices+')"><div class="bi-pie-center"><strong>'+total+'</strong><span>'+label+'</span></div></div><div class="bi-legend">'+(items.length?items.map(x=>'<div class="bi-legend-row"><span class="bi-legend-label"><i class="bi-dot" style="background:'+x.color+'"></i>'+x.label+'</span><strong>'+x.count+' · '+(total?Math.round(x.count/total*100):0)+'%</strong></div>').join(""):'<div class="bi-empty">Sem registros no período.</div>')+'</div></div>';};
    const metricCards=[
      {name:"Disponibilidade física",value:"—",tag:"Dados insuficientes",detail:"Exige horas programadas e horas efetivamente disponíveis por equipamento e turno."},
      {name:"MTBF · Tempo entre falhas",value:"—",tag:"Dados insuficientes",detail:"Exige horas de operação acumuladas e registro confiável de cada falha."},
      {name:"MTTR · Tempo médio de reparo",value:"—",tag:"Dados insuficientes",detail:"Exige início e término de cada intervenção corretiva."},
      {name:"Downtime · Horas paradas",value:"—",tag:"Dados insuficientes",detail:"Exige apontamento de início e fim da parada e classificação do motivo."},
      {name:"Cumprimento preventivo",value:"—",tag:"Dados insuficientes",detail:"Exige plano preventivo previsto e ordens preventivas concluídas no período."},
    ];
    const attention=activeEquipment.map(e=>{
      const reason=e.status==="stopped"?"Equipamento parado":e.status==="maintenance"?"Em manutenção":"";
      return {e,reason,rank:e.status==="stopped"?1:e.status==="maintenance"?2:9};
    }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank).slice(0,8);
    const periodLabel=state.overviewPeriod+" dias";
    $("#goLiveOverview").innerHTML=`
      <div class="bi-head"><div><h2>Painel de manutenção</h2><p>${esc(areaLabel(state.areaId))}</p></div><label class="bi-period">Período de análise <select id="biPeriod"><option value="30" ${state.overviewPeriod===30?"selected":""}>Últimos 30 dias</option><option value="90" ${state.overviewPeriod===90?"selected":""}>Últimos 90 dias</option><option value="180" ${state.overviewPeriod===180?"selected":""}>Últimos 180 dias</option></select></label></div>
      <div class="bi-kpis">
        <article class="bi-kpi"><span>Frota ativa</span><strong>${activeEquipment.length}</strong><small>${state.equipment.length-activeEquipment.length} inativos / fora de operação</small></article>
        <article class="bi-kpi ${stopped?"alert":""}"><span>Parados ou em manutenção</span><strong>${stopped}</strong><small>${activeEquipment.length?Math.round(stopped/activeEquipment.length*100):0}% da frota ativa</small></article>
        <article class="bi-kpi"><span>Produzindo</span><strong>${available}</strong><small>${activeEquipment.length?Math.round(available/activeEquipment.length*100):0}% da frota ativa com status produzindo</small></article>
        <article class="bi-kpi ${due125.length?"warn":""}"><span>Preventivas 125h próximas</span><strong>${state.controls125hAvailable?due125.length:"—"}</strong><small>${state.controls125hAvailable?overdue125+" vencidas · "+(due125.length-overdue125)+" próximas":"Controle 125h não consultado"}</small></article>
        <article class="bi-kpi"><span>Eventos no período</span><strong>${periodEvents.length}</strong><small>Registros de manutenção e ocorrências</small></article>
        <article class="bi-kpi"><span>Leituras de horímetro</span><strong>${state.readings.length}</strong><small>Registros disponíveis no histórico</small></article>
      </div>

      <div class="bi-section-title"><div><h3>Distribuição da operação</h3><p>Visão proporcional da frota e das intervenções</p></div></div>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Status da frota</h3><p class="bi-sub">Equipamentos ativos · situação cadastrada</p>${pieMarkup(equipmentPie,activeEquipment.length,"equipamentos")}<div class="bi-note">Este gráfico representa o status informado no cadastro, não substitui o cálculo de disponibilidade física.</div></section>
      </div>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Tipos de intervenção</h3><p class="bi-sub">Eventos registrados nos últimos ${periodLabel.toLowerCase()}</p>${pieMarkup(eventPie,periodEvents.length,"eventos")}<div class="bi-note">A classificação depende do preenchimento correto do tipo de evento.</div></section>
      </div>
      <div class="bi-section-title"><div><h3>Indicadores de desempenho da manutenção</h3><p>KPIs de gestão da frota e confiabilidade</p></div></div>
      <div class="bi-metric-grid">${metricCards.map(m=>'<article class="bi-metric"><div class="bi-metric-top"><span>'+m.name+'</span><i class="bi-tag">'+m.tag+'</i></div><strong>'+m.value+'</strong><small>'+m.detail+'</small></article>').join("")}</div>
      <div class="bi-note">Indicadores marcados como dados insuficientes ainda não podem ser calculados com rigor a partir dos registros atuais. A próxima etapa é implantar apontamento de disponibilidade, paradas e planejamento preventivo.</div>
      <section class="bi-panel"><h3>Equipamentos que exigem atenção</h3><p class="bi-sub">Equipamentos parados ou em manutenção</p>
        ${attention.length?'<div class="go-live-table-wrap"><table class="bi-table"><thead><tr><th>Equipamento</th><th>Status</th><th>Motivo</th></tr></thead><tbody>'+attention.map(x=>'<tr><td><strong>'+esc(x.e.asset_code)+'</strong><br><small>'+esc([x.e.model].filter(Boolean).join(" · "))+'</small></td><td><span class="go-live-status '+statusClass(x.e.status)+'">'+esc(equipmentStatusLabel(x.e.status,x.e.maintenance_type))+'</span></td><td>'+esc(x.reason)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="bi-empty">Nenhum equipamento parado ou em manutenção.</div>'}
      </section>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Movimentações recentes</h3><p class="bi-sub">Últimos registros de manutenção e ocorrência</p>
          ${state.events.slice(0,6).length?'<div class="go-live-table-wrap"><table class="bi-table"><thead><tr><th>Data</th><th>Equipamento</th><th>Tipo</th><th>Registro</th></tr></thead><tbody>'+state.events.slice(0,6).map(e=>'<tr><td>'+esc(dateOnly(e.occurred_at))+'</td><td>'+esc(equipmentName(e.equipment_id))+'</td><td>'+esc(statusLabel(e.event_type))+'</td><td>'+esc(e.description)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="bi-empty">Sem movimentações registradas.</div>'}
        </section>
        <section class="bi-panel"><h3>Leitura gerencial</h3><p class="bi-sub">Pontos de atenção sobre a qualidade dos indicadores</p>
          <div class="bi-bars">
            <div class="bi-bar-row"><span class="bi-bar-label">Produzindo</span><div class="bi-bar-track"><div class="bi-bar-fill success" style="width:${activeEquipment.length?available/activeEquipment.length*100:0}%"></div></div><strong class="bi-bar-value">${available}</strong></div>
            <div class="bi-bar-row"><span class="bi-bar-label">Parados / manutenção</span><div class="bi-bar-track"><div class="bi-bar-fill danger" style="width:${activeEquipment.length?stopped/activeEquipment.length*100:0}%"></div></div><strong class="bi-bar-value">${stopped}</strong></div>
          </div>
          <div class="bi-note">A taxa acima é baseada no status cadastrado. Para calcular disponibilidade física, MTBF, MTTR e horas de downtime com rigor, precisamos registrar início/fim das paradas, horas programadas e horímetro por turno.</div>
        </section>
      </div>
    `;
    $("#biPeriod").addEventListener("change",event=>{state.overviewPeriod=Number(event.target.value)||90;render();});
    const term=($("#goLiveEquipmentSearch")?.value||"").toLocaleLowerCase("pt-BR"),status=$("#goLiveEquipmentStatus")?.value||"";
    const equipment=state.equipment.filter(e=>(!status||e.status===status)&&(!term||[e.asset_code,e.description,e.model].join(" ").toLocaleLowerCase("pt-BR").includes(term)));
    $("#goLiveEquipmentRows").innerHTML=equipment.length?equipment.map(e=>'<tr><td><strong>'+esc(e.asset_code)+'</strong></td><td>'+esc([e.model,e.description].filter(Boolean).join(" · "))+'</td><td>'+Number(e.current_horimeter||0).toLocaleString("pt-BR")+' h</td><td><span class="go-live-status '+statusClass(e.status)+'">'+esc(equipmentStatusLabel(e.status,e.maintenance_type))+'</span></td><td><div class="go-live-actions"><button type="button" class="light" data-equipment-history="'+e.id+'">Histórico</button><button type="button" class="light" data-change-equipment-status="'+e.id+'">Alterar status</button><button type="button" class="light" data-edit-equipment="'+e.id+'">Editar</button><button type="button" class="light" data-add-reading="'+e.id+'">Horímetro</button></div></td></tr>').join(""):'<tr><td colspan="5" class="go-live-empty">Nenhum equipamento encontrado.</td></tr>';
    $("#goLiveEventRows").innerHTML=state.shiftReports.length?state.shiftReports.map(r=>'<tr><td>'+esc(new Date(r.report_date+"T12:00:00").toLocaleDateString("pt-BR"))+'</td><td>'+esc(equipmentName(r.equipment_id))+'</td><td>'+esc(r.created_by_name||"Não identificado")+(r.other_mechanics?.length?'<small>Participantes: '+esc(r.other_mechanics.join(", "))+'</small>':"")+'</td><td>'+Number(r.horimeter||0).toLocaleString("pt-BR")+' h</td><td>'+esc(({available:"Disponível",stopped:"Parado",maintenance:"Em manutenção"})[r.final_condition]||r.final_condition)+'</td><td>'+esc(r.work_performed)+'</td></tr>').join(""):'<tr><td colspan="6" class="go-live-empty">Nenhum relatório de final de turno registrado.</td></tr>';
  }
  function openModal(title,body,submitLabel="Salvar",hasForm=true) {
    const footer=hasForm?'<button type="button" class="light" data-close-live-modal>Cancelar</button><button type="submit" form="goLiveForm" class="primary">'+esc(submitLabel)+'</button>':'<button type="button" class="light" data-close-live-modal>Fechar</button>';
    $("#goLiveModalHost").innerHTML='<div class="go-live-modal" role="presentation"><section class="go-live-dialog" role="dialog" aria-modal="true"><div class="go-live-dialog-head"><h2>'+esc(title)+'</h2><button type="button" class="light" data-close-live-modal>Fechar</button></div>'+body+'<div class="go-live-dialog-foot">'+footer+'</div></section></div>';
    $("#goLiveModalHost .go-live-modal").addEventListener("click",e=>{if(e.target.classList.contains("go-live-modal")||e.target.closest("[data-close-live-modal]"))$("#goLiveModalHost").innerHTML="";});
    if(hasForm)$("#goLiveForm").addEventListener("submit",submitForm);
  }
  const field=(label,name,value="",type="text",required=true)=>'<div><label for="live_'+name+'">'+esc(label)+'</label><input id="live_'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?"required":"")+'></div>';
  const selectField=(label,name,options,value)=>'<div><label for="live_'+name+'">'+esc(label)+'</label><select id="live_'+name+'" name="'+name+'">'+options.map(o=>'<option value="'+esc(o[0])+'" '+(o[0]===value?"selected":"")+'>'+esc(o[1])+'</option>').join("")+'</select></div>';
  function equipmentForm(item={}) {
    const creationFields=item.id?"":selectField("Condição inicial","status",[["available","Produzindo"],["stopped","Parado"],["maintenance","Em manutenção"],["inactive","Inativo"]],item.status||"available")+selectField("Tipo de manutenção inicial","maintenance_type",[["","Não se aplica"],["preventive","Preventiva"],["corrective","Corretiva"],["tire_shop","Borracharia"]],"")+field("Motivo da condição inicial","initial_reason","Cadastro inicial")+ '<div class="full"><label for="live_initial_notes">Observações iniciais</label><textarea id="live_initial_notes" name="initial_notes" rows="2"></textarea></div>';
    openModal(item.id?"Editar equipamento":"Cadastrar equipamento",'<form id="goLiveForm"><div class="go-live-form-grid">'+field("TAG do equipamento","asset_code",item.asset_code||"")+field("Descrição","description",item.description||"")+field("Modelo","model",item.model||"")+selectField("Categoria","category",[["caminhao","Caminhão"],["escavadeira","Escavadeira"],["carregadeira","Carregadeira"],["trator","Trator"],["outro","Outro"]],item.category||"caminhao")+creationFields+field("Horímetro atual (h)","current_horimeter",item.current_horimeter??0,"number")+ '<input type="hidden" name="record_id" value="'+esc(item.id||"")+'"></div></form>');
  }
  function orderForm(item={}) {
    const options=state.equipment.filter(e=>e.status!=="inactive").map(e=>[e.id,e.asset_code+" · "+[e.model].filter(Boolean).join(" " )]);
    if(!options.length){setFeedback("Cadastre um equipamento antes de abrir uma OS.",true);switchTab("equipment");return;}
    openModal(item.id?"Atualizar ordem de serviço":"Abrir ordem de serviço",'<form id="goLiveForm"><div class="go-live-form-grid">'+selectField("Equipamento","equipment_id",options,item.equipment_id||options[0][0])+selectField("Tipo de manutenção","maintenance_type",[["","Selecione"],["preventive","Preventiva"],["corrective","Corretiva"]],item.maintenance_type||"")+field("Título da intervenção","title",item.title||"")+field("Responsável","responsible_name",item.responsible_name||"")+field("Previsão de conclusão","expected_completion_at",localDateTime(item.expected_completion_at),"datetime-local",false)+'<div class="full"><label for="live_diagnosis">Diagnóstico</label><textarea id="live_diagnosis" name="diagnosis" rows="3">'+esc(item.diagnosis||"")+'</textarea></div><div class="full"><label for="live_description">Descrição da ocorrência</label><textarea id="live_description" name="description" rows="3">'+esc(item.description||"")+'</textarea></div>'+selectField("Prioridade","priority",[["low","Baixa"],["normal","Normal"],["high","Alta"],["critical","Crítica"]],item.priority||"normal")+selectField("Status","status",[["open","Aberta"],["in_progress","Em andamento"],["waiting","Aguardando recurso"],["cancelled","Cancelada"]],item.status==="completed"?"open":item.status||"open")+'<input type="hidden" name="record_id" value="'+esc(item.id||"")+'"></div></form>');
  }
  function equipmentHistory(item) {
    const history=state.statusHistory.filter(entry=>entry.equipment_id===item.id);
    const timeline=history.length?'<div class="go-timeline">'+history.map(entry=>'<article class="go-timeline-item"><strong>'+(entry.previous_status?esc(equipmentStatusLabel(entry.previous_status,""))+' → ':'Condição inicial · ')+esc(equipmentStatusLabel(entry.new_status,entry.maintenance_type))+'</strong><div>'+esc(dateTime(entry.changed_at))+' · '+esc(entry.source==="initial_snapshot"?"Registro de implantação":entry.source==="legacy_application"?(entry.actor_name||"Versão anterior da aplicação"):(entry.actor_name||"Usuário não identificado"))+'</div><p>'+esc(entry.reason)+'</p>'+(entry.work_order_id?'<small>OS '+esc(state.orders.find(order=>order.id===entry.work_order_id)?.order_number||"vinculada")+'</small>':'')+(entry.notes?'<p>'+esc(entry.notes)+'</p>':'')+'</article>').join("")+'</div>':'<p class="go-live-empty">Ainda não há transições de status registradas.</p>';
    const reports=state.shiftReports.filter(report=>report.equipment_id===item.id);
    const reportTimeline=reports.length?'<div class="go-timeline">'+reports.map(report=>'<article class="go-timeline-item"><strong>Relatório de final de turno · '+esc(new Date(report.report_date+"T12:00:00").toLocaleDateString("pt-BR"))+'</strong><div>Preenchido por '+esc(report.created_by_name||"Mecânico")+' · Horímetro '+esc(report.horimeter)+' h</div><p><strong>Serviços:</strong> '+esc(report.work_performed)+'</p>'+(report.other_mechanics?.length?'<p><strong>Participantes:</strong> '+esc(report.other_mechanics.join(", "))+'</p>':'')+(report.anomalies?'<p><strong>Anormalidades:</strong> '+esc(report.anomalies)+'</p>':'')+(report.actions_taken?'<p><strong>Ações:</strong> '+esc(report.actions_taken)+'</p>':'')+(report.pending_items?'<p><strong>Pendências:</strong> '+esc(report.pending_items)+'</p>':'')+'<p><strong>Condição final:</strong> '+esc(equipmentStatusLabel(report.final_condition,""))+'</p>'+(report.final_condition_notes?'<p>'+esc(report.final_condition_notes)+'</p>':'')+'</article>').join("")+'</div>':'<p class="go-live-empty">Ainda não há relatórios de final de turno para esta TAG.</p>';
    openModal("Histórico operacional · "+item.asset_code,'<p>Status atual: <strong>'+esc(equipmentStatusLabel(item.status,item.maintenance_type))+'</strong></p><h3>Histórico de status</h3>'+timeline+'<h3>Relatórios de final de turno</h3>'+reportTimeline+'<button type="button" class="primary" data-change-equipment-status="'+item.id+'">Alterar status</button>',"",false);
  }
  function equipmentStatusForm(item) {
    
    
    openModal("Alterar status · "+item.asset_code,'<form id="goLiveForm"><div class="go-live-form-grid">'+selectField("Novo status","new_status",[["available","Produzindo"],["stopped","Parado"],["maintenance","Em manutenção"],["inactive","Inativo"]],item.status)+selectField("Tipo de manutenção","maintenance_type",[["","Não se aplica"],["preventive","Preventiva"],["corrective","Corretiva"],["tire_shop","Borracharia"]],item.maintenance_type||"")+field("Motivo da alteração","reason","")+ '<input type="hidden" name="status_equipment_id" value="'+esc(item.id)+'"><div class="full"><label for="live_notes">Observações</label><textarea id="live_notes" name="notes" rows="3"></textarea></div></div></form>');
  }
  function activityForm(order,type="activity",previous=null) {
    const labels={activity:"Registrar atividade",pending:"Registrar pendência",impediment:"Registrar impedimento"};
    const formTitle=previous?"Atualizar registro":"Registrar "+(labels[type]||"atividade").replace("Registrar ","").toLowerCase();
    const typeField=previous?'<p>Atualização de '+esc(labels[previous.activity_type]||"registro")+'</p><input type="hidden" name="activity_type" value="'+esc(previous.activity_type)+'">':selectField("Tipo de registro","activity_type",[["activity","Atividade"],["pending","Pendência"],["impediment","Impedimento"]],type);
    const started=localDateTime(previous?.started_at)||(!previous?new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):"");
    openModal(formTitle,'<form id="goLiveForm"><div class="go-live-form-grid">'+typeField+field("Título","title",previous?.title||"")+field("Responsável pelo acompanhamento","responsible_name",previous?.responsible_name||"", "text",false)+selectField("Situação","activity_status",[["open","Aberta"],["in_progress","Em andamento"],["completed","Concluída"],["blocked","Impedida"]],previous?.status||(type==="impediment"?"blocked":"open"))+field("Início","started_at",started,"datetime-local",false)+field("Término","ended_at",localDateTime(previous?.ended_at),"datetime-local",false)+'<div class="full"><label for="live_description">Descrição do serviço / impedimento</label><textarea id="live_description" name="description" rows="3" required>'+esc(previous?.description||"")+'</textarea></div><div class="full"><label for="live_notes">Observações</label><textarea id="live_notes" name="notes" rows="2">'+esc(previous?.notes||"")+'</textarea></div><input type="hidden" name="activity_order_id" value="'+esc(order.id)+'"><input type="hidden" name="supersedes_id" value="'+esc(previous?.id||"")+'"></div></form>');
  }
  function orderDetails(order) {
    const activities=state.activities.filter(activity=>activity.work_order_id===order.id);
    const active=!["completed","cancelled"].includes(order.status);
    const superseded=new Set(activities.map(activity=>activity.supersedes_id).filter(Boolean));
    const timeline=activities.length?'<div class="go-timeline">'+activities.map(activity=>'<article class="go-timeline-item"><strong>'+esc(activity.supersedes_id?"Atualização de ":"")+esc(statusLabel(activity.activity_type))+' · '+esc(activity.title)+'</strong><div>'+esc(dateTime(activity.created_at))+' · '+esc(activity.created_by_name||"Usuário não identificado")+'</div><p>'+esc(activity.description)+'</p><small>'+esc(activity.status==="blocked"?"Impedida":statusLabel(activity.status))+(activity.responsible_name?" · Responsável: "+esc(activity.responsible_name):"")+'</small>'+(activity.notes?'<p>'+esc(activity.notes)+'</p>':'')+(active&&activity.activity_type!=="closure"&&!superseded.has(activity.id)?'<button type="button" class="light" data-update-order-activity="'+activity.id+'">Atualizar</button>':'')+'</article>').join("")+'</div>':'<p class="go-live-empty">Nenhuma atividade registrada.</p>';
    const actions=active?'<div class="go-live-actions"><button type="button" class="light" data-add-order-activity="'+order.id+'">Adicionar atividade</button><button type="button" class="light" data-add-order-pending="'+order.id+'">Registrar pendência</button><button type="button" class="light" data-add-order-impediment="'+order.id+'">Registrar impedimento</button><button type="button" class="primary" data-close-order="'+order.id+'">Encerrar OS</button></div>':'';
    openModal("Acompanhamento · "+order.order_number,'<p><strong>'+esc(equipmentName(order.equipment_id))+'</strong> · '+esc(statusLabel(order.status))+'</p><p>'+esc(order.diagnosis||order.description)+'</p><p>Responsável: '+esc(order.responsible_name||"Não informado")+' · Previsão: '+esc(dateTime(order.expected_completion_at))+'</p><h3>Atividades, pendências e impedimentos</h3>'+timeline+actions,"",false);
  }
  function closeOrderForm(order) {
    openModal("Encerrar OS · "+order.order_number,'<form id="goLiveForm"><div class="go-live-form-grid"><div class="full"><label for="live_closure_notes">Atividades concluídas</label><textarea id="live_closure_notes" name="closure_notes" rows="4" required></textarea></div><div class="full"><label for="live_remaining_pending">Pendências restantes</label><textarea id="live_remaining_pending" name="remaining_pending" rows="3"></textarea></div><div class="full"><label><input type="checkbox" name="release_equipment"> Confirmo explicitamente a liberação do equipamento para operação</label></div><div class="full"><label for="live_release_reason">Motivo da liberação (obrigatório se liberado)</label><textarea id="live_release_reason" name="release_reason" rows="2"></textarea></div><input type="hidden" name="close_order_id" value="'+esc(order.id)+'"></div></form>',"Confirmar encerramento");
  }
  function eventForm() {
    const equipmentOptions=state.equipment.filter(e=>e.status!=="inactive").map(e=>[e.id,e.asset_code+" · "+[e.model].filter(Boolean).join(" ")]);
    if(!equipmentOptions.length){setFeedback("Cadastre um equipamento antes de registrar manutenção ou ocorrência.",true);switchTab("equipment");return;}
    
    openModal("Registrar manutenção ou ocorrência",'<form id="goLiveForm"><div class="go-live-form-grid">'+selectField("Equipamento","equipment_id",equipmentOptions,equipmentOptions[0][0])+selectField("Tipo de evento","event_type",[["preventive","Preventiva"],["corrective","Corretiva"],["inspection","Inspeção"],["occurrence","Ocorrência"]],"occurrence")+'<div><label for="live_occurred_at">Data e hora</label><input id="live_occurred_at" name="occurred_at" type="datetime-local" value="'+new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)+'" required></div><div class="full"><label for="live_description">Descrição / registro</label><textarea id="live_description" name="description" rows="4" required></textarea></div></div></form>');
  }
  function shiftReportForm() {
    const equipmentOptions=state.equipment.filter(e=>e.status!=="inactive").map(e=>[e.id,e.asset_code+" · "+[e.model].filter(Boolean).join(" ")]);
    if(!equipmentOptions.length){setFeedback("Não há equipamentos ativos nesta área.",true);switchTab("equipment");return;}
    const date=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
    openModal("Registrar relatório de final de turno",'<form id="goLiveForm"><input type="hidden" name="shift_report" value="1"><div class="go-live-form-grid">'+selectField("Equipamento / TAG","equipment_id",equipmentOptions,equipmentOptions[0][0])+'<div><label for="live_report_date">Data do trabalho</label><input id="live_report_date" name="report_date" type="date" value="'+date+'" required></div>'+field("Horímetro","horimeter",state.equipment.find(e=>e.id===equipmentOptions[0][0])?.current_horimeter||0,"number")+'<div><label for="live_other_mechanics">Mecânicos participantes</label><input id="live_other_mechanics" name="other_mechanics" placeholder="Separe os nomes por vírgula"></div><div class="full"><label for="live_work_performed">Serviços realizados</label><textarea id="live_work_performed" name="work_performed" rows="3" required></textarea></div><div class="full"><label for="live_anomalies">Problemas / anormalidades</label><textarea id="live_anomalies" name="anomalies" rows="2"></textarea></div><div class="full"><label for="live_actions_taken">Ações executadas</label><textarea id="live_actions_taken" name="actions_taken" rows="2"></textarea></div><div class="full"><label for="live_pending_items">Pendências para o próximo turno</label><textarea id="live_pending_items" name="pending_items" rows="2"></textarea></div>'+selectField("Condição final","final_condition",[["available","Disponível para operação"],["stopped","Parado"],["maintenance","Permanece em manutenção"]],"available")+'<div><label for="live_final_condition_notes">Observações da condição final</label><input id="live_final_condition_notes" name="final_condition_notes"></div></div></form>',"Salvar relatório");
  }
  function horimeterForm(item) {
    openModal("Registrar horímetro · "+item.asset_code,'<form id="goLiveForm"><div class="go-live-form-grid">'+field("Leitura atual (horas)","reading",item.current_horimeter||0,"number")+'<div class="full"><label for="live_notes">Observações</label><textarea id="live_notes" name="notes" rows="3"></textarea></div><input type="hidden" name="equipment_id" value="'+esc(item.id)+'"></div></form>');
  }
  async function submitForm(event) {
    event.preventDefault();
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries()), button=$("#goLiveModalHost button[type=submit]");
    if(form.querySelector('[name="close_order_id"]')&&!confirm("Confirma o encerramento desta ordem de serviço? A liberação do equipamento só ocorrerá se a opção correspondente estiver marcada."))return;
    if(button)button.disabled=true;
    try {
      const recordId=data.record_id;delete data.record_id;
      if(form.querySelector('[name="shift_report"]')){
        const participants=String(data.other_mechanics||"").replace(/\r?\n/g,",").split(/[,;]+/).map(value=>value.trim()).filter(Boolean);
        const payload={area_id:state.areaId,equipment_id:data.equipment_id,report_date:data.report_date,horimeter:Number(data.horimeter),created_by:profile.uid||profile.id,created_by_name:profile.name||"",other_mechanics:participants,work_performed:String(data.work_performed||"").trim(),anomalies:String(data.anomalies||"").trim(),actions_taken:String(data.actions_taken||"").trim(),pending_items:String(data.pending_items||"").trim(),final_condition:data.final_condition,final_condition_notes:String(data.final_condition_notes||"").trim(),idempotency_key:crypto.randomUUID(),client_created_at:new Date().toISOString()};
        if(!Number.isFinite(payload.horimeter)||payload.horimeter<0)throw new Error("Informe um horímetro válido.");
        const {error}=await supabase.from("operational_shift_reports").insert(payload);
        if(error)throw error;
        $("#goLiveModalHost").innerHTML="";
        await loadData();
        setFeedback("Relatório de final de turno registrado e confirmado pelo Supabase.");
        return;
      } else if(form.querySelector('[name="asset_code"]')){
        const shared={p_area_id:state.areaId,p_asset_code:data.asset_code.trim(),p_description:data.description.trim(),p_brand:"SANY",p_model:data.model.trim(),p_category:data.category,p_current_horimeter:Number(data.current_horimeter||0)};
        if(recordId){
          const result=await supabase.from("operational_equipment").update({asset_code:shared.p_asset_code,description:shared.p_description,brand:"SANY",model:shared.p_model,category:shared.p_category,current_horimeter:shared.p_current_horimeter,updated_by:profile.uid||profile.id}).eq("id",recordId).eq("area_id",state.areaId);
          if(result.error)throw result.error;
        }else{
          const {error}=await supabase.rpc("create_operational_equipment",{...shared,p_status:data.status,p_maintenance_type:data.maintenance_type||null,p_initial_reason:data.initial_reason.trim(),p_initial_notes:data.initial_notes||""});
          if(error)throw error;
        }
      } else if(form.querySelector('[name="status_equipment_id"]')){
        const {error}=await supabase.rpc("transition_operational_equipment_status",{
          p_area_id:state.areaId,p_equipment_id:data.status_equipment_id,p_new_status:data.new_status,
          p_maintenance_type:data.new_status==="maintenance"?(data.maintenance_type||null):null,
          p_reason:data.reason.trim(),p_notes:data.notes||"",p_work_order_id:null
        });
        if(error)throw error;
      } else if(form.querySelector('[name="close_order_id"]')){
        const {error}=await supabase.rpc("close_operational_work_order",{
          p_area_id:state.areaId,p_work_order_id:data.close_order_id,p_closure_notes:data.closure_notes.trim(),
          p_remaining_pending:data.remaining_pending||"",p_release_equipment:data.release_equipment==="on",
          p_release_reason:data.release_reason||""
        });
        if(error)throw error;
      } else if(form.querySelector('[name="activity_order_id"]')){
        const timestamp=value=>value?new Date(value).toISOString():null;
        const order=state.orders.find(item=>item.id===data.activity_order_id);
        if(!order)throw new Error("A ordem de serviço não foi encontrada.");
        const result=await supabase.from("operational_work_order_activities").insert({
          area_id:state.areaId,equipment_id:order.equipment_id,work_order_id:data.activity_order_id,
          activity_type:data.activity_type,title:data.title.trim(),description:data.description.trim(),
          notes:data.notes||"",status:data.activity_status,responsible_name:data.responsible_name||"",
          started_at:timestamp(data.started_at),ended_at:timestamp(data.ended_at),created_by:profile.uid||profile.id,
          supersedes_id:data.supersedes_id||null
        });
        if(result.error)throw result.error;
      } else if(form.querySelector('[name="title"]')){
        if(!recordId&&!data.maintenance_type)throw new Error("Selecione se a ordem é preventiva ou corretiva.");
        const expectedAt=data.expected_completion_at?new Date(data.expected_completion_at).toISOString():null;
        const payload={area_id:state.areaId,equipment_id:data.equipment_id,maintenance_type:data.maintenance_type||null,title:data.title.trim(),diagnosis:(data.diagnosis||"").trim(),description:(data.description||"").trim(),priority:data.priority,status:data.status,responsible_name:(data.responsible_name||"").trim(),expected_completion_at:expectedAt,updated_by:profile.uid||profile.id};
        if(recordId){const result=await supabase.from("operational_work_orders").update(payload).eq("id",recordId).eq("area_id",state.areaId);if(result.error)throw result.error;}
        else {payload.order_number="OS-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+Math.random().toString(36).slice(2,6).toUpperCase();payload.created_by=profile.uid||profile.id;const result=await supabase.from("operational_work_orders").insert(payload);if(result.error)throw result.error;}
      } else if(form.querySelector('[name="event_type"]')){
        const payload={area_id:state.areaId,equipment_id:data.equipment_id,event_type:data.event_type,description:data.description.trim(),occurred_at:new Date(data.occurred_at).toISOString(),created_by:profile.uid||profile.id};
        const result=await supabase.from("operational_maintenance_events").insert(payload);if(result.error)throw result.error;
      } else if(form.querySelector('[name="reading"]')){
        const equipment=state.equipment.find(e=>e.id===data.equipment_id),reading=Number(data.reading);
        if(!Number.isFinite(reading)||reading<0)throw new Error("Informe uma leitura de horímetro válida.");
        if(reading<Number(equipment?.current_horimeter||0))throw new Error("A leitura não pode ser menor que o horímetro atual do equipamento.");
        const result=await supabase.from("operational_horimeter_readings").insert({area_id:state.areaId,equipment_id:data.equipment_id,reading,notes:data.notes||"",created_by:profile.uid||profile.id});
        if(result.error)throw result.error;
        const update=await supabase.from("operational_equipment").update({current_horimeter:reading,updated_by:profile.uid||profile.id}).eq("id",data.equipment_id).eq("area_id",state.areaId);
        if(update.error)throw update.error;
      }
      $("#goLiveModalHost").innerHTML="";
      await loadData();
      setFeedback("Registro salvo com sucesso.");
    } catch(error){setFeedback(error.message||"Não foi possível salvar o registro.",true);if(button)button.disabled=false;}
  }
  liveRoot().addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    if(button.dataset.liveTab){switchTab(button.dataset.liveTab);return;}
    if(button.id==="goLiveAddEquipment"){equipmentForm();return;}
    if(button.id==="goLiveAddEvent"){shiftReportForm();return;}
    if(button.dataset.equipmentHistory){const item=state.equipment.find(e=>e.id===button.dataset.equipmentHistory);if(item)equipmentHistory(item);return;}
    if(button.dataset.changeEquipmentStatus){const item=state.equipment.find(e=>e.id===button.dataset.changeEquipmentStatus);if(item)equipmentStatusForm(item);return;}
    if(button.dataset.editEquipment){const item=state.equipment.find(e=>e.id===button.dataset.editEquipment);if(item)equipmentForm(item);return;}
    if(button.dataset.addReading){const item=state.equipment.find(e=>e.id===button.dataset.addReading);if(item)horimeterForm(item);return;}
  });
  $("#goLiveEquipmentSearch").addEventListener("input",render);
  $("#goLiveEquipmentStatus").addEventListener("change",render);
  await loadData();
  await init125hMaintenanceModule({supabase,profile,getAreaId:()=>state.areaId,getEquipment:()=>state.equipment,onRefresh:loadData});
}
