const DB_NAME = "relatoriopro-offline";
const STORE = "shiftReports";
const EQUIPMENT_STORE = "equipmentCache";
const SCHEDULE_STORE = "scheduleCache";
const AREA_LABELS = {"arcelormittal-andradas":"ArcelorMittal Andradas"};
let activeController=null;
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localDate = () => {const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const statusText = status => ({pending:"Aguardando sincronização",syncing:"Sincronizando",synced:"Sincronizado",error:"Erro no envio",conflict:"Conflito: já existe relatório para esta TAG/data"})[status]||status;

function openQueue(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Este navegador não oferece armazenamento local necessário para trabalhar offline."));return;}
    const request=indexedDB.open(DB_NAME,3);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:"localId"});store.createIndex("ownerUid","ownerUid",{unique:false});store.createIndex("status","status",{unique:false});}if(!db.objectStoreNames.contains(EQUIPMENT_STORE))db.createObjectStore(EQUIPMENT_STORE,{keyPath:"areaId"});if(!db.objectStoreNames.contains(SCHEDULE_STORE))db.createObjectStore(SCHEDULE_STORE,{keyPath:"key"});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Não foi possível abrir o armazenamento offline."));
  });
}
async function queueAll(){
  const db=await openQueue();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly"),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});
}
async function queuePut(item){
  const db=await openQueue();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(item);tx.oncomplete=()=>{db.close();resolve(item)};tx.onerror=()=>{db.close();reject(tx.error)};});
}
async function queueDelete(id){
  const db=await openQueue();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};});
}
async function cacheEquipment(areaId,items){const db=await openQueue();return new Promise((resolve,reject)=>{const tx=db.transaction(EQUIPMENT_STORE,"readwrite");tx.objectStore(EQUIPMENT_STORE).put({areaId,items,updatedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};});}
async function readEquipmentCache(areaId){const db=await openQueue();return new Promise((resolve,reject)=>{const tx=db.transaction(EQUIPMENT_STORE,"readonly"),req=tx.objectStore(EQUIPMENT_STORE).get(areaId);req.onsuccess=()=>resolve(req.result?.items||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function readScheduleCache(areaId,uid){const db=await openQueue();return new Promise((resolve,reject)=>{const tx=db.transaction(SCHEDULE_STORE,"readonly"),req=tx.objectStore(SCHEDULE_STORE).get(areaId+":"+uid);req.onsuccess=()=>resolve(req.result?.items||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function cacheSchedule(areaId,uid,items){const db=await openQueue();return new Promise((resolve,reject)=>{const tx=db.transaction(SCHEDULE_STORE,"readwrite");tx.objectStore(SCHEDULE_STORE).put({key:areaId+":"+uid,items,updatedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};});}

export async function initMechanicShiftReports({supabase,profile,root}){
  if(activeController)activeController.abort();
  activeController=new AbortController();
  const listenerOptions={signal:activeController.signal};
  const areaId=profile.operationalAreaId;
  const uid=profile.uid||profile.id;
  if(!areaId)throw new Error("Seu login não está vinculado a uma mina. Solicite ao Super Admin a correção do cadastro.");
  const areaName=AREA_LABELS[areaId]||areaId;
  const $=selector=>root.querySelector(selector);
  const state={equipment:[],assignedEquipment:[],assignments:[],reports:[],queue:[],busy:false};
  root.innerHTML=`
    <style>
      #gestaoOperacional .ms-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin:8px 0 18px}
      #gestaoOperacional .ms-head h1{margin:0 0 5px}
      #gestaoOperacional .ms-muted{color:var(--muted,#68737d);font-size:13px}
      #gestaoOperacional .ms-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:13px;padding:18px;margin:14px 0}
      #gestaoOperacional .ms-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
      #gestaoOperacional .ms-field.full{grid-column:1/-1}
      #gestaoOperacional .ms-field label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}
      #gestaoOperacional .ms-field input,#gestaoOperacional .ms-field select,#gestaoOperacional .ms-field textarea{box-sizing:border-box;width:100%;padding:11px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit}
      #gestaoOperacional .ms-field textarea{min-height:88px;resize:vertical}
      #gestaoOperacional .ms-status{padding:10px 12px;border-radius:8px;background:#eef3f7;color:#334155;margin:10px 0;font-size:13px}
      #gestaoOperacional .ms-status.error{background:#fff0ee;color:#a32b21}
      #gestaoOperacional .ms-status.ok{background:#e6f5eb;color:#17663a}
      #gestaoOperacional .ms-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
      #gestaoOperacional .ms-report{border:1px solid var(--line,#e1e6eb);border-radius:10px;padding:14px;margin:10px 0}
      #gestaoOperacional .ms-report h3{margin:0 0 5px;font-size:15px}
      #gestaoOperacional .ms-report p{margin:5px 0;font-size:13px;white-space:pre-wrap}
      #gestaoOperacional .ms-pill{display:inline-block;border-radius:20px;padding:4px 8px;background:#edf1f4;font-size:11px;font-weight:700}
      #gestaoOperacional .ms-pill.synced{background:#e2f5e9;color:#17663a}
      #gestaoOperacional .ms-pill.error,#gestaoOperacional .ms-pill.conflict{background:#fff0ee;color:#a32b21}
      #gestaoOperacional .ms-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      #gestaoOperacional .ms-kpi{padding:13px;border:1px solid var(--line,#e1e6eb);border-radius:10px}
      #gestaoOperacional .ms-kpi strong{display:block;font-size:22px}
      @media(max-width:600px){#gestaoOperacional .ms-grid{grid-template-columns:1fr}#gestaoOperacional .ms-field.full{grid-column:auto}#gestaoOperacional .ms-kpis{grid-template-columns:1fr}}
    </style>
    <div class="ms-head"><div><h1>Relatório de Final de Turno</h1><p class="ms-muted">Área vinculada: <strong>${esc(areaName)}</strong> · Mecânico: <strong>${esc(profile.name||"Usuário")}</strong></p><p class="ms-muted">Registre um único relatório por equipamento e data. Se outros mecânicos participaram, informe os nomes no mesmo registro.</p></div><button class="light" type="button" id="msRefresh">↻ Atualizar</button></div>
    <div class="ms-kpis"><div class="ms-kpi"><span class="ms-muted">Equipamentos disponíveis</span><strong id="msEquipmentCount">—</strong></div><div class="ms-kpi"><span class="ms-muted">Relatórios no histórico</span><strong id="msReportCount">—</strong></div><div class="ms-kpi"><span class="ms-muted">Pendentes neste dispositivo</span><strong id="msPendingCount">—</strong></div></div>
    <div class="ms-card"><h2 style="margin:0 0 8px">Equipamentos em manutenção na área</h2><p class="ms-muted">Todos os mecânicos da área podem consultar os equipamentos em manutenção e os relatórios de final de turno registrados para cada TAG.</p><div id="msMaintenanceEquipment"></div></div>
    <div class="ms-card"><h2 style="margin:0 0 5px">Novo relatório</h2><p class="ms-muted">O formulário é salvo primeiro neste dispositivo. A sincronização com o sistema ocorre quando houver conexão.</p>
      <form id="msForm"><div class="ms-grid">
        <div class="ms-field"><label for="msEquipment">TAG do equipamento *</label><select id="msEquipment" name="equipment_id" required><option value="">Carregando equipamentos...</option></select></div>
        <div class="ms-field"><label for="msDate">Data do trabalho *</label><input id="msDate" name="report_date" type="date" value="${localDate()}" required></div>
        <div class="ms-field"><label for="msHorimeter">Horímetro na intervenção *</label><input id="msHorimeter" name="horimeter" type="number" min="0" step="0.1" required></div>
        <div class="ms-field"><label for="msOtherMechanics">Outros mecânicos participantes</label><input id="msOtherMechanics" name="other_mechanics" placeholder="Separe os nomes por vírgula"></div>
        <div class="ms-field full"><label for="msWork">Serviços realizados *</label><textarea id="msWork" name="work_performed" required placeholder="Descreva as atividades executadas no equipamento"></textarea></div>
        <div class="ms-field full"><label for="msAnomalies">Problemas / anormalidades encontrados</label><textarea id="msAnomalies" name="anomalies" placeholder="Informe sintomas, vazamentos, ruídos, alertas ou outras anormalidades"></textarea></div>
        <div class="ms-field full"><label for="msActions">Ações executadas</label><textarea id="msActions" name="actions_taken" placeholder="Testes, ajustes, inspeções e correções realizados"></textarea></div>
        <div class="ms-field full"><label for="msPending">Pendências para o próximo turno</label><textarea id="msPending" name="pending_items" placeholder="Informe o que ficou pendente ou escreva 'Sem pendências'"></textarea></div>
        <div class="ms-field"><label for="msCondition">Condição final do equipamento *</label><select id="msCondition" name="final_condition" required><option value="available">Disponível para operação</option><option value="stopped">Parado</option><option value="maintenance">Permanece em manutenção</option></select></div>
        <div class="ms-field"><label for="msConditionNotes">Observação da condição final</label><input id="msConditionNotes" name="final_condition_notes" placeholder="Detalhe a condição, se necessário"></div>
      </div><div class="ms-actions"><button class="primary" id="msSave" type="submit">Salvar relatório</button><button class="light" type="reset">Limpar formulário</button></div><div class="ms-status" id="msFeedback" role="status" aria-live="polite">Rascunho local protegido contra perda de conexão.</div></form>
    </div>
    <div class="ms-card"><h2 style="margin:0 0 8px">Fila de sincronização</h2><p class="ms-muted">Relatórios locais só são considerados entregues após confirmação do Supabase.</p><div id="msQueue"></div></div>
    <div class="ms-card"><h2 style="margin:0 0 8px">Histórico por equipamento</h2><p class="ms-muted">Histórico compartilhado com todos os mecânicos da mina. Você pode consultar relatórios de qualquer TAG da área, mesmo que não esteja escalado nela.</p><div class="ms-field" style="max-width:420px;margin:10px 0"><label for="msHistoryFilter">Filtrar por qualquer equipamento da mina</label><select id="msHistoryFilter"><option value="">Todos os equipamentos</option></select></div><div id="msHistory"></div></div>
  `;

  // Painel do mecânico: navegação lateral por áreas, mantendo os mesmos formulários e regras de acesso.
  const msHead=root.querySelector(".ms-head");
  const msKpis=root.querySelector(".ms-kpis");
  const msCards=[...root.querySelectorAll(".ms-card")];
  const msShell=document.createElement("div");
  msShell.className="ms-shell";
  msShell.innerHTML=`
    <aside class="ms-sidebar" aria-label="Menu do painel do mecânico">
      <div class="ms-sidebar-brand"><span class="ms-brand-mark">IR</span><div><strong>IRMEN</strong><small>PAINEL DO MECÂNICO</small></div></div>
      <div class="ms-sidebar-caption">MENU PRINCIPAL</div>
      <nav class="ms-nav">
        <button type="button" class="ms-nav-item active" data-ms-section="overview"><span>▦</span>Visão geral</button>
        <button type="button" class="ms-nav-item" data-ms-section="new-report"><span>＋</span>Novo relatório</button>
        <button type="button" class="ms-nav-item" data-ms-section="maintenance"><span>⚙</span>Equipamentos em manutenção</button>
        <button type="button" class="ms-nav-item" data-ms-section="history"><span>▤</span>Histórico de relatórios</button>
        <button type="button" class="ms-nav-item" data-ms-section="sync"><span>⇅</span>Sincronização</button>
        <button type="button" class="ms-nav-item" data-ms-section="schedule"><span>▦</span>Minha escala</button>
      </nav>
      <div class="ms-sidebar-footer"><span class="ms-online-dot"></span><span id="msConnectionLabel">Verificando conexão…</span></div>
    </aside>
    <div class="ms-workspace">
      <div class="ms-section" data-ms-panel="overview"></div>
      <div class="ms-section" data-ms-panel="new-report" hidden></div>
      <div class="ms-section" data-ms-panel="maintenance" hidden></div>
      <div class="ms-section" data-ms-panel="history" hidden></div>
      <div class="ms-section" data-ms-panel="sync" hidden></div>
      <div class="ms-section" data-ms-panel="schedule" hidden>
        <div class="ms-section-heading"><div><span class="ms-eyebrow">PLANEJAMENTO OPERACIONAL</span><h2>Minha escala</h2><p class="ms-muted">Consulte os equipamentos e as datas em que você foi escalado pelo Supervisor de Área.</p></div><button class="light" type="button" id="msScheduleRefresh">↻ Atualizar escala</button></div>
        <div class="ms-schedule-summary" id="msScheduleSummary"><div class="ms-kpi"><span class="ms-muted">Escalas carregadas</span><strong>—</strong></div></div>
        <div id="msMySchedule"><p class="ms-muted">Carregando sua escala…</p></div>
      </div>
    </div>`;
  const msWorkspace=msShell.querySelector(".ms-workspace");
  const msPanel=id=>msShell.querySelector('[data-ms-panel="'+id+'"]');
  if(profile?.role==="mecanico"){
    const mainNav=document.querySelector("#appShell > nav.tabs");
    const mechanicSidebar=msShell.querySelector(".ms-sidebar");
    if(mainNav&&mechanicSidebar){mainNav.classList.add("ms-mechanic-main-nav");document.body.classList.add("mechanic-shell-layout");mainNav.append(mechanicSidebar);}
  }
  if(msHead)root.insertBefore(msShell,msHead.nextSibling);
  msPanel("overview").innerHTML='<div class="ms-section-heading"><div><span class="ms-eyebrow">ÁREA DO MECÂNICO</span><h2>Visão geral</h2><p class="ms-muted">Acompanhe seus registros, equipamentos escalados e a situação da sincronização.</p></div></div>';
  if(msKpis)msPanel("overview").append(msKpis);
  if(msCards[0])msPanel("maintenance").append(msCards[0]);
  if(msCards[1])msPanel("new-report").append(msCards[1]);
  if(msCards[2])msPanel("sync").append(msCards[2]);
  if(msCards[3])msPanel("history").append(msCards[3]);
  const activateMsSection=id=>{
    msShell.querySelectorAll("[data-ms-panel]").forEach(panel=>{panel.hidden=panel.dataset.msPanel!==id});
    msShell.querySelectorAll("[data-ms-section]").forEach(button=>{const active=button.dataset.msSection===id;button.classList.toggle("active",active);if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current")});
    if(id==="schedule")loadMySchedule();
  };
  msShell.querySelectorAll("[data-ms-section]").forEach(button=>button.addEventListener("click",()=>activateMsSection(button.dataset.msSection)));
  msShell.querySelector("#msScheduleRefresh").addEventListener("click",loadMySchedule);
  function updateMsConnection(){const online=navigator.onLine;const label=msShell.querySelector("#msConnectionLabel");if(label){label.textContent=online?"Conectado":"Trabalhando offline";label.previousElementSibling.style.background=online?"#31b66b":"#e3a900"}}
  window.addEventListener("online",updateMsConnection,listenerOptions);window.addEventListener("offline",updateMsConnection,listenerOptions);updateMsConnection();
  async function loadMySchedule(){
    const box=msShell.querySelector("#msMySchedule"),summary=msShell.querySelector("#msScheduleSummary");
    if(!box)return;
    if(!navigator.onLine){box.innerHTML='<p class="ms-muted">Conecte-se à internet para consultar a escala atualizada. O registro de relatórios continua respeitando a escala previamente armazenada neste dispositivo.</p>';return}
    box.innerHTML='<p class="ms-muted">Consultando sua escala…</p>';
    try{
      const start=new Date();start.setDate(1);const from=start.toISOString().slice(0,10);
      const end=new Date(start.getFullYear(),start.getMonth()+2,0);const to=end.getFullYear()+"-"+String(end.getMonth()+1).padStart(2,"0")+"-"+String(end.getDate()).padStart(2,"0");
      const {data,error}=await supabase.from("operational_mechanic_assignments").select("equipment_id,work_date,status").eq("area_id",areaId).eq("mechanic_id",uid).gte("work_date",from).lte("work_date",to).order("work_date",{ascending:true});
      if(error)throw error;
      const rows=(data||[]).filter(row=>row.status==="scheduled");
      const countDays=new Set(rows.map(row=>row.work_date)).size;
      summary.innerHTML='<div class="ms-kpi"><span class="ms-muted">Alocações no período</span><strong>'+rows.length+'</strong></div><div class="ms-kpi"><span class="ms-muted">Dias escalados</span><strong>'+countDays+'</strong></div><div class="ms-kpi"><span class="ms-muted">Equipamentos diferentes</span><strong>'+new Set(rows.map(row=>row.equipment_id)).size+'</strong></div>';
      if(!rows.length){box.innerHTML='<div class="ms-empty"><strong>Nenhuma escala encontrada</strong><p>Não há equipamentos atribuídos a você neste mês e no próximo. Em caso de dúvida, procure o Supervisor de Área.</p></div>';return}
      const groups={};rows.forEach(row=>(groups[row.work_date]??=[]).push(row));
      box.innerHTML=Object.entries(groups).map(([date,items])=>'<article class="ms-schedule-day"><div class="ms-schedule-date"><strong>'+new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})+'</strong><span>'+items.length+' equipamento(s)</span></div><div class="ms-schedule-tags">'+items.map(row=>{const equipment=state.equipment.find(item=>item.id===row.equipment_id);return '<span class="ms-schedule-tag"><strong>'+esc(equipment?.asset_code||"TAG")+'</strong> '+esc(equipment?.model||equipment?.description||"Equipamento")+'</span>'}).join("")+'</div></article>').join("");
    }catch(error){box.innerHTML='<div class="ms-status error">Não foi possível consultar sua escala. '+esc(error.message||"Verifique sua conexão e tente novamente.")+'</div>'}
  }
  const msStyle=document.createElement("style");
  msStyle.textContent=`
    #gestaoOperacional .ms-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start;margin-top:12px}
    #gestaoOperacional .ms-sidebar{position:sticky;top:14px;min-height:620px;background:#202832;color:#fff;border-radius:15px;padding:18px 12px;display:flex;flex-direction:column;box-shadow:0 8px 24px #17202b18}
    #gestaoOperacional .ms-sidebar-brand{display:flex;align-items:center;gap:10px;padding:6px 8px 22px;border-bottom:1px solid #ffffff20}
    #gestaoOperacional .ms-brand-mark{width:38px;height:38px;border-radius:10px;background:#e4a900;color:#20242b;display:grid;place-items:center;font-weight:900}
    #gestaoOperacional .ms-sidebar-brand strong{display:block;font-size:14px;letter-spacing:.12em}
    #gestaoOperacional .ms-sidebar-brand small{display:block;font-size:9px;letter-spacing:.1em;color:#b9c1cb;margin-top:4px}
    #gestaoOperacional .ms-sidebar-caption{font-size:9px;letter-spacing:.14em;color:#8d99a8;font-weight:800;padding:20px 10px 9px}
    #gestaoOperacional .ms-nav{display:grid;gap:5px}
    #gestaoOperacional .ms-nav-item{width:100%;display:flex;align-items:center;gap:11px;text-align:left;background:transparent;color:#d3d9e0;padding:12px 11px;border-radius:9px;font-size:12px;font-weight:600}
    #gestaoOperacional .ms-nav-item span{width:20px;text-align:center;font-size:17px;color:#aeb8c4}
    #gestaoOperacional .ms-nav-item:hover{background:#ffffff12;color:#fff}
    #gestaoOperacional .ms-nav-item.active{background:#e4a900;color:#20242b;font-weight:800}
    #gestaoOperacional .ms-nav-item.active span{color:#20242b}
    #gestaoOperacional .ms-sidebar-footer{margin-top:auto;padding:18px 9px 4px;border-top:1px solid #ffffff20;display:flex;align-items:center;gap:8px;font-size:11px;color:#c5cdd6}
    #gestaoOperacional .ms-online-dot{width:8px;height:8px;border-radius:50%;background:#31b66b}
    #gestaoOperacional .ms-workspace{min-width:0}
    #gestaoOperacional .ms-section[hidden]{display:none!important}
    #gestaoOperacional .ms-section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin:4px 0 14px}
    #gestaoOperacional .ms-section-heading h2{margin:4px 0;font-size:22px}
    #gestaoOperacional .ms-eyebrow{font-size:10px;font-weight:800;letter-spacing:.13em;color:#9a7600}
    #gestaoOperacional .ms-section .ms-card{margin:0}
    #gestaoOperacional .ms-schedule-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
    #gestaoOperacional .ms-schedule-day{background:#fff;border:1px solid var(--line);border-radius:11px;padding:15px;margin:10px 0}
    #gestaoOperacional .ms-schedule-date{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;text-transform:capitalize}
    #gestaoOperacional .ms-schedule-date span{font-size:11px;color:var(--muted)}
    #gestaoOperacional .ms-schedule-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    #gestaoOperacional .ms-schedule-tag{background:#f2f4f7;border:1px solid #e1e5e9;border-radius:8px;padding:9px 11px;font-size:12px}
    #gestaoOperacional .ms-empty{background:#fff;border:1px dashed var(--line);border-radius:11px;padding:24px;text-align:center;color:var(--muted)}
    #gestaoOperacional .ms-empty strong{color:var(--ink)}
    @media(max-width:900px){#gestaoOperacional .ms-shell{grid-template-columns:1fr}#gestaoOperacional .ms-sidebar{position:static;min-height:0;padding:12px}#gestaoOperacional .ms-nav{grid-template-columns:repeat(2,minmax(0,1fr))}#gestaoOperacional .ms-sidebar-footer{margin-top:14px}}
    @media(max-width:600px){#gestaoOperacional .ms-nav{grid-template-columns:1fr 1fr}#gestaoOperacional .ms-nav-item{font-size:11px;padding:10px 8px}#gestaoOperacional .ms-schedule-summary{grid-template-columns:1fr}#gestaoOperacional .ms-section-heading h2{font-size:19px}}
    body.mechanic-shell-layout #appShell>header{margin-left:260px}
    body.mechanic-shell-layout #appShell>nav.ms-mechanic-main-nav{position:fixed;z-index:100;left:0;top:0;bottom:0;width:260px;overflow-y:auto;display:flex;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:0;padding:12px;background:#202832;border:0;border-right:1px solid #111923}
    body.mechanic-shell-layout #appShell>nav.ms-mechanic-main-nav>*:not(.ms-sidebar){display:none!important}
    body.mechanic-shell-layout #appShell>nav.ms-mechanic-main-nav .ms-sidebar{position:static;min-height:100%;width:100%;margin:0;padding:18px 12px;border-radius:0;box-shadow:none;flex:1}
    body.mechanic-shell-layout #appShell>main{max-width:none;margin-left:260px;padding:20px}
    body.mechanic-shell-layout #gestaoOperacional .ms-shell{margin-top:0}
    @media(max-width:700px){body.mechanic-shell-layout #appShell>header{margin-left:210px}body.mechanic-shell-layout #appShell>nav.ms-mechanic-main-nav{width:210px;padding:8px}body.mechanic-shell-layout #appShell>main{margin-left:210px;padding:12px}body.mechanic-shell-layout #appShell>nav.ms-mechanic-main-nav .ms-nav-item{font-size:11px;padding:10px 7px;gap:7px}}
  `;
  root.append(msStyle);
  // O painel abre sempre na visão geral; as demais áreas ficam disponíveis no menu lateral.
  activateMsSection("overview");

  function feedback(message,type=""){
    const el=$("#msFeedback");el.textContent=message;el.className="ms-status"+(type?" "+type:"");
  }
  function statusPill(status){return '<span class="ms-pill '+(status==="synced"?"synced":status==="error"||status==="conflict"?"error":"")+'">'+esc(statusText(status))+'</span>'}
  async function loadEquipment(){
    let fetched=false;
    try{
      const {data,error}=await supabase.from("operational_equipment").select("id,asset_code,model,description,current_horimeter,status").eq("area_id",areaId).order("asset_code");
      if(error)throw error;
      state.equipment=data||[];
      fetched=true;
    }catch(error){
      state.equipment=await readEquipmentCache(areaId);
      if(!state.equipment.length)throw navigator.onLine?error:new Error("Não há equipamentos armazenados neste dispositivo. Conecte-se uma vez para carregar a frota da mina.");
      feedback("Sem acesso ao servidor neste momento. Usando a última lista de equipamentos salva neste dispositivo.");
    }
    if(fetched){try{await cacheEquipment(areaId,state.equipment)}catch(error){console.warn("[RelatorioPro] Não foi possível atualizar o cache local da frota:",error)}}
    await loadAssignedEquipment($("#msDate").value||localDate());
    renderMaintenanceEquipment();
  }
  async function loadAssignedEquipment(date){
    let items=[];
    if(navigator.onLine){
      const {data,error}=await supabase.from("operational_mechanic_assignments").select("equipment_id,work_date,status").eq("area_id",areaId).eq("mechanic_id",uid).eq("work_date",date).eq("status","scheduled");
      if(error)throw error;
      items=data||[];
      const cached=await readScheduleCache(areaId,uid);
      await cacheSchedule(areaId,uid,[...cached.filter(row=>row.work_date!==date),...items]);
    }else{
      const cached=await readScheduleCache(areaId,uid);
      items=cached.filter(row=>row.work_date===date&&row.status==="scheduled");
    }
    state.assignments=items;
    const assignedIds=new Set(items.map(row=>row.equipment_id));
    state.assignedEquipment=state.equipment.filter(e=>assignedIds.has(e.id)&&e.status!=="inactive");
    $("#msEquipment").innerHTML='<option value="">Selecione a TAG escalada para esta data</option>'+state.assignedEquipment.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.asset_code)+' · '+esc(e.model||e.description||"Equipamento")+'</option>').join("");
    $("#msEquipmentCount").textContent=String(state.assignedEquipment.length);
    renderMaintenanceEquipment();
    if(!state.assignedEquipment.length)feedback("Você não possui equipamento escalado para "+date+". Consulte o Supervisor de Área.");
  }
  async function loadRemoteReports(){
    const {data,error}=await supabase.from("operational_shift_reports").select("*").eq("area_id",areaId).order("report_date",{ascending:false}).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    state.reports=data||[];
    $("#msReportCount").textContent=String(state.reports.length);
    renderHistory();
    renderMaintenanceEquipment();
  }
  async function loadQueue(){
    const all=await queueAll();
    for(const item of all.filter(x=>x.ownerUid===uid&&x.areaId===areaId&&x.status==="syncing")){item.status="pending";await queuePut(item);}
    state.queue=(await queueAll()).filter(x=>x.ownerUid===uid&&x.areaId===areaId);
    const otherAccounts=all.filter(x=>x.ownerUid!==uid).length;
    const otherAreas=all.filter(x=>x.ownerUid===uid&&x.areaId!==areaId).length;
    $("#msPendingCount").textContent=String(state.queue.filter(x=>x.status!=="synced").length);
    renderQueue(otherAccounts,otherAreas);
  }
  function renderQueue(otherAccounts=0,otherAreas=0){
    const box=$("#msQueue");
    if(!state.queue.length){box.innerHTML='<p class="ms-muted">Nenhum relatório aguardando sincronização.</p>';}
    else box.innerHTML=state.queue.slice().sort((a,b)=>String(b.createdLocalAt).localeCompare(String(a.createdLocalAt))).map(item=>'<article class="ms-report"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong>'+esc(item.equipmentLabel)+' · '+esc(item.payload.report_date)+'</strong>'+statusPill(item.status)+'</div><p>'+esc(item.payload.work_performed)+'</p>'+(item.error?'<p class="ms-muted">Detalhe: '+esc(item.error)+'</p>':'')+'</article>').join("");
    if(otherAccounts)box.insertAdjacentHTML("beforeend",'<p class="ms-muted">'+otherAccounts+' pendência(s) pertencem a outra conta neste dispositivo e não serão sincronizadas com este login.</p>');
    if(otherAreas)box.insertAdjacentHTML("beforeend",'<p class="ms-muted">'+otherAreas+' pendência(s) deste usuário estão vinculadas a outra mina. Elas não serão enviadas com o vínculo atual.</p>');
  }
  function renderMaintenanceEquipment(){
    const box=$("#msMaintenanceEquipment");
    if(!box)return;
    const items=state.equipment.filter(e=>e.status==="maintenance").sort((a,b)=>String(a.asset_code).localeCompare(String(b.asset_code),"pt-BR"));
    const filter=$("#msHistoryFilter");
    const previous=filter?.value||"";
    if(filter){
      const visibleEquipment=state.equipment.filter(e=>e.status!=="inactive").sort((a,b)=>String(a.asset_code).localeCompare(String(b.asset_code),"pt-BR"));
      filter.innerHTML='<option value="">Todos os equipamentos da mina</option>'+visibleEquipment.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.asset_code)+' · '+esc(e.model||e.description||"Equipamento")+(e.status==="maintenance"?" · Em manutenção":"")+'</option>').join("");
      if(visibleEquipment.some(e=>e.id===previous))filter.value=previous;
    }
    if(!items.length){box.innerHTML='<p class="ms-muted">Não há equipamentos com status “Em manutenção” nesta área no momento.</p>';return;}
    box.innerHTML=items.map(e=>{
      const latest=state.reports.filter(r=>r.equipment_id===e.id).sort((a,b)=>String(b.report_date).localeCompare(String(a.report_date)))[0];
      const pending=latest?.pending_items?.trim();
      return '<article class="ms-report"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3>'+esc(e.asset_code)+' · '+esc(e.model||e.description||"Equipamento")+'</h3><p class="ms-muted">Horímetro atual: '+esc(e.current_horimeter??"—")+' h · Status: Em manutenção</p></div><span class="ms-pill">Em manutenção</span></div>'+(latest?'<p><strong>Último relatório:</strong> '+esc(new Date(latest.report_date+"T12:00:00").toLocaleDateString("pt-BR"))+' · '+esc(latest.created_by_name||"Mecânico")+'</p>'+(pending?'<p><strong>Pendências registradas:</strong> '+esc(pending)+'</p>':'<p class="ms-muted">O último relatório não registrou pendências.</p>'):'<p class="ms-muted">Ainda não existe relatório de final de turno para este equipamento.</p>')+'<div class="ms-actions"><button class="light" type="button" data-ms-view-equipment="'+esc(e.id)+'">Ver relatórios da TAG</button></div></article>';
    }).join("");
    box.querySelectorAll("[data-ms-view-equipment]").forEach(button=>button.addEventListener("click",()=>{
      if(filter){filter.value=button.dataset.msViewEquipment;renderHistory();}
      activateMsSection("history");
      $("#msHistory").scrollIntoView({behavior:"smooth",block:"start"});
    }));
  }
  function renderHistory(){
    const box=$("#msHistory");
    const selected=$("#msHistoryFilter")?.value||"";
    const reports=selected?state.reports.filter(r=>r.equipment_id===selected):state.reports;
    if(!reports.length){box.innerHTML='<p class="ms-muted">'+(selected?'Ainda não há relatórios para este equipamento.':'Ainda não há relatórios enviados para esta mina.')+'</p>';return;}
    box.innerHTML=reports.map(r=>{
      const equipment=state.equipment.find(e=>e.id===r.equipment_id);
      const label=equipment?equipment.asset_code:"Equipamento";
      const condition={available:"Disponível para operação",stopped:"Parado",maintenance:"Em manutenção"}[r.final_condition]||r.final_condition;
      return '<article class="ms-report"><h3>'+esc(label)+' · '+esc(new Date(r.report_date+"T12:00:00").toLocaleDateString("pt-BR"))+'</h3><p class="ms-muted">Preenchido por '+esc(r.created_by_name||"Mecânico")+' · Horímetro '+esc(r.horimeter)+' h · '+esc(condition)+'</p><p><strong>Serviços:</strong> '+esc(r.work_performed)+'</p>'+(r.other_mechanics?.length?'<p><strong>Participantes:</strong> '+esc(r.other_mechanics.join(", "))+'</p>':'')+(r.anomalies?'<p><strong>Anormalidades:</strong> '+esc(r.anomalies)+'</p>':'')+(r.actions_taken?'<p><strong>Ações:</strong> '+esc(r.actions_taken)+'</p>':'')+(r.pending_items?'<p><strong>Pendências:</strong> '+esc(r.pending_items)+'</p>':'')+(r.final_condition_notes?'<p><strong>Condição final:</strong> '+esc(r.final_condition_notes)+'</p>':'')+'</article>';
    }).join("");
  }
  async function refresh(){
    await loadEquipment();
    await loadQueue();
    if(navigator.onLine){try{await loadRemoteReports()}catch(error){feedback("Não foi possível carregar o histórico remoto. Verifique se a migration 016 foi aplicada e se a sessão está válida. "+(error.message||""),"error")}}
    else {state.reports=[];$("#msReportCount").textContent="—";renderHistory();}
  }
  async function syncQueue(){
    if(state.busy||!navigator.onLine)return;
    state.busy=true;
    try{
      const all=await queueAll();
      const pending=all.filter(x=>x.ownerUid===uid&&x.areaId===areaId&&["pending","error"].includes(x.status));
      for(const item of pending){
        item.status="syncing";item.error="";await queuePut(item);await loadQueue();
        try{
          const {error}=await supabase.from("operational_shift_reports").insert(item.payload);
          if(error){
            if(error.code==="23505"){
              const existing=await supabase.from("operational_shift_reports").select("id,created_by,idempotency_key").eq("area_id",areaId).eq("equipment_id",item.payload.equipment_id).eq("report_date",item.payload.report_date).maybeSingle();
              if(!existing.error&&existing.data?.created_by===uid&&existing.data?.idempotency_key===item.payload.idempotency_key){await queueDelete(item.localId);continue;}
              item.status="conflict";item.error="Já existe um relatório registrado para esta TAG e data. Consulte o histórico antes de tentar novamente.";await queuePut(item);continue;
            }
            throw error;
          }
          await queueDelete(item.localId);
        }catch(error){
          item.status="error";item.error=error.message||"Falha de comunicação com o servidor.";await queuePut(item);
        }
        await loadQueue();
      }
      await loadQueue();
      await loadRemoteReports();
      const remaining=state.queue.filter(x=>x.status!=="conflict");
      if(!remaining.length)feedback("Sincronização concluída. Os relatórios enviados foram confirmados pelo Supabase.","ok");
    }catch(error){feedback("Não foi possível processar a fila offline: "+(error.message||error),"error")}
    finally{state.busy=false;}
  }
  $("#msDate").addEventListener("change",async()=>{try{await loadAssignedEquipment($("#msDate").value)}catch(error){feedback(error.message||"Não foi possível consultar a escala desta data.","error")}});
  $("#msHistoryFilter").addEventListener("change",renderHistory);
  $("#msEquipment").addEventListener("change",()=>{
    const item=state.equipment.find(e=>e.id===$("#msEquipment").value);
    if(item&&(!$("#msHorimeter").value||Number($("#msHorimeter").value)===0))$("#msHorimeter").value=item.current_horimeter||"";
  });
  $("#msForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const formElement=event.currentTarget;
    const button=$("#msSave");if(button.disabled)return;button.disabled=true;
    try{
      const form=Object.fromEntries(new FormData(formElement).entries());
      const equipment=state.assignedEquipment.find(e=>e.id===form.equipment_id);
      if(!equipment)throw new Error("Selecione um equipamento válido da mina vinculada.");
      const horimeter=Number(form.horimeter);
      if(!Number.isFinite(horimeter)||horimeter<0)throw new Error("Informe um horímetro válido.");
      const participants=String(form.other_mechanics||"").split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
      const idempotencyKey=crypto.randomUUID();
      const payload={area_id:areaId,equipment_id:equipment.id,report_date:form.report_date,horimeter,created_by:uid,created_by_name:profile.name||"",other_mechanics:participants,work_performed:form.work_performed.trim(),anomalies:form.anomalies.trim(),actions_taken:form.actions_taken.trim(),pending_items:form.pending_items.trim(),final_condition:form.final_condition,final_condition_notes:form.final_condition_notes.trim(),idempotency_key:idempotencyKey,client_created_at:new Date().toISOString()};
      const localId=idempotencyKey;
      const existingLocal=state.queue.find(x=>x.payload.equipment_id===equipment.id&&x.payload.report_date===form.report_date);
      if(existingLocal)throw new Error("Já existe um relatório local para esta TAG e data. Verifique a fila de sincronização.");
      const existingRemote=state.reports.find(x=>x.equipment_id===equipment.id&&x.report_date===form.report_date);
      if(existingRemote)throw new Error("Já existe um relatório no histórico para esta TAG e data. Não crie um segundo registro.");
      const item={localId,ownerUid:uid,areaId,payload,equipmentLabel:equipment.asset_code+" · "+(equipment.model||""),status:"pending",createdLocalAt:new Date().toISOString(),error:""};
      await queuePut(item);
      await loadQueue();
      formElement.reset();$("#msDate").value=localDate();$("#msHorimeter").value="";
      feedback(navigator.onLine?"Relatório salvo no dispositivo. Iniciando sincronização...":"Relatório salvo localmente. Será enviado quando a conexão retornar.","");
      if(navigator.onLine)await syncQueue();
    }catch(error){feedback(error.message||"Não foi possível salvar o relatório.","error")}
    finally{button.disabled=false;}
  });
  $("#msRefresh").addEventListener("click",async()=>{try{await refresh();if(navigator.onLine)await syncQueue()}catch(error){feedback(error.message||"Falha ao atualizar.","error")}});
  window.addEventListener("online",syncQueue,listenerOptions);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&navigator.onLine)syncQueue()},{signal:activeController.signal});
  try{await refresh();if(navigator.onLine)await syncQueue();}
  catch(error){feedback(error.message||"Não foi possível iniciar o relatório de turno.","error")}
}
