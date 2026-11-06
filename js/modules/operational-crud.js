import { init125hMaintenanceModule } from "./maintenance-125h.js";

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
  const state = {areas:[], areaId:fixedArea || AREA_DEFAULT, equipment:[], orders:[], events:[], readings:[], busy:false};
  root.innerHTML = `
    <style>
      #gestaoOperacional .go-live-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:18px 0}
      #gestaoOperacional .go-workspace{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px;align-items:start;margin-top:18px}
      #gestaoOperacional .go-subnav{display:flex;flex-direction:column;gap:5px;padding:12px;background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;position:sticky;top:14px}
      #gestaoOperacional .go-subnav-caption{padding:7px 10px 10px;color:var(--muted,#68737d);font-size:10px;font-weight:800;letter-spacing:.1em}
      #gestaoOperacional .go-subtab{display:flex;align-items:center;width:100%;min-height:44px;padding:10px 12px;text-align:left;white-space:normal;border:0;border-radius:8px;background:transparent;color:var(--text,#26323d);font-size:13px;font-weight:650}
      #gestaoOperacional .go-subtab.active{background:#202b35;color:#fff;border-left:3px solid var(--brand,#e4b21b);padding-left:9px}
      #gestaoOperacional .go-workspace-content{min-width:0}
      #gestaoOperacional .go-workspace-content .go-live-toolbar{margin:0 0 14px}
      @media(max-width:760px){#gestaoOperacional .go-workspace{grid-template-columns:1fr;gap:12px}#gestaoOperacional .go-subnav{position:static;display:flex;flex-direction:row;overflow-x:auto;align-items:stretch}#gestaoOperacional .go-subnav-caption{display:none}#gestaoOperacional .go-subtab{width:auto;min-width:max-content;min-height:42px}}
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
      @media(max-width:600px){#gestaoOperacional .go-live-form-grid{grid-template-columns:1fr}#gestaoOperacional .go-live-form-grid .full{grid-column:auto}#gestaoOperacional .go-live-dialog{padding:16px}}
    </style>
    <div class="go-page-head"><div><span class="go-eyebrow">IRMEN · GESTÃO TÉCNICA E OPERACIONAL</span><h1>Gestão Operacional</h1><p class="muted">Dados operacionais gravados no Supabase e protegidos por área.</p></div><span class="go-master-badge" id="goLiveScope"></span></div>
    <div class="go-contract-bar"><div><small>CLIENTE / OPERAÇÃO</small><strong>ArcelorMittal Andradas</strong></div><div><small>ÁREA DE ACESSO</small><strong id="goLiveAreaName">ArcelorMittal Andradas</strong></div><div><small>ORIGEM DOS DADOS</small><strong>Supabase · Atualização em tempo real ao recarregar</strong></div></div>
    <div class="go-workspace">
      <nav class="go-subnav" aria-label="Seções operacionais">
        <span class="go-subnav-caption">MENU OPERACIONAL</span>
        <button class="go-subtab active" type="button" data-live-tab="overview">▦ &nbsp; Visão geral</button>
        <button class="go-subtab" type="button" data-live-tab="equipment">▣ &nbsp; Equipamentos</button>
        <button class="go-subtab" type="button" data-live-tab="orders">▤ &nbsp; Ordens de serviço</button>
        <button class="go-subtab" type="button" data-live-tab="events">⚙ &nbsp; Manutenção e ocorrências</button>
        <button class="go-subtab" type="button" data-live-tab="maintenance125">◷ &nbsp; Manutenção 125h</button>
      </nav>
      <div class="go-workspace-content">
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
    <section class="go-panel" data-live-panel="events" hidden>
      <div class="go-section-heading"><div><h2>Manutenção e ocorrências</h2><p>Histórico de intervenções, inspeções e ocorrências.</p></div><button class="primary" type="button" id="goLiveAddEvent">＋ Registrar evento</button></div>
      <div class="go-table-wrap"><table class="go-table go-live-table"><thead><tr><th>Data</th><th>Equipamento</th><th>Tipo</th><th>Descrição</th><th>OS vinculada</th></tr></thead><tbody id="goLiveEventRows"></tbody></table></div>
    </section>
      </div>
    </div>
    <div id="goLiveModalHost"></div>
  `;
  const setFeedback = (message, error=false) => { const el=$("#goLiveFeedback"); if(el){el.textContent=message;el.classList.toggle("go-live-error",error);} };
  const areaLabel = id => state.areas.find(a=>a.id===id)?.name || (id===AREA_DEFAULT?AREA_LABEL:id);
  const activeArea = () => state.areas.find(a=>a.id===state.areaId);
  const switchTab = name => {
    root.querySelectorAll("[data-live-tab]").forEach(b=>b.classList.toggle("active",b.dataset.liveTab===name));
    root.querySelectorAll("[data-live-panel]").forEach(p=>{const active=p.dataset.livePanel===name;p.hidden=!active;p.classList.toggle("active",active)});
  };
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
      $("#goLiveAreaName").textContent=area.name;
      render();
      setFeedback("Dados atualizados · "+new Date().toLocaleTimeString("pt-BR"));
    } catch(error) { setFeedback(error.message||"Falha ao carregar dados operacionais.",true); throw error; }
    finally { state.busy=false; }
  }
  const equipmentName = id => {const e=state.equipment.find(x=>x.id===id);return e?[e.asset_code,e.brand,e.model].filter(Boolean).join(" · "):"Equipamento não localizado";};
  function render() {
    const open=state.orders.filter(o=>["open","in_progress","waiting"].includes(o.status)).length;
    const available=state.equipment.filter(e=>e.status==="available").length;
    const stopped=state.equipment.filter(e=>["stopped","maintenance"].includes(e.status)).length;
    $("#goLiveScope").textContent=isMaster?"Acesso global · Administrador master":"Área vinculada · "+areaLabel(state.areaId);
    $("#goLiveOverview").innerHTML=`
      <div class="go-live-grid">
        <article class="go-live-card"><h3>Equipamentos cadastrados</h3><strong>${state.equipment.length}</strong><p>${available} disponíveis · ${stopped} parados ou em manutenção</p></article>
        <article class="go-live-card"><h3>Ordens em aberto</h3><strong>${open}</strong><p>${state.orders.filter(o=>o.status==="waiting").length} aguardando recurso</p></article>
        <article class="go-live-card"><h3>Eventos registrados</h3><strong>${state.events.length}</strong><p>Manutenções, inspeções e ocorrências</p></article>
        <article class="go-live-card"><h3>Leituras de horímetro</h3><strong>${state.readings.length}</strong><p>Histórico registrado nesta área</p></article>
      </div>
      <div class="go-live-card"><h3>Últimas movimentações</h3>${state.events.slice(0,5).length?'<ul>'+state.events.slice(0,5).map(e=>'<li><strong>'+esc(equipmentName(e.equipment_id))+'</strong> · '+esc(statusLabel(e.event_type))+' · '+esc(e.description)+' <span style="color:#718096">('+esc(dateTime(e.occurred_at))+')</span></li>').join("")+'</ul>':'<p>Nenhum evento registrado até o momento.</p>'}</div>
      <div class="go-live-card" style="margin-top:12px"><h3>Equipamentos recentes</h3>${state.equipment.slice(0,6).length?'<ul>'+state.equipment.slice(0,6).map(e=>'<li><strong>'+esc(e.asset_code)+'</strong> · '+esc([e.brand,e.model,e.description].filter(Boolean).join(" · "))+' · '+esc(statusLabel(e.status))+' · '+Number(e.current_horimeter||0).toLocaleString("pt-BR")+' h</li>').join("")+'</ul>':'<p>Nenhum equipamento cadastrado. Comece cadastrando o primeiro equipamento da área.</p>'}</div>`;
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
}
