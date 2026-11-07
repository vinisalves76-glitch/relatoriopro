const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localISO=date=>date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
const todayISO=()=>localISO(new Date());
const monthBounds=value=>{const [year,month]=value.split("-").map(Number);return{start:year+"-"+String(month).padStart(2,"0")+"-01",end:localISO(new Date(year,month,0))}};
const weekdayNames=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export async function initMechanicSchedule({supabase,profile,areaId,root}){
  if(!supabase||!profile||profile.role!=="supervisor_area"||!areaId||!root)return;
  const uid=profile.uid||profile.id;
  const state={mechanics:[],equipment:[],assignments:[],month:todayISO().slice(0,7),busy:false};
  root.innerHTML=`
    <style>
      #gestaoOperacional .sc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:8px 0 18px}
      #gestaoOperacional .sc-head h2{margin:0 0 5px}
      #gestaoOperacional .sc-muted{font-size:12px;color:var(--muted,#68737d)}
      #gestaoOperacional .sc-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;padding:16px;margin:12px 0}
      #gestaoOperacional .sc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #gestaoOperacional .sc-field label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}
      #gestaoOperacional .sc-field input,#gestaoOperacional .sc-field select,#gestaoOperacional .sc-field textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit}
      #gestaoOperacional .sc-full{grid-column:1/-1}
      #gestaoOperacional .sc-mechanic-picker{position:relative}
      #gestaoOperacional .sc-mechanic-trigger{box-sizing:border-box;width:100%;min-height:40px;padding:10px 36px 10px 10px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--surface,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer;position:relative}
      #gestaoOperacional .sc-mechanic-trigger:after{content:"";position:absolute;right:14px;top:14px;width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg)}
      #gestaoOperacional .sc-mechanic-picker.open .sc-mechanic-trigger:after{top:18px;transform:rotate(225deg)}
      #gestaoOperacional .sc-mechanic-menu{display:none;position:absolute;z-index:30;top:calc(100% + 5px);left:0;right:0;max-height:220px;overflow:auto;padding:9px;background:var(--surface,#fff);border:1px solid var(--line,#d5dce2);border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,.12)}
      #gestaoOperacional .sc-mechanic-picker.open .sc-mechanic-menu{display:block}
      #gestaoOperacional .sc-mechanic-menu label{display:flex;gap:9px;align-items:center;padding:7px 5px;font-weight:500;margin:0;cursor:pointer}
      #gestaoOperacional .sc-mechanic-menu label+label{border-top:1px solid var(--line,#edf0f2)}
      #gestaoOperacional .sc-mechanic-menu input{width:auto;margin:0}
      #gestaoOperacional .sc-mechanic-count{font-size:12px;color:var(--muted,#68737d);margin-top:5px}
      #gestaoOperacional .sc-days{display:flex;gap:8px;flex-wrap:wrap}
      #gestaoOperacional .sc-days label{display:flex;align-items:center;gap:5px;font-size:12px}
      #gestaoOperacional .sc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      #gestaoOperacional .sc-calendar-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      #gestaoOperacional .sc-day{border:1px solid var(--line,#e1e6eb);border-radius:9px;padding:10px;margin:8px 0}
      #gestaoOperacional .sc-day h3{font-size:14px;margin:0 0 8px}
      #gestaoOperacional .sc-assignment{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,#edf0f2);font-size:12px}
      #gestaoOperacional .sc-assignment small{display:block;color:var(--muted,#68737d);margin-top:3px}
      #gestaoOperacional .sc-pill{font-size:10px;font-weight:700;padding:4px 7px;border-radius:20px;background:#e5efff;color:#28549a}
      #gestaoOperacional .sc-pill.cancelled{background:#edf0f2;color:#68737d}
      #gestaoOperacional .sc-empty{padding:20px;text-align:center;color:var(--muted,#68737d);font-size:13px}
      #gestaoOperacional .sc-error{color:#a32b21;background:#fff0ee;padding:10px;border-radius:8px;margin:10px 0}
      @media(max-width:600px){#gestaoOperacional .sc-form{grid-template-columns:1fr}#gestaoOperacional .sc-full{grid-column:auto}}
    </style>
    <div class="sc-head"><div><h2>Escala de Mecânicos</h2><p class="sc-muted">Planeje a alocação da equipe por TAG e data. Um mecânico pode atuar em vários equipamentos no mesmo dia.</p></div><span class="sc-muted" id="scArea">Área operacional</span></div>
    <div class="sc-card">
      <h3 style="margin:0 0 5px">Nova programação</h3>
      <p class="sc-muted">Selecione um equipamento, um ou mais mecânicos e o período de trabalho. A programação pode ser lançada para vários dias de uma só vez.</p>
      <form id="scForm" class="sc-form">
        <div class="sc-field"><label for="scEquipment">Equipamento / TAG *</label><select id="scEquipment" required><option value="">Carregando...</option></select></div>
        <div class="sc-field"><label>Período *</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><input id="scStart" type="date" required><input id="scEnd" type="date" required></div></div>
        <div class="sc-field sc-full"><label>Mecânicos alocados *</label><div class="sc-mechanic-picker" id="scMechanicPicker"><button class="sc-mechanic-trigger" id="scMechanicTrigger" type="button" aria-expanded="false" aria-controls="scMechanicMenu">Selecione os mecânicos</button><div class="sc-mechanic-menu" id="scMechanicMenu"><span class="sc-muted">Carregando equipe...</span></div></div><div class="sc-mechanic-count" id="scMechanicCount">Nenhum mecânico selecionado</div></div>
        <div class="sc-field sc-full"><label>Dias da semana</label><div class="sc-days" id="scWeekdays">${weekdayNames.map((name,i)=>'<label><input type="checkbox" value="'+i+'" '+(i>=1&&i<=5?'checked':'')+'> '+name+'</label>').join("")}</div><small class="sc-muted">Deixe todos desmarcados para programar todos os dias do período.</small></div>
        <div class="sc-field sc-full"><label for="scNotes">Observações da alocação</label><textarea id="scNotes" rows="2" placeholder="Ex.: inspeção preventiva, atendimento corretivo, apoio à equipe..."></textarea></div>
        <div class="sc-full sc-actions"><button class="primary" id="scSave" type="submit">Salvar programação</button><button class="light" type="button" id="scReload">Atualizar escala</button></div>
      </form>
      <div id="scFeedback" class="sc-muted" role="status" aria-live="polite">A escala será gravada no Supabase.</div>
    </div>
    <div class="sc-card">
      <div class="sc-calendar-head"><div><h3 style="margin:0 0 4px">Programação mensal</h3><p class="sc-muted">Consulte as alocações e cancele somente as futuras.</p></div><input type="month" id="scMonth" value="${state.month}" aria-label="Mês da escala"></div>
      <div id="scCalendar"><div class="sc-empty">Carregando escala...</div></div>
    </div>
  `;
  const $=selector=>root.querySelector(selector);
  $("#scArea").textContent="Área: "+areaId;
  const feedback=(message,error=false)=>{$("#scFeedback").textContent=message;$("#scFeedback").classList.toggle("sc-error",error)};
  function render(){
    const box=$("#scCalendar");
    const bounds=monthBounds(state.month),grouped=new Map();
    for(const row of state.assignments){if(!grouped.has(row.work_date))grouped.set(row.work_date,[]);grouped.get(row.work_date).push(row);}
    const days=[];
    for(let cursor=new Date(bounds.start+"T12:00:00");localISO(cursor)<=bounds.end;cursor.setDate(cursor.getDate()+1))days.push(localISO(cursor));
    box.innerHTML=days.map(date=>{
      const rows=grouped.get(date)||[];
      const day=new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
      const assignments=rows.length?rows.map(row=>{
        const mechanic=state.mechanics.find(item=>item.id===row.mechanic_id);
        const equipment=state.equipment.find(item=>item.id===row.equipment_id);
        const isFuture=row.work_date>=todayISO();
        return '<div class="sc-assignment"><div><strong>'+esc(equipment?.asset_code||"Equipamento")+'</strong> · '+esc(mechanic?.name||"Mecânico")+'<small>'+esc(equipment?.model||"")+(row.notes?" · "+esc(row.notes):"")+'</small></div><div style="display:flex;align-items:center;gap:7px"><span class="sc-pill '+(row.status==="cancelled"?"cancelled":"")+'">'+(row.status==="cancelled"?"Cancelada":"Escalado")+'</span>'+(row.status==="scheduled"&&isFuture?'<button type="button" class="light" data-sc-cancel="'+esc(row.id)+'">Cancelar</button>':"")+'</div></div>';
      }).join(""):'<p class="sc-muted" style="margin:0">Sem alocação cadastrada para este dia.</p>';
      return '<section class="sc-day"><h3>'+esc(day)+'</h3>'+assignments+'</section>';
    }).join("");
  }
  async function load(){
    if(state.busy)return;state.busy=true;
    try{
      const bounds=monthBounds(state.month);
      const [team,equipment,assignments]=await Promise.all([
        (async()=>{
          // A RPC é a fonte principal, pois lista a equipe com privilégio controlado no banco.
          const rpc=await supabase.rpc("list_operational_area_mechanics",{area_key:areaId});
          if(!rpc.error&&Array.isArray(rpc.data)&&rpc.data.length)return rpc.data;
          // Fallback para instalações em que a RPC ainda não foi atualizada; a consulta continua
          // estritamente limitada a mecânicos ativos vinculados à área do supervisor.
          const direct=await supabase.from("profiles").select("id,name,email")
            .eq("operational_area_id",areaId).eq("role","mecanico").eq("active",true).order("name");
          if(!direct.error&&Array.isArray(direct.data)&&direct.data.length)return direct.data;
          if(rpc.error)throw new Error("Não foi possível listar os mecânicos pela função do banco: "+rpc.error.message+(direct.error?" | Consulta alternativa: "+direct.error.message:""));
          if(direct.error)throw new Error("A função de listagem não retornou mecânicos e a consulta alternativa foi bloqueada: "+direct.error.message);
          return [];
        })(),
        supabase.from("operational_equipment").select("id,asset_code,model,status").eq("area_id",areaId).neq("status","inactive").order("asset_code"),
        supabase.from("operational_mechanic_assignments").select("*").eq("area_id",areaId).gte("work_date",bounds.start).lte("work_date",bounds.end).order("work_date").order("created_at")
      ]);
      for(const result of [equipment,assignments])if(result.error)throw result.error;
      state.mechanics=team;state.equipment=equipment.data||[];state.assignments=assignments.data||[];
      $("#scEquipment").innerHTML='<option value="">Selecione a TAG</option>'+state.equipment.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.asset_code)+' · '+esc(item.model||"")+'</option>').join("");
      $("#scMechanicMenu").innerHTML=state.mechanics.length?'<div class="sc-muted" style="padding:3px 5px 8px">'+state.mechanics.length+' mecânico(s) ativo(s) nesta área</div>'+state.mechanics.map(item=>'<label><input type="checkbox" name="mechanic" value="'+esc(item.id)+'"> <span>'+esc(item.name||item.email||"Mecânico")+(item.email?' <small class="sc-muted">('+esc(item.email)+')</small>':'')+'</span></label>').join(""):'<span class="sc-muted">Não há mecânicos ativos vinculados a esta área. Confira se o cadastro está ativo, com cargo Mecânico e área ArcelorMittal Andradas.</span>';
      updateMechanicPicker();
      render();feedback("Escala atualizada · "+state.mechanics.length+" mecânico(s) disponível(is) · "+state.assignments.length+" alocação(ões) no mês.");
    }catch(error){feedback(error.message||"Não foi possível carregar a escala.",true);$("#scMechanics").innerHTML='<span class="sc-error">Falha ao carregar a lista de mecânicos: '+esc(error.message||"Erro desconhecido")+'</span>';$("#scCalendar").innerHTML='<div class="sc-empty">Falha ao carregar as alocações.</div>';}
    finally{state.busy=false;}
  }
  $("#scForm").addEventListener("submit",async event=>{
    event.preventDefault();const button=$("#scSave");if(button.disabled)return;
    const equipmentId=$("#scEquipment").value,start=$("#scStart").value,end=$("#scEnd").value;
    const mechanicIds=[...root.querySelectorAll('input[name="mechanic"]:checked')].map(input=>input.value);
    if(!equipmentId||!start||!end||start>end||!mechanicIds.length){feedback("Selecione TAG, período válido e pelo menos um mecânico.",true);return;}
    if(start<todayISO()){feedback("A programação não pode iniciar em uma data passada.",true);return;}
    const selectedDays=[...root.querySelectorAll("#scWeekdays input:checked")].map(input=>Number(input.value));
    const records=[];
    for(let cursor=new Date(start+"T12:00:00");localISO(cursor)<=end;cursor.setDate(cursor.getDate()+1)){
      if(selectedDays.length&&!selectedDays.includes(cursor.getDay()))continue;
      const workDate=localISO(cursor);
      for(const mechanicId of mechanicIds)records.push({area_id:areaId,equipment_id:equipmentId,mechanic_id:mechanicId,work_date:workDate,status:"scheduled",notes:$("#scNotes").value.trim(),created_by:uid,updated_by:uid});
    }
    if(!records.length){feedback("Nenhuma data corresponde aos dias da semana selecionados.",true);return;}
    button.disabled=true;button.textContent="Salvando...";
    try{
      const {error}=await supabase.from("operational_mechanic_assignments").upsert(records,{onConflict:"area_id,equipment_id,mechanic_id,work_date"});
      if(error)throw error;
      $("#scMonth").value=start.slice(0,7);state.month=start.slice(0,7);
      $("#scForm").reset();$("#scStart").value=start;$("#scEnd").value=end;
      updateMechanicPicker();
      await load();feedback(records.length+" alocação(ões) programada(s) com sucesso.");
    }catch(error){feedback(error.message||"Não foi possível salvar a programação.",true);}
    finally{button.disabled=false;button.textContent="Salvar programação";}
  });
  function updateMechanicPicker(){
    const selected=[...root.querySelectorAll('input[name="mechanic"]:checked')];
    const names=selected.map(input=>state.mechanics.find(item=>item.id===input.value)?.name||input.closest("label")?.textContent?.trim()||"Mecânico");
    $("#scMechanicTrigger").textContent=selected.length?names.join(", "):"Selecione os mecânicos";
    $("#scMechanicCount").textContent=selected.length?selected.length+" mecânico(s) selecionado(s)":"Nenhum mecânico selecionado";
  }
  $("#scMechanicTrigger").addEventListener("click",()=>{
    const picker=$("#scMechanicPicker"),opened=picker.classList.toggle("open");
    $("#scMechanicTrigger").setAttribute("aria-expanded",String(opened));
  });
  $("#scMechanicMenu").addEventListener("change",event=>{
    if(event.target.matches('input[name="mechanic"]'))updateMechanicPicker();
  });
  document.addEventListener("click",event=>{
    const picker=$("#scMechanicPicker");
    if(picker&&!picker.contains(event.target)){picker.classList.remove("open");$("#scMechanicTrigger").setAttribute("aria-expanded","false");}
  });
  $("#scMonth").addEventListener("change",()=>{if(!$("#scMonth").value)return;state.month=$("#scMonth").value;load()});
  $("#scReload").addEventListener("click",load);
  $("#scCalendar").addEventListener("click",async event=>{
    const button=event.target.closest("[data-sc-cancel]");if(!button)return;
    if(!confirm("Cancelar esta alocação futura? O histórico será preservado."))return;
    button.disabled=true;
    try{const {error}=await supabase.from("operational_mechanic_assignments").update({status:"cancelled"}).eq("id",button.dataset.scCancel).eq("area_id",areaId);if(error)throw error;await load();feedback("Alocação cancelada. O histórico foi preservado.");}
    catch(error){feedback(error.message||"Não foi possível cancelar a alocação.",true);button.disabled=false;}
  });
  const bounds=monthBounds(state.month);$("#scStart").value=todayISO()<bounds.start?bounds.start:todayISO();$("#scEnd").value=bounds.end;
  await load();
}
