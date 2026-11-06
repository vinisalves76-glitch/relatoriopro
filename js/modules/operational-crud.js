import { init125hMaintenanceModule } from "./maintenance-125h.js";
import { initShiftCloseoutModule } from "./shift-closeout.js";

const AREA_DEFAULT = "arcelormittal-andradas";
const AREA_LABEL = "ArcelorMittal Andradas";
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateTime = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
const dateOnly = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const statusLabel = value => ({available:"Disponível",stopped:"Parado",maintenance:"Em manutenção",inactive:"Inativo",open:"Aberta",in_progress:"Em andamento",waiting:"Aguardando recurso",completed:"Concluída",cancelled:"Cancelada",low:"Baixa",normal:"Normal",high:"Alta",critical:"Crítica",preventive:"Preventiva",corrective:"Corretiva",inspection:"Inspeção",occurrence:"Ocorrência"}[value] || value || "—");
const statusClass = value => ({available:"success",stopped:"danger",maintenance:"warning",inactive:"muted",open:"info",in_progress:"warning",waiting:"warning",completed:"success",cancelled:"muted",critical:"danger",high:"danger",normal:"info",low:"muted"}[value] || "info");

export async function initOperationalModule({supabase, profile}) {
  const root = document.getElementById("gestaoOperacional");
  if (!root || !supabase || !profile || profile.active === false) return;
  const isMaster = profile.role === "super_admin";
  const isSupervisor = profile.role === "supervisor_area";
  if (!isMaster && !isSupervisor) return;
  if (isSupervisor && !profile.operationalAreaId) throw new Error("Supervisor sem área operacional vinculada.");
  const fixedArea = isSupervisor ? profile.operationalAreaId : null;
  const state = {areas:[], areaId:fixedArea || AREA_DEFAULT, equipment:[], orders:[], events:[], readings:[], schedules125h:[], schedules125hAvailable:false, overviewPeriod:90, busy:false};
  root.innerHTML = `
    <style>
      #gestaoOperacional .go-live-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:18px 0}
      #gestaoOperacional .go-live-toolbar{margin:18px 0}
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
    <div class="go-page-head"><div><span class="go-eyebrow">IRMEN · GESTÃO TÉCNICA E OPERACIONAL</span><h1>Gestão Operacional</h1><p class="muted">Dados operacionais gravados no Supabase e protegidos por área.</p></div><span class="go-master-badge" id="goLiveScope"></span></div>
    <div class="go-contract-bar"><div><small>CLIENTE / OPERAÇÃO</small><strong>ArcelorMittal Andradas</strong></div><div><small>ÁREA DE ACESSO</small><strong id="goLiveAreaName">ArcelorMittal Andradas</strong></div><div><small>ORIGEM DOS DADOS</small><strong>Supabase · Atualização em tempo real ao recarregar</strong></div></div>
    <div class="go-live-toolbar"><div id="goLiveFeedback" role="status" aria-live="polite">Carregando dados da área…</div><button class="light" type="button" id="goLiveRefresh">Atualizar dados</button></div>
        <section class="go-panel active" data-live-panel="overview"><div id="goLiveOverview"></div></section>
        <section class="go-panel" data-live-panel="equipment" hidden>
      <div class="go-section-heading"><div><h2>Equipamentos</h2><p>Cadastro, situação operacional e horímetros.</p></div><button class="primary" type="button" id="goLiveAddEquipment">＋ Cadastrar equipamento</button></div>
      <div class="go-filters"><input id="goLiveEquipmentSearch" type="search" placeholder="Buscar identificação, marca ou modelo"><select id="goLiveEquipmentStatus"><option value="">Todos os status</option><option value="available">Disponível</option><option value="stopped">Parado</option><option value="maintenance">Em manutenção</option><option value="inactive">Inativo</option></select></div>
      <div class="go-table-wrap"><table class="go-table go-live-table"><thead><tr><th>Identificação</th><th>Equipamento</th><th>Horímetro</th><th>Status</th><th>Ações</th></tr></thead><tbody id="goLiveEquipmentRows"></tbody></table></div>
    </section>
    <section class="go-panel" data-live-panel="orders" hidden>
      <div class="go-section-heading"><div><h2>Ordens de serviço</h2><p>Abertura e acompanhamento das intervenções.</p></div><button class="primary" type="button" id="goLiveAddOrder">＋ Nova ordem de serviço</button></div>
      <div class="go-filters"><input id="goLiveOrderSearch" type="search" placeholder="Buscar OS, equipamento ou descrição"><select id="goLiveOrderStatus"><option value="">Todos os status</option><option value="open">Aberta</option><option value="in_progress">Em andamento</option><option value="waiting">Aguardando recurso</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select></div>
      <div id="goLiveOrderList"></div>
    </section>
    <section class="go-panel" data-live-panel="maintenance125" hidden><div id="goLive125h"></div></section>
    <section class="go-panel" data-live-panel="shiftCloseout" hidden><div id="goShiftCloseout"></div></section>
    <section class="go-panel" data-live-panel="events" hidden>
      <div class="go-section-heading"><div><h2>Manutenção e ocorrências</h2><p>Histórico de intervenções, inspeções e ocorrências.</p></div><button class="primary" type="button" id="goLiveAddEvent">＋ Registrar evento</button></div>
      <div class="go-table-wrap"><table class="go-table go-live-table"><thead><tr><th>Data</th><th>Equipamento</th><th>Tipo</th><th>Descrição</th><th>OS vinculada</th></tr></thead><tbody id="goLiveEventRows"></tbody></table></div>
    </section>
    <div id="goLiveModalHost"></div>
  `;
  const setFeedback = (message, error=false) => { const el=$("#goLiveFeedback"); if(el){el.textContent=message;el.classList.toggle("go-live-error",error);} };
  const areaLabel = id => state.areas.find(a=>a.id===id)?.name || (id===AREA_DEFAULT?AREA_LABEL:id);
  const activeArea = () => state.areas.find(a=>a.id===state.areaId);
  const switchTab = name => {
    root.querySelectorAll("[data-live-panel]").forEach(p=>{const active=p.dataset.livePanel===name;p.hidden=!active;p.classList.toggle("active",active)});
    const sharedToolbar=root.querySelector(".go-live-toolbar");if(sharedToolbar)sharedToolbar.hidden=name==="maintenance125";
    document.querySelectorAll(".operational-main-tab").forEach(b=>b.classList.toggle("active",b.dataset.operationalSection===name));
  };
  root.showOperationalSection = switchTab;
  async function loadData() {
    if(state.busy)return;
    state.busy=true;setFeedback("Atualizando dados…");
    try {
      if(!state.areas.length){
        const {data,error}=await supabase.from("operational_areas").select("id,name,active").eq("active",true).order("name");
        if(error)throw error;
        state.areas=data||[];
        if(fixedArea)state.areas=state.areas.filter(a=>a.id===fixedArea);
        if(!state.areas.length)throw new Error("Nenhuma área operacional ativa foi encontrada para este perfil.");
        if(!state.areas.some(a=>a.id===state.areaId))state.areaId=state.areas[0].id;
      }
      const area=activeArea();
      if(!area)throw new Error("Área operacional não encontrada ou inativa.");
      const [equipment,orders,events,readings]=await Promise.all([
        supabase.from("operational_equipment").select("*").eq("area_id",state.areaId).order("asset_code"),
        supabase.from("operational_work_orders").select("*").eq("area_id",state.areaId).order("opened_at",{ascending:false}),
        supabase.from("operational_maintenance_events").select("*").eq("area_id",state.areaId).order("occurred_at",{ascending:false}),
        supabase.from("operational_horimeter_readings").select("*").eq("area_id",state.areaId).order("recorded_at",{ascending:false})
      ]);
      for(const result of [equipment,orders,events,readings])if(result.error)throw result.error;
      state.equipment=equipment.data||[];state.orders=orders.data||[];state.events=events.data||[];state.readings=readings.data||[];
      const schedules125h=await supabase.from("operational_125h_schedules").select("id,equipment_id,planned_for,status").eq("area_id",state.areaId);
      state.schedules125hAvailable=!schedules125h.error;state.schedules125h=schedules125h.error?[]:(schedules125h.data||[]);
      $("#goLiveAreaName").textContent=area.name;
      render();
      setFeedback("Dados atualizados · "+new Date().toLocaleTimeString("pt-BR"));
    } catch(error) { setFeedback(error.message||"Falha ao carregar dados operacionais.",true); throw error; }
    finally { state.busy=false; }
  }
  const equipmentName = id => {const e=state.equipment.find(x=>x.id===id);return e?[e.asset_code,e.brand,e.model].filter(Boolean).join(" · "):"Equipamento não localizado";};
  function render() {

    const activeEquipment=state.equipment.filter(e=>e.status!=="inactive");
    const available=activeEquipment.filter(e=>e.status==="available").length;
    const stopped=activeEquipment.filter(e=>["stopped","maintenance"].includes(e.status)).length;
    const openOrders=state.orders.filter(o=>["open","in_progress","waiting"].includes(o.status));
    const criticalOrders=openOrders.filter(o=>["critical","high"].includes(o.priority));
    const waitingOrders=openOrders.filter(o=>o.status==="waiting").length;
    const closedOrders=state.orders.filter(o=>o.status==="completed").length;
    const today125=new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0")+"-"+String(new Date().getDate()).padStart(2,"0");
    const activeSchedules125=state.schedules125h.filter(s=>["scheduled","in_progress"].includes(s.status)&&activeEquipment.some(e=>e.id===s.equipment_id));
    const overdue125=activeSchedules125.filter(s=>s.planned_for<today125).length;
    const periodStart=new Date();periodStart.setDate(periodStart.getDate()-state.overviewPeriod);
    const periodEvents=state.events.filter(e=>e.occurred_at&&new Date(e.occurred_at)>=periodStart);
    const periodOrders=state.orders.filter(o=>o.opened_at&&new Date(o.opened_at)>=periodStart);

    const eventTypes=[["preventive","Preventivas","#31966b"],["corrective","Corretivas","#d45b50"],["inspection","Inspeções","#4779a8"],["occurrence","Ocorrências","#d69a27"]];
    const orderTypes=[["open","Abertas","#4779a8"],["in_progress","Em andamento","#d69a27"],["waiting","Aguardando recurso","#d45b50"],["completed","Concluídas","#31966b"],["cancelled","Canceladas","#9aa5af"]];
    const equipmentTypes=[["available","Disponíveis","#31966b"],["stopped","Parados","#d45b50"],["maintenance","Em manutenção","#d69a27"]];
    const pieData=(items,source,key)=>items.map(([value,label,color])=>({label,color,count:source.filter(x=>x[key]===value).length})).filter(x=>x.count>0);
    const eventPie=pieData(eventTypes,periodEvents,"event_type");
    const orderPie=pieData(orderTypes,state.orders,"status");
    const equipmentPie=pieData(equipmentTypes,activeEquipment,"status");
    const maxOrder=Math.max(1,...orderTypes.map(([key])=>state.orders.filter(o=>o.status===key).length));
    const orderBars=orderTypes.map(([key,label])=>{const n=state.orders.filter(o=>o.status===key).length;return '<div class="bi-bar-row"><span class="bi-bar-label">'+label+'</span><div class="bi-bar-track"><div class="bi-bar-fill '+(key==="waiting"?"warning":key==="completed"?"success":key==="open"?"danger":"")+'" style="width:'+(n/maxOrder*100)+'%"></div></div><strong class="bi-bar-value">'+n+'</strong></div>';}).join("");

    const pieMarkup=(items,total,label)=>{let cursor=0;const slices=items.map(x=>{const from=cursor;cursor+=total?x.count/total*100:0;return x.color+" "+from+"% "+cursor+"%";}).join(", ")||"#dce3e9 0% 100%";return '<div class="bi-pie-wrap"><div class="bi-pie" style="background:conic-gradient('+slices+')"><div class="bi-pie-center"><strong>'+total+'</strong><span>'+label+'</span></div></div><div class="bi-legend">'+(items.length?items.map(x=>'<div class="bi-legend-row"><span class="bi-legend-label"><i class="bi-dot" style="background:'+x.color+'"></i>'+x.label+'</span><strong>'+x.count+' · '+(total?Math.round(x.count/total*100):0)+'%</strong></div>').join(""):'<div class="bi-empty">Sem registros no período.</div>')+'</div></div>';};
    const metricCards=[
      {name:"Disponibilidade física",value:"—",tag:"Dados insuficientes",detail:"Exige horas programadas e horas efetivamente disponíveis por equipamento e turno."},
      {name:"MTBF · Tempo entre falhas",value:"—",tag:"Dados insuficientes",detail:"Exige horas de operação acumuladas e registro confiável de cada falha."},
      {name:"MTTR · Tempo médio de reparo",value:"—",tag:"Dados insuficientes",detail:"Exige início e término de cada intervenção corretiva."},
      {name:"Downtime · Horas paradas",value:"—",tag:"Dados insuficientes",detail:"Exige apontamento de início e fim da parada e classificação do motivo."},
      {name:"Cumprimento preventivo",value:"—",tag:"Dados insuficientes",detail:"Exige plano preventivo previsto e ordens preventivas concluídas no período."},
      {name:"Backlog de manutenção",value:openOrders.length+" OS",tag:"Parcial · por quantidade",detail:"Mostra OS em aberto. Para backlog em horas, precisamos da estimativa e do saldo de homem-hora."}
    ];
    const attention=activeEquipment.map(e=>{
      const related=openOrders.filter(o=>o.equipment_id===e.id);
      const critical=related.some(o=>["critical","high"].includes(o.priority));
      const reason=critical?"OS de alta prioridade":e.status==="stopped"?"Equipamento parado":e.status==="maintenance"?"Em manutenção":related.length?"OS em aberto":"";
      return {e,related,critical,reason,rank:critical?0:e.status==="stopped"?1:e.status==="maintenance"?2:related.length?3:9};
    }).filter(x=>x.rank<9).sort((a,b)=>a.rank-b.rank).slice(0,8);
    const periodLabel=state.overviewPeriod+" dias";
    $("#goLiveScope").textContent=isMaster?"Acesso global · Administrador master":"Área vinculada · "+areaLabel(state.areaId);
    $("#goLiveOverview").innerHTML=`
      <div class="bi-head"><div><h2>Painel de manutenção</h2><p>Gestão à vista da frota · ${esc(areaLabel(state.areaId))}</p></div><label class="bi-period">Período de análise <select id="biPeriod"><option value="30" ${state.overviewPeriod===30?"selected":""}>Últimos 30 dias</option><option value="90" ${state.overviewPeriod===90?"selected":""}>Últimos 90 dias</option><option value="180" ${state.overviewPeriod===180?"selected":""}>Últimos 180 dias</option></select></label></div>
      <div class="bi-kpis">
        <article class="bi-kpi"><span>Frota ativa</span><strong>${activeEquipment.length}</strong><small>${state.equipment.length-activeEquipment.length} inativos / fora de operação</small></article>
        <article class="bi-kpi ${stopped?"alert":""}"><span>Parados ou em manutenção</span><strong>${stopped}</strong><small>${activeEquipment.length?Math.round(stopped/activeEquipment.length*100):0}% da frota ativa</small></article>
        <article class="bi-kpi"><span>OS em aberto</span><strong>${openOrders.length}</strong><small>${waitingOrders} aguardando recurso · ${closedOrders} concluídas no total</small></article>
        <article class="bi-kpi ${criticalOrders.length?"alert":""}"><span>OS prioritárias</span><strong>${criticalOrders.length}</strong><small>Alta ou crítica · backlog atual</small></article>
        <article class="bi-kpi"><span>Disponíveis</span><strong>${available}</strong><small>${activeEquipment.length?Math.round(available/activeEquipment.length*100):0}% da frota ativa com status disponível</small></article>
        <article class="bi-kpi ${overdue125?"warn":""}"><span>Inspeções 125h programadas</span><strong>${state.schedules125hAvailable?activeSchedules125.length:"—"}</strong><small>${state.schedules125hAvailable?overdue125+" com data atrasada · "+(activeSchedules125.length-overdue125)+" dentro do prazo":"Agenda não disponível no banco"}</small></article>
        <article class="bi-kpi"><span>Eventos no período</span><strong>${periodEvents.length}</strong><small>${periodOrders.length} OS abertas no período</small></article>
        <article class="bi-kpi"><span>Leituras de horímetro</span><strong>${state.readings.length}</strong><small>Registros disponíveis no histórico</small></article>
      </div>

      <div class="bi-section-title"><div><h3>Distribuição da operação</h3><p>Visão proporcional da frota, das ordens e das intervenções</p></div></div>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Status da frota</h3><p class="bi-sub">Equipamentos ativos · situação cadastrada</p>${pieMarkup(equipmentPie,activeEquipment.length,"equipamentos")}<div class="bi-note">Este gráfico representa o status informado no cadastro, não substitui o cálculo de disponibilidade física.</div></section>
        <section class="bi-panel"><h3>Ordens de serviço</h3><p class="bi-sub">Distribuição por situação atual</p>${pieMarkup(orderPie,state.orders.length,"ordens")}</section>
      </div>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Tipos de intervenção</h3><p class="bi-sub">Eventos registrados nos últimos ${periodLabel.toLowerCase()}</p>${pieMarkup(eventPie,periodEvents.length,"eventos")}<div class="bi-note">A classificação depende do preenchimento correto do tipo de evento.</div></section>
        <section class="bi-panel"><h3>Resumo de prioridades</h3><p class="bi-sub">Fila atual que exige acompanhamento</p><div class="bi-bars">${orderBars}</div><div class="bi-note">${criticalOrders.length} OS de alta prioridade ou críticas · ${waitingOrders} aguardando recurso.</div></section>
      </div>
      <div class="bi-section-title"><div><h3>Indicadores de desempenho da manutenção</h3><p>KPIs de gestão da frota e confiabilidade</p></div></div>
      <div class="bi-metric-grid">${metricCards.map(m=>'<article class="bi-metric"><div class="bi-metric-top"><span>'+m.name+'</span><i class="bi-tag">'+m.tag+'</i></div><strong>'+m.value+'</strong><small>'+m.detail+'</small></article>').join("")}</div>
      <div class="bi-note">Indicadores marcados como dados insuficientes ainda não podem ser calculados com rigor a partir dos registros atuais. A próxima etapa é implantar apontamento de disponibilidade, paradas e planejamento preventivo.</div>
      <section class="bi-panel"><h3>Equipamentos que exigem atenção</h3><p class="bi-sub">Prioridade sugerida por status do equipamento e criticidade das OS</p>
        ${attention.length?'<div class="go-live-table-wrap"><table class="bi-table"><thead><tr><th>Equipamento</th><th>Status</th><th>OS abertas</th><th>Prioridade</th><th>Motivo</th></tr></thead><tbody>'+attention.map(x=>'<tr><td><strong>'+esc(x.e.asset_code)+'</strong><br><small>'+esc([x.e.brand,x.e.model].filter(Boolean).join(" · "))+'</small></td><td><span class="go-live-status '+statusClass(x.e.status)+'">'+esc(statusLabel(x.e.status))+'</span></td><td>'+x.related.length+'</td><td>'+ (x.critical?'<span class="go-live-status danger">Alta / crítica</span>':'—')+'</td><td>'+esc(x.reason)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="bi-empty">Nenhum equipamento parado, em manutenção ou com OS aberta.</div>'}
      </section>
      <div class="bi-layout">
        <section class="bi-panel"><h3>Movimentações recentes</h3><p class="bi-sub">Últimos registros de manutenção e ocorrência</p>
          ${state.events.slice(0,6).length?'<div class="go-live-table-wrap"><table class="bi-table"><thead><tr><th>Data</th><th>Equipamento</th><th>Tipo</th><th>Registro</th></tr></thead><tbody>'+state.events.slice(0,6).map(e=>'<tr><td>'+esc(dateOnly(e.occurred_at))+'</td><td>'+esc(equipmentName(e.equipment_id))+'</td><td>'+esc(statusLabel(e.event_type))+'</td><td>'+esc(e.description)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="bi-empty">Sem movimentações registradas.</div>'}
        </section>
        <section class="bi-panel"><h3>Leitura gerencial</h3><p class="bi-sub">Pontos de atenção sobre a qualidade dos indicadores</p>
          <div class="bi-bars">
            <div class="bi-bar-row"><span class="bi-bar-label">Disponíveis</span><div class="bi-bar-track"><div class="bi-bar-fill success" style="width:${activeEquipment.length?available/activeEquipment.length*100:0}%"></div></div><strong class="bi-bar-value">${available}</strong></div>
            <div class="bi-bar-row"><span class="bi-bar-label">Parados / manutenção</span><div class="bi-bar-track"><div class="bi-bar-fill danger" style="width:${activeEquipment.length?stopped/activeEquipment.length*100:0}%"></div></div><strong class="bi-bar-value">${stopped}</strong></div>
          </div>
          <div class="bi-note">A taxa acima é baseada no status cadastrado. Para calcular disponibilidade física, MTBF, MTTR e horas de downtime com rigor, precisamos registrar início/fim das paradas, horas programadas e horímetro por turno.</div>
        </section>
      </div>
    `;
    $("#biPeriod").addEventListener("change",event=>{state.overviewPeriod=Number(event.target.value)||90;render();});
    const term=($("#goLiveEquipmentSearch")?.value||"").toLocaleLowerCase("pt-BR"),status=$("#goLiveEquipmentStatus")?.value||"";
    const equipment=state.equipment.filter(e=>(!status||e.status===status)&&(!term||[e.asset_code,e.description,e.brand,e.model].join(" ").toLocaleLowerCase("pt-BR").includes(term)));
    $("#goLiveEquipmentRows").innerHTML=equipment.length?equipment.map(e=>'<tr><td><strong>'+esc(e.asset_code)+'</strong></td><td>'+esc([e.brand,e.model,e.description].filter(Boolean).join(" · "))+'</td><td>'+Number(e.current_horimeter||0).toLocaleString("pt-BR")+' h</td><td><span class="go-live-status '+statusClass(e.status)+'">'+esc(statusLabel(e.status))+'</span></td><td><div class="go-live-actions"><button type="button" class="light" data-edit-equipment="'+e.id+'">Editar</button><button type="button" class="light" data-add-reading="'+e.id+'">Horímetro</button></div></td></tr>').join(""):'<tr><td colspan="5" class="go-live-empty">Nenhum equipamento encontrado.</td></tr>';
    const orderTerm=($("#goLiveOrderSearch")?.value||"").toLocaleLowerCase("pt-BR"),orderStatus=$("#goLiveOrderStatus")?.value||"";
    const orders=state.orders.filter(o=>(!orderStatus||o.status===orderStatus)&&(!orderTerm||[o.order_number,o.title,o.description,equipmentName(o.equipment_id)].join(" ").toLocaleLowerCase("pt-BR").includes(orderTerm)));
    $("#goLiveOrderList").innerHTML=orders.length?orders.map(o=>'<article class="go-os-card"><div class="go-os-top"><div><span class="go-live-status '+statusClass(o.status)+'">'+esc(statusLabel(o.status))+' · '+esc(statusLabel(o.priority))+'</span><h3>'+esc(o.order_number)+' · '+esc(equipmentName(o.equipment_id))+'</h3><p>'+esc(o.title)+'</p></div><span class="go-os-date">'+esc(dateOnly(o.opened_at))+'</span></div><p>'+esc(o.description)+'</p><div class="go-live-actions"><button class="light" type="button" data-edit-order="'+o.id+'">Atualizar OS</button></div></article>').join(""):'<div class="go-live-empty">Nenhuma ordem de serviço cadastrada nesta área.</div>';
    $("#goLiveEventRows").innerHTML=state.events.length?state.events.map(e=>'<tr><td>'+esc(dateTime(e.occurred_at))+'</td><td>'+esc(equipmentName(e.equipment_id))+'</td><td>'+esc(statusLabel(e.event_type))+'</td><td>'+esc(e.description)+'</td><td>'+esc(state.orders.find(o=>o.id===e.work_order_id)?.order_number||"—")+'</td></tr>').join(""):'<tr><td colspan="5" class="go-live-empty">Nenhum evento registrado.</td></tr>';
  }
  function openModal(title,body,submitLabel="Salvar") {
    $("#goLiveModalHost").innerHTML='<div class="go-live-modal" role="presentation"><section class="go-live-dialog" role="dialog" aria-modal="true"><div class="go-live-dialog-head"><h2>'+esc(title)+'</h2><button type="button" class="light" data-close-live-modal>Fechar</button></div>'+body+'<div class="go-live-dialog-foot"><button type="button" class="light" data-close-live-modal>Cancelar</button><button type="submit" form="goLiveForm" class="primary">'+esc(submitLabel)+'</button></div></section></div>';
    $("#goLiveModalHost .go-live-modal").addEventListener("click",e=>{if(e.target.classList.contains("go-live-modal")||e.target.closest("[data-close-live-modal]"))$("#goLiveModalHost").innerHTML="";});
    $("#goLiveForm").addEventListener("submit",submitForm);
  }
  const field=(label,name,value="",type="text",required=true)=>'<div><label for="live_'+name+'">'+esc(label)+'</label><input id="live_'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(required?"required":"")+'></div>';
  const selectField=(label,name,options,value)=>'<div><label for="live_'+name+'">'+esc(label)+'</label><select id="live_'+name+'" name="'+name+'">'+options.map(o=>'<option value="'+esc(o[0])+'" '+(o[0]===value?"selected":"")+'>'+esc(o[1])+'</option>').join("")+'</select></div>';
  function equipmentForm(item={}) {
    openModal(item.id?"Editar equipamento":"Cadastrar equipamento",'<form id="goLiveForm"><div class="go-live-form-grid">'+field("Identificação / patrimônio","asset_code",item.asset_code||"")+field("Descrição","description",item.description||"")+field("Marca","brand",item.brand||"")+field("Modelo","model",item.model||"")+selectField("Categoria","category",[["caminhao","Caminhão"],["escavadeira","Escavadeira"],["carregadeira","Carregadeira"],["trator","Trator"],["outro","Outro"]],item.category||"caminhao")+selectField("Status","status",[["available","Disponível"],["stopped","Parado"],["maintenance","Em manutenção"],["inactive","Inativo"]],item.status||"available")+field("Horímetro atual (h)","current_horimeter",item.current_horimeter??0,"number")+ '<input type="hidden" name="record_id" value="'+esc(item.id||"")+'"></div></form>');
  }
  function orderForm(item={}) {
    const options=state.equipment.filter(e=>e.status!=="inactive").map(e=>[e.id,e.asset_code+" · "+[e.brand,e.model].filter(Boolean).join(" " )]);
    if(!options.length){setFeedback("Cadastre um equipamento antes de abrir uma OS.",true);switchTab("equipment");return;}
    openModal(item.id?"Atualizar ordem de serviço":"Abrir ordem de serviço",'<form id="goLiveForm"><div class="go-live-form-grid">'+selectField("Equipamento","equipment_id",options,item.equipment_id||options[0][0])+field("Título da intervenção","title",item.title||"")+ '<div class="full"><label for="live_description">Descrição / diagnóstico</label><textarea id="live_description" name="description" rows="4">'+esc(item.description||"")+'</textarea></div>'+selectField("Prioridade","priority",[["low","Baixa"],["normal","Normal"],["high","Alta"],["critical","Crítica"]],item.priority||"normal")+selectField("Status","status",[["open","Aberta"],["in_progress","Em andamento"],["waiting","Aguardando recurso"],["completed","Concluída"],["cancelled","Cancelada"]],item.status||"open")+'<input type="hidden" name="record_id" value="'+esc(item.id||"")+'"></div></form>');
  }
  function eventForm() {
    const equipmentOptions=state.equipment.filter(e=>e.status!=="inactive").map(e=>[e.id,e.asset_code+" · "+[e.brand,e.model].filter(Boolean).join(" ")]);
    if(!equipmentOptions.length){setFeedback("Cadastre um equipamento antes de registrar manutenção ou ocorrência.",true);switchTab("equipment");return;}
    const orderOptions=[["","Sem OS vinculada"],...state.orders.filter(o=>!["completed","cancelled"].includes(o.status)).map(o=>[o.id,o.order_number+" · "+o.title])];
    openModal("Registrar manutenção ou ocorrência",'<form id="goLiveForm"><div class="go-live-form-grid">'+selectField("Equipamento","equipment_id",equipmentOptions,equipmentOptions[0][0])+selectField("Tipo de evento","event_type",[["preventive","Preventiva"],["corrective","Corretiva"],["inspection","Inspeção"],["occurrence","Ocorrência"]],"occurrence")+selectField("Ordem de serviço","work_order_id",orderOptions,"")+'<div><label for="live_occurred_at">Data e hora</label><input id="live_occurred_at" name="occurred_at" type="datetime-local" value="'+new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)+'" required></div><div class="full"><label for="live_description">Descrição / registro</label><textarea id="live_description" name="description" rows="4" required></textarea></div></div></form>');
  }
  function horimeterForm(item) {
    openModal("Registrar horímetro · "+item.asset_code,'<form id="goLiveForm"><div class="go-live-form-grid">'+field("Leitura atual (horas)","reading",item.current_horimeter||0,"number")+'<div class="full"><label for="live_notes">Observações</label><textarea id="live_notes" name="notes" rows="3"></textarea></div><input type="hidden" name="equipment_id" value="'+esc(item.id)+'"></div></form>');
  }
  async function submitForm(event) {
    event.preventDefault();
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries()), button=$("#goLiveModalHost button[type=submit]");
    if(button)button.disabled=true;
    try {
      const recordId=data.record_id;delete data.record_id;
      if(form.querySelector('[name="asset_code"]')){
        const payload={area_id:state.areaId,asset_code:data.asset_code.trim(),description:data.description.trim(),brand:data.brand.trim(),model:data.model.trim(),category:data.category,status:data.status,current_horimeter:Number(data.current_horimeter||0),updated_by:profile.uid||profile.id};
        const result=recordId?await supabase.from("operational_equipment").update(payload).eq("id",recordId).eq("area_id",state.areaId):await supabase.from("operational_equipment").insert({...payload,created_by:profile.uid||profile.id});
        if(result.error)throw result.error;
      } else if(form.querySelector('[name="title"]')){
        const now=new Date().toISOString(),payload={area_id:state.areaId,equipment_id:data.equipment_id,title:data.title.trim(),description:data.description.trim(),priority:data.priority,status:data.status,updated_by:profile.uid||profile.id};
        if(recordId){payload.closed_at=data.status==="completed"?now:null;const result=await supabase.from("operational_work_orders").update(payload).eq("id",recordId).eq("area_id",state.areaId);if(result.error)throw result.error;}
        else {payload.order_number="OS-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+Math.random().toString(36).slice(2,6).toUpperCase();payload.created_by=profile.uid||profile.id;const result=await supabase.from("operational_work_orders").insert(payload);if(result.error)throw result.error;}
      } else if(form.querySelector('[name="event_type"]')){
        const payload={area_id:state.areaId,equipment_id:data.equipment_id,work_order_id:data.work_order_id||null,event_type:data.event_type,description:data.description.trim(),occurred_at:new Date(data.occurred_at).toISOString(),created_by:profile.uid||profile.id};
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
      setFeedback("Registro salvo com sucesso.");
      await loadData();
    } catch(error){setFeedback(error.message||"Não foi possível salvar o registro.",true);if(button)button.disabled=false;}
  }
  root.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    if(button.dataset.liveTab){switchTab(button.dataset.liveTab);return;}
    if(button.id==="goLiveRefresh"){loadData().catch(()=>{});return;}
    if(button.id==="goLiveAddEquipment"){equipmentForm();return;}
    if(button.id==="goLiveAddOrder"){orderForm();return;}
    if(button.id==="goLiveAddEvent"){eventForm();return;}
    if(button.dataset.editEquipment){const item=state.equipment.find(e=>e.id===button.dataset.editEquipment);if(item)equipmentForm(item);return;}
    if(button.dataset.editOrder){const item=state.orders.find(o=>o.id===button.dataset.editOrder);if(item)orderForm(item);return;}
    if(button.dataset.addReading){const item=state.equipment.find(e=>e.id===button.dataset.addReading);if(item)horimeterForm(item);return;}
  });
  $("#goLiveEquipmentSearch").addEventListener("input",render);
  $("#goLiveEquipmentStatus").addEventListener("change",render);
  $("#goLiveOrderSearch").addEventListener("input",render);
  $("#goLiveOrderStatus").addEventListener("change",render);
  await loadData();
  await init125hMaintenanceModule({supabase,profile,getAreaId:()=>state.areaId,getEquipment:()=>state.equipment,onRefresh:loadData});
  await initShiftCloseoutModule({supabase,profile,getAreaId:()=>state.areaId,getEquipment:()=>state.equipment,getOrders:()=>state.orders});
}
