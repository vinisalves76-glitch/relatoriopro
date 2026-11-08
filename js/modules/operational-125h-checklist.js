const TF_BUCKET='operational-checklist-private';
const TF_INITIAL=[
  ['horimetro','Horímetro'],['painel','Painel (horímetro e data)'],['serie','Placa com número de série'],
  ['equipamento','Equipamento'],['transmissao','Transmissão'],['placaTransmissao','Placa de identificação da transmissão'],['motor','Motor']
];
const TF_CATEGORIES=[
  {name:'Coxins / Suportes',items:['Coxins e suporte do motor','Coxins laterais da transmissão','Suporte da transmissão']},
  {name:'Transmissão Allison / Fast',items:['Conexão motor/transmissão','Flange de saída da transmissão']},
  {name:'Cardãs e Juntas',items:['Cruzetas — cardã (transmissão/diferencial intermediário)','Cruzetas — cardã entre eixos','Luva e ponteira estriada (Slip Yoke) — transmissão/diferencial intermediário','Luva e ponteira estriada (Slip Yoke) — cardã entre eixos','Lubrificação']},
  {name:'Barras Tensoras',items:['Eixo dianteiro','Eixo intermediário','Eixo traseiro']},
  {name:'Diferenciais',items:['Diferencial intermediário — flange','Diferencial traseiro — flange']}
];
const TF_ITEMS=TF_CATEGORIES.flatMap(x=>x.items);
const tfEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tfDate=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';

export async function init125hChecklistModule({supabase,profile,root,areaId,mode}){
  if(!supabase||!profile||!root)return;
  const mechanic=mode==='mechanic'||profile.role==='mecanico';
  const uid=profile.uid||profile.id;
  const area=typeof areaId==='function'?areaId():(areaId||profile.operationalAreaId||'arcelormittal-andradas');
  let rows=[],equipment=[],mechanics=[],current=null,readOnly=false,saveTimer=null;
  let host=root;
  if(mechanic){
    const workspace=root.querySelector('.ms-workspace');
    if(!workspace)return;
    host=document.createElement('div');host.className='ms-section';host.dataset.msPanel='tf-checklist';host.hidden=true;
    workspace.append(host);
    const nav=document.querySelector('#appShell > nav.tabs');
    if(nav){
      const btn=document.createElement('button');btn.type='button';btn.className='tab mechanic-main-tab';btn.dataset.mechanicSection='tf-checklist';btn.textContent='☑   Checklist 125h — Trem de Força';
      btn.addEventListener('click',()=>{root.querySelectorAll('[data-ms-panel]').forEach(p=>p.hidden=p!==host);document.querySelectorAll('.mechanic-main-tab').forEach(b=>b.classList.toggle('active',b===btn));loadList();});
      nav.insertBefore(btn,nav.querySelector('#sessionInfo')||null);
    }
  }
  host.innerHTML='<style>'+
    '.tf125-card{background:var(--panel,#fff);border:1px solid var(--line,#dfe4e8);border-radius:12px;padding:16px;margin:12px 0;color:var(--text,#17212b)}'+
    '.tf125-muted{color:var(--muted,#68737d);font-size:12px}.tf125-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tf125-field label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}.tf125-field input,.tf125-field textarea,.tf125-field select{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--line,#d5dce2);border-radius:8px;background:var(--surface,#fff);color:inherit}.tf125-full{grid-column:1/-1}.tf125-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.tf125-list{display:grid;gap:9px}.tf125-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line,#e1e6eb);border-radius:9px;padding:12px}.tf125-row small{display:block;color:var(--muted,#68737d);margin-top:4px}.tf125-section{border-top:1px solid var(--line,#e5e9ed);padding-top:14px;margin-top:16px}.tf125-photo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.tf125-photo{border:1px dashed var(--line,#b9c3cc);border-radius:9px;padding:9px}.tf125-photo img{width:100%;height:110px;object-fit:cover;border-radius:6px}.tf125-photo input{width:100%;font-size:11px}.tf125-item{border:1px solid var(--line,#e1e6eb);border-radius:9px;padding:12px;margin:9px 0}.tf125-item-head{display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:13px}.tf125-sign{width:100%;height:130px;border:1px solid #aab4bd;border-radius:8px;touch-action:none;background:#fff}.tf125-feedback{padding:10px;border-radius:8px;background:#eef3f7;margin:10px 0;font-size:13px}.tf125-feedback.error{background:#fff0ee;color:#a32b21}.tf125-feedback.ok{background:#e6f5eb;color:#17663a}@media(max-width:600px){.tf125-grid{grid-template-columns:1fr}.tf125-full{grid-column:auto}.tf125-row{align-items:flex-start;flex-direction:column}}'+
    '</style><div class="tf125-head"><h2>Checklist 125h — Trem de Força</h2><p class="tf125-muted">'+(mechanic?'Execute os checklists atribuídos a você. O rascunho fica salvo no sistema.':'Atribua a inspeção ao mecânico e acompanhe a execução e o histórico.')+'</p></div><div id="tf125Feedback" class="tf125-feedback" role="status">Carregando…</div><div id="tf125List"></div><div id="tf125Editor"></div>';
  const $=s=>host.querySelector(s);
  const feedback=(msg,type='')=>{const el=$('#tf125Feedback');if(el){el.textContent=msg;el.className='tf125-feedback'+(type?' '+type:'');}};
  async function loadBase(){
    const e=await supabase.from('operational_equipment').select('id,asset_code,model,current_horimeter').eq('area_id',area).order('asset_code');
    if(e.error)throw e.error;equipment=e.data||[];
    if(!mechanic){
      const m=await supabase.rpc('list_operational_area_mechanics',{area_key:area});
      if(m.error)throw m.error;mechanics=m.data||[];
    }
  }
  async function loadList(){
    try{
      await loadBase();
      let q=supabase.from('operational_125h_checklists').select('*').eq('area_id',area).order('created_at',{ascending:false});
      if(mechanic)q=q.eq('assigned_profile_id',uid);
      const r=await q;if(r.error)throw r.error;rows=r.data||[];
      renderList();feedback('Dados atualizados.');
    }catch(e){feedback(e.message||'Não foi possível carregar os checklists. Verifique se a migration 018 foi aplicada.','error');}
  }
  const equip=id=>equipment.find(x=>x.id===id);
  const mechanicName=id=>mechanics.find(x=>x.id===id)?.name||'Mecânico';
  function renderList(){
    const list=$('#tf125List');if(!list)return;
    let create='';
    if(!mechanic)create='<div class="tf125-card"><h3>Nova atribuição de inspeção</h3><form id="tf125Assign" class="tf125-grid"><div class="tf125-field"><label>Caminhão / TAG *</label><select name="equipment_id" required><option value="">Selecione</option>'+equipment.map(e=>'<option value="'+e.id+'">'+tfEsc(e.asset_code)+' — '+tfEsc(e.model)+'</option>').join('')+'</select></div><div class="tf125-field"><label>Mecânico responsável *</label><select name="assigned_profile_id" required><option value="">Selecione</option>'+mechanics.map(m=>'<option value="'+m.id+'">'+tfEsc(m.name)+'</option>').join('')+'</select></div><div class="tf125-field"><label>Data prevista *</label><input type="date" name="assigned_for" value="'+new Date().toISOString().slice(0,10)+'" required></div><div class="tf125-field tf125-full"><label>Observação da atribuição</label><input name="general_notes" placeholder="Ex.: inspeção preventiva 125h"></div><div class="tf125-actions tf125-full"><button class="primary" type="submit">Atribuir checklist ao mecânico</button></div></form></div>';
    list.innerHTML=create+'<div class="tf125-card"><h3>'+(mechanic?'Meus checklists atribuídos':'Checklists da área')+'</h3><div class="tf125-list">'+(rows.length?rows.map(r=>{const e=equip(r.equipment_id);return '<div class="tf125-row"><div><strong>'+tfEsc(e?.asset_code||'Equipamento')+' · '+tfEsc(e?.model||'')+'</strong><small>Mecânico: '+tfEsc(mechanic?profile.name:mechanicName(r.assigned_profile_id))+' · '+tfDate(r.assigned_for)+' · '+({assigned:'Aguardando',in_progress:'Em andamento',completed:'Concluído'}[r.status]||r.status)+'</small></div><div class="tf125-actions"><button type="button" class="light" data-open="'+r.id+'">'+(r.status==='completed'?'Consultar':'Abrir checklist')+'</button>'+(r.status==='completed'&&!mechanic?'<button type="button" class="primary" data-pdf="'+r.id+'">Gerar PDF</button>':'')+'</div></div>';}).join(''):'<p class="tf125-muted">Nenhum checklist encontrado.</p>')+'</div></div>';
    $('#tf125Assign')?.addEventListener('submit',assign);
    list.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openChecklist(b.dataset.open)));
    list.querySelectorAll('[data-pdf]').forEach(b=>b.addEventListener('click',()=>generatePdf(b.dataset.pdf)));
  }
  async function assign(ev){
    ev.preventDefault();const d=Object.fromEntries(new FormData(ev.currentTarget).entries());const btn=ev.currentTarget.querySelector('[type=submit]');btn.disabled=true;
    try{
      const payload={area_id:area,equipment_id:d.equipment_id,assigned_profile_id:d.assigned_profile_id,assigned_for:d.assigned_for,status:'assigned',created_by:uid,general_notes:d.general_notes||''};
      const r=await supabase.from('operational_125h_checklists').insert(payload).select().single();if(r.error)throw r.error;
      await loadList();feedback('Checklist atribuído. Ele já está disponível na área do mecânico.','ok');
    }catch(e){feedback(e.message||'Não foi possível atribuir o checklist.','error');btn.disabled=false;}
  }
  async function openChecklist(id){
    const row=rows.find(x=>x.id===id);if(!row)return;
    current={...row,responses:row.responses||{},evidence:row.evidence||{}};
    if(current.horimeter===null||current.horimeter===undefined)current.horimeter=equip(current.equipment_id)?.current_horimeter??'';
    readOnly=current.status==='completed'||!mechanic;
    if(mechanic&&current.status==='assigned'){
      const u=await supabase.from('operational_125h_checklists').update({status:'in_progress'}).eq('id',id).eq('assigned_profile_id',uid);
      if(u.error){feedback(u.error.message,'error');return;}current.status='in_progress';
    }
    renderEditor();
  }
  function renderEditor(){
    const e=equip(current.equipment_id);const r=current.responses||{},ev=current.evidence||{};
    let html='<div class="tf125-card"><div class="tf125-row"><div><h3>Inspeção · '+tfEsc(e?.asset_code||'')+'</h3><small class="tf125-muted">Status: '+tfEsc(current.status)+'</small></div><button type="button" class="light" id="tf125Back">Voltar à lista</button></div>';
    html+='<div class="tf125-section"><h3>Identificação da inspeção</h3><div class="tf125-grid">'+
      '<div class="tf125-field"><label>Data *</label><input type="date" data-meta="inspection_date" value="'+tfEsc(current.inspection_date||current.assigned_for)+'" '+(readOnly?'disabled':'')+'></div>'+
      '<div class="tf125-field"><label>Técnico responsável *</label><input data-meta="technician_name" value="'+tfEsc(current.technician_name||profile.name||'')+'" '+(readOnly?'disabled':'')+'></div>'+
      '<div class="tf125-field"><label>Número de série *</label><input data-meta="serial_number" value="'+tfEsc(current.serial_number||'')+'" '+(readOnly?'disabled':'')+'></div>'+
      '<div class="tf125-field"><label>TAG do equipamento</label><input value="'+tfEsc(e?.asset_code||'')+'" disabled></div>'+
      '<div class="tf125-field"><label>Horímetro (h) *</label><input type="number" min="0" step="0.1" data-meta="horimeter" value="'+tfEsc(current.horimeter??e?.current_horimeter??'')+'" '+(readOnly?'disabled':'')+'></div>'+
      '<div class="tf125-field"><label>Local *</label><input data-meta="location" value="'+tfEsc(current.location||'')+'" '+(readOnly?'disabled':'')+'></div>'+
      '<div class="tf125-field tf125-full"><label>Contrato / Cliente</label><input data-meta="client" value="'+tfEsc(current.client||'ArcelorMittal')+'" '+(readOnly?'disabled':'')+'></div></div></div>';
    html+='<div class="tf125-section"><h3>Registro fotográfico inicial — 7 fotos obrigatórias</h3><div class="tf125-photo-grid">'+TF_INITIAL.map(([k,label])=>photoHtml(k,label,ev[k],readOnly)).join('')+'</div></div>';
    html+='<div class="tf125-section"><h3>Inspeção do trem de força — 15 itens</h3>';
    let n=0;TF_CATEGORIES.forEach(cat=>{html+='<h4>'+tfEsc(cat.name)+'</h4>';cat.items.forEach(item=>{n++;const a=r[item]||{};html+='<article class="tf125-item"><div class="tf125-item-head"><span>'+n+'. '+tfEsc(item)+'</span><span class="tf125-muted">'+tfEsc(a.status||'Não avaliado')+'</span></div><div class="tf125-actions"><label><input type="radio" name="status-'+n+'" value="OK" data-status="'+tfEsc(item)+'" '+(a.status==='OK'?'checked':'')+' '+(readOnly?'disabled':'')+'> OK</label><label><input type="radio" name="status-'+n+'" value="NOK" data-status="'+tfEsc(item)+'" '+(a.status==='NOK'?'checked':'')+' '+(readOnly?'disabled':'')+'> NOK</label></div><div class="tf125-field"><label>'+(a.status==='NOK'?'Descrição da falha *':'Observações')+'</label><textarea rows="2" data-observation="'+tfEsc(item)+'" '+(readOnly?'disabled':'')+'>'+(tfEsc(a.observation||''))+'</textarea></div>'+photoHtml('item-'+n,'Foto obrigatória do item',ev['item-'+n],readOnly)+'</article>';});});
    html+='</div><div class="tf125-section"><h3>Conclusão e observações gerais</h3><div class="tf125-field"><textarea rows="4" data-meta="general_notes" placeholder="Recomendações, pendências e observações..." '+(readOnly?'disabled':'')+'>'+tfEsc(current.general_notes||'')+'</textarea></div></div>';
    html+='<div class="tf125-section"><h3>Assinatura do técnico *</h3><canvas id="tf125Signature" class="tf125-sign" width="900" height="220"></canvas><div class="tf125-actions"><button type="button" class="light" id="tf125ClearSign" '+(readOnly?'disabled':'')+'>Limpar assinatura</button></div></div>';
    html+='<div class="tf125-actions">'+(readOnly?'<span class="tf125-muted">Checklist concluído. Registro preservado para consulta.</span>':'<button type="button" class="light" id="tf125Save">Salvar andamento</button><button type="button" class="primary" id="tf125Complete">Concluir checklist</button>')+'</div></div>';
    $('#tf125Editor').innerHTML=html;$('#tf125List').hidden=true;
    $('#tf125Back').onclick=()=>{$('#tf125Editor').innerHTML='';$('#tf125List').hidden=false;loadList();};
    host.querySelectorAll('[data-photo]').forEach(input=>input.addEventListener('change',uploadEvidence));
    host.querySelectorAll('[data-meta]').forEach(input=>input.addEventListener('change',()=>{current[input.dataset.meta]=input.value;saveDraft(false);}));
    host.querySelectorAll('[data-status]').forEach(input=>input.addEventListener('change',()=>{const item=input.dataset.status;current.responses[item]=current.responses[item]||{};current.responses[item].status=input.value;renderEditor();saveDraft(false);}));
    host.querySelectorAll('[data-observation]').forEach(input=>input.addEventListener('change',()=>{const item=input.dataset.observation;current.responses[item]=current.responses[item]||{};current.responses[item].observation=input.value;saveDraft(false);}));
    const canvas=$('#tf125Signature'),ctx=canvas.getContext('2d');ctx.lineWidth=4;ctx.lineCap='round';ctx.strokeStyle='#17212b';let drawing=false;
    if(current.signature_path)loadSignature(ctx,canvas,current.signature_path);
    if(!readOnly){
      const point=ev=>{const b=canvas.getBoundingClientRect();return{x:(ev.clientX-b.left)*canvas.width/b.width,y:(ev.clientY-b.top)*canvas.height/b.height};};
      canvas.onpointerdown=ev=>{drawing=true;canvas.setPointerCapture(ev.pointerId);const p=point(ev);ctx.beginPath();ctx.moveTo(p.x,p.y);};
      canvas.onpointermove=ev=>{if(!drawing)return;const p=point(ev);ctx.lineTo(p.x,p.y);ctx.stroke();};
      canvas.onpointerup=async()=>{if(!drawing)return;drawing=false;current.signature_data=canvas.toDataURL('image/png');await uploadSignature();};
      $('#tf125ClearSign').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);current.signature_path=null;current.signature_data='';saveDraft(false);};
      $('#tf125Save').onclick=()=>saveDraft(true);
      $('#tf125Complete').onclick=complete;
    }
    loadPhotoPreviews();
  }
  function photoHtml(key,label,path,disabled){
    return '<div class="tf125-photo" data-photo-box="'+tfEsc(key)+'"><strong>'+tfEsc(label)+'</strong><div id="tf125-preview-'+tfEsc(key)+'">'+(path?'<span class="tf125-muted">Foto salva</span>':'<span class="tf125-muted">Sem foto</span>')+'</div>'+(disabled?'':'<input type="file" accept="image/*" capture="environment" data-photo="'+tfEsc(key)+'">')+'</div>';
  }
  async function loadPhotoPreviews(){
    for(const [key,path] of Object.entries(current.evidence||{})){
      const {data,error}=await supabase.storage.from(TF_BUCKET).createSignedUrl(path,3600);
      const box=$('#tf125-preview-'+CSS.escape(key));if(!box)continue;
      if(!error&&data?.signedUrl)box.innerHTML='<img src="'+data.signedUrl+'" alt="Evidência '+tfEsc(key)+'">';
    }
  }
  async function loadSignature(ctx,canvas,path){
    const {data,error}=await supabase.storage.from(TF_BUCKET).createSignedUrl(path,3600);if(error||!data?.signedUrl)return;
    const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);img.src=data.signedUrl;
  }
  async function compressed(file){
    if(!file||!file.type.startsWith('image/'))throw new Error('Selecione uma imagem válida.');
    const url=URL.createObjectURL(file);
    try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
      const scale=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);x.fillStyle='rgba(0,0,0,.58)';x.fillRect(0,c.height-34,c.width,34);
      x.fillStyle='#fff';x.font='bold 16px Arial';x.fillText(new Date().toLocaleString('pt-BR')+' · IRMEN · '+(equip(current.equipment_id)?.asset_code||''),10,c.height-11,c.width-20);
      return await new Promise(res=>c.toBlob(res,'image/jpeg',.78));
    }finally{URL.revokeObjectURL(url);}
  }
  async function uploadEvidence(ev){
    const input=ev.currentTarget,key=input.dataset.photo,file=input.files?.[0];if(!file)return;
    input.disabled=true;feedback('Enviando evidência fotográfica…');
    try{
      const blob=await compressed(file),path=current.id+'/'+uid+'/'+key+'-'+Date.now()+'.jpg';
      const up=await supabase.storage.from(TF_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
      current.evidence=current.evidence||{};current.evidence[key]=path;
      const save=await saveDraft(false);if(save){const box=$('#tf125-preview-'+CSS.escape(key));if(box)box.innerHTML='<span class="tf125-muted">Foto enviada e salva ✓</span>';feedback('Foto enviada e vinculada ao checklist.','ok');}
    }catch(e){feedback(e.message||'Falha ao enviar foto.','error');}
    finally{input.disabled=false;input.value='';}
  }
  async function uploadSignature(){
    try{
      const canvas=$('#tf125Signature');const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
      const path=current.id+'/'+uid+'/signature-'+Date.now()+'.png';
      const up=await supabase.storage.from(TF_BUCKET).upload(path,blob,{contentType:'image/png',upsert:false});if(up.error)throw up.error;
      current.signature_path=path;await saveDraft(false);feedback('Assinatura salva.','ok');
    }catch(e){feedback(e.message||'Falha ao salvar assinatura.','error');}
  }
  async function saveDraft(show){
    if(!current||readOnly)return false;
    const payload={technician_name:current.technician_name||'',inspection_date:current.inspection_date||current.assigned_for,serial_number:current.serial_number||'',horimeter:current.horimeter===''||current.horimeter===null||current.horimeter===undefined?null:Number(current.horimeter),location:current.location||'',client:current.client||'',general_notes:current.general_notes||'',responses:current.responses||{},evidence:current.evidence||{},signature_path:current.signature_path||null,status:'in_progress',updated_at:new Date().toISOString()};
    const r=await supabase.from('operational_125h_checklists').update(payload).eq('id',current.id).eq('assigned_profile_id',uid);if(r.error){feedback(r.error.message,'error');return false;}
    Object.assign(current,payload);if(show)feedback('Andamento salvo no Supabase.','ok');return true;
  }
  async function complete(){
    const errors=[];if(!current.technician_name?.trim())errors.push('Informe o técnico responsável.');
    if(!current.serial_number?.trim())errors.push('Informe o número de série.');
    if(current.horimeter===null||current.horimeter===''||!Number.isFinite(Number(current.horimeter)))errors.push('Informe o horímetro.');
    if(!current.location?.trim())errors.push('Informe o local.');
    if(!current.signature_path)errors.push('Registre a assinatura.');
    TF_INITIAL.forEach(([k,l])=>{if(!current.evidence?.[k])errors.push('Foto obrigatória: '+l);});
    TF_ITEMS.forEach((item,i)=>{const a=current.responses?.[item];if(!['OK','NOK'].includes(a?.status))errors.push('Avalie: '+item);if(a?.status==='NOK'&&!a.observation?.trim())errors.push('Descreva a falha: '+item);if(!current.evidence?.['item-'+(i+1)])errors.push('Foto obrigatória do item: '+item);});
    if(errors.length){feedback('Não é possível concluir. '+errors.slice(0,5).join(' ')+(errors.length>5?' E mais '+(errors.length-5)+' pendência(s).':''),'error');return;}
    const saved=await saveDraft(false);if(!saved)return;
    const r=await supabase.from('operational_125h_checklists').update({status:'completed',completed_by:uid,completed_at:new Date().toISOString()}).eq('id',current.id).eq('assigned_profile_id',uid);
    if(r.error){feedback(r.error.message||'Não foi possível concluir.','error');return;}
    current.status='completed';readOnly=true;feedback('Checklist concluído e registrado. O supervisor já pode consultar e gerar o PDF.','ok');renderEditor();await loadList();
  }
  async function generatePdf(id){
    const row=rows.find(x=>x.id===id);if(!row||row.status!=='completed')return;
    const win=window.open('','_blank');if(!win){feedback('Permita pop-ups para gerar o PDF.','error');return;}
    win.document.write('<p style="font:16px Arial;padding:24px">Preparando relatório e evidências…</p>');
    try{
      const e=equip(row.equipment_id),images=[];
      for(const [key,path] of Object.entries(row.evidence||{})){const s=await supabase.storage.from(TF_BUCKET).createSignedUrl(path,300);if(!s.error&&s.data?.signedUrl)images.push([key,s.data.signedUrl]);}
      let sections='';let i=0;TF_CATEGORIES.forEach(cat=>{sections+='<h2>'+tfEsc(cat.name)+'</h2>';cat.items.forEach(item=>{i++;const a=row.responses?.[item]||{};const pic=images.find(x=>x[0]==='item-'+i);sections+='<article><h3>'+tfEsc(item)+' — '+tfEsc(a.status||'')+'</h3><p>'+tfEsc(a.observation||'Sem observações')+'</p>'+(pic?'<img src="'+pic[1]+'">':'')+'</article>';});});
      const photoLabels=TF_INITIAL.map(([k,l])=>{const p=images.find(x=>x[0]===k);return p?'<figure><img src="'+p[1]+'"><figcaption>'+tfEsc(l)+'</figcaption></figure>':'';}).join('');
      const signature=row.signature_path?await supabase.storage.from(TF_BUCKET).createSignedUrl(row.signature_path,300):null;
      const sign=signature&&!signature.error?'<img class="sign" src="'+signature.data.signedUrl+'">':'';
      const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Checklist Trem de Força</title><style>body{font:13px Arial;color:#1c2935;margin:24px}h1{border-bottom:3px solid #e0a900;padding-bottom:10px}h2{background:#eef2f5;padding:9px;margin-top:24px} .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.meta div{padding:8px;background:#f5f7f8} .photos{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}figure{margin:8px 0;break-inside:avoid}img{max-width:100%;max-height:250px;object-fit:contain}article{border-bottom:1px solid #ddd;padding:8px 0;break-inside:avoid}p{white-space:pre-wrap}.sign{max-width:350px;max-height:100px;border-bottom:1px solid #333}@media print{body{margin:12mm}}</style><body><h1>IRMEN · Inspeção 125h — Trem de Força</h1><div class="meta"><div><b>TAG:</b> '+tfEsc(e?.asset_code||'')+'</div><div><b>Equipamento:</b> '+tfEsc(e?.model||'')+'</div><div><b>Data:</b> '+tfDate(row.inspection_date)+'</div><div><b>Técnico:</b> '+tfEsc(row.technician_name)+'</div><div><b>Nº de série:</b> '+tfEsc(row.serial_number)+'</div><div><b>Horímetro:</b> '+tfEsc(row.horimeter)+' h</div><div><b>Local:</b> '+tfEsc(row.location)+'</div><div><b>Cliente:</b> '+tfEsc(row.client)+'</div><div><b>Conclusão:</b> '+tfDate((row.completed_at||'').slice(0,10))+'</div></div><h2>Registro fotográfico inicial</h2><div class="photos">'+photoLabels+'</div><h2>Inspeção técnica</h2>'+sections+'<h2>Observações gerais</h2><p>'+tfEsc(row.general_notes||'Sem observações.')+'</p><h2>Assinatura do técnico</h2>'+sign+'<p>Documento gerado em '+new Date().toLocaleString('pt-BR')+'</p><script>window.onload=()=>setTimeout(()=>window.print(),700)<\/script></body></html>';
      win.document.open();win.document.write(html);win.document.close();
    }catch(e){win.close();feedback(e.message||'Falha ao preparar PDF.','error');}
  }
  $('#tf125List').addEventListener('click',ev=>{const b=ev.target.closest('[data-pdf]');if(b)generatePdf(b.dataset.pdf);});
  await loadList();
}
