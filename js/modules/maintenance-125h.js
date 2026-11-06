const esc125 = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num125 = value => Number(value || 0).toLocaleString("pt-BR",{maximumFractionDigits:1});
const today125 = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
const date125 = value => value ? (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(...String(value).split("-").map((v,i)=>i===1?Number(v)-1:Number(v))).toLocaleDateString("pt-BR") : new Date(value).toLocaleDateString("pt-BR")) : "—";

export async function init125hMaintenanceModule({supabase, profile, getAreaId, getEquipment, onRefresh}) {
  const root=document.getElementById("goLive125h");
  if(!root || !supabase || !profile) return;
  const state={schedules:[],loading:false,filter:"all",search:""};
  const userId=profile.uid||profile.id;
  const areaId=()=>getAreaId();
  const equipment=()=>getEquipment()||[];
  const feedback=(message,error=false)=>{
    const el=root.querySelector("#m125Feedback");
    if(el){el.textContent=message;el.classList.toggle("m125-error",error);}
  };
  root.innerHTML=`
    <style>
      #goLive125h .m125-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}
      #goLive125h .m125-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;padding:16px}
      #goLive125h .m125-card h3{margin:0 0 6px;font-size:14px}
      #goLive125h .m125-card p{margin:5px 0;color:var(--muted,#68737d);font-size:12px}
      #goLive125h .m125-value{font-size:27px;font-weight:750;margin:8px 0}
      #goLive125h .m125-pill{display:inline-block;border-radius:20px;padding:4px 8px;font-size:11px;font-weight:750;background:#e7eef7;color:#29496b;white-space:nowrap}
      #goLive125h .m125-pill.today{background:#fff0d4;color:#875600}
      #goLive125h .m125-pill.overdue{background:#ffe4e1;color:#a32b21}
      #goLive125h .m125-pill.completed{background:#e2f5e9;color:#17663a}
      #goLive125h .m125-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 0}
      #goLive125h .m125-filters{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
      #goLive125h .m125-filters input,#goLive125h .m125-filters select{padding:9px 11px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--panel,#fff);color:inherit}
      #goLive125h .m125-table-wrap{overflow:auto;border:1px solid var(--line,#e5e9ed);border-radius:12px}
      #goLive125h table{width:100%;border-collapse:collapse;min-width:720px}
      #goLive125h th,#goLive125h td{padding:11px 10px;border-bottom:1px solid var(--line,#e5e9ed);font-size:13px;text-align:left;vertical-align:middle}
      #goLive125h th{font-size:11px;color:var(--muted,#68737d);text-transform:uppercase}
      #goLive125h .m125-actions{display:flex;gap:6px;flex-wrap:wrap}
      #goLive125h .m125-actions button{padding:7px 10px;font-size:12px}
      #goLive125h .m125-modal{position:fixed;inset:0;z-index:10030;background:#101820a8;display:grid;place-items:center;padding:16px}
      #goLive125h .m125-dialog{width:min(600px,100%);max-height:90vh;overflow:auto;background:#fff;color:#17212b;border-radius:14px;padding:22px}
      #goLive125h .m125-dialog h3{margin:0 0 8px}
      #goLive125h .m125-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
      #goLive125h .m125-form .full{grid-column:1/-1}
      #goLive125h .m125-form label{display:block;font-size:12px;font-weight:650;margin-bottom:5px}
      #goLive125h .m125-form input,#goLive125h .m125-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d5dce2;border-radius:8px}
      #goLive125h .m125-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      #goLive125h .m125-error{color:#a32b21}
      #goLive125h .m125-empty{padding:24px;text-align:center;color:var(--muted,#68737d)}
      #goLive125h .m125-date-group{margin:16px 0 8px;font-weight:750;font-size:13px;color:var(--muted,#68737d)}
      @media(max-width:600px){#goLive125h .m125-form{grid-template-columns:1fr}#goLive125h .m125-form .full{grid-column:auto}#goLive125h .m125-dialog{padding:16px}}
    </style>
    <div class="go-section-heading">
      <div><h2>Agenda de inspeções de 250 horas</h2><p>Programação e acompanhamento das inspeções de toda a frota da área.</p></div>
    </div>
    <div class="m125-toolbar"><div id="m125Feedback" role="status" aria-live="polite">Carregando agenda da frota…</div><span class="m125-pill">Programação por data</span></div>
    <div class="m125-grid" id="m125Summary"></div>
    <div class="m125-card"><strong>Como funciona:</strong><p>Consulte todos os equipamentos ativos, escolha o caminhão e informe a data prevista para a inspeção de 250 horas. A agenda reúne os compromissos da frota em ordem de data. O horímetro exibido é apenas a leitura atual cadastrada no equipamento.</p></div>
    <div class="m125-toolbar"><h3 style="margin:0">Programação da frota</h3><button class="primary" type="button" id="m125NewSchedule">＋ Programar inspeção</button></div>
    <div class="m125-filters"><input id="m125Search" type="search" placeholder="Buscar caminhão, marca ou modelo"><select id="m125Filter"><option value="all">Toda a frota</option><option value="scheduled">Com inspeção programada</option><option value="unscheduled">Sem programação</option><option value="overdue">Programação atrasada</option><option value="completed">Inspeções concluídas</option></select></div>
    <div class="m125-table-wrap"><table><thead><tr><th>Equipamento</th><th>Horímetro atual</th><th>Data da inspeção</th><th>Responsável</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="m125FleetRows"></tbody></table></div>
    <div class="m125-card" style="margin-top:16px"><h3>Agenda por data</h3><div id="m125Agenda"><p>Carregando compromissos…</p></div></div>
    <div id="m125Modal"></div>
  `;

  function currentSchedule(id){
    return state.schedules.find(s=>s.equipment_id===id&&["scheduled","in_progress"].includes(s.status));
  }
  function scheduleStatus(s){
    if(s.status==="completed")return {label:"Concluída",kind:"completed"};
    if(s.status==="cancelled")return {label:"Cancelada",kind:""};
    if(s.planned_for<today125())return {label:"Atrasada",kind:"overdue"};
    if(s.planned_for===today125())return {label:"Programada para hoje",kind:"today"};
    return {label:"Programada",kind:""};
  }
  function render(){
    const active=equipment().filter(e=>e.status!=="inactive");
    const activeSchedules=state.schedules.filter(s=>["scheduled","in_progress"].includes(s.status));
    const overdue=activeSchedules.filter(s=>s.planned_for<today125()).length;
    const today=activeSchedules.filter(s=>s.planned_for===today125()).length;
    const unscheduled=active.filter(e=>!currentSchedule(e.id)).length;
    root.querySelector("#m125Summary").innerHTML=`
      <article class="m125-card"><h3>Frota ativa</h3><div class="m125-value">${active.length}</div><p>Equipamentos disponíveis para programação</p></article>
      <article class="m125-card"><h3>Inspeções programadas</h3><div class="m125-value">${activeSchedules.length}</div><p>Compromissos ativos na agenda</p></article>
      <article class="m125-card"><h3>Inspeções para hoje</h3><div class="m125-value">${today}</div><p>Programadas para a data atual</p></article>
      <article class="m125-card"><h3>Programações atrasadas</h3><div class="m125-value">${overdue}</div><p>Data prevista já passou e não foi concluída</p></article>
      <article class="m125-card"><h3>Sem programação</h3><div class="m125-value">${unscheduled}</div><p>Equipamentos que ainda precisam de uma data</p></article>
    `;
    const term=(root.querySelector("#m125Search")?.value||"").trim().toLowerCase();
    const filter=root.querySelector("#m125Filter")?.value||"all";
    const rows=active.map(e=>({e,s:currentSchedule(e.id)})).filter(({e,s})=>{
      const searchText=[e.asset_code,e.brand,e.model].filter(Boolean).join(" ").toLowerCase();
      if(term&&!searchText.includes(term))return false;
      if(filter==="scheduled"&&!s)return false;
      if(filter==="unscheduled"&&s)return false;
      if(filter==="overdue"&&(!s||s.planned_for>=today125()))return false;
      if(filter==="completed"&&!state.schedules.some(x=>x.equipment_id===e.id&&x.status==="completed"))return false;
      return true;
    });
    root.querySelector("#m125FleetRows").innerHTML=rows.length?rows.map(({e,s})=>{
      const status=s?scheduleStatus(s):{label:"Sem programação",kind:""};
      return `<tr>
        <td><strong>${esc125(e.asset_code||"Sem identificação")}</strong><br><small>${esc125([e.brand,e.model].filter(Boolean).join(" · "))}</small></td>
        <td>${num125(e.current_horimeter)} h</td>
        <td>${s?date125(s.planned_for):"—"}</td>
        <td>${s?esc125(s.responsible_name||"Não informado"):"—"}</td>
        <td><span class="m125-pill ${status.kind}">${status.label}</span></td>
        <td><div class="m125-actions"><button class="light" type="button" data-m125-schedule="${e.id}">${s?"Reprogramar":"Agendar inspeção"}</button>${s?'<button class="light" type="button" data-m125-complete="'+s.id+'">Concluir</button><button class="light" type="button" data-m125-cancel="'+s.id+'">Cancelar</button>':""}</div></td>
      </tr>`;
    }).join(""):'<tr><td colspan="6" class="m125-empty">Nenhum equipamento corresponde a este filtro.</td></tr>';

    const agenda=activeSchedules.slice().sort((a,b)=>a.planned_for.localeCompare(b.planned_for)).map(s=>({s,e:active.find(x=>x.id===s.equipment_id)})).filter(x=>x.e);
    const completed=state.schedules.filter(s=>s.status==="completed").sort((a,b)=>b.planned_for.localeCompare(a.planned_for)).slice(0,10).map(s=>({s,e:active.find(x=>x.id===s.equipment_id)})).filter(x=>x.e);
    const groupByDate=new Map();
    agenda.forEach(item=>{const key=item.s.planned_for;(groupByDate.get(key)||groupByDate.set(key,[]).get(key)).push(item);});
    let agendaHtml="";
    for(const [day,items] of groupByDate){
      agendaHtml+='<div class="m125-date-group">'+date125(day)+'</div><div class="m125-table-wrap"><table><thead><tr><th>Equipamento</th><th>Horímetro na programação</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>';
      agendaHtml+=items.map(({s,e})=>'<tr><td><strong>'+esc125(e.asset_code)+'</strong><br><small>'+esc125([e.brand,e.model].filter(Boolean).join(" · "))+'</small></td><td>'+num125(s.planned_horimeter)+' h</td><td>'+esc125(s.responsible_name||"Não informado")+'</td><td><span class="m125-pill '+scheduleStatus(s).kind+'">'+scheduleStatus(s).label+'</span></td></tr>').join("");
      agendaHtml+='</tbody></table></div>';
    }
    if(completed.length){
      agendaHtml+='<h4>Últimas inspeções concluídas</h4><div class="m125-table-wrap"><table><thead><tr><th>Equipamento</th><th>Data programada</th><th>Responsável</th><th>Situação</th></tr></thead><tbody>';
      agendaHtml+=completed.map(({s,e})=>'<tr><td>'+esc125(e.asset_code)+'</td><td>'+date125(s.planned_for)+'</td><td>'+esc125(s.responsible_name||"Não informado")+'</td><td><span class="m125-pill completed">Concluída</span></td></tr>').join("");
      agendaHtml+='</tbody></table></div>';
    }
    root.querySelector("#m125Agenda").innerHTML=agendaHtml||'<p class="m125-empty">Ainda não existem inspeções programadas. Use “Programar inspeção” para incluir o primeiro compromisso.</p>';
  }
  async function load(){
    if(state.loading)return;
    state.loading=true;feedback("Carregando agenda da frota…");
    try{
      const {data,error}=await supabase.from("operational_125h_schedules").select("*").eq("area_id",areaId()).order("planned_for",{ascending:true});
      if(error)throw error;
      state.schedules=data||[];
      render();feedback("Agenda atualizada · "+new Date().toLocaleTimeString("pt-BR"));
    }catch(error){feedback(error.message||"Não foi possível carregar a agenda.",true);}
    finally{state.loading=false;}
  }
  function modal(title,e,existing){
    const today=today125();
    root.querySelector("#m125Modal").innerHTML='<div class="m125-modal"><section class="m125-dialog" role="dialog" aria-modal="true"><h3>'+esc125(title)+'</h3><p>'+esc125(e.asset_code||"Equipamento")+' · '+esc125([e.brand,e.model].filter(Boolean).join(" "))+'</p><form id="m125Form"><div class="m125-form"><div><label>Data prevista da inspeção de 250 horas</label><input name="planned_for" type="date" min="'+today+'" value="'+esc125(existing?.planned_for||today)+'" required></div><div><label>Responsável pela inspeção</label><input name="responsible_name" value="'+esc125(existing?.responsible_name||"")+'" placeholder="Nome do responsável"></div><div class="full"><label>Observações</label><textarea name="notes" rows="3" placeholder="Turno, equipe, janela de parada ou outras informações">'+esc125(existing?.notes||"")+'</textarea></div><div class="full"><small>O horímetro atual ('+num125(e.current_horimeter)+' h) será registrado como referência no agendamento. A programação é organizada pela data informada.</small></div></div><div class="m125-foot"><button class="light" type="button" data-m125-close>Cancelar</button><button class="primary" type="submit">Salvar programação</button></div></form></section></div>';
    root.querySelector(".m125-modal").addEventListener("click",ev=>{if(ev.target.classList.contains("m125-modal")||ev.target.closest("[data-m125-close]"))root.querySelector("#m125Modal").innerHTML="";});
    root.querySelector("#m125Form").addEventListener("submit",async ev=>{
      ev.preventDefault();const btn=ev.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
      try{
        const d=Object.fromEntries(new FormData(ev.currentTarget).entries());
        if(d.planned_for<today125())throw new Error("Escolha uma data de hoje em diante.");
        const payload={area_id:areaId(),equipment_id:e.id,planned_for:d.planned_for,planned_horimeter:Number(e.current_horimeter||0),responsible_name:(d.responsible_name||"").trim(),notes:d.notes||"",status:"scheduled",created_by:userId,updated_at:new Date().toISOString()};
        const result=existing?await supabase.from("operational_125h_schedules").update(payload).eq("id",existing.id).eq("area_id",areaId()):await supabase.from("operational_125h_schedules").insert(payload);
        if(result.error)throw result.error;
        root.querySelector("#m125Modal").innerHTML="";await load();feedback("Inspeção de 250 horas programada com sucesso.");
      }catch(error){feedback(error.message||"Falha ao salvar a programação.",true);btn.disabled=false;}
    });
  }
  async function changeScheduleStatus(id,status){
    const result=await supabase.from("operational_125h_schedules").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("area_id",areaId());
    if(result.error){feedback(result.error.message||"Não foi possível atualizar a programação.",true);return;}
    await load();feedback(status==="completed"?"Inspeção marcada como concluída.":"Programação cancelada.");
  }
  root.addEventListener("click",event=>{
    const b=event.target.closest("button");if(!b)return;
    if(b.id==="m125NewSchedule"){
      const first=equipment().find(e=>e.status!=="inactive"&&!currentSchedule(e.id));
      if(first)modal("Programar inspeção de 250 horas",first,null);
      else feedback("Todos os equipamentos ativos já possuem uma programação. Use Reprogramar na frota.");
      return;
    }
    if(b.dataset.m125Schedule){
      const e=equipment().find(x=>x.id===b.dataset.m125Schedule);if(!e)return;
      modal(currentSchedule(e.id)?"Reprogramar inspeção de 250 horas":"Programar inspeção de 250 horas",e,currentSchedule(e.id));return;
    }
    if(b.dataset.m125Complete){changeScheduleStatus(b.dataset.m125Complete,"completed");return;}
    if(b.dataset.m125Cancel){changeScheduleStatus(b.dataset.m125Cancel,"cancelled");return;}
  });
  root.querySelector("#m125Search").addEventListener("input",render);
  root.querySelector("#m125Filter").addEventListener("change",render);
  await load();
}
