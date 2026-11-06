/* Gestão Operacional — Fase 1
 * Protótipo funcional isolado: grava somente no localStorage deste navegador.
 * Não envia dados ao Supabase e não altera dados do Relatório Pro.
 */
export function initGestaoOperacional({ $, isMaster }) {
  const root = $("gestaoOperacional");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  const STORAGE_KEY = "relatoriopro-gestao-operacional-phase1-demo-v1";
  const state = {
    clients: [], contracts: [], operations: [], assets: [], components: [],
    hourmeters: [], workOrders: [], failures: [], downtimes: []
  };
  let editing = null;
  let activeTab = "overview";

  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : "go-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  const now = () => new Date().toISOString();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const fmtDate = (v) => v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—";
  const fmtNumber = (v) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const label = (type, id) => {
    const collection = state[type] || [];
    const item = collection.find(x => x.id === id);
    if (!item) return "Não vinculado";
    return item.name || item.asset_code || item.code || item.order_number || "Registro";
  };
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.error("[Gestão Operacional] Falha ao salvar protótipo local:", e); alert("Não foi possível salvar os dados neste navegador."); }
    renderAll();
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.keys(state).forEach(k => { state[k] = Array.isArray(parsed[k]) ? parsed[k] : []; });
      }
    } catch (e) { console.error("[Gestão Operacional] Dados locais inválidos:", e); }
    if (!state.clients.length && !state.contracts.length && !state.operations.length && !state.assets.length) seedDemo();
  };
  function seedDemo() {
    const clientId = uid(), contractId = uid(), operationId = uid();
    state.clients.push({ id:clientId, name:"Cliente demonstração", document:"", contact:"", status:"Ativo", notes:"Registro fictício para avaliação do fluxo.", created_at:now() });
    state.contracts.push({ id:contractId, client_id:clientId, code:"DEMO-001", name:"Manutenção de frota de caminhões", start_date:"2026-11-01", end_date:"", status:"Ativo", notes:"Contrato fictício.", created_at:now() });
    state.operations.push({ id:operationId, contract_id:contractId, code:"OP-001", name:"Operação Mina Modelo", location:"Área de demonstração", status:"Ativa", notes:"Operação fictícia e independente.", created_at:now() });
    const a1=uid(),a2=uid();
    state.assets.push(
      { id:a1, operation_id:operationId, asset_code:"CAM-DEMO-001", asset_category:"truck", manufacturer:"Fabricante demonstrativo", model:"Caminhão fora de estrada", serial_number:"SÉRIE-DEMO-001", year:"2024", current_hourmeter:18420, status:"Disponível", notes:"Equipamento fictício.", created_at:now() },
      { id:a2, operation_id:operationId, asset_code:"CAM-DEMO-002", asset_category:"truck", manufacturer:"Fabricante demonstrativo", model:"Caminhão articulado", serial_number:"SÉRIE-DEMO-002", year:"2023", current_hourmeter:8240, status:"Em manutenção", notes:"Equipamento fictício.", created_at:now() }
    );
    state.hourmeters.push({ id:uid(), asset_id:a1, reading:18380, reading_at:"2026-10-29T12:00:00", source:"Lançamento demonstrativo", notes:"", created_at:now() },{ id:uid(), asset_id:a1, reading:18420, reading_at:"2026-11-05T12:00:00", source:"Lançamento demonstrativo", notes:"", created_at:now() });
    state.workOrders.push({ id:uid(), asset_id:a2, order_number:"OS-DEMO-001", order_type:"Corretiva", priority:"Alta", status:"Em andamento", description:"Inspeção de sistema de transmissão — exemplo fictício.", opened_at:"2026-11-04", hourmeter:8240, assigned_to:"Equipe demonstrativa", created_at:now() });
    state.failures.push({ id:uid(), asset_id:a2, component_id:"", failure_date:"2026-11-04", system:"Transmissão", failure_mode:"Vazamento", symptom:"Indício de vazamento — exemplo", cause:"Não determinada", severity:"Alta", notes:"Registro fictício para testar histórico.", created_at:now() });
    state.downtimes.push({ id:uid(), asset_id:a2, work_order_id:"", start_at:"2026-11-04T08:00", end_at:"", category:"Corretiva", reason:"Parada demonstrativa", planned:false, counts_unavailable:true, created_at:now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const configs = {
    clients: { title:"Cliente", fields:[
      ["name","Nome do cliente","text",true],["document","CNPJ / identificação","text",false],["contact","Contato responsável","text",false],["status","Status","select",true,["Ativo","Inativo"]],["notes","Observações","textarea",false]
    ]},
    contracts: { title:"Contrato", fields:[
      ["client_id","Cliente","select",true,"clients"],["code","Código do contrato","text",true],["name","Nome / escopo do contrato","text",true],["start_date","Início","date",false],["end_date","Término","date",false],["status","Status","select",true,["Ativo","Suspenso","Encerrado"]],["notes","Observações","textarea",false]
    ]},
    operations: { title:"Operação", fields:[
      ["contract_id","Contrato","select",true,"contracts"],["code","Código da operação","text",true],["name","Nome da operação","text",true],["location","Local / área","text",false],["status","Status","select",true,["Ativa","Suspensa","Encerrada"]],["notes","Observações","textarea",false]
    ]},
    assets: { title:"Caminhão", fields:[
      ["operation_id","Operação","select",true,"operations"],["asset_code","Código patrimonial / identificação","text",true],["manufacturer","Fabricante","text",false],["model","Modelo","text",true],["serial_number","Número de série / chassi","text",false],["year","Ano","number",false],["current_hourmeter","Horímetro atual (h)","number",true],["status","Status operacional","select",true,["Disponível","Em operação","Em manutenção","Indisponível","Inativo"]],["notes","Observações","textarea",false]
    ]},
    components: { title:"Componente", fields:[
      ["asset_id","Caminhão","select",true,"assets"],["component_code","Código do componente","text",false],["name","Nome do componente / conjunto","text",true],["system","Sistema","select",true,["Motor","Transmissão","Diferencial","Sistema hidráulico","Freios","Arrefecimento","Elétrico","Rodagem / pneus","Chassi / estrutura","Outro"]],["serial_number","Número de série","text",false],["installed_hourmeter","Horímetro de instalação","number",false],["status","Status","select",true,["Instalado","Removido","Em análise"]]
    ]},
    hourmeters: { title:"Leitura de horímetro", fields:[
      ["asset_id","Caminhão","select",true,"assets"],["reading","Leitura (h)","number",true],["reading_at","Data e hora da leitura","datetime-local",true],["source","Origem da leitura","select",true,["Apontamento manual","Telemetria","Relatório de operação","Inspeção"]],["notes","Observações / evidência","textarea",false]
    ]},
    workOrders: { title:"Ordem de serviço", fields:[
      ["asset_id","Caminhão","select",true,"assets"],["order_number","Número da OS","text",true],["order_type","Tipo","select",true,["Preventiva","Corretiva","Inspeção","Preditiva","Melhoria"]],["priority","Prioridade","select",true,["Baixa","Média","Alta","Crítica"]],["status","Status","select",true,["Aberta","Programada","Em andamento","Aguardando peça","Aguardando recurso","Aguardando aprovação","Concluída","Cancelada"]],["opened_at","Data de abertura","date",true],["hourmeter","Horímetro na abertura","number",false],["assigned_to","Responsável / equipe","text",false],["description","Descrição da solicitação / serviço","textarea",true]
    ]},
    failures: { title:"Registro de falha", fields:[
      ["asset_id","Caminhão","select",true,"assets"],["component_id","Componente (opcional)","select",false,"components"],["failure_date","Data da falha","date",true],["system","Sistema afetado","select",true,["Motor","Transmissão","Diferencial","Sistema hidráulico","Freios","Arrefecimento","Elétrico","Rodagem / pneus","Chassi / estrutura","Outro"]],["failure_mode","Modo de falha","text",true],["symptom","Sintoma observado","textarea",true],["cause","Causa identificada (se conhecida)","text",false],["severity","Criticidade","select",true,["Baixa","Média","Alta","Crítica"]],["notes","Evidências / observações","textarea",false]
    ]},
    downtimes: { title:"Evento de parada", fields:[
      ["asset_id","Caminhão","select",true,"assets"],["work_order_id","Ordem de serviço (opcional)","select",false,"workOrders"],["start_at","Início da parada","datetime-local",true],["end_at","Fim da parada (se liberado)","datetime-local",false],["category","Categoria","select",true,["Corretiva","Preventiva","Aguardando peça","Aguardando equipe","Aguardando liberação","Operacional","Programada","Outra"]],["reason","Motivo / descrição","textarea",true],["planned","Parada planejada?","select",true,["Não","Sim"]],["counts_unavailable","Conta como indisponibilidade?","select",true,["Sim","Não"]]
    ]}
  };

  const nav = [
    ["overview","Visão geral","layout"],["clients","Clientes","building"],["contracts","Contratos","file"],["operations","Operações","layers"],["assets","Frota de caminhões","truck"],["components","Componentes","cog"],["hourmeters","Horímetros","clock"],["workOrders","Ordens de serviço","wrench"],["failures","Falhas","alert"],["downtimes","Paradas","pause"]
  ];
  const titles = { clients:"Clientes", contracts:"Contratos", operations:"Operações independentes", assets:"Frota de caminhões", components:"Componentes e conjuntos", hourmeters:"Histórico de horímetros", workOrders:"Ordens de serviço", failures:"Histórico de falhas", downtimes:"Eventos de parada" };

  function optionsFor(field) {
    const type = field[4];
    if (!Array.isArray(state[type])) return [];
    return state[type].map(item => {
      const text = type==="clients" ? item.name : type==="contracts" ? item.code+" — "+item.name : type==="operations" ? item.code+" — "+item.name : type==="assets" ? item.asset_code+" — "+item.model : type==="components" ? item.name+" ("+label("assets",item.asset_id)+")" : item.order_number+" — "+label("assets",item.asset_id);
      return '<option value="'+esc(item.id)+'">'+esc(text)+'</option>';
    }).join("");
  }
  function fieldHtml(f, value="") {
    const [key,name,type,required,source] = f;
    const req = required ? " required" : "";
    if (type==="textarea") return '<label class="go-form-field full"><span>'+esc(name)+'</span><textarea name="'+key+'"'+req+'>'+esc(value)+'</textarea></label>';
    if (type==="select") {
      const opts = Array.isArray(source) ? source.map(v=>'<option'+(String(value)===v?' selected':'')+'>'+esc(v)+'</option>').join("") : optionsFor(f);
      return '<label class="go-form-field"><span>'+esc(name)+'</span><select name="'+key+'"'+req+'><option value="">Selecione...</option>'+opts+'</select></label>';
    }
    return '<label class="go-form-field"><span>'+esc(name)+'</span><input name="'+key+'" type="'+type+'" value="'+esc(value)+'"'+req+(type==="number"?' min="0" step="0.1"':'')+'></label>';
  }
  function openForm(type, id="") {
    if (!isMaster()) return;
    const cfg = configs[type], existing = state[type].find(x=>x.id===id) || {};
    editing = { type, id };
    $("goModalTitle").textContent = (id ? "Editar " : "Cadastrar ") + cfg.title;
    $("goModalFields").innerHTML = cfg.fields.map(f=>fieldHtml(f,existing[f[0]] ?? "")).join("");
    $("goModal").hidden = false;
    $("goModalStatus").textContent = "";
    $("goModalFields").querySelector("input,select,textarea")?.focus();
  }
  function closeForm() { $("goModal").hidden = true; editing = null; }
  function relationSummary(type,item) {
    if(type==="contracts") return label("clients",item.client_id);
    if(type==="operations") return label("contracts",item.contract_id);
    if(type==="assets") return label("operations",item.operation_id);
    if(type==="components") return label("assets",item.asset_id);
    if(type==="hourmeters"||type==="workOrders"||type==="failures"||type==="downtimes") return label("assets",item.asset_id);
    return "";
  }
  function rowActions(type,item) {
    return '<span class="go-row-actions"><button type="button" class="light" data-go-edit="'+type+'" data-id="'+esc(item.id)+'">Editar</button><button type="button" class="danger" data-go-delete="'+type+'" data-id="'+esc(item.id)+'">Excluir</button></span>';
  }
  function table(type, cols, rows) {
    if(!rows.length) return '<div class="go-empty">Nenhum registro cadastrado. Use o botão “Novo cadastro” para começar.</div>';
    return '<div class="go-table-wrap"><table class="go-table"><thead><tr>'+cols.map(c=>'<th>'+esc(c[1])+'</th>').join("")+'<th>Vínculo</th><th>Ações</th></tr></thead><tbody>'+rows.map(item=>'<tr>'+cols.map(c=>'<td>'+esc(c[2](item))+'</td>').join("")+'<td>'+esc(relationSummary(type,item)||"—")+'</td><td>'+rowActions(type,item)+'</td></tr>').join("")+'</tbody></table></div>';
  }
  function renderList(type) {
    const box = $("goList-"+type);
    if(!box) return;
    const q = ($("goSearch-"+type)?.value || "").toLocaleLowerCase("pt-BR").trim();
    const all = state[type].filter(item => !q || JSON.stringify(item).toLocaleLowerCase("pt-BR").includes(q));
    const defs = {
      clients:[["name","Cliente",x=>x.name],["document","CNPJ / ID",x=>x.document||"—"],["status","Status",x=>x.status]],
      contracts:[["code","Código",x=>x.code],["name","Contrato",x=>x.name],["status","Status",x=>x.status]],
      operations:[["code","Código",x=>x.code],["name","Operação",x=>x.name],["status","Status",x=>x.status]],
      assets:[["asset_code","Identificação",x=>x.asset_code],["model","Modelo",x=>x.model],["current_hourmeter","Horímetro",x=>fmtNumber(x.current_hourmeter)+" h"],["status","Status",x=>x.status]],
      components:[["name","Componente",x=>x.name],["system","Sistema",x=>x.system],["status","Status",x=>x.status]],
      hourmeters:[["reading_at","Data",x=>fmtDate(x.reading_at)],["reading","Leitura",x=>fmtNumber(x.reading)+" h"],["source","Origem",x=>x.source]],
      workOrders:[["order_number","OS",x=>x.order_number],["order_type","Tipo",x=>x.order_type],["priority","Prioridade",x=>x.priority],["status","Status",x=>x.status]],
      failures:[["failure_date","Data",x=>fmtDate(x.failure_date)],["system","Sistema",x=>x.system],["failure_mode","Modo de falha",x=>x.failure_mode],["severity","Criticidade",x=>x.severity]],
      downtimes:[["start_at","Início",x=>fmtDate(x.start_at)],["category","Categoria",x=>x.category],["reason","Motivo",x=>x.reason],["end_at","Fim",x=>x.end_at?fmtDate(x.end_at):"Em aberto"]]
    };
    box.innerHTML = table(type,defs[type],all);
  }
  function renderOverview() {
    const openOS=state.workOrders.filter(x=>!["Concluída","Cancelada"].includes(x.status)).length;
    const activeAssets=state.assets.filter(x=>x.status!=="Inativo").length;
    const down=state.assets.filter(x=>["Em manutenção","Indisponível"].includes(x.status)).length;
    const openStops=state.downtimes.filter(x=>!x.end_at).length;
    const repeatSystems={};
    state.failures.forEach(f=>repeatSystems[f.system]=(repeatSystems[f.system]||0)+1);
    const top=Object.entries(repeatSystems).sort((a,b)=>b[1]-a[1])[0];
    $("goOverviewKpis").innerHTML=[
      ["Clientes",state.clients.length],["Contratos",state.contracts.length],["Operações",state.operations.length],["Caminhões ativos",activeAssets],["OS em aberto",openOS],["Paradas abertas",openStops]
    ].map(([t,v])=>'<article class="go-kpi"><span>'+t+'</span><strong>'+v+'</strong><small>Dados do protótipo local</small></article>').join("");
    $("goHealthSummary").innerHTML='<div class="go-health-line"><strong>'+down+'</strong><span>caminhões indisponíveis ou em manutenção</span></div><div class="go-health-line"><strong>'+state.failures.length+'</strong><span>falhas registradas no histórico</span></div><div class="go-health-line"><strong>'+state.hourmeters.length+'</strong><span>leituras de horímetro registradas</span></div><div class="go-health-line"><strong>'+(top?esc(top[0])+" · "+top[1]+" registro(s)":"Sem padrão de falha identificado")+'</strong><span>sistema com maior quantidade de registros de falha</span></div>';
  }
  function renderAll() {
    renderOverview();
    Object.keys(titles).forEach(renderList);
    $("goDatasetCounts").textContent = state.clients.length+" clientes · "+state.contracts.length+" contratos · "+state.operations.length+" operações · "+state.assets.length+" caminhões";
    root.querySelectorAll("[data-go-tab]").forEach(b=>b.classList.toggle("active",b.dataset.goTab===activeTab));
    root.querySelectorAll("[data-go-panel]").forEach(p=>{p.hidden=p.dataset.goPanel!==activeTab;p.classList.toggle("active",p.dataset.goPanel===activeTab)});
  }
  function saveForm(event) {
    event.preventDefault();
    if(!isMaster()||!editing)return;
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    if(editing.type==="assets" && state.assets.some(x=>x.asset_code.toLowerCase()===String(data.asset_code).toLowerCase()&&x.id!==editing.id)){ $("goModalStatus").textContent="Já existe um caminhão com essa identificação."; return; }
    if(editing.type==="hourmeters") {
      const reading=Number(data.reading), previous=Math.max(0,...state.hourmeters.filter(x=>x.asset_id===data.asset_id&&x.id!==editing.id).map(x=>Number(x.reading)));
      if(reading<previous){ $("goModalStatus").textContent="A leitura não pode ser menor que o maior horímetro já registrado para este caminhão."; return; }
      data.reading=reading;
      const asset=state.assets.find(x=>x.id===data.asset_id); if(asset)asset.current_hourmeter=Math.max(Number(asset.current_hourmeter||0),reading);
    }
    if(editing.type==="assets") data.current_hourmeter=Number(data.current_hourmeter||0);
    if(editing.type==="downtimes"){data.planned=data.planned==="Sim";data.counts_unavailable=data.counts_unavailable==="Sim";}
    const list=state[editing.type], existing=list.find(x=>x.id===editing.id);
    if(existing) Object.assign(existing,data,{updated_at:now()});
    else list.unshift({id:uid(),...data,created_at:now()});
    save();closeForm();
  }
  function deleteItem(type,id) {
    if(!isMaster())return;
    const refs={
      clients:()=>state.contracts.some(x=>x.client_id===id),
      contracts:()=>state.operations.some(x=>x.contract_id===id),
      operations:()=>state.assets.some(x=>x.operation_id===id),
      assets:()=>state.components.some(x=>x.asset_id===id)||state.hourmeters.some(x=>x.asset_id===id)||state.workOrders.some(x=>x.asset_id===id)||state.failures.some(x=>x.asset_id===id)||state.downtimes.some(x=>x.asset_id===id),
      components:()=>state.failures.some(x=>x.component_id===id),
      workOrders:()=>state.downtimes.some(x=>x.work_order_id===id)
    };
    if(refs[type]?.()) { alert("Este registro possui informações vinculadas. Preserve o histórico e inative o cadastro em vez de excluí-lo."); return; }
    if(!confirm("Excluir este registro do protótipo local?"))return;
    state[type]=state[type].filter(x=>x.id!==id);save();
  }

  root.addEventListener("click",e=>{
    const tab=e.target.closest("[data-go-tab]");
    if(tab){activeTab=tab.dataset.goTab;renderAll();return;}
    const add=e.target.closest("[data-go-add]");
    if(add){openForm(add.dataset.goAdd);return;}
    const edit=e.target.closest("[data-go-edit]");
    if(edit){openForm(edit.dataset.goEdit,edit.dataset.id);return;}
    const del=e.target.closest("[data-go-delete]");
    if(del){deleteItem(del.dataset.goDelete,del.dataset.id);return;}
  });
  root.addEventListener("input",e=>{if(e.target.matches("[data-go-search]"))renderList(e.target.dataset.goSearch);});
  $("goModalClose").addEventListener("click",closeForm);
  $("goModalCancel").addEventListener("click",closeForm);
  $("goModal").addEventListener("click",e=>{if(e.target.id==="goModal")closeForm();});
  $("goRecordForm").addEventListener("submit",saveForm);
  $("goExportDemo").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="gestao-operacional-demo.json";a.click();URL.revokeObjectURL(url);
  });
  $("goResetDemo").addEventListener("click",()=>{
    if(!isMaster()||!confirm("Restaurar os dados fictícios iniciais? Os cadastros locais deste protótipo serão substituídos."))return;
    Object.keys(state).forEach(k=>state[k]=[]);localStorage.removeItem(STORAGE_KEY);seedDemo();renderAll();
  });
  root.querySelectorAll("[data-go-search]").forEach(input=>input.addEventListener("input",()=>renderList(input.dataset.goSearch)));
  load();
  renderAll();
  if(!isMaster()) { root.innerHTML='<div class="go-denied">A Gestão Operacional está disponível somente para o administrador master.</div>'; }
}
