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

  // O menu do mecânico é integrado à navegação lateral principal do RelatorioPro.
  const msHead=root.querySelector(".ms-head");
  const msKpis=root.querySelector(".ms-kpis");
  const msCards=[...root.querySelectorAll(".ms-card")];
  const msShell=document.createElement("div");
  msShell.className="ms-shell";
  msShell.innerHTML=`
    <div class="ms-workspace">
      <div class="ms-section" data-ms-panel="overview"></div>
      <div class="ms-section" data-ms-panel="new-report" hidden></div>
      <div class="ms-section" data-ms-panel="maintenance" hidden></div>
      <div class="ms-section" data-ms-panel="history" hidden></div>
      <div class="ms-section" data-ms-panel="sync" hidden></div>
      <div class="ms-section" data-ms-panel="manuals" hidden>
        <div class="ms-section-heading"><div><span class="ms-eyebrow">BIBLIOTECA TÉCNICA IRMEN SANY</span><h2>Manuais técnicos</h2><p class="ms-muted">Localize o documento e abra-o no visualizador padrão do seu dispositivo. O RelatorioPro não possui leitor ou editor de PDF integrado.</p></div><button class="light" type="button" id="msManualRefresh">↻ Atualizar biblioteca</button></div>
        <div class="ms-resource-card">
          <div class="ms-resource-filters">
            <div class="ms-field"><label for="msManualSearch">Pesquisar manual</label><input id="msManualSearch" type="search" placeholder="Nome, modelo ou palavra-chave"></div>
            <div class="ms-field"><label for="msManualModel">Modelo</label><select id="msManualModel"><option value="">Todos os modelos</option></select></div>
            <div class="ms-field"><label for="msManualSystem">Sistema</label><select id="msManualSystem"><option value="">Todos os sistemas</option></select></div>
            <div class="ms-field"><label for="msManualCategory">Categoria</label><select id="msManualCategory"><option value="">Todas as categorias</option></select></div>
          </div>
          <p class="ms-resource-count" id="msManualCount" aria-live="polite">Carregando manuais autorizados…</p>
          <div class="ms-resource-grid" id="msManualList"><div class="ms-empty">Carregando biblioteca técnica…</div></div>
          <p class="ms-resource-note">Os manuais são disponibilizados somente para consulta. Não há opção de edição ou publicação neste perfil. O aplicativo de abertura depende das configurações do dispositivo.</p>
        </div>
      </div>
      <div class="ms-section" data-ms-panel="pops" hidden>
        <div class="ms-section-heading"><div><span class="ms-eyebrow">PADRONIZAÇÃO E SEGURANÇA</span><h2>POP – Procedimentos Operacionais</h2><p class="ms-muted">Consulte procedimentos aprovados e publicados. O acesso é somente para leitura.</p></div><button class="light" type="button" id="msPopRefresh">↻ Atualizar biblioteca</button></div>
        <div class="ms-resource-card">
          <div class="ms-resource-filters">
            <div class="ms-field"><label for="msPopSearch">Pesquisar POP</label><input id="msPopSearch" type="search" placeholder="Nome, código ou palavra-chave"></div>
            <div class="ms-field"><label for="msPopModel">Modelo</label><select id="msPopModel"><option value="">Todos os modelos</option></select></div>
            <div class="ms-field"><label for="msPopSystem">Sistema</label><select id="msPopSystem"><option value="">Todos os sistemas</option></select></div>
            <div class="ms-field"><label for="msPopCategory">Categoria</label><select id="msPopCategory"><option value="">Todas as categorias</option></select></div>
          </div>
          <p class="ms-resource-count" id="msPopCount" aria-live="polite">Carregando POPs aprovados…</p>
          <div class="ms-resource-grid" id="msPopList"><div class="ms-empty">Carregando procedimentos…</div></div>
          <div class="ms-pop-detail" id="msPopDetail" hidden></div>
          <p class="ms-resource-note">Os POPs são apresentados em modo de consulta. Etapas e checklists não são marcados nem enviados pelo mecânico.</p>
        </div>
      </div>
      <div class="ms-section" data-ms-panel="schedule" hidden>
        <div class="ms-section-heading"><div><span class="ms-eyebrow">PLANEJAMENTO OPERACIONAL</span><h2>Minha escala</h2><p class="ms-muted">Consulte os equipamentos e as datas em que você foi escalado pelo Supervisor de Área.</p></div><button class="light" type="button" id="msScheduleRefresh">↻ Atualizar escala</button></div>
        <div class="ms-schedule-summary" id="msScheduleSummary"><div class="ms-kpi"><span class="ms-muted">Escalas carregadas</span><strong>—</strong></div></div>
        <div id="msMySchedule"><p class="ms-muted">Carregando sua escala…</p></div>
      </div>
    </div>`;
  const msWorkspace=msShell.querySelector(".ms-workspace");
  const msPanel=id=>msShell.querySelector('[data-ms-panel="'+id+'"]');
  const mainNav=document.querySelector("#appShell > nav.tabs");
  const mechanicMenu=[["overview","▦","Visão geral"],["new-report","＋","Novo relatório"],["maintenance","⚙","Equipamentos em manutenção"],["history","▤","Histórico de relatórios"],["sync","⇅","Sincronização"],["manuals","▤","Manuais técnicos"],["pops","▣","POP – Procedimentos Operacionais"],["schedule","▦","Minha escala"]];
  if(mainNav){
    mainNav.querySelectorAll(".mechanic-main-tab,.mechanic-nav-caption,.mechanic-connection").forEach(el=>el.remove());
    const anchor=mainNav.querySelector("#sessionInfo");
    const caption=document.createElement("div");
    caption.className="mechanic-nav-caption";
    caption.textContent="ÁREA DO MECÂNICO";
    caption.style.cssText="padding:18px 20px 7px;color:#8d99a8;font-size:10px;font-weight:800;letter-spacing:.14em";
    mainNav.insertBefore(caption,anchor||null);
    mechanicMenu.forEach(([id,icon,label])=>{
      const button=document.createElement("button");
      button.type="button";button.className="tab mechanic-main-tab";
      button.dataset.mechanicSection=id;button.textContent=icon+"   "+label;
      button.addEventListener("click",()=>activateMsSection(id));
      mainNav.insertBefore(button,anchor||null);
    });
    const connection=document.createElement("div");
    connection.className="muted mechanic-connection";connection.id="msConnectionLabel";
    connection.style.cssText="padding:12px 20px;font-size:12px";
    mainNav.insertBefore(connection,anchor||null);
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
    document.querySelectorAll(".mechanic-main-tab").forEach(button=>{const active=button.dataset.mechanicSection===id;button.classList.toggle("active",active);if(active)button.setAttribute("aria-current","page");else button.removeAttribute("aria-current")});
    if(id==="schedule")loadMySchedule();
    if(id==="manuals")loadManualLibrary();
    if(id==="pops")loadPopLibrary();
  };

  const resourceState={manuals:[],pops:[],manualsLoaded:false,popsLoaded:false,loadingManuals:false,loadingPops:false};
  const normalizeResource=row=>({...((row&&row.legacy_data&&typeof row.legacy_data==="object")?row.legacy_data:{}),id:row.id,title:row.title||row.legacy_data?.title||"Documento sem título",description:row.description||row.legacy_data?.description||"",category:row.category||row.legacy_data?.category||"",status:row.status,version:row.version||row.legacy_data?.version||1,updatedAt:row.updated_at||row.legacy_data?.updatedOn||"",legacy:row.legacy_data||{}});
  const resourceText=value=>String(value??"").trim();
  const resourceDate=value=>{if(!value)return "Data não informada";const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):d.toLocaleDateString("pt-BR")};
  const resourceMeta=item=>({model:resourceText(item.equipment||item.model||item.machineModel),system:resourceText(item.system||item.systemName||item.technicalSystem),category:resourceText(item.category||item.docCategory||item.procedureCategory)});
  async function fetchPublishedResources(){
    const {data,error}=await supabase.from("trainings").select("id,title,category,description,status,version,legacy_data,updated_at").eq("status","published").order("updated_at",{ascending:false});
    if(error)throw error;
    return (data||[]).map(normalizeResource);
  }
  function fillResourceFilter(id,items,key,label){
    const select=$(id),current=select.value,values=[...new Set(items.map(item=>resourceMeta(item)[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    select.innerHTML='<option value="">'+label+'</option>'+values.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join("");
    if(values.includes(current))select.value=current;
  }
  function renderManualLibrary(){
    const term=$("#msManualSearch").value.trim().toLocaleLowerCase("pt-BR"),model=$("#msManualModel").value,system=$("#msManualSystem").value,category=$("#msManualCategory").value;
    const items=resourceState.manuals.filter(item=>{const meta=resourceMeta(item),haystack=[item.title,item.description,item.fileName,meta.model,meta.system,meta.category,item.language].join(" ").toLocaleLowerCase("pt-BR");return(!term||haystack.includes(term))&&(!model||meta.model===model)&&(!system||meta.system===system)&&(!category||meta.category===category)});
    $("#msManualCount").textContent=items.length+" de "+resourceState.manuals.length+" manual(is) autorizado(s)";
    $("#msManualList").innerHTML=items.length?items.map(item=>{const meta=resourceMeta(item);return '<article class="ms-resource-item"><div class="ms-resource-file ms-resource-pdf">PDF</div><div class="ms-resource-body"><span class="ms-resource-tag">PUBLICADO</span><h3>'+esc(item.title)+'</h3>'+(item.description?'<p>'+esc(item.description)+'</p>':'')+'<div class="ms-resource-meta">'+[meta.model,meta.system,meta.category,item.language].filter(Boolean).map(esc).join(" · ")+'</div><small>Arquivo: '+esc(item.fileName||"Documento PDF")+' · Atualizado: '+resourceDate(item.updatedAt)+'</small><div class="ms-resource-actions"><button class="primary" type="button" data-ms-open-manual="'+esc(item.id)+'">↗ Abrir manual</button></div></div></article>'}).join(""):'<div class="ms-empty"><strong>Nenhum manual encontrado.</strong><br>Altere os filtros ou consulte o responsável pela biblioteca técnica.</div>';
  }
  async function loadManualLibrary(force=false){
    if(resourceState.loadingManuals)return;
    if(resourceState.manualsLoaded&&!force){renderManualLibrary();return;}
    resourceState.loadingManuals=true;$("#msManualList").innerHTML='<div class="ms-empty">Carregando manuais publicados…</div>';
    try{
      const rows=await fetchPublishedResources();
      resourceState.manuals=rows.filter(item=>item.docType==="technical_manual"&&item.path&&item.status==="published");
      resourceState.manualsLoaded=true;
      fillResourceFilter("msManualModel",resourceState.manuals,"model","Todos os modelos");
      fillResourceFilter("msManualSystem",resourceState.manuals,"system","Todos os sistemas");
      fillResourceFilter("msManualCategory",resourceState.manuals,"category","Todas as categorias");
      renderManualLibrary();
    }catch(error){$("#msManualList").innerHTML='<div class="ms-status error">Não foi possível carregar os manuais autorizados: '+esc(error.message||"Erro de consulta")+'</div>'}
    finally{resourceState.loadingManuals=false}
  }
  async function openManualExternally(id,button){
    const item=resourceState.manuals.find(entry=>entry.id===id);
    if(!item||!item.path||item.status!=="published")throw new Error("Manual indisponível ou não publicado.");
    const tab=window.open("about:blank","_blank");
    if(!tab)throw new Error("O navegador bloqueou a nova aba. Permita pop-ups para abrir o manual.");
    try{
      tab.opener=null;
      tab.document.title="Abrindo manual técnico…";
      const {data,error}=await supabase.storage.from("training-attachments-private").createSignedUrl(item.path,3600);
      if(error)throw error;
      if(!data?.signedUrl)throw new Error("O serviço não retornou um endereço seguro para o documento.");
      tab.location.replace(data.signedUrl);
    }catch(error){tab.close();throw error}
  }
  function isPopResource(item){
    const type=resourceText(item.docType||item.legacy?.docType).toLocaleLowerCase("pt-BR");
    const category=resourceText(item.category).toLocaleLowerCase("pt-BR");
    return ["pop","operational_procedure","procedimento_operacional","procedimento operacional"].includes(type)||category==="pop"||category.startsWith("pop -")||category.startsWith("pop –");
  }
  function renderPopLibrary(){
    const term=$("#msPopSearch").value.trim().toLocaleLowerCase("pt-BR"),model=$("#msPopModel").value,system=$("#msPopSystem").value,category=$("#msPopCategory").value;
    const items=resourceState.pops.filter(item=>{const meta=resourceMeta(item),haystack=[item.title,item.description,item.code,item.keywords,meta.model,meta.system,meta.category].join(" ").toLocaleLowerCase("pt-BR");return(!term||haystack.includes(term))&&(!model||meta.model===model)&&(!system||meta.system===system)&&(!category||meta.category===category)});
    $("#msPopCount").textContent=items.length+" de "+resourceState.pops.length+" POP(s) aprovado(s) e publicado(s)";
    $("#msPopList").innerHTML=items.length?items.map(item=>{const meta=resourceMeta(item);return '<article class="ms-resource-item ms-pop-item"><div class="ms-resource-file ms-resource-pop">POP</div><div class="ms-resource-body"><span class="ms-resource-tag">APROVADO · PUBLICADO</span><h3>'+esc(item.title)+'</h3>'+(item.description?'<p>'+esc(item.description)+'</p>':'')+'<div class="ms-resource-meta">'+[meta.model,meta.system,meta.category].filter(Boolean).map(esc).join(" · ")+'</div><small>Versão '+esc(item.version)+' · Atualizado: '+resourceDate(item.updatedAt)+'</small><div class="ms-resource-actions"><button class="primary" type="button" data-ms-view-pop="'+esc(item.id)+'">Visualizar POP</button></div></div></article>'}).join(""):'<div class="ms-empty"><strong>Nenhum POP aprovado e publicado encontrado.</strong><br>Os procedimentos aparecerão aqui após a aprovação e publicação pelo Gerente de Treinamento.</div>';
  }
  async function loadPopLibrary(force=false){
    if(resourceState.loadingPops)return;
    if(resourceState.popsLoaded&&!force){renderPopLibrary();return;}
    resourceState.loadingPops=true;$("#msPopList").innerHTML='<div class="ms-empty">Carregando POPs aprovados…</div>';
    try{
      const rows=await fetchPublishedResources();
      resourceState.pops=rows.filter(item=>isPopResource(item)&&item.status==="published");
      resourceState.popsLoaded=true;
      fillResourceFilter("msPopModel",resourceState.pops,"model","Todos os modelos");
      fillResourceFilter("msPopSystem",resourceState.pops,"system","Todos os sistemas");
      fillResourceFilter("msPopCategory",resourceState.pops,"category","Todas as categorias");
      renderPopLibrary();
    }catch(error){$("#msPopList").innerHTML='<div class="ms-status error">Não foi possível carregar os POPs publicados: '+esc(error.message||"Erro de consulta")+'</div>'}
    finally{resourceState.loadingPops=false}
  }
  async function viewPop(id){
    const item=resourceState.pops.find(entry=>entry.id===id);
    if(!item||item.status!=="published"||!isPopResource(item))throw new Error("POP indisponível ou não publicado.");
    const detail=$("#msPopDetail"),meta=resourceMeta(item),steps=Array.isArray(item.steps)?item.steps:Array.isArray(item.procedureSteps)?item.procedureSteps:[];
    const body=resourceText(item.procedure||item.content||item.instructions||item.legacy?.procedure||item.legacy?.content||item.legacy?.instructions);
    const stepHtml=steps.length?'<ol class="ms-pop-steps">'+steps.map((step,index)=>{const title=typeof step==="string"?step:step.title||step.name||("Etapa "+(index+1)),description=typeof step==="string"?"":step.description||step.instructions||"";return '<li><strong>'+esc(title)+'</strong>'+(description?'<p>'+esc(description)+'</p>':'')+'</li>'}).join("")+'</ol>':"";
    const files=Array.isArray(item.attachments)?item.attachments:[];
    const fileHtml=files.length?'<div class="ms-pop-files"><h3>Materiais do procedimento</h3>'+files.map((file,index)=>'<div class="ms-pop-file"><span>'+esc(file.name||("Anexo "+(index+1)))+' · '+esc(file.kind||"Arquivo")+'</span><button class="light" type="button" data-ms-pop-file="'+index+'">Abrir anexo</button></div>').join("")+'</div>':"";
    detail.innerHTML='<div class="ms-section-heading"><div><span class="ms-eyebrow">PROCEDIMENTO APROVADO · SOMENTE LEITURA</span><h2>'+esc(item.title)+'</h2><p class="ms-muted">'+[meta.model,meta.system,meta.category,"Versão "+item.version].filter(Boolean).map(esc).join(" · ")+'</p></div><button class="light" type="button" id="msClosePop">← Voltar à biblioteca</button></div>'+(item.description?'<p class="ms-pop-description">'+esc(item.description)+'</p>':'')+(body?'<div class="ms-pop-content">'+esc(body)+'</div>':'')+stepHtml+fileHtml+(!body&&!steps.length&&!files.length?'<div class="ms-empty">Este POP não possui etapas ou anexos cadastrados. Consulte a descrição e as informações de classificação acima.</div>':'');
    detail.hidden=false;$("#msPopList").hidden=true;detail.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function openPopAttachment(index){
    const item=resourceState.pops.find(entry=>entry.id===$("#msPopDetail").dataset.popId);
    const file=item?.attachments?.[index];
    if(!file)throw new Error("Anexo não encontrado.");
    const tab=window.open("about:blank","_blank");if(!tab)throw new Error("O navegador bloqueou a nova aba. Permita pop-ups para abrir o anexo.");
    try{
      tab.opener=null;
      if(file.path){
        const {data,error}=await supabase.storage.from("training-attachments-private").createSignedUrl(file.path,3600);
        if(error)throw error;
        if(!data?.signedUrl)throw new Error("Não foi possível gerar o acesso ao anexo.");
        tab.location.replace(data.signedUrl);
      }else if(file.url){tab.location.replace(file.url)}
      else throw new Error("O anexo não possui um arquivo associado.");
    }catch(error){tab.close();throw error}
  }
  msPanel("manuals").querySelectorAll("input,select").forEach(el=>el.addEventListener(el.tagName==="INPUT"?"input":"change",renderManualLibrary));
  msPanel("pops").querySelectorAll("input,select").forEach(el=>el.addEventListener(el.tagName==="INPUT"?"input":"change",renderPopLibrary));
  $("#msManualRefresh").addEventListener("click",()=>loadManualLibrary(true));
  $("#msPopRefresh").addEventListener("click",()=>{resourceState.popsLoaded=false;loadPopLibrary(true)});
  $("#msManualList").addEventListener("click",async event=>{const button=event.target.closest("[data-ms-open-manual]");if(!button)return;button.disabled=true;try{await openManualExternally(button.dataset.msOpenManual,button)}catch(error){feedback(error.message||"Não foi possível abrir o manual.","error")}finally{button.disabled=false}});
  $("#msPopList").addEventListener("click",event=>{const button=event.target.closest("[data-ms-view-pop]");if(!button)return;$("#msPopDetail").dataset.popId=button.dataset.msViewPop;viewPop(button.dataset.msViewPop).catch(error=>feedback(error.message||"Não foi possível abrir o POP.","error"))});
  $("#msPopDetail").addEventListener("click",async event=>{if(event.target.closest("#msClosePop")){$("#msPopDetail").hidden=true;$("#msPopList").hidden=false;return}const button=event.target.closest("[data-ms-pop-file]");if(button){button.disabled=true;try{await openPopAttachment(Number(button.dataset.msPopFile))}catch(error){feedback(error.message||"Não foi possível abrir o anexo.","error")}finally{button.disabled=false}}});

  msShell.querySelector("#msScheduleRefresh").addEventListener("click",loadMySchedule);
  function updateMsConnection(){const online=navigator.onLine;const label=document.querySelector("#msConnectionLabel");if(label){label.innerHTML='<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(online?"#31b66b":"#e3a900")+';margin-right:8px"></span>'+(online?"Conectado":"Trabalhando offline")}}
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
    #gestaoOperacional .ms-shell{display:block;margin-top:12px}
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
    #gestaoOperacional .ms-resource-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
    #gestaoOperacional .ms-resource-filters{display:grid;grid-template-columns:2fr repeat(3,minmax(140px,1fr));gap:10px}
    #gestaoOperacional .ms-resource-filters .ms-field{min-width:0}
    #gestaoOperacional .ms-resource-filters label{display:block;font-size:12px;font-weight:700;margin-bottom:6px}
    #gestaoOperacional .ms-resource-filters input,#gestaoOperacional .ms-resource-filters select{width:100%;min-width:0;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
    #gestaoOperacional .ms-resource-count{font-size:12px;color:var(--muted);margin:14px 0}
    #gestaoOperacional .ms-resource-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #gestaoOperacional .ms-resource-item{display:flex;gap:13px;align-items:flex-start;border:1px solid var(--line);border-radius:11px;padding:14px;min-width:0;background:#fff}
    #gestaoOperacional .ms-resource-file{width:44px;height:50px;flex:0 0 44px;border-radius:8px;display:grid;place-items:center;font-size:11px;font-weight:900}
    #gestaoOperacional .ms-resource-pdf{background:#fff0ee;color:#b33b32}
    #gestaoOperacional .ms-resource-pop{background:#fff5d8;color:#8a6500}
    #gestaoOperacional .ms-resource-body{min-width:0;flex:1}
    #gestaoOperacional .ms-resource-body h3{font-size:14px;margin:6px 0}
    #gestaoOperacional .ms-resource-body p{font-size:12px;color:var(--muted);margin:5px 0;white-space:pre-wrap}
    #gestaoOperacional .ms-resource-body small{display:block;color:var(--muted);font-size:11px;margin-top:6px}
    #gestaoOperacional .ms-resource-tag{font-size:9px;font-weight:800;letter-spacing:.08em;color:#24764e}
    #gestaoOperacional .ms-resource-meta{font-size:11px;color:var(--muted);margin-top:7px}
    #gestaoOperacional .ms-resource-actions{display:flex;gap:8px;margin-top:12px}
    #gestaoOperacional .ms-resource-actions button{font-size:12px;padding:8px 11px}
    #gestaoOperacional .ms-resource-note{font-size:11px;color:var(--muted);margin:16px 0 0}
    #gestaoOperacional .ms-pop-detail{margin-top:18px;border-top:1px solid var(--line);padding-top:16px}
    #gestaoOperacional .ms-pop-description{font-size:14px;line-height:1.6;white-space:pre-wrap}
    #gestaoOperacional .ms-pop-content{white-space:pre-wrap;line-height:1.65;background:#f7f8fa;border-radius:9px;padding:14px;margin:12px 0}
    #gestaoOperacional .ms-pop-steps{padding-left:24px;line-height:1.6}
    #gestaoOperacional .ms-pop-steps li{padding:8px 0}
    #gestaoOperacional .ms-pop-steps p{margin:4px 0;color:var(--muted);white-space:pre-wrap}
    #gestaoOperacional .ms-pop-files{margin-top:18px}
    #gestaoOperacional .ms-pop-file{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}
    @media(max-width:900px){#gestaoOperacional .ms-resource-filters{grid-template-columns:repeat(2,minmax(0,1fr))}#gestaoOperacional .ms-resource-grid{grid-template-columns:1fr}}
    @media(max-width:600px){#gestaoOperacional .ms-schedule-summary{grid-template-columns:1fr}#gestaoOperacional .ms-section-heading h2{font-size:19px}#gestaoOperacional .ms-resource-filters{grid-template-columns:1fr}#gestaoOperacional .ms-resource-item{padding:11px}#gestaoOperacional .ms-pop-file{align-items:flex-start;flex-direction:column}}
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
