/* Checklist de Campo — Trem de Força
 * Homologação local/offline. Os registros ficam no dispositivo (localStorage).
 * Não envia dados ao banco nem altera o fluxo existente da Gestão Operacional.
 */
export function initChecklistTremForca({ root, isMaster, getAssets }) {
  if (!root || root.dataset.tremForcaInitialized === "true") return;
  root.dataset.tremForcaInitialized = "true";
  const panel = root.querySelector('[data-live-panel="checklist"]');
  if (!panel) return;
  const KEY = "relatoriopro-checklist-trem-forca-v1";
  const categories = [
    { name:"Coxins / Suportes", items:[
      "Coxins e suporte do motor",
      "Coxins laterais da transmissão",
      "Suporte da transmissão"
    ]},
    { name:"Transmissão Allison / Fast", items:[
      "Conexão motor/transmissão",
      "Flange de saída da transmissão"
    ]},
    { name:"Cardãs e Juntas", items:[
      "Cruzetas — cardã (transmissão/diferencial intermediário)",
      "Cruzetas — cardã entre eixos",
      "Luva e ponteira estriada (Slip Yoke) — transmissão/diferencial intermediário",
      "Luva e ponteira estriada (Slip Yoke) — cardã entre eixos",
      "Lubrificação"
    ]},
    { name:"Barras Tensoras", items:[
      "Eixo dianteiro",
      "Eixo intermediário",
      "Eixo traseiro"
    ]},
    { name:"Diferenciais", items:[
      "Diferencial intermediário — flange",
      "Diferencial traseiro — flange"
    ]}
  ];
  const requiredPhotos = [
    ["horimetro","Horímetro"],["painel","Painel (horímetro e data)"],
    ["serie","Placa com número de série"],["equipamento","Equipamento"],
    ["transmissao","Transmissão"],["placaTransmissao","Placa de identificação da transmissão"],
    ["motor","Motor"]
  ];
  const state = { id:"", data:{}, items:{}, photos:{}, extraPhotos:[], signature:"", savedAt:"" };
  let signatureDirty = false;
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const uid = () => crypto?.randomUUID ? crypto.randomUUID() : "tf-"+Date.now()+"-"+Math.random().toString(16).slice(2);
  const allItems = categories.flatMap(c=>c.items);
  const countAnswered = () => allItems.filter(x=>["OK","NOK"].includes(state.items[x]?.status)).length;
  const photoCount = () => requiredPhotos.filter(([k])=>!!state.photos[k]).length + allItems.filter(x=>!!state.items[x]?.photo).length;
  const dateNow = () => new Date().toLocaleString("pt-BR");
  const assets = () => typeof getAssets === "function" ? getAssets() : [];
  function render() {
    const assetOptions = assets().map(a=>'<option value="'+esc(a.id)+'">'+esc(a.asset_code+" — "+a.model)+'</option>').join("");
    panel.innerHTML = `
      <div class="tf-head">
        <div><span class="go-eyebrow">INSPEÇÃO TÉCNICA · IRMEN</span><h2>Checklist de Campo — Trem de Força</h2>
        <p>Inspeção guiada para registrar condições, evidências fotográficas e assinatura do técnico.</p></div>
        <div class="tf-progress"><strong id="tfProgressValue">0%</strong><span>preenchimento</span><div><i id="tfProgressBar"></i></div></div>
      </div>
      <div class="tf-local-note"><strong>Modo de homologação offline</strong><span>Rascunhos e fotos são salvos somente neste dispositivo. A sincronização com o banco será ativada após validação.</span></div>
      <div class="tf-actions-top"><button class="light" id="tfNew" type="button">＋ Novo checklist</button><button class="light" id="tfSavedToggle" type="button">Ver salvos</button><button class="light" id="tfSave" type="button">Salvar rascunho</button></div>
      <div id="tfSavedList" class="tf-saved-list" hidden></div>
      <form id="tfForm" novalidate>
        <section class="tf-section"><div class="tf-section-title"><span>01</span><div><h3>Identificação da inspeção</h3><p>Informe os dados do equipamento e do responsável.</p></div></div>
          <div class="tf-grid">
            <label>Data da inspeção *<input name="date" type="date" required></label>
            <label>Técnico responsável *<input name="technician" required placeholder="Nome completo"></label>
            <label>Número de série *<input name="serial" required></label>
            <label>TAG do equipamento *<input name="tag" required></label>
            <label>Local *<input name="location" required placeholder="Mina / área / oficina"></label>
            <label>Contrato / Cliente *<input name="client" required value="ArcelorMittal"></label>
            <label>E-mail(s) para receber o PDF *<input name="emails" type="text" required placeholder="email@empresa.com; outro@empresa.com"><small>Separe múltiplos e-mails por ponto e vírgula.</small></label>
            <label>Vincular caminhão cadastrado (opcional)<select name="assetId"><option value="">Não vincular</option>${assetOptions}</select></label>
          </div>
        </section>
        <section class="tf-section"><div class="tf-section-title"><span>02</span><div><h3>Registro fotográfico inicial</h3><p>As sete evidências abaixo são obrigatórias. A marca d'água é aplicada no momento da captura/seleção.</p></div></div>
          <div class="tf-photo-grid" id="tfInitialPhotos">${requiredPhotos.map(([key,title])=>photoCard(key,title,true)).join("")}</div>
        </section>
        <section class="tf-section"><div class="tf-section-title"><span>03</span><div><h3>Inspeção do trem de força</h3><p>Marque OK ou NOK em cada item. Cada item exige fotografia comprobatória e permite observação.</p></div></div>
          <div id="tfInspectionItems">${categories.map((cat,ci)=>`
            <div class="tf-category"><h4>${esc(cat.name)}</h4>
              ${cat.items.map((item,ii)=>{const key="item-"+(categories.slice(0,ci).reduce((n,c)=>n+c.items.length,0)+ii+1);return `
                <article class="tf-item" data-item="${esc(item)}">
                  <div class="tf-item-head"><strong>${esc(item)}</strong><span class="tf-item-number">Item ${allItems.indexOf(item)+1}/15</span></div>
                  <div class="tf-status-choice"><label><input type="radio" name="status-${key}" value="OK"> <span class="tf-ok">OK</span></label><label><input type="radio" name="status-${key}" value="NOK"> <span class="tf-nok">NOK</span></label></div>
                  <label class="tf-observation"><span data-observation-label="${esc(item)}">Observações (opcional)</span><textarea rows="2" data-observation="${esc(item)}" placeholder="Descreva a condição encontrada..."></textarea><small class="tf-nok-required" hidden>Obrigatório quando o resultado for NOK. Descreva a falha encontrada.</small></label>
                  ${photoCard("inspection-"+key,"Foto obrigatória do item",true)}
                </article>`;}).join("")}
            </div>`).join("")}
        </section>
        <section class="tf-section"><div class="tf-section-title"><span>04</span><div><h3>Conclusão e evidências adicionais</h3><p>Registre observações gerais e fotos complementares, se necessário.</p></div></div>
          <label class="tf-wide">Observações gerais<textarea name="generalNotes" rows="4" placeholder="Conclusão da inspeção, recomendações e ações necessárias..."></textarea></label>
          <label class="tf-wide">Fotos adicionais (opcionais)<input id="tfExtraPhotos" type="file" accept="image/*" capture="environment" multiple><small>É possível selecionar mais de uma fotografia.</small></label>
          <div class="tf-photo-grid" id="tfExtraPhotoList"></div>
        </section>
        <section class="tf-section"><div class="tf-section-title"><span>05</span><div><h3>Assinatura do técnico</h3><p>Assine no quadro abaixo para concluir o checklist.</p></div></div>
          <div class="tf-signature-wrap"><canvas id="tfSignature" width="900" height="240" aria-label="Área para assinatura digital"></canvas><div class="tf-signature-actions"><span>Assinatura digital</span><button class="light" id="tfClearSignature" type="button">Limpar assinatura</button></div></div>
        </section>
        <div class="tf-final-actions"><div id="tfValidation" role="status" aria-live="polite"></div><button class="light" id="tfSaveBottom" type="button">Salvar rascunho</button><button class="primary" id="tfGenerate" type="button">Concluir e gerar PDF</button></div>
      </form>
    `;
    const today = new Date(); const dateField=panel.querySelector('[name="date"]'); dateField.value=today.toISOString().slice(0,10);
    panel.querySelectorAll("#tfForm [name]").forEach(el=>{
      const name=el.name;
      if(el.type==="radio"){const item=el.closest(".tf-item")?.dataset.item;el.checked=!!item&&state.items[item]?.status===el.value;}
      else if(state.data[name]!==undefined)el.value=state.data[name];
    });
    panel.querySelectorAll("[data-observation]").forEach(el=>{el.value=state.items[el.dataset.observation]?.observation||"";updateNokRequirement(el.closest(".tf-item"));});
    requiredPhotos.forEach(([key])=>{if(state.photos[key])setPhoto(key,state.photos[key]);});
    allItems.forEach((item,i)=>{const key="inspection-item-"+(i+1),data=state.items[item];if(data?.photo){const preview=panel.querySelector("#preview-"+CSS.escape(key));if(preview)preview.innerHTML='<img src="'+data.photo+'" alt="Foto do item"><span class="tf-photo-check">✓</span>';const remove=panel.querySelector('[data-remove-photo="'+key+'"]');if(remove)remove.hidden=false;}});
    bind();
    renderExtraPhotos();
    refreshProgress();
  }
  function photoCard(key,title,required) {
    return '<div class="tf-photo-card" data-photo-card="'+esc(key)+'"><div class="tf-photo-preview" id="preview-'+esc(key)+'"><span>＋</span></div><div class="tf-photo-meta"><strong>'+esc(title)+(required?' *':'')+'</strong><small>'+(required?'Obrigatória':'Opcional')+'</small></div><label class="tf-file-button">Adicionar foto<input type="file" accept="image/*" capture="environment" data-photo-input="'+esc(key)+'" hidden></label><button type="button" class="tf-remove-photo" data-remove-photo="'+esc(key)+'" hidden>Remover</button></div>';
  }
  function refreshProgress() {
    const fields=["date","technician","serial","tag","location","client","emails"].filter(k=>panel.querySelector('[name="'+k+'"]')?.value.trim()).length;
    const answered=countAnswered(), requiredPhotoCount=requiredPhotos.filter(([k])=>!!state.photos[k]).length;
    const itemPhotos=allItems.filter(x=>!!state.items[x]?.photo).length;
    const signature=state.signature?1:0;
    const total=7+7+15+15+1, done=fields+requiredPhotoCount+answered+itemPhotos+signature;
    const pct=Math.round(done/total*100);
    const bar=panel.querySelector("#tfProgressBar"),value=panel.querySelector("#tfProgressValue");
    if(bar)bar.style.width=pct+"%";if(value)value.textContent=pct+"%";
  }
  async function imageData(file) {
    if(!file || !file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem válido.");
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=data});
    const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement("canvas");
    canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const stamp=new Date().toLocaleString("pt-BR")+" · IRMEN · "+(panel.querySelector('[name="tag"]')?.value||"TAG não informada");
    const band=Math.max(38,Math.round(canvas.height*.055));ctx.fillStyle="rgba(0,0,0,.62)";ctx.fillRect(0,canvas.height-band,canvas.width,band);
    ctx.fillStyle="#fff";ctx.font="bold "+Math.max(16,Math.round(band*.34))+"px Arial";ctx.fillText(stamp,16,canvas.height-band/2+6,canvas.width-32);
    return canvas.toDataURL("image/jpeg",.76);
  }
  function setPhoto(key,data) {
    state.photos[key]=data;
    const preview=panel.querySelector("#preview-"+CSS.escape(key));
    if(preview)preview.innerHTML='<img src="'+data+'" alt="Foto registrada"><span class="tf-photo-check">✓</span>';
    const remove=panel.querySelector('[data-remove-photo="'+CSS.escape(key)+'"]');if(remove)remove.hidden=false;
    refreshProgress();
  }
  async function handlePhoto(key,file) {
    try { const data=await imageData(file); if(key.startsWith("inspection-")){const item=panel.querySelector('[data-item] [data-observation]');const name=panel.querySelector('[data-photo-card="'+key+'"]')?.closest(".tf-item")?.dataset.item;state.items[name]=state.items[name]||{};state.items[name].photo=data;const preview=panel.querySelector("#preview-"+CSS.escape(key));if(preview)preview.innerHTML='<img src="'+data+'" alt="Foto do item"><span class="tf-photo-check">✓</span>';panel.querySelector('[data-remove-photo="'+key+'"]').hidden=false;}else setPhoto(key,data); }
    catch(e){alert(e.message||"Não foi possível processar a foto.");}
    refreshProgress();
  }
  function drawSignature() {
    const canvas=panel.querySelector("#tfSignature"),ctx=canvas.getContext("2d");
    if(state.signature){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);img.src=state.signature;}
  }
  function updateNokRequirement(itemCard) {
    if(!itemCard)return;
    const item=itemCard.dataset.item;
    const isNok=state.items[item]?.status==="NOK";
    const textarea=itemCard.querySelector("[data-observation]");
    const label=itemCard.querySelector("[data-observation-label]");
    const hint=itemCard.querySelector(".tf-nok-required");
    if(textarea) {
      textarea.required=!!isNok;
      textarea.setAttribute("aria-required",String(!!isNok));
      textarea.placeholder=isNok?"Descreva obrigatoriamente a falha encontrada...":"Descreva a condição encontrada...";
    }
    if(label)label.textContent=isNok?"Descrição da falha (obrigatória) *":"Observações (opcional)";
    if(hint)hint.hidden=!isNok;
    itemCard.classList.toggle("tf-item-nok",!!isNok);
  }
  function bind() {
    const form=panel.querySelector("#tfForm");
    form.addEventListener("input",e=>{
      if(e.target.name?.startsWith("status-")){const item=e.target.closest(".tf-item")?.dataset.item;if(item){state.items[item]=state.items[item]||{};state.items[item].status=e.target.value;updateNokRequirement(e.target.closest(".tf-item"));}}
      if(e.target.dataset.observation){const item=e.target.dataset.observation;state.items[item]=state.items[item]||{};state.items[item].observation=e.target.value;}
      refreshProgress();
    });
    form.addEventListener("change",async e=>{
      if(e.target.dataset.photoInput){const key=e.target.dataset.photoInput;if(e.target.files?.[0])await handlePhoto(key,e.target.files[0]);e.target.value="";}
      if(e.target.id==="tfExtraPhotos"){for(const file of Array.from(e.target.files||[])){try{state.extraPhotos.push(await imageData(file));}catch(_){}}renderExtraPhotos();e.target.value="";}
      if(e.target.name==="assetId"){state.data.assetId=e.target.value;}
    });
    form.addEventListener("input",e=>{if(e.target.name)state.data[e.target.name]=e.target.value;});
    panel.addEventListener("click",e=>{
      const remove=e.target.closest("[data-remove-photo]");if(remove){const key=remove.dataset.removePhoto;if(key.startsWith("inspection-")){const item=remove.closest(".tf-item")?.dataset.item;if(item&&state.items[item])delete state.items[item].photo;const p=panel.querySelector("#preview-"+CSS.escape(key));if(p)p.innerHTML="<span>＋</span>";}else{delete state.photos[key];const p=panel.querySelector("#preview-"+CSS.escape(key));if(p)p.innerHTML="<span>＋</span>";}remove.hidden=true;refreshProgress();}
    });
    const canvas=panel.querySelector("#tfSignature"),ctx=canvas.getContext("2d");ctx.lineWidth=4;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#142334";
    let drawing=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    canvas.addEventListener("pointerdown",e=>{drawing=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);});
    canvas.addEventListener("pointermove",e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();signatureDirty=true;});
    canvas.addEventListener("pointerup",()=>{if(!drawing)return;drawing=false;state.signature=canvas.toDataURL("image/png");refreshProgress();});
    canvas.addEventListener("pointercancel",()=>drawing=false);
    panel.querySelector("#tfClearSignature").addEventListener("click",()=>{ctx.clearRect(0,0,canvas.width,canvas.height);state.signature="";signatureDirty=false;refreshProgress();});
    panel.querySelector("#tfSave").addEventListener("click",saveDraft);panel.querySelector("#tfSaveBottom").addEventListener("click",saveDraft);
    panel.querySelector("#tfNew").addEventListener("click",()=>{if(!confirm("Iniciar um novo checklist? Salve o atual antes para não perder alterações."))return;Object.assign(state,{id:"",data:{},items:{},photos:{},extraPhotos:[],signature:"",savedAt:""});render();});
    panel.querySelector("#tfSavedToggle").addEventListener("click",showSaved);
    panel.querySelector("#tfGenerate").addEventListener("click",generatePDF);
    drawSignature();
  }
  function renderExtraPhotos(){const box=panel.querySelector("#tfExtraPhotoList");box.innerHTML=state.extraPhotos.map((p,i)=>'<div class="tf-photo-card"><div class="tf-photo-preview"><img src="'+p+'" alt="Foto adicional"></div><div class="tf-photo-meta"><strong>Foto adicional '+(i+1)+'</strong></div><button type="button" class="tf-remove-photo" data-extra-remove="'+i+'">Remover</button></div>').join("");box.querySelectorAll("[data-extra-remove]").forEach(b=>b.addEventListener("click",()=>{state.extraPhotos.splice(Number(b.dataset.extraRemove),1);renderExtraPhotos();}));}
  function collect() {
    panel.querySelectorAll("#tfForm [name]").forEach(el=>{if(el.type==="radio"){if(el.checked)state.items[el.closest(".tf-item")?.dataset.item]={...(state.items[el.closest(".tf-item")?.dataset.item]||{}),status:el.value};}else state.data[el.name]=el.value;});
    panel.querySelectorAll("[data-observation]").forEach(el=>{const name=el.dataset.observation;state.items[name]=state.items[name]||{};state.items[name].observation=el.value;});
  }
  function validate() {
    collect();const errors=[];
    ["date","technician","serial","tag","location","client","emails"].forEach(k=>{if(!String(state.data[k]||"").trim())errors.push("Preencha: "+({date:"Data",technician:"Técnico",serial:"Número de série",tag:"TAG",location:"Local",client:"Contrato/Cliente",emails:"E-mail(s)"}[k]));});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+(?:\s*;\s*[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(state.data.emails||""))errors.push("Informe e-mail(s) válido(s), separados por ponto e vírgula.");
    requiredPhotos.forEach(([k,t])=>{if(!state.photos[k])errors.push("Foto obrigatória: "+t);});
    allItems.forEach(item=>{if(!["OK","NOK"].includes(state.items[item]?.status))errors.push("Avalie: "+item);if(state.items[item]?.status==="NOK"&&!String(state.items[item]?.observation||"").trim())errors.push("Descreva obrigatoriamente a falha do item marcado como NOK: "+item);if(!state.items[item]?.photo)errors.push("Adicione foto: "+item);});
    if(!state.signature)errors.push("A assinatura do técnico é obrigatória.");
    return errors;
  }
  function saveDraft() {
    if(!isMaster())return;
    collect();state.id=state.id||uid();state.savedAt=new Date().toISOString();
    try{const list=JSON.parse(localStorage.getItem(KEY)||"[]"),idx=list.findIndex(x=>x.id===state.id),snapshot=JSON.parse(JSON.stringify(state));if(idx>=0)list[idx]=snapshot;else list.unshift(snapshot);localStorage.setItem(KEY,JSON.stringify(list));panel.querySelector("#tfValidation").textContent="Rascunho salvo neste dispositivo em "+dateNow()+"."; }
    catch(e){panel.querySelector("#tfValidation").textContent="Não foi possível salvar. O armazenamento do dispositivo pode estar cheio.";console.error(e);}
  }
  function showSaved() {
    const box=panel.querySelector("#tfSavedList");box.hidden=!box.hidden;if(box.hidden)return;
    let list=[];try{list=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(_){}
    box.innerHTML=list.length?'<h3>Checklists salvos neste dispositivo</h3>'+list.map(x=>'<div class="tf-saved-row"><div><strong>'+esc(x.data?.tag||"Sem TAG")+'</strong><small>'+esc(x.data?.date||"Sem data")+' · '+esc(x.data?.technician||"Sem técnico")+'</small></div><button class="light" type="button" data-open-saved="'+esc(x.id)+'">Abrir</button></div>').join(""):'<p>Nenhum checklist salvo neste dispositivo.</p>';
    box.querySelectorAll("[data-open-saved]").forEach(b=>b.addEventListener("click",()=>{const x=list.find(v=>v.id===b.dataset.openSaved);if(x){Object.assign(state,JSON.parse(JSON.stringify(x)));render();panel.querySelector("#tfSavedList").hidden=true;}}));
  }
  function generatePDF() {
    const errors=validate(),status=panel.querySelector("#tfValidation");
    if(errors.length){status.innerHTML='<strong>Antes de concluir, corrija:</strong><ul>'+errors.slice(0,30).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';status.scrollIntoView({behavior:"smooth",block:"center"});return;}
    saveDraft();
    const photoHtml=(title,data)=>data?'<figure><img src="'+data+'"><figcaption>'+esc(title)+'</figcaption></figure>':"";
    const itemRows=categories.map(cat=>'<h2>'+esc(cat.name)+'</h2>'+cat.items.map(item=>'<article><h3>'+esc(item)+' — '+esc(state.items[item].status)+'</h3><p>'+esc(state.items[item].observation||"Sem observações")+'</p>'+photoHtml("Evidência fotográfica",state.items[item].photo)+'</article>').join("")).join("");
    const initials=requiredPhotos.map(([k,t])=>photoHtml(t,state.photos[k])).join("");
    const extras=state.extraPhotos.map((p,i)=>photoHtml("Foto adicional "+(i+1),p)).join("");
    const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Checklist Trem de Força — '+esc(state.data.tag)+'</title><style>body{font:14px Arial;color:#202b36;margin:28px}h1{color:#172a3d;border-bottom:3px solid #e4a900;padding-bottom:12px}h2{background:#eef2f5;padding:10px;margin-top:26px}h3{margin-bottom:4px}p{white-space:pre-wrap} .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.meta div{padding:8px;background:#f5f7f8} .photos{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}figure{margin:8px 0;break-inside:avoid}figure img{width:100%;max-height:300px;object-fit:contain;border:1px solid #ddd}figcaption{font-size:12px;color:#555}article{border-bottom:1px solid #ddd;padding:8px 0;break-inside:avoid}.sign{max-width:360px;max-height:100px;object-fit:contain;border-bottom:1px solid #333}@media print{button{display:none}body{margin:12mm}}</style></head><body><h1>IRMEN · Checklist de Campo — Trem de Força</h1><div class="meta">'+Object.entries({Data:state.data.date,Técnico:state.data.technician,"Nº de série":state.data.serial,TAG:state.data.tag,Local:state.data.location,"Contrato / Cliente":state.data.client,"E-mail(s)":state.data.emails}).map(([k,v])=>'<div><b>'+k+':</b> '+esc(v)+'</div>').join("")+'</div><h2>Registro fotográfico inicial</h2><div class="photos">'+initials+'</div><h2>Inspeção técnica</h2>'+itemRows+'<h2>Conclusão e observações gerais</h2><p>'+esc(state.data.generalNotes||"Sem observações gerais.")+'</p><div class="photos">'+extras+'</div><h2>Assinatura do técnico</h2><img class="sign" src="'+state.signature+'"><p>Documento gerado em '+esc(dateNow())+'</p><script>window.onload=()=>setTimeout(()=>window.print(),700)<\/script></body></html>';
    const win=window.open("","_blank");if(!win){status.textContent="Permita pop-ups para gerar o PDF.";return;}win.document.open();win.document.write(html);win.document.close();status.textContent="Relatório preparado. Na janela de impressão, escolha “Salvar como PDF”.";
  }
  function loadExisting() {
    if(!isMaster()){panel.innerHTML='<div class="go-denied">Acesso restrito ao administrador master.</div>';return;}
    render();
  }
  loadExisting();
}
