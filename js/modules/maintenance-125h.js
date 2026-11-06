const esc125 = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num125 = value => Number(value || 0).toLocaleString("pt-BR",{maximumFractionDigits:1});
const date125 = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

export async function init125hMaintenanceModule({supabase, profile, getAreaId, getEquipment, onRefresh}) {
  const root=document.getElementById("goLive125h");
  if(!root || !supabase || !profile) return;
  const state={controls:[],services:[],loading:false};
  const userId=profile.uid||profile.id;
  const areaId=()=>getAreaId();
  const equipment=()=>getEquipment()||[];
  const feedback=(message,error=false)=>{
    const el=root.querySelector("#m125Feedback");
    if(el){el.textContent=message;el.classList.toggle("m125-error",error);}
  };
  root.innerHTML=`
    <style>
      #goLive125h .m125-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:16px 0}
      #goLive125h .m125-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;padding:16px}
      #goLive125h .m125-card h3{margin:0 0 6px;font-size:15px}
      #goLive125h .m125-card p{margin:5px 0;color:var(--muted,#68737d);font-size:13px}
      #goLive125h .m125-value{font-size:25px;font-weight:750;margin:9px 0}
      #goLive125h .m125-pill{display:inline-block;border-radius:20px;padding:4px 8px;font-size:11px;font-weight:750;background:#e7eef7;color:#29496b}
      #goLive125h .m125-pill.due{background:#fff0d4;color:#875600}
      #goLive125h .m125-pill.overdue{background:#ffe4e1;color:#a32b21}
      #goLive125h .m125-pill.ok{background:#e2f5e9;color:#17663a}
      #goLive125h .m125-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 0}
      #goLive125h .m125-table-wrap{overflow:auto;border:1px solid var(--line,#e5e9ed);border-radius:12px}
      #goLive125h table{width:100%;border-collapse:collapse;min-width:760px}
      #goLive125h th,#goLive125h td{padding:11px 10px;border-bottom:1px solid var(--line,#e5e9ed);font-size:13px;text-align:left;vertical-align:middle}
      #goLive125h th{font-size:11px;color:var(--muted,#68737d);text-transform:uppercase}
      #goLive125h .m125-actions{display:flex;gap:6px;flex-wrap:wrap}
      #goLive125h .m125-actions button{padding:7px 10px;font-size:12px}
      #goLive125h .m125-modal{position:fixed;inset:0;z-index:10030;background:#101820a8;display:grid;place-items:center;padding:16px}
      #goLive125h .m125-dialog{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;color:#17212b;border-radius:14px;padding:22px}
      #goLive125h .m125-dialog h3{margin:0 0 16px}
      #goLive125h .m125-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #goLive125h .m125-form .full{grid-column:1/-1}
      #goLive125h .m125-form label{display:block;font-size:12px;font-weight:650;margin-bottom:5px}
      #goLive125h .m125-form input,#goLive125h .m125-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d5dce2;border-radius:8px}
      #goLive125h .m125-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      #goLive125h .m125-error{color:#a32b21}
      #goLive125h .m125-empty{padding:24px;text-align:center;color:var(--muted,#68737d)}
      @media(max-width:600px){#goLive125h .m125-form{grid-template-columns:1fr}#goLive125h .m125-form .full{grid-column:auto}#goLive125h .m125-dialog{padding:16px}}
    </style>
    <div class="go-section-heading">
      <div><h2>Manutenção preventiva de 125 horas</h2><p>Controle por horímetro, previsão da próxima revisão e histórico por equipamento.</p></div>
      <button class="light" type="button" id="m125Refresh">Atualizar controle</button>
    </div>
    <div class="m125-toolbar"><div id="m125Feedback" role="status" aria-live="polite">Carregando controles…</div><span class="m125-pill">Intervalo padrão: 125 h</span></div>
    <div class="m125-grid" id="m125Summary"></div>
    <div class="m125-table-wrap"><table><thead><tr><th>Equipamento</th><th>Horímetro atual</th><th>Última manutenção</th><th>Próxima manutenção</th><th>Faltam</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="m125Rows"></tbody></table></div>
    <div class="m125-card" style="margin-top:16px"><h3>Histórico de manutenções de 125 horas</h3><div id="m125History"><p>Nenhum registro carregado.</p></div></div>
    <div id="m125Modal"></div>
  `;

  function statusFor(current, next, enabled){
    if(!enabled)return {label:"Controle pausado",kind:""};
    const remaining=next-current;
    if(remaining<=0)return {label:"Vencida",kind:"overdue"};
    if(remaining<=25)return {label:"Próxima do vencimento",kind:"due"};
    return {label:"Em dia",kind:"ok"};
  }
  function controlFor(id){return state.controls.find(c=>c.equipment_id===id);}
  function render(){
    const rows=equipment().filter(e=>e.status!=="inactive").map(e=>{
      const c=controlFor(e.id),current=Number(e.current_horimeter||0);
      if(!c)return {e,c,current,next:null,remaining:null,status:{label:"Não configurado",kind:""}};
      const next=Number(c.last_service_horimeter||0)+Number(c.interval_hours||125);
      return {e,c,current,next,remaining:next-current,status:statusFor(current,next,c.enabled)};
    });
    const overdue=rows.filter(r=>r.c?.enabled&&r.remaining<=0).length;
    const due=rows.filter(r=>r.c?.enabled&&r.remaining>0&&r.remaining<=25).length;
    const configured=rows.filter(r=>r.c?.enabled).length;
    root.querySelector("#m125Summary").innerHTML=`
      <article class="m125-card"><h3>Equipamentos monitorados</h3><div class="m125-value">${configured}</div><p>Com controle de 125 horas ativo</p></article>
      <article class="m125-card"><h3>Manutenções vencidas</h3><div class="m125-value">${overdue}</div><p>Horímetro atingiu ou ultrapassou o limite</p></article>
      <article class="m125-card"><h3>Próximas manutenções</h3><div class="m125-value">${due}</div><p>Faltam até 25 horas para a revisão</p></article>
    `;
    root.querySelector("#m125Rows").innerHTML=rows.length?rows.map(r=>`
      <tr>
        <td><strong>${esc125(r.e.asset_code)}</strong><br><small>${esc125([r.e.brand,r.e.model].filter(Boolean).join(" · "))}</small></td>
        <td>${num125(r.current)} h</td>
        <td>${r.c?num125(r.c.last_service_horimeter)+" h":"—"}</td>
        <td>${r.next===null?"—":num125(r.next)+" h"}</td>
        <td>${r.remaining===null?"—":r.remaining<=0?num125(Math.abs(r.remaining))+" h vencidas":num125(r.remaining)+" h"}</td>
        <td><span class="m125-pill ${r.status.kind}">${r.status.label}</span></td>
        <td><div class="m125-actions">
          ${r.c?'<button class="light" type="button" data-m125-service="'+r.e.id+'">Registrar manutenção</button><button class="light" type="button" data-m125-toggle="'+r.e.id+'">'+(r.c.enabled?"Pausar":"Ativar")+'</button>':'<button class="light" type="button" data-m125-config="'+r.e.id+'">Configurar controle</button>'}
        </div></td>
      </tr>`).join(""):'<tr><td colspan="7" class="m125-empty">Cadastre equipamentos na área operacional para iniciar o controle.</td></tr>';
    root.querySelector("#m125History").innerHTML=state.services.length?'<div class="m125-table-wrap"><table><thead><tr><th>Data</th><th>Equipamento</th><th>Horímetro da revisão</th><th>Checklist / serviços executados</th><th>Observações</th></tr></thead><tbody>'+state.services.map(s=>{
      const e=equipment().find(x=>x.id===s.equipment_id);
      return '<tr><td>'+esc125(date125(s.performed_at))+'</td><td>'+esc125(e?.asset_code||"Equipamento")+'</td><td>'+num125(s.service_horimeter)+' h</td><td>'+esc125(s.checklist||"—")+'</td><td>'+esc125(s.notes||"—")+'</td></tr>';
    }).join("")+'</tbody></table></div>':'<p class="m125-empty">Nenhuma manutenção de 125 horas registrada.</p>';
  }
  async function load(){
    if(state.loading)return;
    state.loading=true;feedback("Atualizando controle de 125 horas…");
    try{
      const id=areaId();
      const [controls,services]=await Promise.all([
        supabase.from("operational_125h_control").select("*").eq("area_id",id),
        supabase.from("operational_125h_services").select("*").eq("area_id",id).order("performed_at",{ascending:false}).limit(100)
      ]);
      if(controls.error)throw controls.error;
      if(services.error)throw services.error;
      state.controls=controls.data||[];state.services=services.data||[];
      render();feedback("Controle atualizado · "+new Date().toLocaleTimeString("pt-BR"));
    }catch(error){feedback(error.message||"Não foi possível carregar o controle.",true);throw error;}
    finally{state.loading=false;}
  }
  function modal(title,fields,submitLabel){
    root.querySelector("#m125Modal").innerHTML='<div class="m125-modal"><section class="m125-dialog" role="dialog" aria-modal="true"><h3>'+esc125(title)+'</h3><form id="m125Form"><div class="m125-form">'+fields+'</div><div class="m125-foot"><button class="light" type="button" data-m125-close>Cancelar</button><button class="primary" type="submit">'+esc125(submitLabel||"Salvar")+'</button></div></form></section></div>';
    root.querySelector(".m125-modal").addEventListener("click",e=>{if(e.target.classList.contains("m125-modal")||e.target.closest("[data-m125-close]"))root.querySelector("#m125Modal").innerHTML="";});
  }
  function configureForm(id){
    const e=equipment().find(x=>x.id===id);if(!e)return;
    const c=controlFor(id);
    const baseline=c?.last_service_horimeter??e.current_horimeter??0;
    modal("Configurar manutenção de 125 horas · "+e.asset_code,
      '<div class="full"><p>Informe o horímetro em que foi realizada a última manutenção de 125 horas. Se o equipamento ainda não possui histórico, use o horímetro de referência definido pela equipe responsável.</p></div>'+
      '<div><label>Horímetro da última manutenção / referência (h)</label><input name="baseline" type="number" min="0" step="0.1" value="'+esc125(baseline)+'" required></div>'+
      '<div><label>Intervalo (horas)</label><input value="125" disabled></div>'+
      '<div class="full"><small>Próxima manutenção calculada: referência + 125 horas. Esta configuração não cria um registro de serviço concluído.</small></div>',"Salvar controle");
    root.querySelector("#m125Form").addEventListener("submit",async ev=>{
      ev.preventDefault();const btn=ev.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
      try{
        const value=Number(new FormData(ev.currentTarget).get("baseline"));
        if(!Number.isFinite(value)||value<0)throw new Error("Informe um horímetro de referência válido.");
        const result=await supabase.from("operational_125h_control").upsert({
          area_id:areaId(),equipment_id:id,interval_hours:125,last_service_horimeter:value,enabled:true,updated_by:userId
        },{onConflict:"equipment_id"});
        if(result.error)throw result.error;
        root.querySelector("#m125Modal").innerHTML="";await load();
      }catch(error){feedback(error.message||"Falha ao configurar controle.",true);btn.disabled=false;}
    });
  }
  function serviceForm(id){
    const e=equipment().find(x=>x.id===id),c=controlFor(id);if(!e||!c)return;
    modal("Registrar manutenção de 125 horas · "+e.asset_code,
      '<div><label>Horímetro no momento da manutenção (h)</label><input name="service_horimeter" type="number" min="'+esc125(e.current_horimeter||0)+'" step="0.1" value="'+esc125(e.current_horimeter||0)+'" required></div>'+
      '<div><label>Data da execução</label><input name="performed_at" type="date" value="'+new Date().toISOString().slice(0,10)+'" required></div>'+
      '<div class="full"><label>Serviços / checklist executado</label><textarea name="checklist" rows="4" placeholder="Descreva os itens verificados e serviços executados" required></textarea></div>'+
      '<div class="full"><label>Observações</label><textarea name="notes" rows="3" placeholder="Peças, pendências, recomendações…"></textarea></div>'+
      '<div class="full"><small>Ao salvar, o sistema registra o histórico, atualiza o horímetro do equipamento e calcula a próxima revisão em +125 horas.</small></div>',"Concluir manutenção");
    root.querySelector("#m125Form").addEventListener("submit",async ev=>{
      ev.preventDefault();const btn=ev.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
      try{
        const data=Object.fromEntries(new FormData(ev.currentTarget).entries()),reading=Number(data.service_horimeter);
        if(!Number.isFinite(reading)||reading<Number(e.current_horimeter||0))throw new Error("O horímetro informado não pode ser menor que o atual.");
        const performedAt=new Date(data.performed_at+"T12:00:00").toISOString();
        const result=await supabase.rpc("complete_operational_125h_service",{
          p_area_id:areaId(),p_equipment_id:id,p_service_horimeter:reading,p_performed_at:performedAt,
          p_checklist:data.checklist,p_notes:data.notes||""
        });
        if(result.error)throw result.error;
        root.querySelector("#m125Modal").innerHTML="";
        if(onRefresh)await onRefresh();
        await load();feedback("Manutenção registrada. Próxima revisão calculada para "+num125(reading+125)+" h.");
      }catch(error){feedback(error.message||"Falha ao registrar manutenção.",true);btn.disabled=false;}
    });
  }
  root.addEventListener("click",async event=>{
    const b=event.target.closest("button");if(!b)return;
    if(b.id==="m125Refresh"){load().catch(()=>{});return;}
    if(b.dataset.m125Config){configureForm(b.dataset.m125Config);return;}
    if(b.dataset.m125Service){serviceForm(b.dataset.m125Service);return;}
    if(b.dataset.m125Toggle){
      const c=controlFor(b.dataset.m125Toggle);if(!c)return;
      b.disabled=true;
      const result=await supabase.from("operational_125h_control").update({enabled:!c.enabled,updated_by:userId,updated_at:new Date().toISOString()}).eq("id",c.id).eq("area_id",areaId());
      if(result.error)feedback(result.error.message||"Não foi possível alterar o controle.",true);
      else await load();
      return;
    }
  });
  await load();
}
