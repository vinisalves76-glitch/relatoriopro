import { createSupabaseAdapter } from "./core/supabase-adapter.js";
import { hasPermission, PERMISSIONS, ROLE_DEFAULTS } from "./core/permissions.js";
import { escapeHtml } from "./shared/html.js";
import { initOperationalModule } from "./modules/operational-crud.js";
const $ = id => document.getElementById(id);
const backend = createSupabaseAdapter({ $, supabaseUrl: "https://vwvesygsudhbaqmayhsz.supabase.co", supabaseAnonKey: "sb_publishable_IcydrqH9qr8WqVpVdfPwoA_sWz1ehMw" });
// Normaliza o usuário autenticado localmente para evitar dependência de exportação do adaptador.
const normalizeUser = user => user ? { ...user, uid: user.id || user.uid } : null;
const { supabase, creatorClient, auth, db, storage, MASTER_UID, profilesRef, collection, collectionGroup, doc, where, query, serverTimestamp, getDocs, getDoc, setDoc, createUserProfile, updateDoc, deleteDoc, signInWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail, createUserWithEmailAndPassword, onAuthStateChanged, storageRef, uploadBytes, getDownloadURL } = backend;

let currentProfile=null,userProfilesCache=[];

const REPORTS='relatoriopro-reports';
const MODEL='relatoriopro-model';
const fields=['type','date','responsible','client','branch','equipment','location','objective','observations','activities','results','conclusion'];
const defaultModel={company:'IRMEN',subtitle:'Soluções técnicas SANY',footer:'IRMEN | Relatório técnico',conf:'Documento destinado ao uso técnico e profissional.',color:'#e4a900',logo:''};
let photos=[],editingId=null,logoData='',restoring=false,activeUser=null,reportCache=[],modelCache={...defaultModel},gptPendingResult=null;

function userReportsRef(){if(!activeUser)throw new Error('Faça login para acessar os relatórios.');return isSystemAdmin()?collectionGroup(db,'reports'):collection(db,'users',activeUser.uid,'reports')}
function reportRef(id,ownerUid=activeUser?.uid){if(!ownerUid)throw new Error('Proprietário não identificado.');return doc(db,'users',ownerUid,'reports',id)}
function modelRef(){if(!activeUser)throw new Error('Faça login para acessar o modelo.');return doc(db,'users',activeUser.uid,'settings','model')}
const TRAININGS='relatoriopro-trainings';
function trainingAdmin(){return isSystemAdmin()}
function trainingEscape(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function trainingStatus(s){return ({draft:'Rascunho',pending:'Aguardando aprovação',published:'Publicado',returned:'Correções solicitadas'})[s]||s}
function trainingCanCreate(){return !!activeUser&&!!currentProfile&&currentProfile.active!==false&&(['instrutor_tecnico','consultor_tecnico','auxiliar_administrativo','gerente','coordenador'].includes(currentProfile.role)||isMaster())}
function trainingDeleteButton(id){return trainingAdmin()?'<button class="danger training-delete" data-training-delete="'+trainingEscape(id)+'" type="button">Excluir</button>':''}
function trainingFavoriteIds(){try{return JSON.parse(localStorage.getItem('irmen-training-favorites-'+(activeUser?.uid||'guest'))||'[]')}catch(_){return []}}
function trainingToggleFavorite(id){const ids=trainingFavoriteIds(),next=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];localStorage.setItem('irmen-training-favorites-'+activeUser.uid,JSON.stringify(next));renderPublishedTrainingLibrary();renderFavoriteTrainings()}
function trainingCard(t,mode='library'){
 const status=t.status||'draft',meta=[t.category,t.audience,t.equipment].filter(Boolean).map(trainingEscape).join(' • '),fav=trainingFavoriteIds().includes(t.id);let actions='';
 if(mode==='library'||mode==='favorites'){actions+='<button class="training-favorite '+(fav?'active':'')+'" data-training-favorite="'+trainingEscape(t.id)+'" type="button" aria-label="'+(fav?'Remover dos favoritos':'Adicionar aos favoritos')+'">'+(fav?'★ Favoritado':'☆ Favoritar')+'</button>';actions+='<button class="primary training-action" data-training-access="'+trainingEscape(t.id)+'" type="button">Acessar treinamento</button><button class="light training-action" data-training-download="'+trainingEscape(t.id)+'" type="button">Baixar materiais</button>'}
 if(mode==='mine'&&(status==='draft'||status==='returned'))actions+='<button class="primary" data-training-submit="'+trainingEscape(t.id)+'" type="button">Enviar para aprovação</button>';
 if(mode==='pending')actions+='<button class="light" data-training-return="'+trainingEscape(t.id)+'" type="button">Devolver para correção</button><button class="primary" data-training-approve="'+trainingEscape(t.id)+'" type="button">Aprovar e publicar</button>';
 actions+=trainingDeleteButton(t.id);
 const cover=t.coverUrl||'';
 return '<article class="training-card">'+(cover?'<img class="training-card-cover" src="'+trainingEscape(cover)+'" alt="Capa de '+trainingEscape(t.title)+'">':'<div class="training-card-cover"></div>')+'<div class="training-card-body"><div class="training-card-top"><span class="training-status '+trainingEscape(status)+'">'+trainingEscape(trainingStatus(status))+'</span>'+(t.category?'<span class="training-category">'+trainingEscape(t.category)+'</span>':'')+'</div><h3>'+trainingEscape(t.title)+'</h3>'+(t.description?'<p class="training-description">'+trainingEscape(t.description)+'</p>':'')+'<div class="training-card-meta">'+(t.equipment?'<span>'+trainingEscape(t.equipment)+'</span>':'')+(t.level?'<span>'+trainingEscape(t.level)+'</span>':'')+(t.duration?'<span>'+trainingEscape(t.duration)+' h</span>':'')+'</div>'+(meta?'<p class="training-meta">'+meta+'</p>':'')+(mode==='pending'?'<p class="training-author">Responsável: '+trainingEscape(t.ownerName||t.ownerUid||'Não informado')+'</p>':'')+(mode!=='library'&&mode!=='favorites'?trainingAttachmentLinks(t.attachments):'')+(mode==='pending'?'<textarea class="training-review-input" id="review-'+trainingEscape(t.id)+'" placeholder="Comentário / motivo de devolução"></textarea>':'')+(mode==='mine'&&t.reviewComment?'<p class="training-feedback"><strong>Comentário do aprovador:</strong> '+trainingEscape(t.reviewComment)+'</p>':'')+'<div class="training-card-actions">'+actions+'</div></div></article>';
}
let publishedTrainingItems=[];
function renderPublishedTrainingLibrary(){
 const term=($('trainingLibrarySearch')?.value||'').trim().toLocaleLowerCase('pt-BR'),category=$('trainingCategoryFilter')?.value||'',audience=$('trainingAudienceFilter')?.value||'',equipment=$('trainingEquipmentFilter')?.value||'',level=$('trainingLevelFilter')?.value||'';
 const filtered=publishedTrainingItems.filter(t=>(!term||[t.title,t.description,t.category,t.audience,t.equipment,t.level,...(Array.isArray(t.keywords)?t.keywords:[])].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(term)))&&(!category||String(t.category||'')===category)&&(!audience||String(t.audience||'')===audience)&&(!equipment||String(t.equipment||'')===equipment)&&(!level||String(t.level||'')===level));
 $('publishedTrainings').innerHTML=filtered.length?filtered.map(t=>trainingCard(t,'library')).join(''):'<div class="training-empty">Nenhum treinamento encontrado com esses filtros.</div>';
 $('trainingLibraryResults').textContent=filtered.length+' de '+publishedTrainingItems.length+' treinamento(s)';
}
function renderFavoriteTrainings(){const ids=trainingFavoriteIds(),items=publishedTrainingItems.filter(t=>ids.includes(t.id));$('favoriteTrainings').innerHTML=items.length?items.map(t=>trainingCard(t,'favorites')).join(''):'<div class="training-empty">Você ainda não salvou treinamentos favoritos.</div>'}
function populateTrainingFilters(items){
 const fill=(id,key,placeholder)=>{const el=$(id),selected=el.value,values=[...new Set(items.map(t=>String(t[key]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));el.innerHTML='<option value="">'+placeholder+'</option>'+values.map(v=>'<option value="'+trainingEscape(v)+'">'+trainingEscape(v)+'</option>').join('');if(values.includes(selected))el.value=selected};
 fill('trainingCategoryFilter','category','Todas as categorias');fill('trainingAudienceFilter','audience','Todos os públicos');fill('trainingEquipmentFilter','equipment','Todos os equipamentos');fill('trainingLevelFilter','level','Todos os níveis');
}
async function loadTrainings(){
 if(!activeUser)return;$('trainingCreatePanel').hidden=!trainingCanCreate();$('trainingReviewPanel').hidden=!trainingAdmin();
 const pub=$('publishedTrainings'),mine=$('myTrainings'),pending=$('pendingTrainings');
 try{
  const [publishedSnap,mineSnap]=await Promise.all([getDocs(query(collection(db,TRAININGS),where('status','==','published'))),getDocs(query(collection(db,TRAININGS),where('ownerUid','==',activeUser.uid)))]);
  await loadTechnicalManuals();
  const published=publishedSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.docType!=='technical_manual'),own=mineSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.docType!=='technical_manual');
  // As capas ficam em bucket privado: cada lista precisa de URL assinada.
  // Antes, somente a biblioteca pública recebia coverUrl; a lista "Meus treinamentos"
  // usava os registros sem URL e perdia a imagem logo após salvar/recarregar.
  const attachTrainingCoverUrl=async training=>{
   if(!training.coverPath){training.coverUrl='';return training}
   try{
    const {data,error}=await supabase.storage.from('training-attachments-private').createSignedUrl(training.coverPath,3600);
    if(error)throw error;
    training.coverUrl=data?.signedUrl||'';
    if(!training.coverUrl)throw new Error('O Storage não retornou uma URL assinada para a capa.');
   }catch(error){
    training.coverUrl='';
    console.error('[RelatorioPro] Não foi possível carregar a capa do treinamento '+training.id+':',error);
   }
   return training;
  };
  publishedTrainingItems=await Promise.all(published.map(attachTrainingCoverUrl));
  const ownWithCovers=await Promise.all(own.map(attachTrainingCoverUrl));
  populateTrainingFilters(publishedTrainingItems);renderPublishedTrainingLibrary();renderFavoriteTrainings();
  $('trainingPublishedCount').textContent=published.length;$('trainingMineCount').textContent=own.length;
  
  mine.innerHTML=ownWithCovers.length?ownWithCovers.map(t=>trainingCard(t,'mine')).join(''):'<div class="training-empty">Você ainda não criou treinamentos.</div>';
  $('trainingPendingCount').textContent=trainingAdmin()?'0':'—';
  if(trainingAdmin()){
   const ps=await getDocs(query(collection(db,TRAININGS),where('status','==','pending')));
   const pend=ps.docs.map(d=>({id:d.id,...d.data()})).filter(t=>t.docType!=='technical_manual');
   const pendingWithCovers=await Promise.all(pend.map(attachTrainingCoverUrl));
   $('trainingPendingCount').textContent=pend.length;
   pending.innerHTML=pendingWithCovers.length?pendingWithCovers.map(t=>trainingCard(t,'pending')).join(''):'<div class="training-empty">Nenhum treinamento aguardando aprovação.</div>';
  }
 }catch(e){pub.innerHTML='<p class="muted">Não foi possível carregar os treinamentos. Verifique as permissões do Supabase.</p>';mine.innerHTML='<p class="muted">'+trainingEscape(e.message)+'</p>';if(trainingAdmin())pending.innerHTML='<p class="muted">'+trainingEscape(e.message)+'</p>'}
}
async function trainingOpenMaterials(trainingId,mode='access'){
 const training=publishedTrainingItems.find(t=>t.id===trainingId);
 if(!training)throw new Error('Treinamento publicado não encontrado.');
 const files=Array.isArray(training.attachments)?training.attachments:[];
 const overlay=document.createElement('div');overlay.className='training-material-overlay';overlay.setAttribute('role','presentation');
 const title=mode==='download'?'Baixar materiais':'Acessar treinamento';
 overlay.innerHTML='<section class="training-material-dialog" role="dialog" aria-modal="true" aria-label="'+title+'"><div class="training-material-head"><div><span class="training-eyebrow">BIBLIOTECA IRMEN</span><h2>'+trainingEscape(training.title)+'</h2><p class="muted">'+title+'</p></div><button type="button" class="training-material-close" aria-label="Fechar">✕</button></div>'+(mode==='access'?'<p class="training-material-description">'+trainingEscape(training.description||'Sem descrição cadastrada.')+'</p><p class="training-meta">'+[training.equipment,training.category,training.level,training.duration?training.duration+' h':''].filter(Boolean).map(trainingEscape).join(' · ')+'</p>':'<p class="training-material-description">Selecione os arquivos deste treinamento que deseja baixar.</p>')+'<div class="training-material-list">'+(files.length?files.map((f,i)=>'<div class="training-material-row"><div><strong>'+trainingEscape(f.name||('Material '+(i+1)))+'</strong><small>'+trainingEscape(f.kind||'Arquivo')+(f.size?' · '+(f.size/1024/1024).toFixed(1)+' MB':'')+'</small></div><span class="muted">Preparando...</span></div>').join(''):'<p class="muted">Este treinamento não possui arquivos anexados.</p>')+'</div></section>';
 document.body.appendChild(overlay);
 const close=()=>overlay.remove();overlay.querySelector('.training-material-close').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 if(!files.length)return;
 const rows=overlay.querySelectorAll('.training-material-row');
 for(let i=0;i<files.length;i++){
  const f=files[i],row=rows[i],label=mode==='download'?'Baixar arquivo':'Abrir arquivo';
  try{
   if(!f.path)throw new Error('Caminho do arquivo indisponível');
   const options=mode==='download'?{download:f.name||true}:{};
   const {data,error}=await supabase.storage.from('training-attachments-private').createSignedUrl(f.path,900,options);
   if(error||!data?.signedUrl)throw error||new Error('Não foi possível gerar o link');
   const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;if(mode==='download')link.setAttribute('download',f.name||'material');
   row.querySelector('span').replaceWith(link);
  }catch(err){row.querySelector('span').textContent='Indisponível: '+(err.message||'erro ao acessar')}
 }
}
function trainingAttachmentLinks(files){
 const list=Array.isArray(files)?files:[];
 if(!list.length)return '<p class="muted">Nenhum anexo neste treinamento.</p>';
 return '<div class="training-attachments"><strong>Materiais anexados</strong><ul>'+list.map(a=>'<li><a href="'+trainingEscape(a.url||'#')+'" target="_blank" rel="noopener noreferrer">'+trainingEscape(a.name)+'</a> <span class="muted">('+trainingEscape(a.kind||'Arquivo')+')</span></li>').join('')+'</ul></div>';
}
function trainingFileKind(file){
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 return ({pdf:'PDF',ppt:'PowerPoint',pptx:'PowerPoint',doc:'Word',docx:'Word',xls:'Excel',xlsx:'Excel',jpg:'Imagem',jpeg:'Imagem',png:'Imagem',webp:'Imagem',mp4:'Vídeo'})[ext]||'Arquivo';
}
async function uploadTrainingFiles(trainingId,uploadedPaths=[]){
 const selected=Array.from($('trainingFiles').files||[]);
 if(!selected.length)return [];
 const allowed=/\.(pdf|ppt|pptx|doc|docx|xls|xlsx|jpg|jpeg|png|webp|mp4)$/i;
 for(const file of selected){
  if(!allowed.test(file.name))throw new Error('Formato não permitido: '+file.name);
 }
 const uploaded=[];
 $('trainingFilesStatus').textContent='Enviando '+selected.length+' arquivo(s)...';
 for(const file of selected){
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=activeUser.uid+'/'+trainingId+'/'+Date.now()+'-'+safeName;
  const fileRef=storageRef(storage,path);
  try{
   await uploadBytes(fileRef,file,{contentType:file.type||'application/octet-stream',customMetadata:{trainingId,uploadedBy:activeUser.uid,originalName:file.name}});
   uploadedPaths.push(path);
   const url=await getDownloadURL(fileRef);
   uploaded.push({name:file.name,path,url,kind:trainingFileKind(file),size:file.size,contentType:file.type||''});
  }catch(error){
   throw new Error('Arquivo "'+file.name+'" ('+(file.size/1024/1024).toFixed(1)+' MB): '+(error?.message||String(error)));
  }
 }
 $('trainingFilesStatus').textContent=uploaded.length+' arquivo(s) anexado(s).';
 return uploaded;
}
let trainingWizardStep=0;
function trainingWizardShow(step){trainingWizardStep=Math.max(0,Math.min(3,step));document.querySelectorAll('[data-training-step]').forEach((el,i)=>el.hidden=i!==trainingWizardStep);document.querySelectorAll('.training-step-line').forEach((el,i)=>el.classList.toggle('active',i<=trainingWizardStep));$('trainingWizardLabel').textContent=['Etapa 1 de 4 · Identificação','Etapa 2 de 4 · Classificação','Etapa 3 de 4 · Materiais','Etapa 4 de 4 · Revisão'][trainingWizardStep];$('trainingWizardPercent').textContent=((trainingWizardStep+1)*25)+'%';$('trainingWizardBack').disabled=trainingWizardStep===0;$('trainingWizardNext').hidden=trainingWizardStep===3;$('trainingSaveDraft').hidden=trainingWizardStep!==3;$('trainingSubmit').hidden=trainingWizardStep!==3;if(trainingWizardStep===3)trainingBuildReview()}
function trainingValidateStep(step){const ids=step===0?['trainingTitle','trainingDescription','trainingEquipment','trainingDuration']:step===1?['trainingCategory','trainingLevel','trainingAudience','trainingKeywords']:[];for(const id of ids){const el=$(id);if(!el.value.trim()||(id==='trainingDuration'&&Number(el.value)<=0)){el.focus();alert('Preencha corretamente o campo obrigatório: '+(el.labels?.[0]?.textContent||id));return false}}if(step===0){const cover=$('trainingCover').files?.[0];if(!cover){$('trainingCover').focus();alert('A imagem de capa é obrigatória.');return false}if(!/^image\/(jpeg|png|webp)$/.test(cover.type)||cover.size>8*1024*1024){alert('A capa deve ser JPG, PNG ou WebP e ter no máximo 8 MB.');return false}}return true}
function trainingBuildReview(){const cover=$('trainingCover').files?.[0],url=cover?URL.createObjectURL(cover):'';$('trainingReviewPreview').innerHTML='<div class="training-card" style="max-width:520px">'+(url?'<img class="training-card-cover" src="'+url+'" alt="Prévia da capa">':'')+'<div class="training-card-body"><span class="training-status draft">Pré-visualização</span><h3>'+trainingEscape($('trainingTitle').value)+'</h3><p class="training-description">'+trainingEscape($('trainingDescription').value)+'</p><div class="training-card-meta"><span>'+trainingEscape($('trainingEquipment').value)+'</span><span>'+trainingEscape($('trainingLevel').value)+'</span><span>'+trainingEscape($('trainingDuration').value)+' h</span></div><p class="training-meta">'+trainingEscape($('trainingCategory').value)+' • '+trainingEscape($('trainingAudience').value)+'</p><p class="training-meta">Palavras-chave: '+trainingEscape($('trainingKeywords').value)+'</p></div></div>'}
async function uploadTrainingCover(trainingId,uploadedPaths=[]){const file=$('trainingCover').files?.[0];if(!file)throw new Error('A imagem de capa é obrigatória.');const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=activeUser.uid+'/'+trainingId+'/cover-'+Date.now()+'-'+safeName;const ref=storageRef(storage,path);await uploadBytes(ref,file,{contentType:file.type||'image/jpeg',customMetadata:{trainingId,uploadedBy:activeUser.uid,originalName:file.name}});uploadedPaths.push(path);return path}
async function createTraining(status){
 if(!trainingCanCreate()){alert('Seu perfil não pode criar treinamentos.');return}
 if(!trainingValidateStep(0)||!trainingValidateStep(1))return;
 const title=$('trainingTitle').value.trim(),buttons=[$('trainingSaveDraft'),$('trainingSubmit')];buttons.forEach(b=>b.disabled=true);
 let trainingStage='preparar cadastro',trainingId=null;
 const uploadedPaths=[];
 try{
  trainingId=doc(collection(db,TRAININGS)).id;
  trainingStage='enviar a capa';
  const coverPath=await uploadTrainingCover(trainingId,uploadedPaths);
  trainingStage='enviar anexos';
  const attachments=await uploadTrainingFiles(trainingId,uploadedPaths);
  trainingStage='gravar treinamento com status '+status;
  await setDoc(doc(db,TRAININGS,trainingId),{title,category:$('trainingCategory').value.trim(),audience:$('trainingAudience').value.trim(),description:$('trainingDescription').value.trim(),equipment:$('trainingEquipment').value.trim(),level:$('trainingLevel').value,duration:Number($('trainingDuration').value),keywords:$('trainingKeywords').value.split(',').map(x=>x.trim()).filter(Boolean),coverPath,attachments,ownerUid:activeUser.uid,ownerName:currentProfile.name||activeUser.email,status,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),reviewComment:'',version:2});
  ['trainingTitle','trainingCategory','trainingAudience','trainingDescription','trainingEquipment','trainingDuration','trainingLevel','trainingKeywords','trainingFiles','trainingCover'].forEach(id=>$(id).value='');$('trainingFilesStatus').textContent='';$('trainingCoverPreview').src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22100%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e9edf0%22/%3E%3C/svg%3E';trainingWizardShow(0);
  try{await loadTrainings()}catch(refreshError){console.error('Treinamento salvo, mas a listagem não atualizou:',refreshError)}
  alert(status==='pending'?'Treinamento enviado para aprovação.':status==='published'?'Treinamento publicado com sucesso.':'Rascunho salvo.');
 }catch(e){
  $('trainingFilesStatus').textContent='';
  const detail=[e.message,e.statusCode?'HTTP '+e.statusCode:'',e.error?String(e.error):''].filter(Boolean).join(' | ');
  let cleanupDetail='';
  if(uploadedPaths.length){
   const {error:removeError}=await supabase.storage.from('training-attachments-private').remove(uploadedPaths);
   if(removeError)cleanupDetail=' Não foi possível limpar todos os arquivos enviados: '+removeError.message;
  }
  alert('Falha ao '+trainingStage+': '+detail+cleanupDetail);
 }
 finally{buttons.forEach(b=>b.disabled=false)}
}
async function loadTechnicalManuals(){const host=$('trainingManualsList');if(!host)return;try{const snap=await getDocs(collection(db,TRAININGS));const items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.docType==='technical_manual'&&m.status==='published').sort((a,b)=>String(b.updatedOn||'').localeCompare(String(a.updatedOn||'')));host.innerHTML=items.length?items.map(m=>'<article class="training-card"><div class="training-card-body"><span class="training-status published">Manual disponível</span><h3>'+trainingEscape(m.title)+'</h3>'+(m.description?'<p class="training-description">'+trainingEscape(m.description)+'</p>':'')+'<div class="manual-card-meta"><span>Equipamento: '+trainingEscape(m.equipment)+'</span><span>Atualizado em: '+trainingEscape(m.updatedOn)+'</span><span>Idioma: '+trainingEscape(m.language)+'</span></div><p class="training-meta">'+trainingEscape(m.fileName||'Documento')+' · '+trainingEscape(m.ownerName||'Equipe IRMEN')+'</p><div class="manual-card-actions"><button class="primary" type="button" data-manual-open="'+trainingEscape(m.id)+'">Abrir manual</button><button class="light" type="button" data-manual-download="'+trainingEscape(m.id)+'">Baixar manual</button>'+(trainingAdmin()?'<button class="danger" type="button" data-manual-delete="'+trainingEscape(m.id)+'">Excluir</button>':'')+'</div></div></article>').join(''):'<div class="training-empty">Nenhum manual compartilhado ainda. Utilize “Compartilhar manual” para adicionar o primeiro documento.</div>';window.__irmenTechnicalManuals=items}catch(e){host.innerHTML='<div class="training-empty">Não foi possível carregar os manuais: '+trainingEscape(e.message)+'</div>'}}
async function submitTechnicalManual(e){e.preventDefault();if(!trainingCanCreate()){alert('Seu perfil não tem permissão para compartilhar manuais.');return}const title=$('manualTitle').value.trim(),equipment=$('manualEquipment').value.trim(),updatedOn=$('manualUpdatedOn').value,language=$('manualLanguage').value,file=$('manualFile').files?.[0],description=$('manualDescription').value.trim();if(!title||!equipment||!updatedOn||!language||!file){alert('Preencha todos os campos obrigatórios e selecione o arquivo.');return}if(!/\.(pdf|doc|docx|ppt|pptx|xls|xlsx)$/i.test(file.name)){alert('Formato não permitido. Envie PDF, Word, PowerPoint ou Excel.');return}const initialManualStatus=currentProfile.role==='gerente'?'published':'pending';const btn=$('manualSubmit');btn.disabled=true;$('manualUploadStatus').textContent='Enviando documento…';try{const id=doc(collection(db,TRAININGS)).id,path=activeUser.uid+'/manuals/'+id+'/'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),ref=storageRef(storage,path);await uploadBytes(ref,file,{contentType:file.type||'application/octet-stream',customMetadata:{manualId:id,uploadedBy:activeUser.uid,originalName:file.name}});await setDoc(doc(db,TRAININGS,id),{docType:'technical_manual',title,equipment,updatedOn,language,description,fileName:file.name,path,size:file.size,contentType:file.type||'',ownerUid:activeUser.uid,ownerName:currentProfile.name||activeUser.email,status:initialManualStatus,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});$('trainingManualForm').reset();$('manualUploadStatus').textContent='Manual compartilhado com sucesso.';await loadTechnicalManuals();alert('Manual adicionado à biblioteca técnica.')}catch(err){$('manualUploadStatus').textContent='';alert('Não foi possível compartilhar o manual: '+err.message)}finally{btn.disabled=false}}
async function openTechnicalManual(id,download=false){const item=(window.__irmenTechnicalManuals||[]).find(x=>x.id===id);if(!item?.path)throw new Error('Manual não encontrado ou sem arquivo.');const {data,error}=await supabase.storage.from('training-attachments-private').createSignedUrl(item.path,3600,download?{download:item.fileName||true}:{});if(error)throw error;if(download){const a=document.createElement('a');a.href=data.signedUrl;a.download=item.fileName||'manual';a.target='_blank';a.rel='noopener';a.click()}else window.open(data.signedUrl,'_blank','noopener')}
$('trainingManualForm').addEventListener('submit',submitTechnicalManual);
$('trainingManualsPanel').addEventListener('click',async e=>{const open=e.target.closest('[data-manual-open]'),down=e.target.closest('[data-manual-download]'),del=e.target.closest('[data-manual-delete]');try{if(open){await openTechnicalManual(open.dataset.manualOpen);return}if(down){await openTechnicalManual(down.dataset.manualDownload,true);return}if(del){if(!trainingAdmin())throw new Error('Apenas administradores podem excluir manuais.');if(!confirm('Excluir este manual da biblioteca?'))return;const item=(window.__irmenTechnicalManuals||[]).find(x=>x.id===del.dataset.manualDelete);if(item?.path){const {error}=await supabase.storage.from('training-attachments-private').remove([item.path]);if(error)throw error}await deleteDoc(doc(db,TRAININGS,del.dataset.manualDelete));await loadTechnicalManuals();return}}catch(err){alert('Não foi possível concluir a ação: '+err.message)}});
$('trainingWizardNext').addEventListener('click',()=>{if(trainingValidateStep(trainingWizardStep))trainingWizardShow(trainingWizardStep+1)});
$('trainingWizardBack').addEventListener('click',()=>trainingWizardShow(trainingWizardStep-1));
$('trainingSaveDraft').addEventListener('click',()=>createTraining('draft'));
$('trainingSubmit').addEventListener('click',()=>createTraining(currentProfile?.role==='gerente'?'published':'pending'));
$('trainingCover').addEventListener('change',e=>{const f=e.target.files?.[0];if(f){if(f.size>8*1024*1024){alert('A imagem deve ter no máximo 8 MB.');e.target.value='';return}$('trainingCoverPreview').src=URL.createObjectURL(f)}});
document.querySelectorAll('[data-training-scroll]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.trainingScroll)?.scrollIntoView({behavior:'smooth',block:'start'})));
$('trainingLibrarySearch').addEventListener('input',renderPublishedTrainingLibrary);
$('trainingCategoryFilter').addEventListener('change',renderPublishedTrainingLibrary);
$('trainingAudienceFilter').addEventListener('change',renderPublishedTrainingLibrary);$('trainingEquipmentFilter').addEventListener('change',renderPublishedTrainingLibrary);$('trainingLevelFilter').addEventListener('change',renderPublishedTrainingLibrary);
$('trainingClearFilters').addEventListener('click',()=>{$('trainingLibrarySearch').value='';$('trainingCategoryFilter').value='';$('trainingAudienceFilter').value='';$('trainingEquipmentFilter').value='';$('trainingLevelFilter').value='';renderPublishedTrainingLibrary()});
$('trainings').addEventListener('click',async e=>{const submit=e.target.closest('[data-training-submit]'),approve=e.target.closest('[data-training-approve]'),ret=e.target.closest('[data-training-return]'),del=e.target.closest('[data-training-delete]'),favorite=e.target.closest('[data-training-favorite]'),access=e.target.closest('[data-training-access]'),download=e.target.closest('[data-training-download]');try{if(access){await trainingOpenMaterials(access.dataset.trainingAccess,'access');return}if(download){await trainingOpenMaterials(download.dataset.trainingDownload,'download');return}if(favorite){trainingToggleFavorite(favorite.dataset.trainingFavorite);return}
 if(del){if(!trainingAdmin())throw new Error('Apenas ADM ou Mestre ADM pode excluir treinamentos.');const id=del.dataset.trainingDelete;if(!confirm('Tem certeza que deseja excluir este treinamento? Esta ação não pode ser desfeita.'))return;del.disabled=true;const ref=doc(db,TRAININGS,id),snap=await getDoc(ref);if(!snap.exists())throw new Error('Treinamento não encontrado.');const files=Array.isArray(snap.data().attachments)?snap.data().attachments:[],paths=files.map(x=>x.path).filter(Boolean);if(paths.length){const {error}=await supabase.storage.from('training-attachments-private').remove(paths);if(error)throw error;}await deleteDoc(ref);await loadTrainings();alert('Treinamento excluído com sucesso.');return}
 if(submit){const ref=doc(db,TRAININGS,submit.dataset.trainingSubmit),snap=await getDoc(ref);if(!snap.exists()||snap.data().ownerUid!==activeUser.uid||!['draft','returned'].includes(snap.data().status))throw new Error('Este treinamento não pode ser enviado.');await updateDoc(ref,{status:'pending',reviewComment:'',updatedAt:serverTimestamp()});await loadTrainings();alert('Enviado para aprovação.')}
 if(approve){if(!trainingAdmin())throw new Error('Apenas administrador pode aprovar.');await updateDoc(doc(db,TRAININGS,approve.dataset.trainingApprove),{status:'published',reviewComment:$('review-'+approve.dataset.trainingApprove).value.trim(),approvedBy:activeUser.uid,approvedAt:serverTimestamp(),updatedAt:serverTimestamp()});await loadTrainings();alert('Treinamento publicado.')}
 if(ret){if(!trainingAdmin())throw new Error('Apenas administrador pode devolver para correção.');const comment=$('review-'+ret.dataset.trainingReturn).value.trim();if(!comment)throw new Error('Informe o motivo da devolução.');await updateDoc(doc(db,TRAININGS,ret.dataset.trainingReturn),{status:'returned',reviewComment:comment,updatedAt:serverTimestamp()});await loadTrainings();alert('Treinamento devolvido para correção.')}
 }catch(err){alert('Ação não concluída: '+err.message);if(del)del.disabled=false}});

function setAuthError(message){$('authError').textContent=message||''}
function friendlyAuthError(error){
 const codes={
 'auth/invalid-credential':'E-mail ou senha incorretos.',
 'auth/user-not-found':'Conta não encontrada. Crie uma conta ou confira o e-mail.',
 'auth/wrong-password':'Senha incorreta.',
 'auth/email-already-in-use':'Este e-mail já possui uma conta.',
 'auth/weak-password':'A senha deve ter pelo menos 6 caracteres.',
 'auth/invalid-email':'Informe um endereço de e-mail válido.',
 'auth/too-many-requests':'Muitas tentativas. Aguarde e tente novamente.',
 'auth/network-request-failed':'Falha de conexão. Verifique a internet.',
 'auth/operation-not-allowed':'O login por e-mail/senha não está habilitado no provedor de autenticação.',
 'permission-denied':'Seu acesso foi negado. Verifique suas permissões ou entre em contato com o administrador.',
 'unavailable':'O serviço de dados está temporariamente indisponível. Tente novamente.'
 };
 const message=String(error?.message||'');if(/invalid login credentials/i.test(message))return 'E-mail ou senha incorretos.';if(/email not confirmed/i.test(message))return 'Confirme seu e-mail antes de entrar.';if(/user already registered/i.test(message))return 'Este e-mail já possui uma conta.';if(/row-level security|permission denied/i.test(message))return 'Acesso bloqueado pelas permissões do Supabase. Confira as políticas RLS.';return codes[error?.code] || message || 'Ocorreu um erro. Tente novamente.';
}
// Um único handler de login evita autenticações concorrentes.
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if($('authSubmit').disabled)return;
 setAuthError('');
 $('authSubmit').disabled=true;
 const originalLabel=$('authSubmit').textContent;
 $('authSubmit').textContent='Autenticando...';
 try{
  const result=await signInWithEmailAndPassword(auth,$('authEmail').value.trim(),$('authPassword').value);
  if(!result?.user)throw new Error('O Supabase não retornou os dados do usuário autenticado.');
  // Confirma que a sessão foi persistida antes de carregar perfil e permissões.
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  const sessionUser=normalizeUser(data?.session?.user);
  if(!sessionUser||sessionUser.uid!==result.user.uid)throw new Error('O login foi aceito, mas a sessão não permaneceu ativa no navegador. Verifique cookies, armazenamento local e configuração de domínio.');
  backend.currentSupabaseUser=sessionUser;
  await initializeUser(sessionUser);
 }catch(error){
  console.error('[RelatorioPro] Falha após autenticação:',error);
  setAuthError(friendlyAuthError(error));
 }finally{
  $('authSubmit').disabled=false;
  $('authSubmit').textContent=originalLabel;
 }
});

function isMaster(){return !!activeUser&&(activeUser.id===MASTER_UID||activeUser.uid===MASTER_UID||currentProfile?.role==='super_admin')}
function openSimulation(){if(!isMaster())return;
const staff=[['Ana Paula Ribeiro','Instrutora técnica','Treinamentos'],['Bruno Martins','Consultor técnico','Escavadeiras'],['Camila Souza','Consultora técnica','Pós-venda'],['Diego Ferreira','Consultor técnico','Pá carregadeira'],['Eduarda Lima','Instrutora técnica','Segurança operacional'],['Felipe Costa','Consultor técnico','Diagnóstico'],['Gabriela Alves','Consultora técnica','Motores diesel'],['Henrique Rocha','Consultor técnico','Hidráulica'],['Isabela Mendes','Instrutora técnica','Elétrica e eletrônica'],['João Pedro Santos','Consultor técnico','Transmissão'],['Karen Oliveira','Consultora técnica','Manutenção preventiva'],['Lucas Almeida','Consultor técnico','Equipamentos de mineração'],['Mariana Carvalho','Instrutora técnica','Procedimentos operacionais'],['Nicolas Gomes','Consultor técnico','Atendimento de campo'],['Patrícia Nunes','Consultora técnica','Garantia e inspeção']];
const clients=['Mineração Horizonte (TESTE)','Pedreira Modelo (TESTE)','Obras Brasil Demonstração (TESTE)','Construtora Vale Verde (TESTE)','Unidade IRMEN Treinamento (TESTE)'];
const equipment=['Escavadeira SANY SY215C','Escavadeira SANY SY365H','Pá carregadeira SANY SW966K','Motoniveladora SANY STG190C','Rolo compactador SANY SSR120'];
const reportTypes=['Relatório de campo','Inspeção técnica','Diagnóstico de falha','Treinamento técnico','Manutenção preventiva'];
const reports=staff.map((p,i)=>({id:'SIM-'+String(i+1).padStart(3,'0'),owner:p[0],role:p[1],client:clients[i%clients.length],equipment:equipment[i%equipment.length],type:reportTypes[i%reportTypes.length],date:new Date(Date.now()-i*86400000).toLocaleDateString('pt-BR'),status:i%4===0?'Em revisão':'Concluído',objective:['Avaliar as condições operacionais e registrar as evidências encontradas.','Realizar inspeção preventiva dos principais sistemas do equipamento.','Investigar o sintoma relatado e documentar as verificações realizadas.'][i%3],activities:['Inspeção visual geral e verificação de segurança.','Conferência dos registros de operação e histórico de manutenção.','Verificação dos sistemas relacionados ao atendimento.','Registro das observações e recomendações técnicas.'].join('\n'),results:['Condição geral registrada para fins de demonstração.','Pontos de atenção documentados para acompanhamento.','Recomendações registradas; validar com manual específico antes de qualquer intervenção.'][i%3],conclusion:'Relatório fictício para teste visual do RelatorioPro. Não representa diagnóstico real nem especificação oficial SANY.'}));
const appointments=staff.flatMap((p,i)=>[{id:'SIM-AG-'+(i+1)+'A',person:p[0],dateOffset:i%5,time:['08:00','09:30','11:00','13:30','15:00'][i%5],title:['Inspeção técnica de equipamento','Treinamento de manutenção preventiva','Diagnóstico de sistema hidráulico','Verificação elétrica e eletrônica','Acompanhamento de pós-venda'][i%5],client:clients[i%clients.length],equipment:equipment[i%equipment.length],status:i%3===0?'Confirmado':'Agendado',location:['Oficina de demonstração','Cliente fictício — Unidade Norte','Centro de treinamento IRMEN'][i%3]},{id:'SIM-AG-'+(i+1)+'B',person:p[0],dateOffset:(i+2)%7,time:['08:30','10:00','14:00'][i%3],title:['Retorno técnico','Revisão de relatório','Visita de acompanhamento'][i%3],client:clients[(i+2)%clients.length],equipment:equipment[(i+1)%equipment.length],status:'Planejado',location:'Agenda fictícia de demonstração'}]);
const dateFor=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})};
$('simulationStats').innerHTML='<div class="simulation-stat">Funcionários<strong>15</strong></div><div class="simulation-stat">Relatórios prontos<strong>15</strong></div><div class="simulation-stat">Compromissos individuais<strong>'+appointments.length+'</strong></div>';
$('simulationEmployees').innerHTML=staff.map((p,i)=>'<article class="simulation-person"><h4>'+String(i+1).padStart(2,'0')+'. '+escapeHtml(p[0])+'</h4><p>'+escapeHtml(p[1])+'</p><p>Área: '+escapeHtml(p[2])+'</p><p>Relatórios de teste: '+reports.filter(r=>r.owner===p[0]).length+' · Agenda: '+appointments.filter(a=>a.person===p[0]).length+' compromissos</p><span class="simulation-tag">FUNCIONÁRIO FICTÍCIO</span><div style="margin-top:10px"><button type="button" class="light sim-view-person" data-person="'+i+'">Ver relatórios e agenda</button></div></article>').join('');
const reportList=$('simulationReports'),agendaList=$('simulationAgenda'),personSelect=$('simAgendaPerson');
personSelect.innerHTML='<option value="">Todos os funcionários</option>'+staff.map(p=>'<option value="'+escapeHtml(p[0])+'">'+escapeHtml(p[0])+'</option>').join('');
function showReportList(){const q=$('simReportSearch').value.toLowerCase().trim();const filtered=reports.filter(r=>[r.id,r.owner,r.client,r.equipment,r.type,r.status].join(' ').toLowerCase().includes(q));reportList.innerHTML=filtered.length?filtered.map((r)=>'<article class="simulation-report"><h4>'+escapeHtml(r.id)+' · '+escapeHtml(r.type)+'</h4><p><strong>Responsável:</strong> '+escapeHtml(r.owner)+'</p><p><strong>Cliente:</strong> '+escapeHtml(r.client)+'</p><p><strong>Equipamento:</strong> '+escapeHtml(r.equipment)+'</p><p><strong>Data:</strong> '+escapeHtml(r.date)+' · <strong>Status:</strong> '+escapeHtml(r.status)+'</p><button type="button" class="primary sim-open-report" data-report="'+reports.indexOf(r)+'">Abrir relatório</button></article>').join(''):'<div class="simulation-empty">Nenhum relatório corresponde à pesquisa.</div>'}
function openReport(index){const r=reports[index];if(!r)return;const detail=$('simulationReportDetail');detail.hidden=false;detail.innerHTML='<button type="button" class="light" id="simBackReports">← Voltar aos relatórios</button><h3 style="margin-top:18px">'+escapeHtml(r.id)+' · '+escapeHtml(r.type)+'</h3><p><strong>Data:</strong> '+escapeHtml(r.date)+' | <strong>Status:</strong> '+escapeHtml(r.status)+'</p><p><strong>Responsável:</strong> '+escapeHtml(r.owner)+' ('+escapeHtml(r.role)+')</p><p><strong>Cliente:</strong> '+escapeHtml(r.client)+'</p><p><strong>Equipamento:</strong> '+escapeHtml(r.equipment)+'</p><h4>Objetivo</h4><p>'+escapeHtml(r.objective)+'</p><h4>Atividades realizadas</h4><p>'+escapeHtml(r.activities).replace(/\n/g,'<br>')+'</p><h4>Resultados e recomendações</h4><p>'+escapeHtml(r.results)+'</p><h4>Conclusão</h4><p>'+escapeHtml(r.conclusion)+'</p><span class="simulation-tag">CONTEÚDO FICTÍCIO · NÃO SALVO</span>';detail.scrollIntoView({behavior:'smooth',block:'start'});$('simBackReports').onclick=()=>{detail.hidden=true;reportList.scrollIntoView({behavior:'smooth',block:'start'})}}
function showAgenda(){const selected=personSelect.value;const filtered=appointments.filter(a=>!selected||a.person===selected).sort((a,b)=>a.dateOffset-b.dateOffset||a.time.localeCompare(b.time));agendaList.innerHTML=filtered.length?filtered.map(a=>'<article class="simulation-appointment"><h4>'+escapeHtml(a.title)+'</h4><p><strong>Responsável:</strong> '+escapeHtml(a.person)+'</p><p><strong>Data:</strong> '+escapeHtml(dateFor(a.dateOffset))+' · '+escapeHtml(a.time)+'</p><p><strong>Cliente:</strong> '+escapeHtml(a.client)+'</p><p><strong>Equipamento:</strong> '+escapeHtml(a.equipment)+'</p><p><strong>Local:</strong> '+escapeHtml(a.location)+'</p><p><strong>Status:</strong> '+escapeHtml(a.status)+'</p><span class="simulation-tag">COMPROMISSO FICTÍCIO</span></article>').join(''):'<div class="simulation-empty">Nenhum compromisso para este funcionário.</div>'}
function switchSimPage(page){document.querySelectorAll('.simulation-tab').forEach(b=>b.classList.toggle('active',b.dataset.simpage===page));document.querySelectorAll('.simulation-page').forEach(s=>{const active=s.id==='sim-'+page;s.hidden=!active;s.classList.toggle('active',active)});if(page==='agenda')showAgenda();if(page==='reports')showReportList()}
document.querySelectorAll('.simulation-tab').forEach(b=>b.onclick=()=>switchSimPage(b.dataset.simpage));
$('simEmployeeSearch').oninput=()=>{const q=$('simEmployeeSearch').value.toLowerCase().trim();document.querySelectorAll('#simulationEmployees .simulation-person').forEach(card=>card.hidden=!card.textContent.toLowerCase().includes(q))};
$('simReportSearch').oninput=showReportList;personSelect.onchange=showAgenda;
reportList.onclick=e=>{const b=e.target.closest('.sim-open-report');if(b)openReport(Number(b.dataset.report))};
$('simulationEmployees').onclick=e=>{const b=e.target.closest('.sim-view-person');if(!b)return;personSelect.value=staff[Number(b.dataset.person)]?.[0]||'';switchSimPage('agenda');showAgenda()};
showReportList();showAgenda();switchSimPage('employees');showPage('simulation')}
function closeSimulation(){showPage('saved')}

function isSystemAdmin(){return isMaster()||!!(currentProfile&&currentProfile.active!==false&&['auxiliar_administrativo','gerente','coordenador'].includes(currentProfile.role))}
function isAreaSupervisor(){
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[\s-]+/g,'_');
 const role=normalize(currentProfile?.role);
 const label=normalize(currentProfile?.roleLabel??currentProfile?.role_label);
 const isSupervisorRole=role==='supervisor_area'||(role.includes('supervisor')&&role.includes('area'));
 const isSupervisorLabel=label.includes('supervisor')&&label.includes('area');
 return !!currentProfile&&currentProfile.active!==false&&(isSupervisorRole||isSupervisorLabel);
}
function isMechanic(){return !!currentProfile&&currentProfile.active!==false&&currentProfile.role==='mecanico'}
function can(p){return hasPermission(currentProfile,p,isMaster())}
function requirePermission(p){if(can(p))return true;alert('Seu perfil não tem permissão para esta ação.');return false}
function applyAccessControl(){const admin=isSystemAdmin(),master=isMaster(),areaSupervisor=isAreaSupervisor(),mechanic=isMechanic();document.querySelectorAll(".mechanic-main-tab,.mechanic-nav-caption,.mechanic-connection").forEach(el=>{if(!mechanic)el.remove();else el.hidden=false;});$('agendaTab').hidden=!isAgendaUser();$('agendaDashboardTab').hidden=!admin;$('usersTab').hidden=!admin;document.querySelectorAll('.operational-main-tab').forEach(t=>{const hide=mechanic||!(master||areaSupervisor);t.hidden=hide;if(hide)t.style.setProperty('display','none','important');else t.style.removeProperty('display');});document.querySelectorAll('.tab[data-page]').forEach(t=>{const hide=(areaSupervisor||mechanic)&&t.dataset.page!=='gestaoOperacional';t.hidden=hide;if(hide)t.style.setProperty('display','none','important');else t.style.removeProperty('display');});$('newTop').hidden=areaSupervisor||mechanic||!can('reports.create');$('home').hidden=areaSupervisor||mechanic;$('trainings').hidden=areaSupervisor||mechanic;document.querySelectorAll('[data-home-page]').forEach(el=>{el.hidden=areaSupervisor||mechanic;});const profileName=String(currentProfile?.name||activeUser?.email||'Usuário').trim();const profileRoleLabel=typeof currentProfile?.roleLabel==='string'&&currentProfile.roleLabel.trim()&&!['true','false'].includes(currentProfile.roleLabel.trim().toLowerCase())?currentProfile.roleLabel.trim():'';const profileRole=typeof currentProfile?.role==='string'?currentProfile.role.trim():'';const roleNames={super_admin:'Super administrador',auxiliar_administrativo:'Auxiliar administrativo',gerente:'Gerente',coordenador:'Coordenador',instrutor_tecnico:'Instrutor técnico',consultor_tecnico:'Consultor técnico',mecanico:'Mecânico'};const profileRoleDisplay=profileRoleLabel||roleNames[profileRole]||profileRole.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());$('sessionInfo').textContent=profileName+(profileRoleDisplay?' | '+profileRoleDisplay:'');document.querySelectorAll('.tab[data-permission]').forEach(t=>t.hidden=!can(t.dataset.permission));document.querySelector('.tab[data-page="model"]').hidden=!can('model.view');document.querySelector('.tab[data-page="editor"]').hidden=!can('reports.create');$('model').style.display=can('model.view')?'':'none';$('users').style.display=admin?'':'none';const mechanicOption=$('newUserRole')?.querySelector('option[value="mecanico"]');if(mechanicOption)mechanicOption.hidden=!master;$('newTop').hidden=!can('reports.create');$('saveBtn').hidden=!(can('reports.create')||can('reports.edit'));$('printBtn').hidden=!can('reports.print');$('clearBtn').hidden=!can('reports.create');$('gptAssistant').hidden=!(can('reports.create')||can('reports.edit'))}
async function loadOperationalAreaOptions(){if(!isMaster())return;const select=$('newSupervisorArea');if(!select)return;try{const {data,error}=await supabase.from('operational_areas').select('id,name').eq('active',true).order('name');if(error)throw error;if(Array.isArray(data)&&data.length){const current=select.value;select.innerHTML=data.map(area=>'<option value="'+escapeHtml(area.id)+'">'+escapeHtml(area.name)+'</option>').join('');if(data.some(area=>area.id===current))select.value=current;}}catch(error){console.warn('[RelatorioPro] Não foi possível carregar a lista de minas:',error)}}
async function loadUsers(){if(!isSystemAdmin())return;if(isMaster())await loadOperationalAreaOptions();const box=$('usersList');try{const s=await getDocs(profilesRef);userProfilesCache=s.docs.map(d=>({uid:d.id,...d.data()}));box.innerHTML='';if(!userProfilesCache.length){box.innerHTML='<div class="empty">Nenhum usuário cadastrado.</div>';return}userProfilesCache.forEach(u=>{const card=document.createElement('div');card.className='panel';const title=document.createElement('h3');title.textContent=(u.name||'Usuário')+' — '+(u.email||u.uid);card.appendChild(title);const status=document.createElement('p');status.className='muted';status.textContent='Cargo: '+(u.roleLabel||u.role||'')+' | '+(u.active===false?'Desativado':'Ativo')+(u.operationalAreaId?' | Área: '+(u.operationalAreaId==='arcelormittal-andradas'?'ArcelorMittal Andradas':u.operationalAreaId):'')+(u.uid===MASTER_UID?' | Mestre protegido':'');card.appendChild(status);if(isMaster()&&['mecanico','supervisor_area'].includes(u.role)){const areaWrap=document.createElement('div');areaWrap.style.margin='10px 0';const areaLabel=document.createElement('label');areaLabel.textContent='Mina / área vinculada';const areaSelect=document.createElement('select');areaSelect.innerHTML=$('newSupervisorArea').innerHTML;areaSelect.value=u.operationalAreaId||'';areaSelect.style.width='100%';areaSelect.style.margin='6px 0';const areaSave=document.createElement('button');areaSave.className='light';areaSave.textContent='Atualizar vínculo da mina';areaSave.onclick=async()=>{if(!isMaster()||!areaSelect.value)return;areaSave.disabled=true;try{await setDoc(doc(db,'userProfiles',u.uid),{operationalAreaId:areaSelect.value,updatedAt:new Date().toISOString()},{merge:true});alert('Vínculo da mina atualizado. O usuário deverá entrar novamente para aplicar o novo escopo.');await loadUsers()}catch(error){alert(friendlyAuthError(error));areaSave.disabled=false}};areaWrap.append(areaLabel,areaSelect,areaSave);card.appendChild(areaWrap)}if(u.uid!==MASTER_UID){const active=document.createElement('input');active.type='checkbox';active.checked=u.active!==false;active.style.width='auto';const lab=document.createElement('label');lab.append(active,document.createTextNode(' Acesso ativo'));card.appendChild(lab);const save=document.createElement('button');save.className='primary';save.textContent='Salvar status';save.onclick=async()=>{try{await setDoc(doc(db,'userProfiles',u.uid),{active:active.checked,updatedAt:new Date().toISOString()},{merge:true});await loadUsers();alert('Status de acesso atualizado. Peça ao usuário para entrar novamente.')}catch(e){alert(friendlyAuthError(e))}};card.appendChild(save);const reset=document.createElement('button');reset.className='light';reset.textContent='Enviar redefinição de senha';reset.onclick=async()=>{if(!isSystemAdmin())return;try{await sendPasswordResetEmail(auth,u.email);alert('E-mail de redefinição enviado para '+u.email)}catch(e){alert(friendlyAuthError(e))}};card.appendChild(reset);if(isMaster()){const del=document.createElement('button');del.className='danger';del.textContent='Excluir usuário permanentemente';del.style.marginTop='8px';del.onclick=async()=>{if(!isMaster()||u.uid===MASTER_UID)return;const label=u.name||u.email||u.uid;if(!confirm('ATENÇÃO: excluir definitivamente '+label+'? A conta de acesso será removida. Relatórios, treinamentos e compromissos históricos serão preservados e passarão a constar como registros arquivados do usuário.'))return;if(!confirm('ÚLTIMA CONFIRMAÇÃO: deseja realmente excluir '+label+'? Esta ação não pode ser desfeita.'))return;del.disabled=true;del.textContent='Excluindo...';try{const {data:sessionData,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;const token=sessionData?.session?.access_token;if(!token)throw new Error('Sessão administrativa expirada. Entre novamente.');const response=await fetch('/api/delete-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({uid:u.uid})});let result={};try{result=await response.json()}catch{}if(!response.ok)throw new Error(result.error||'Não foi possível concluir a exclusão.');alert(result.message||'Conta excluída com sucesso.');await loadUsers()}catch(e){del.disabled=false;del.textContent='Excluir usuário permanentemente';alert(e.message||friendlyAuthError(e))}};card.appendChild(del)}}box.appendChild(card)})}catch(e){box.textContent='Erro ao carregar usuários: '+friendlyAuthError(e)}}
/* Evita preenchimento automático das credenciais do administrador no formulário de criação. Os campos ficam editáveis assim que recebem foco. */
['newUserName','newUserEmail','newUserPassword'].forEach(id=>{const field=$(id);if(field){field.addEventListener('focus',()=>field.removeAttribute('readonly'),{once:true});}});
$('newUserRole').addEventListener('change',()=>{const role=$('newUserRole').value,requiresArea=['supervisor_area','mecanico'].includes(role);$('supervisorAreaField').hidden=!requiresArea;$('newSupervisorArea').required=requiresArea;$('operationalAreaHelp').textContent=role==='mecanico'?'O mecânico ficará vinculado a esta mina e poderá registrar relatórios de turno somente nela.':'O supervisor terá acesso somente ao Setor Operacional desta área.';});
$('userCreateForm').addEventListener('submit',async e=>{e.preventDefault();if(!isSystemAdmin())return;const b=$('createUserBtn'),s=$('userCreateStatus');b.disabled=true;s.textContent='Criando usuário...';try{const email=$('newUserEmail').value.trim(),password=$('newUserPassword').value,name=$('newUserName').value.trim(),role=$('newUserRole').value,permissions=ROLE_DEFAULTS[role]||[],operationalAreaId=['supervisor_area','mecanico'].includes(role)?$('newSupervisorArea').value:null;if(role==='supervisor_area'&&!isMaster())throw new Error('Somente o ADM Master pode cadastrar Supervisor de Área.');if(role==='mecanico'&&!isMaster())throw new Error('Somente o Super Admin pode cadastrar mecânicos.');if(['supervisor_area','mecanico'].includes(role)&&!operationalAreaId)throw new Error('Selecione a mina / área de atuação.');if(!isMaster()&&['auxiliar_administrativo','gerente','coordenador'].includes(role))throw new Error('Cargo administrativo somente pode ser criado pelo mestre.');const cr=await createUserWithEmailAndPassword(creatorClient,email,password);if(!cr.user?.uid)throw new Error('O Supabase não retornou o identificador do novo usuário.');if(Array.isArray(cr.user.identities)&&cr.user.identities.length===0)throw new Error('Este e-mail já possui cadastro no Supabase.');await createUserProfile(cr.user.uid,{uid:cr.user.uid,email,name,role,roleLabel:$('newUserRole').selectedOptions[0].text,permissions,operationalAreaId,active:true,mustChangePassword:true,createdAt:new Date().toISOString(),createdBy:activeUser.uid});await creatorClient.auth.signOut();$('userCreateForm').reset();['newUserName','newUserEmail','newUserPassword'].forEach(id=>{const field=$(id);if(field)field.value='';});$('supervisorAreaField').hidden=true;$('newSupervisorArea').required=false;s.textContent='Usuário criado com sucesso.';await loadUsers()}catch(e){s.textContent='Falha: '+friendlyAuthError(e)}finally{b.disabled=false}});


let agendaCache=[];
let agendaDemoMode=false,agendaDemoInitialized=false,agendaView='month';
const agendaDemoRows=[["2026-11-02","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","AUJ - FERIADO"],["2026-11-03","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","CLI - AOp Ferro+ - SKT130 e SKT110S"],["2026-11-04","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","CLI - AOp Ferro+ - SKT130 e SKT110S"],["2026-11-05","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","CLI - AOp Ferro+ - SKT130 e SKT110S"],["2026-11-06","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","CLI - AOp Ferro+ - SKT130 e SKT110S"],["2026-11-13","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-20","DAIENE MÉRCIA DOMINGOS AZEVEDO","Formação, Operação e Manutenção","AUJ - FERIADO"],["2026-11-02","JOSÉ LUCIANO DOS SANTOS","Operação","AUJ - FERIADO"],["2026-11-03","JOSÉ LUCIANO DOS SANTOS","Operação","CLI - AOp ARCELOR ANDRADE - OPERAÇÃO GERAL - FOCO SKT90S, FALHA CAPA SECA TRANSMISSÃO"],["2026-11-04","JOSÉ LUCIANO DOS SANTOS","Operação","CLI - AOp ARCELOR ANDRADE - OPERAÇÃO GERAL - FOCO SKT90S, FALHA CAPA SECA TRANSMISSÃO"],["2026-11-05","JOSÉ LUCIANO DOS SANTOS","Operação","CLI - AOp ARCELOR ANDRADE - OPERAÇÃO GERAL - FOCO SKT90S, FALHA CAPA SECA TRANSMISSÃO"],["2026-11-06","JOSÉ LUCIANO DOS SANTOS","Operação","CLI - AOp ARCELOR ANDRADE - OPERAÇÃO GERAL - FOCO SKT90S, FALHA CAPA SECA TRANSMISSÃO"],["2026-11-09","JOSÉ LUCIANO DOS SANTOS","Operação","VRE - DESLOCAMENTO"],["2026-11-10","JOSÉ LUCIANO DOS SANTOS","Operação","ONL - ROTOGRAMA SKT90S - CIMENTOS NACIONAL - SETE LAGOAS/MG"],["2026-11-11","JOSÉ LUCIANO DOS SANTOS","Operação","ONL - ROTOGRAMA SKT90S - CIMENTOS NACIONAL - SETE LAGOAS/MG"],["2026-11-12","JOSÉ LUCIANO DOS SANTOS","Operação","ONL - ROTOGRAMA SKT90S - CIMENTOS NACIONAL - SETE LAGOAS/MG"],["2026-11-13","JOSÉ LUCIANO DOS SANTOS","Operação","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-20","JOSÉ LUCIANO DOS SANTOS","Operação","AUJ - FERIADO"],["2026-11-02","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","AUJ - FERIADO"],["2026-11-03","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","REC - INTRODUTÓRIO FERRO+ | CONFIRMAR COM O LEONARDO DA SEGURANÇA QUAIS DIAS SERÃO ONLINE E QUAIS DIAS SERÃO PRESENCIAL."],["2026-11-04","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","REC - INTRODUTÓRIO FERRO+ | CONFIRMAR COM O LEONARDO DA SEGURANÇA QUAIS DIAS SERÃO ONLINE E QUAIS DIAS SERÃO PRESENCIAL."],["2026-11-05","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","REC - INTRODUTÓRIO FERRO+ | CONFIRMAR COM O LEONARDO DA SEGURANÇA QUAIS DIAS SERÃO ONLINE E QUAIS DIAS SERÃO PRESENCIAL."],["2026-11-06","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","REC - INTRODUTÓRIO FERRO+ | CONFIRMAR COM O LEONARDO DA SEGURANÇA QUAIS DIAS SERÃO ONLINE E QUAIS DIAS SERÃO PRESENCIAL."],["2026-11-09","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - TMan SKT110H TRADIMAQ"],["2026-11-10","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - TMan SKT110H TRADIMAQ"],["2026-11-11","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - TMan SKT110H TRADIMAQ"],["2026-11-12","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - TMan SKT110H TRADIMAQ"],["2026-11-13","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-16","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - ACOMP. OP. SKT130 e SKT110S - FERRO+"],["2026-11-17","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - ACOMP. OP. SKT130 e SKT110S - FERRO+"],["2026-11-18","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - ACOMP. OP. SKT130 e SKT110S - FERRO+"],["2026-11-19","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","INT - TREINAMENTOS MANUTENÇÃO EQUIPE CONTRATO FERRO+"],["2026-11-20","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","INT - TREINAMENTOS MANUTENÇÃO EQUIPE CONTRATO FERRO+"],["2026-11-23","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","CLI - ACOMP. OP. SKT130 e SKT110S - FERRO+"],["2026-11-24","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","VRE - DESLOCAMENTO"],["2026-11-25","TIAGO HENRIQUE BARBOZA","Manutenção e Operação","ONL - TMan MEC. BASCULANTE ELÉTRICO SYZ422BEV - U&M - MINA GELADO - Canaã dos Carajas/PA (Thiers vai ministrar a parte elétrica) - T1"],["2026-11-02","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","AUJ - FERIADO"],["2026-11-03","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-04","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT110S - SEMEP NAZARENO - TREINAR O MASTERDRIVER"],["2026-11-05","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT110S - SEMEP NAZARENO - TREINAR O MASTERDRIVER"],["2026-11-06","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-09","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-10","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-11","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-12","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-13","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-16","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-17","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-18","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-19","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","CLI - TOp SKT130Pro - HYDRO"],["2026-11-20","MARCELO FELIPE OLIVEIRA PAIVA","Formação, Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-02","ARIEL GONÇALVES DA SILVA","Manutenção","AUJ - FERIADO"],["2026-11-03","ARIEL GONÇALVES DA SILVA","Manutenção","PRE - WORKSHOP INSPEÇÃO TREM DE FORÇA SKT | ELABORAR AVALIAÇÃO DIAGNOSTICO SY (135, 155, 215, 365, 500, 750...)"],["2026-11-04","ARIEL GONÇALVES DA SILVA","Manutenção","CLI - WORKSHOP INSPEÇÃO TREM DE FORÇA SKT | 08:30-11:00h - ARCELOR SERRA AZUL; 14:30-17:00h - MINERITA"],["2026-11-05","ARIEL GONÇALVES DA SILVA","Manutenção","CLI - WORKSHOP INSPEÇÃO TREM DE FORÇA SKT | 10:00-12:00h - ARCELOR ANDRADE"],["2026-11-06","ARIEL GONÇALVES DA SILVA","Manutenção","PRE - ELABORAR AVALIAÇÃO DIAGNOSTICO SY (135, 155, 215, 365, 500, 750...)"],["2026-11-09","ARIEL GONÇALVES DA SILVA","Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-10","ARIEL GONÇALVES DA SILVA","Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-11","ARIEL GONÇALVES DA SILVA","Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-12","ARIEL GONÇALVES DA SILVA","Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-13","ARIEL GONÇALVES DA SILVA","Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-16","ARIEL GONÇALVES DA SILVA","Manutenção","VRE - DESLOCAMENTO"],["2026-11-17","ARIEL GONÇALVES DA SILVA","Manutenção","CLI - WORKSHOP INSPEÇÃO TREM DE FORÇA SKT | 08:30-12:00h - ARCELOR ANDRADE"],["2026-11-18","ARIEL GONÇALVES DA SILVA","Manutenção","VRE - DESLOCAMENTO"],["2026-11-19","ARIEL GONÇALVES DA SILVA","Manutenção","PRE - FINALIZAR AVALIAÇÃO DIAGNOSTICO SY (135, 155, 215, 365, 500, 750...)"],["2026-11-20","ARIEL GONÇALVES DA SILVA","Manutenção","AUJ - FERIADO"],["2026-11-02","CARLOS HENRIQUE GONÇALVES","Manutenção","AUJ - FERIADO"],["2026-11-09","CARLOS HENRIQUE GONÇALVES","Manutenção","ONL - TOp e AOp Teste SYGN588 - TORA - Contagem/MG"],["2026-11-10","CARLOS HENRIQUE GONÇALVES","Manutenção","ONL - TOp e AOp Teste SYGN588 - TORA - Contagem/MG"],["2026-11-20","CARLOS HENRIQUE GONÇALVES","Manutenção","AUJ - FERIADO"],["2026-11-02","VINÍCIUS LOUREIRO","Operação e Manutenção","AUJ - FERIADO"],["2026-11-03","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE -ROTEIRO VIDEO 8X4"],["2026-11-04","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE -ROTEIRO VIDEO 8X4"],["2026-11-05","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE -ROTEIRO VIDEO 8X4"],["2026-11-06","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE -ROTEIRO VIDEO 8X4"],["2026-11-09","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE - POCONE"],["2026-11-10","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE - POCONE"],["2026-11-11","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE - POCONE"],["2026-11-12","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE - POCONE"],["2026-11-13","VINÍCIUS LOUREIRO","Operação e Manutenção","PRE - POCONE"],["2026-11-16","VINÍCIUS LOUREIRO","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-17","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - TREINAMENTO AR CONDICIONADO POCONÉ MT - T1"],["2026-11-18","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - TREINAMENTO AR CONDICIONADO POCONÉ MT - T1"],["2026-11-19","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - TREINAMENTO AR CONDICIONADO POCONÉ MT - T2"],["2026-11-20","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - TREINAMENTO AR CONDICIONADO POCONÉ MT - T2"],["2026-11-23","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - ENTREGA TÉCNICA POCONÉ MT - TEORIA - T1"],["2026-11-24","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - ENTREGA TÉCNICA POCONÉ MT - TEORIA - T2"],["2026-11-25","VINÍCIUS LOUREIRO","Operação e Manutenção","INT - ENTREGA TÉCNICA POCONÉ MT - PRÁTICA - T1"],["2026-11-02","ABRAAO MORENO DE SOUSA","Operação e Manutenção","AUJ - FERIADO"],["2026-11-03","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-04","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-05","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-06","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-09","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-10","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-11","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-12","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-13","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-16","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-17","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-18","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-19","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-20","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-23","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-24","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-25","ABRAAO MORENO DE SOUSA","Operação e Manutenção","CLI - SUPORTE TEC. SKT110S / SKT130 - HYDRO - Paragominas/PA"],["2026-11-02","MAGNUM MARCESIO SANTOS","Operação","AUJ - FERIADO"],["2026-11-03","MAGNUM MARCESIO SANTOS","Operação","VRE - DESLOCAMENTO"],["2026-11-04","MAGNUM MARCESIO SANTOS","Operação","CLI - TOp Reciclagem SYGN588 - Pedreira Mattar - Teofilo Otoni"],["2026-11-05","MAGNUM MARCESIO SANTOS","Operação","CLI - TOp Reciclagem SYGN588 - Pedreira Mattar - Teofilo Otoni"],["2026-11-06","MAGNUM MARCESIO SANTOS","Operação","VRE - DESLOCAMENTO"],["2026-11-09","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp SW956E - Minexx - Mina Esperança AVG Brumadinho/MG"],["2026-11-10","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp SW956E - Minexx - Mina Esperança AVG Brumadinho/MG"],["2026-11-11","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp SW956E - Minexx - Mina Esperança AVG Brumadinho/MG"],["2026-11-12","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp e AOp Teste SW936E - Supermix"],["2026-11-13","MAGNUM MARCESIO SANTOS","Operação","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-16","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp e AOp Teste SW978E - Herculano Mineração - Itabirito/MG"],["2026-11-17","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp e AOp Teste SYZ425 8x4 - AngloGold"],["2026-11-18","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp e AOp Teste SYZ425 8x4 - AngloGold"],["2026-11-19","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp e AOp Teste SYZ425 8x4 - AngloGold"],["2026-11-20","MAGNUM MARCESIO SANTOS","Operação","AUJ - FERIADO"],["2026-11-23","MAGNUM MARCESIO SANTOS","Operação","VRE - DESLOCAMENTO"],["2026-11-24","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp SYGN588 Reciclagem - Pedreira Mattar - Teofilo Otoni"],["2026-11-25","MAGNUM MARCESIO SANTOS","Operação","ONL - TOp SYGN588 Reciclagem - Pedreira Mattar - Teofilo Otoni"],["2026-11-02","OTAVIO DE MELO ALVES","Operação","AUJ - FERIADO"],["2026-11-03","OTAVIO DE MELO ALVES","Operação","VRE - DESLOCAMENTO"],["2026-11-04","OTAVIO DE MELO ALVES","Operação","REC - TOp Reciclagem SYGN588 - Pedreira Mattar - Teofilo Otoni"],["2026-11-05","OTAVIO DE MELO ALVES","Operação","REC - TOp Reciclagem SYGN588 - Pedreira Mattar - Teofilo Otoni"],["2026-11-06","OTAVIO DE MELO ALVES","Operação","VRE - DESLOCAMENTO"],["2026-11-09","OTAVIO DE MELO ALVES","Operação","ONL - SYZ425BEV 8x4 - FLAPA / KINROSS - Paracatu/MG"],["2026-11-10","OTAVIO DE MELO ALVES","Operação","ONL - TOp e AOp SW978E - LHG - Corumbá/MS"],["2026-11-13","OTAVIO DE MELO ALVES","Operação","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-20","OTAVIO DE MELO ALVES","Operação","AUJ - FERIADO"],["2026-11-02","VINICIUS ALVES","Manutenção","AUJ - FERIADO"],["2026-11-09","VINICIUS ALVES","Manutenção","REC - TMan SKT110H TRADIMAQ (com Tiago Barboza)"],["2026-11-10","VINICIUS ALVES","Manutenção","REC - TMan SKT110H TRADIMAQ (com Tiago Barboza)"],["2026-11-11","VINICIUS ALVES","Manutenção","REC - TMan SKT110H TRADIMAQ (com Tiago Barboza)"],["2026-11-12","VINICIUS ALVES","Manutenção","REC - TMan SKT110H TRADIMAQ (com Tiago Barboza)"],["2026-11-13","VINICIUS ALVES","Manutenção","REC - ENTREGA TÉCNICA CAMINHÃO VOLVO - CENTRO OESTE BETIM - 08:30-16:30h"],["2026-11-20","VINICIUS ALVES","Manutenção","AUJ - FERIADO"],["2026-11-02","CARLOS DUARTE","Operação e Manutenção","AUJ - FERIADO"],["2026-11-03","CARLOS DUARTE","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-04","CARLOS DUARTE","Operação e Manutenção","CLI - FILIAL MT"],["2026-11-05","CARLOS DUARTE","Operação e Manutenção","CLI - FILIAL MT"],["2026-11-06","CARLOS DUARTE","Operação e Manutenção","CLI - FILIAL MT"],["2026-11-08","CARLOS DUARTE","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-09","CARLOS DUARTE","Operação e Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-10","CARLOS DUARTE","Operação e Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-11","CARLOS DUARTE","Operação e Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-12","CARLOS DUARTE","Operação e Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-13","CARLOS DUARTE","Operação e Manutenção","REC - CERTIFICAÇÃO DE FORMAÇÃO SW956E - INDAIATUBA/SP"],["2026-11-14","CARLOS DUARTE","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-16","CARLOS DUARTE","Operação e Manutenção","OUT - MATRIZ BETIM/MG"],["2026-11-17","CARLOS DUARTE","Operação e Manutenção","OUT - MATRIZ BETIM/MG"],["2026-11-18","CARLOS DUARTE","Operação e Manutenção","OUT - MATRIZ BETIM/MG"],["2026-11-19","CARLOS DUARTE","Operação e Manutenção","OUT - MATRIZ BETIM/MG"],["2026-11-20","CARLOS DUARTE","Operação e Manutenção","AUJ - FERIADO"],["2026-11-23","CARLOS DUARTE","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-24","CARLOS DUARTE","Operação e Manutenção","CLI - FILIAL MT"],["2026-11-25","CARLOS DUARTE","Operação e Manutenção","CLI - FILIAL MT"],["2026-11-02","ZION ALMEIDA","Operação e Manutenção","AUJ - FERIADO"],["2026-11-04","ZION ALMEIDA","Operação e Manutenção","INT - APLICAÇÃO DIAGNÓSTICO DE CONHECIMENTO"],["2026-11-05","ZION ALMEIDA","Operação e Manutenção","INT - APLICAÇÃO DIAGNÓSTICO DE CONHECIMENTO"],["2026-11-09","ZION ALMEIDA","Operação e Manutenção","VRE - DESLOCAMENTO"],["2026-11-10","ZION ALMEIDA","Operação e Manutenção","ONL - TMan MOTONIVELADORA SANY SMG200C - TURMA 2 - ARCELOR ANDRADE"],["2026-11-11","ZION ALMEIDA","Operação e Manutenção","ONL - TMan MOTONIVELADORA SANY SMG200C - TURMA 2 - ARCELOR ANDRADE"],["2026-11-12","ZION ALMEIDA","Operação e Manutenção","ONL - TMan MOTONIVELADORA SANY SMG200C - TURMA 2 - ARCELOR ANDRADE"],["2026-11-13","ZION ALMEIDA","Operação e Manutenção","ONL - TMan MOTONIVELADORA SANY SMG200C - TURMA 2 - ARCELOR ANDRADE"],["2026-11-02","TERCEIROS","Operação","AUJ - FERIADO"]];
const agendaDemoData=agendaDemoRows.map((r,i)=>{const m=String(r[3]||'').match(/^\s*([A-Z]{2,3})\s*-/);const category=m?m[1]:'OUT';return{id:'DEMO-'+(i+1),date:r[0],time:'',client:r[3],location:'',equipment:'',type:category,category,focus:r[2],status:'Planejado',notes:'Registro da planilha de programação de novembro de 2026. Demonstração somente.',assigneeName:r[1],assigneeUid:'demo-'+r[1],ownerUid:'demo-'+r[1],demo:true}});
function agendaRef(ownerUid,id){return doc(db,'users',ownerUid,'agenda',id)}
function agendaDateLabel(v){if(!v)return 'Data não definida';const p=String(v).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v}
function agendaLocalISO(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function agendaCategoryOf(a){const known=['CLI','ATR','VRE','INT','REC','PRE','OUT','ONL','AUJ'];if(known.includes(String(a.category||'').toUpperCase()))return String(a.category).toUpperCase();const raw=String(a.type||a.client||'');const m=raw.match(/^\s*([A-Z]{2,3})\s*-/);if(m&&known.includes(m[1]))return m[1];const n=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(n.includes('trein'))return 'REC';if(n.includes('desloc'))return 'VRE';if(n.includes('feria')||n.includes('ausencia')||n.includes('compens'))return 'AUJ';if(n.includes('intern'))return 'INT';if(n.includes('online')||n.includes('onl'))return 'ONL';if(n.includes('prepar')||n.includes('planej'))return 'PRE';if(n.includes('cliente')||n.includes('atendimento')||n.includes('entrega')||n.includes('inspec'))return 'CLI';return 'OUT'}
function agendaRoleEligible(u){
 const values=Object.entries(u||{}).filter(([key])=>/(role|cargo|perfil|funcao|função|position|title|tipo_usuario|tipousuario)/i.test(key)).map(([,value])=>value).flatMap(value=>Array.isArray(value)?value:[value]).filter(value=>typeof value==='string'&&value.trim()).map(value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
 return values.some(role=>role.includes('instrutor')||role.includes('consultor'));
}
function isAgendaUser(){return isSystemAdmin()||agendaRoleEligible(currentProfile)}
function refreshAgendaModeUI(){
 $('agendaDemoBanner').hidden=!agendaDemoMode;
 $('agendaAdminPanel').hidden=!isSystemAdmin()||agendaDemoMode;
 $('agendaAddNew').hidden=!isSystemAdmin()||agendaDemoMode;
 $('agendaModeSwitch').hidden=!isMaster();
 $('agendaModeDemo').className=agendaDemoMode?'dark':'light';
 $('agendaModeOfficial').className=agendaDemoMode?'light':'dark';
 $('agendaPersonFilterWrap').hidden=!isSystemAdmin();
 $('agendaStatusFilterWrap').hidden=agendaDemoMode;
}
async function refreshAgendaPeople(){
 if(!isSystemAdmin())return;
 const s=await getDocs(profilesRef);
 userProfilesCache=s.docs.map(d=>({...d.data(),uid:d.id}));
 const activeProfiles=userProfilesCache.filter(u=>u.uid!==MASTER_UID&&u.active!==false);
 const eligible=activeProfiles.filter(agendaRoleEligible);
 const people=(eligible.length?eligible:activeProfiles).sort((a,b)=>String(a.name||a.email||'').localeCompare(String(b.name||b.email||''),'pt-BR'));
 const opts=people.map(u=>'<option value="'+escapeHtml(u.uid)+'">'+escapeHtml((u.name||u.email||u.uid)+' — '+(u.roleLabel||u.role||'Cargo não identificado'))+'</option>').join('');
 $('agendaAssignee').innerHTML='<option value="">Selecione um usuário cadastrado</option>'+opts;
 $('agendaPersonFilter').innerHTML='<option value="">Todos os profissionais</option>'+people.map(u=>'<option value="'+escapeHtml(u.uid)+'">'+escapeHtml(u.name||u.email||u.uid)+'</option>').join('');
}
function clearAgendaForm(){
 $('agendaForm').reset();$('agendaConflictBox').style.display='none';$('agendaConflictBox').innerHTML='';$('agendaId').value='';$('agendaOwnerUid').value='';$('agendaFormTitle').textContent='Cadastrar compromisso';$('agendaSaveBtn').textContent='Salvar compromisso';$('agendaFormStatus').textContent='';$('agendaDate').value=agendaLocalISO(new Date());$('agendaType').value='CLI';$('agendaStatus').value='Agendado';
}
function editAgendaItem(a){
 if(!isSystemAdmin()||agendaDemoMode)return;
 $('agendaDetailModal').hidden=true;
 $('agendaId').value=a.id;$('agendaOwnerUid').value=a.ownerUid||'';
 $('agendaDate').value=a.date||'';$('agendaTime').value=a.time||'';$('agendaAssignee').value=a.assigneeUid||a.ownerUid||'';
 $('agendaFocus').value=a.focus||'';$('agendaClient').value=a.client||'';$('agendaLocation').value=a.location||'';$('agendaEquipment').value=a.equipment||'';
 $('agendaType').value=agendaCategoryOf(a);$('agendaStatus').value=a.status||'Agendado';$('agendaNotes').value=a.notes||'';
 $('agendaFormTitle').textContent='Editar compromisso';$('agendaSaveBtn').textContent='Salvar alterações';$('agendaFormStatus').textContent='';$('agendaAdminPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function agendaMonthDays(month){
 const p=String(month||'').split('-').map(Number),y=p[0]||new Date().getFullYear(),m=p[1]||new Date().getMonth()+1,n=new Date(y,m,0).getDate();
 return Array.from({length:n},(_,i)=>new Date(y,m-1,i+1));
}
function agendaFilteredItems(){
 const q=String($('agendaSearch').value||'').toLowerCase().trim(),month=$('agendaMonth').value,status=$('agendaStatusFilter').value,person=isSystemAdmin()&&$('agendaPersonFilter').value?$('agendaPersonFilter').value:'',category=$('agendaCategoryFilter').value;
 return agendaCache.filter(a=>{
  const uid=a.assigneeUid||a.ownerUid||'';
  return (!month||String(a.date||'').startsWith(month))&&(!status||a.status===status)&&(!person||(uid===person||a.assigneeName===person))&&(!category||agendaCategoryOf(a)===category)&&(!q||[a.client,a.equipment,a.location,a.type,a.category,a.focus,a.notes,a.assigneeName].some(v=>String(v||'').toLowerCase().includes(q)));
 }).sort((a,b)=>(String(a.date||'')+' '+String(a.time||'')).localeCompare(String(b.date||'')+' '+String(b.time||'')));
}
function agendaPersonRows(items){
 if(agendaDemoMode){const names=[...new Set(agendaDemoData.map(a=>a.assigneeName))];return names.map(name=>({uid:'demo-'+name,name,focus:agendaDemoData.find(a=>a.assigneeName===name)?.focus||''}));}
 if(isSystemAdmin()){
  const eligible=userProfilesCache.filter(u=>u.active!==false&&u.uid!==MASTER_UID&&(agendaRoleEligible(u)||!userProfilesCache.some(agendaRoleEligible)));
  return eligible.map(u=>({uid:u.uid,name:u.name||u.email||u.uid,focus:u.focus||u.area||u.specialty||''})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 }
 return [{uid:activeUser?.uid||activeUser?.id||'',name:currentProfile?.name||activeUser?.email||'Minha agenda',focus:currentProfile?.roleLabel||currentProfile?.role||''}];
}
function agendaEventChip(a){
 const cat=agendaCategoryOf(a),short=String(a.client||a.notes||'Atividade').replace(/\s+/g,' ').trim();
 return '<button type="button" class="agenda-event-chip cat-'+escapeHtml(cat)+'" data-agenda-event="'+escapeHtml(a.id)+'" title="'+escapeHtml(short)+'"><b>'+escapeHtml(cat)+'</b> '+escapeHtml(short.length>54?short.slice(0,51)+'…':short)+'</button>';
}
function agendaRenderMonth(items,people,days){
 let html='<div class="agenda-matrix-wrap"><table class="agenda-matrix"><thead><tr><th class="person-col">Instrutor / consultor</th>';
 days.forEach(d=>{const day=String(d.getDate()).padStart(2,'0'),week=new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d);html+='<th><span class="agenda-day-number">'+day+'</span><span class="agenda-day-name">'+escapeHtml(week)+'</span></th>'});
 html+='</tr></thead><tbody>';
 const today=agendaLocalISO(new Date());
 people.forEach(person=>{
  html+='<tr><td class="person-col"><div class="agenda-person-name">'+escapeHtml(person.name)+'</div><div class="agenda-person-focus">'+escapeHtml(person.focus||'')+'</div></td>';
  days.forEach(d=>{
   const date=agendaLocalISO(d),found=items.filter(a=>(a.assigneeUid||a.ownerUid)==person.uid&&a.date===date||a.assigneeName===person.name&&a.date===date);
   const classes=[d.getDay()===0||d.getDay()===6?'weekend':'',date===today?'today':'',found.length?'':'empty-cell'].filter(Boolean).join(' ');
   html+='<td class="'+classes+'">'+found.slice(0,2).map(agendaEventChip).join('')+(found.length>2?'<div class="agenda-more">+'+(found.length-2)+' atividade(s)</div>':'')+'</td>';
  });
  html+='</tr>';
 });
 html+='</tbody></table></div>';
 return html;
}
function agendaRenderCalendar(items,days,month){
 const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];let html='<div class="agenda-calendar">'+names.map(n=>'<div class="agenda-calendar-head">'+n+'</div>').join('');
 const first=days.length?days[0].getDay():0;
 for(let i=0;i<first;i++)html+='<div class="agenda-calendar-day other-month"></div>';
 const today=agendaLocalISO(new Date());
 days.forEach(d=>{
  const date=agendaLocalISO(d),found=items.filter(a=>a.date===date);
  html+='<div class="agenda-calendar-day '+(date===today?'today':'')+'"><strong>'+d.getDate()+'</strong>'+found.slice(0,4).map(agendaEventChip).join('')+(found.length>4?'<div class="agenda-more">+'+(found.length-4)+' atividade(s)</div>':'')+'</div>';
 });
 html+='</div>';return html;
}
function agendaRenderList(items){
 if(!items.length)return '<div class="empty">Nenhuma atividade encontrada para os filtros selecionados.</div>';
 let html='',last='';
 items.forEach(a=>{
  if(a.date!==last){last=a.date;html+='<h3 class="agenda-list-day">'+escapeHtml(new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(a.date+'T12:00:00')) )+'</h3>'}
  const cat=agendaCategoryOf(a);
  html+='<article class="agenda-list-card cat-'+escapeHtml(cat)+'"><h3>'+escapeHtml(a.client||'Atividade sem descrição')+'</h3><p><b>'+escapeHtml(cat)+'</b> · '+escapeHtml(a.assigneeName||'Profissional não identificado')+' · '+escapeHtml(a.time||'Horário não informado')+'</p><p>'+escapeHtml([a.focus,a.equipment,a.location].filter(Boolean).join(' · '))+'</p><p>Status: '+escapeHtml(a.status||'Programado')+'</p><div class="agenda-list-actions"><button type="button" class="light" data-agenda-event="'+escapeHtml(a.id)+'">Ver detalhes</button>'+(isSystemAdmin()&&!agendaDemoMode?'<button type="button" class="light" data-agenda-edit="'+escapeHtml(a.id)+'">Editar</button><button type="button" class="danger" data-agenda-delete="'+escapeHtml(a.id)+'">Excluir</button>':'')+'</div></article>';
 });
 return html;
}
function renderAgenda(){
 const items=agendaFilteredItems(),days=agendaMonthDays($('agendaMonth').value),people=agendaPersonRows(items),monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(days[0]||new Date());
 $('agendaMonthLabel').textContent=monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1);
 const occupied=new Set(items.map(a=>(a.assigneeUid||a.ownerUid||a.assigneeName)+'|'+a.date)),activePeople=new Set(items.map(a=>a.assigneeUid||a.ownerUid||a.assigneeName)).size;
 const weekdays=days.filter(d=>d.getDay()!==0&&d.getDay()!==6).length,denominator=Math.max(1,weekdays*Math.max(1,people.length));
 $('agendaStatEvents').textContent=items.length;$('agendaStatPeople').textContent=activePeople;$('agendaStatDays').textContent=occupied.size;$('agendaStatUsage').textContent=Math.min(100,Math.round(occupied.size/denominator*100))+'%';
 $('agendaSummary').textContent=items.length+' atividade(s) no período · '+people.length+' profissional(is) na visualização'+(agendaDemoMode?' · Demonstração de novembro/2026':' · Agenda oficial');
 const box=$('agendaList');
 if(agendaView==='month')box.innerHTML=agendaRenderMonth(items,people,days);
 else if(agendaView==='calendar')box.innerHTML=agendaRenderCalendar(items,days,$('agendaMonth').value);
 else box.innerHTML=agendaRenderList(items);
}
function openAgendaDetail(id){
 const a=agendaCache.find(x=>String(x.id)===String(id));if(!a)return;
 const cat=agendaCategoryOf(a);
 const field=(label,value)=>'<div class="agenda-detail-item"><small>'+label+'</small><strong>'+escapeHtml(value||'Não informado')+'</strong></div>';
 $('agendaDetailBody').innerHTML='<span class="agenda-eyebrow">DETALHES DA PROGRAMAÇÃO</span><h2 class="agenda-detail-title" id="agendaDetailTitle">'+escapeHtml(a.client||'Atividade')+'</h2><p class="agenda-detail-date">'+agendaDateLabel(a.date)+(a.time?' · '+escapeHtml(a.time):'')+'</p><div class="agenda-meta"><span class="agenda-pill">'+escapeHtml(cat)+'</span><span class="agenda-pill">'+escapeHtml(a.status||'Programado')+'</span></div><div class="agenda-detail-grid">'+field('Profissional',a.assigneeName)+field('Foco / especialidade',a.focus)+field('Equipamento',a.equipment)+field('Local / filial',a.location)+'</div>'+(a.notes?'<p class="muted">'+escapeHtml(a.notes)+'</p>':'')+(isSystemAdmin()&&!agendaDemoMode?'<div class="actions"><button type="button" class="primary" id="agendaDetailEdit">Editar compromisso</button></div>':'')+(agendaDemoMode?'<p class="status">Demonstração: registro somente para visualização, sem gravação no sistema.</p>':'');
 $('agendaDetailModal').hidden=false;
 const edit=$('agendaDetailEdit');if(edit)edit.onclick=()=>editAgendaItem(a);
}
function agendaSameDayConflicts(x,exclude=''){return agendaCache.filter(a=>String(a.id)!==String(exclude)&&a.status!=='Cancelado'&&a.date===x.date&&String(a.assigneeUid||a.ownerUid||'')===String(x.assigneeUid||x.ownerUid||''))}
function agendaRange(p,v){const b=new Date((v||agendaLocalISO(new Date()))+'T12:00:00');let s=new Date(b),e=new Date(b);if(p==='week'){s.setDate(b.getDate()-((b.getDay()+6)%7));e=new Date(s);e.setDate(s.getDate()+6)}else if(p==='month'){s=new Date(b.getFullYear(),b.getMonth(),1);e=new Date(b.getFullYear(),b.getMonth()+1,0)}else if(p==='year'){s=new Date(b.getFullYear(),0,1);e=new Date(b.getFullYear(),11,31)}return{start:agendaLocalISO(s),end:agendaLocalISO(e),sd:s,ed:e}}
function gdBar(label,n,max,tail=''){const w=max?Math.max(n?2:0,Math.round(n/max*100)):0;return '<div class="agenda-dashboard-bar-row"><span class="agenda-dashboard-bar-label">'+escapeHtml(label)+'</span><div class="agenda-dashboard-bar-track"><div class="agenda-dashboard-bar-fill" style="width:'+w+'%"></div></div><span class="agenda-dashboard-bar-value">'+escapeHtml(n+tail)+'</span></div>'}
function renderAgendaDashboard(){if(!isSystemAdmin())return;const p=$('agendaDashboardPeriod').value,v=$('agendaDashboardDate').value||agendaLocalISO(new Date()),r=agendaRange(p,v),items=agendaCache.filter(a=>a.date>=r.start&&a.date<=r.end),active=items.filter(a=>a.status!=='Cancelado'),people=agendaPersonRows(active),busy=new Set(active.map(a=>(a.assigneeUid||a.ownerUid||a.assigneeName)+'|'+a.date)),count=new Set(active.map(a=>a.assigneeUid||a.ownerUid||a.assigneeName)).size,days=Math.round((r.ed-r.sd)/86400000)+1,wd=Array.from({length:days},(_,i)=>{const d=new Date(r.sd);d.setDate(d.getDate()+i);return d}).filter(d=>d.getDay()>0&&d.getDay()<6).length,occ=Math.min(100,Math.round(busy.size/Math.max(1,wd*people.length)*100));$('agendaDashboardRange').textContent='Período: '+agendaDateLabel(r.start)+' até '+agendaDateLabel(r.end);$('gdEvents').textContent=active.length;$('gdPeople').textContent=count;$('gdBusyDays').textContent=busy.size;$('gdUsage').textContent=occ+'%';const group=fn=>{const m={};active.forEach(a=>{const k=fn(a)||'Não informado';m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])};const cats=group(agendaCategoryOf),sts=group(a=>a.status||'Sem status'),m1=Math.max(1,...cats.map(x=>x[1])),m2=Math.max(1,...sts.map(x=>x[1]));$('gdCategories').innerHTML=cats.length?cats.map(x=>gdBar(x[0],x[1],m1)).join(''):'<div class="empty">Sem atividades.</div>';$('gdStatuses').innerHTML=sts.length?sts.map(x=>gdBar(x[0],x[1],m2)).join(''):'<div class="empty">Sem atividades.</div>';const loads=people.map(p=>{const a=active.filter(x=>(x.assigneeUid||x.ownerUid)===p.uid||x.assigneeName===p.name);return{name:p.name,days:new Set(a.map(x=>x.date)).size,events:a.length}}).sort((a,b)=>b.days-a.days);const m3=Math.max(1,...loads.map(x=>x.days));$('gdProfessionals').innerHTML=loads.length?loads.map(x=>gdBar(x.name,x.days,m3,' dias / '+x.events+' ativ.')).join(''):'<div class="empty">Sem profissionais programados.</div>';const by={};active.forEach(a=>{const k=(a.assigneeUid||a.ownerUid||a.assigneeName)+'|'+a.date;(by[k]||(by[k]=[])).push(a)});const nc=Object.values(by).filter(a=>a.length>1).length,ncan=items.filter(a=>a.status==='Cancelado').length,np=active.filter(a=>!['Confirmado','Concluído'].includes(a.status)).length,alerts=[];if(nc)alerts.push('<div class="agenda-dashboard-alert">⚠ <strong>'+nc+' possível(is) conflito(s)</strong> — mais de uma atividade para o mesmo profissional na mesma data.</div>');if(ncan)alerts.push('<div class="agenda-dashboard-alert">ⓘ <strong>'+ncan+' cancelamento(s)</strong> no período.</div>');if(np)alerts.push('<div class="agenda-dashboard-alert">ⓘ <strong>'+np+' atividade(s) sem confirmação ou conclusão.</strong></div>');if(!alerts.length)alerts.push('<div class="agenda-dashboard-alert good">Nenhum ponto de atenção automático identificado.</div>');$('gdAlerts').innerHTML=alerts.join('')}
async function loadAgendaDashboard(){if(!isSystemAdmin())return;if(!$('agendaDashboardDate').value)$('agendaDashboardDate').value=agendaLocalISO(new Date());$('gdEvents').textContent='…';try{if(!agendaCache.length){const s=await getDocs(collectionGroup(db,'agenda'));agendaCache=s.docs.map(d=>({id:d.id,ownerUid:d.ref.parent.parent?.id,...d.data()}))}if(!userProfilesCache.length){const s=await getDocs(profilesRef);userProfilesCache=s.docs.map(d=>({...d.data(),uid:d.id}))}renderAgendaDashboard()}catch(e){$('gdAlerts').innerHTML='<div class="agenda-dashboard-alert">Falha ao carregar os dados: '+escapeHtml(friendlyAuthError(e))+'</div>'}}async function loadAgenda(){
 if(!isAgendaUser())return;
 if(!agendaDemoInitialized&&isMaster()){agendaDemoMode=true;agendaDemoInitialized=true;if(!$('agendaMonth').value)$('agendaMonth').value='2026-11'}
 if(!$('agendaMonth').value){const n=new Date();$('agendaMonth').value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')}
 refreshAgendaModeUI();
 const box=$('agendaList');box.innerHTML='<div class="empty">Carregando programação...</div>';
 if(agendaDemoMode){agendaCache=agendaDemoData.slice();const demoNames=[...new Set(agendaDemoData.map(a=>String(a.assigneeName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));$('agendaPersonFilter').innerHTML='<option value="">Todos os profissionais</option>'+demoNames.map(name=>'<option value="'+escapeHtml(name)+'">'+escapeHtml(name)+'</option>').join('');$('agendaPersonFilter').value='';$('agendaCategoryFilter').value='';$('agendaStatusFilter').value='';renderAgenda();return}
 try{
  if(isSystemAdmin())await refreshAgendaPeople();
  const snap=await getDocs(isSystemAdmin()?collectionGroup(db,'agenda'):collection(db,'users',activeUser.uid,'agenda'));
  agendaCache=snap.docs.map(d=>({id:d.id,ownerUid:d.ref.parent.parent?.id,...d.data()})).sort((a,b)=>(String(a.date||'')+' '+String(a.time||'')).localeCompare(String(b.date||'')+' '+String(b.time||'')));
  renderAgenda();
 }catch(error){console.error(error);box.innerHTML='<div class="empty">Não foi possível carregar a agenda: '+escapeHtml(friendlyAuthError(error))+'</div>'}
}
$('agendaForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!isSystemAdmin()||agendaDemoMode)return;
 const btn=$('agendaSaveBtn');btn.disabled=true;$('agendaFormStatus').textContent='Salvando compromisso...';
 try{
  const assigneeUid=$('agendaAssignee').value,person=userProfilesCache.find(u=>u.uid===assigneeUid);
  const eligibleProfiles=userProfilesCache.filter(u=>u.active!==false&&agendaRoleEligible(u));if(!person||person.active===false||(eligibleProfiles.length>0&&!agendaRoleEligible(person)))throw new Error('Selecione um instrutor ou consultor ativo já cadastrado no sistema.');
  const oldId=$('agendaId').value,oldOwner=$('agendaOwnerUid').value,id=oldId||('ag-'+Date.now().toString(36)),category=$('agendaType').value;
  const conflicts=agendaSameDayConflicts({date:$('agendaDate').value,assigneeUid},oldId);let conflictOverride=false,conflictReason='';$('agendaConflictBox').style.display='none';$('agendaConflictBox').innerHTML='';
  if(conflicts.length){const desc=conflicts.map(a=>(a.client||'Atividade')+' — '+agendaDateLabel(a.date)+' '+(a.time||'(dia inteiro)')).join(' | ');$('agendaConflictBox').innerHTML='<strong>⚠ Conflito de programação encontrado</strong>'+escapeHtml(desc)+'<p>Como os horários não são padronizados em todos os registros, a validação considera o dia inteiro.</p>';$('agendaConflictBox').style.display='block';if(!confirm('Conflito para '+(person.name||person.email||'profissional')+' em '+agendaDateLabel($('agendaDate').value)+': '+desc+'. Deseja autorizar uma exceção gerencial?'))throw new Error('Cadastro cancelado: conflito não autorizado.');conflictReason=prompt('Justificativa obrigatória para autorizar a sobreposição:','');if(!conflictReason||!conflictReason.trim())throw new Error('Cadastro cancelado: justificativa obrigatória.');conflictOverride=true}
  const data={id,date:$('agendaDate').value,time:$('agendaTime').value||'',client:$('agendaClient').value.trim(),location:$('agendaLocation').value.trim(),equipment:$('agendaEquipment').value.trim(),type:category,category,focus:$('agendaFocus').value.trim(),status:$('agendaStatus').value,notes:$('agendaNotes').value.trim(),assigneeUid,assigneeName:person.name||person.email||'Usuário',ownerUid:assigneeUid,updatedAt:new Date().toISOString(),updatedBy:activeUser.uid,conflictOverride,conflictReason:conflictReason.trim(),conflictAt:conflictOverride?new Date().toISOString():'',conflictBy:conflictOverride?activeUser.uid:''};
  if(!data.date||!data.client)throw new Error('Preencha pelo menos a data e a descrição da atividade.');
  await setDoc(agendaRef(assigneeUid,id),data,{merge:true});
  if(oldId&&oldOwner&&oldOwner!==assigneeUid)await deleteDoc(agendaRef(oldOwner,oldId));
  $('agendaFormStatus').textContent=conflictOverride?'Compromisso salvo com exceção gerencial registrada.':'Compromisso salvo na agenda oficial.';clearAgendaForm();await loadAgenda();
 }catch(error){console.error(error);$('agendaFormStatus').textContent='Falha ao salvar: '+friendlyAuthError(error)}
 finally{btn.disabled=false}
});
$('agendaCancelEdit').addEventListener('click',clearAgendaForm);
$('agendaAddNew').addEventListener('click',()=>{if(!isSystemAdmin()||agendaDemoMode)return;clearAgendaForm();$('agendaAdminPanel').scrollIntoView({behavior:'smooth',block:'start'})});
$('agendaSearch').addEventListener('input',renderAgenda);
['agendaMonth','agendaStatusFilter','agendaPersonFilter','agendaCategoryFilter'].forEach(id=>$(id).addEventListener('change',renderAgenda));
$('agendaToday').addEventListener('click',()=>{const n=new Date();$('agendaMonth').value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');renderAgenda()});
$('agendaPrevMonth').addEventListener('click',()=>{const p=$('agendaMonth').value.split('-').map(Number),d=new Date(p[0],p[1]-2,1);$('agendaMonth').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');renderAgenda()});
$('agendaNextMonth').addEventListener('click',()=>{const p=$('agendaMonth').value.split('-').map(Number),d=new Date(p[0],p[1],1);$('agendaMonth').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');renderAgenda()});
$('agendaReload').addEventListener('click',loadAgenda);
$('agendaModeDemo').addEventListener('click',()=>{if(!isMaster())return;agendaDemoMode=true;$('agendaMonth').value='2026-11';$('agendaPersonFilter').value='';$('agendaSearch').value='';$('agendaCategoryFilter').value='';loadAgenda()});
$('agendaModeOfficial').addEventListener('click',()=>{if(!isMaster())return;agendaDemoMode=false;$('agendaMonth').value=agendaLocalISO(new Date()).slice(0,7);$('agendaPersonFilter').value='';$('agendaSearch').value='';loadAgenda()});
function setAgendaView(view){agendaView=view;[['month','agendaViewMonth'],['calendar','agendaViewCalendar'],['list','agendaViewList']].forEach(([v,id])=>$(id).classList.toggle('active',v===view));renderAgenda()}
$('agendaViewMonth').addEventListener('click',()=>setAgendaView('month'));
$('agendaViewCalendar').addEventListener('click',()=>setAgendaView('calendar'));
$('agendaViewList').addEventListener('click',()=>setAgendaView('list'));
$('agendaList').addEventListener('click',async e=>{
 const eventBtn=e.target.closest('[data-agenda-event]'),editBtn=e.target.closest('[data-agenda-edit]'),deleteBtn=e.target.closest('[data-agenda-delete]');
 if(eventBtn){openAgendaDetail(eventBtn.dataset.agendaEvent);return}
 if(editBtn){const a=agendaCache.find(x=>String(x.id)===String(editBtn.dataset.agendaEdit));if(a)editAgendaItem(a);return}
 if(deleteBtn){const a=agendaCache.find(x=>String(x.id)===String(deleteBtn.dataset.agendaDelete));if(!a||!isSystemAdmin()||agendaDemoMode)return;if(!confirm('Excluir a atividade "'+(a.client||'sem descrição')+'" de '+(a.assigneeName||'profissional')+' em '+agendaDateLabel(a.date)+'?'))return;try{await deleteDoc(agendaRef(a.ownerUid,a.id));await loadAgenda()}catch(err){alert('Não foi possível excluir: '+friendlyAuthError(err))}}
});
$('agendaDashboardPeriod').addEventListener('change',renderAgendaDashboard);$('agendaDashboardDate').addEventListener('change',renderAgendaDashboard);$('agendaDashboardRefresh').addEventListener('click',async()=>{agendaCache=[];await loadAgendaDashboard()});$('agendaDetailClose').addEventListener('click',()=>$('agendaDetailModal').hidden=true);
$('agendaDetailModal').addEventListener('click',e=>{if(e.target===$('agendaDetailModal'))$('agendaDetailModal').hidden=true});

function getFields(){const o={};fields.forEach(k=>o[k]=$(k).value);return o}
function setFields(o){fields.forEach(k=>$(k).value=o&&o[k]!=null?o[k]:'')}
function val(id){return $(id).value}
function fmtDate(v){if(!v)return '—';const a=v.split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:v}
function text(id,v,empty='—'){$(id).textContent=v&&String(v).trim()?v:empty}
function getModel(){return {company:$('mCompany').value.trim(),subtitle:$('mSubtitle').value.trim(),footer:$('mFooter').value.trim(),conf:$('mConf').value.trim(),color:$('mColor').value||'#e4a900',logo:logoData}}
function applyModelDOM(m){
 m={...defaultModel,...(m||{})};document.documentElement.style.setProperty('--brand',m.color);
 const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value??''};
 setText('pvCompany',m.company);setText('pvSubtitle',m.subtitle);setText('pFooter',m.footer);setText('pFooterRight',m.company);setText('pConf',m.conf);
 const area=$('previewBrand');if(area){area.innerHTML='';if(m.logo){const img=document.createElement('img');img.src=m.logo;img.alt='Logotipo';area.appendChild(img)}if(String(m.company||'').trim()){const c=document.createElement('div');c.className='company';c.textContent=m.company;area.appendChild(c)}if(String(m.subtitle||'').trim()){const s=document.createElement('div');s.className='rsub';s.textContent=m.subtitle;area.appendChild(s)}}
 const logoPreview=$('logoPreview');if(logoPreview){logoPreview.innerHTML='';if(m.logo){const img=document.createElement('img');img.src=m.logo;img.alt='Prévia do logotipo';logoPreview.appendChild(img)}else logoPreview.textContent='Nenhum logotipo selecionado'}
}
function setModel(m){m={...defaultModel,...(m||{})};$('mCompany').value=m.company;$('mSubtitle').value=m.subtitle;$('mFooter').value=m.footer;$('mConf').value=m.conf;$('mColor').value=m.color;logoData=m.logo||'';modelCache=m;applyModelDOM(m)}
function preview(){
 text('pvType',val('type')||'Relatório técnico');text('pClient',val('client'));text('pDate',fmtDate(val('date')));text('pEquipment',val('equipment'));text('pResponsible',val('responsible'));text('pLocation',val('location'));text('pBranch',val('branch'));
 [['pObjective','objective'],['pObservations','observations'],['pActivities','activities'],['pResults','results'],['pConclusion','conclusion']].forEach(([a,b])=>text(a,val(b),''));const area=$('pPhotos');area.innerHTML='';
 if(!photos.length){area.textContent='Nenhuma foto adicionada.';area.className='rphotos muted'}else{area.className='rphotos';photos.forEach(p=>{const f=document.createElement('figure');f.className='rphoto';const i=document.createElement('img');i.src=p.data;i.alt=p.caption||'Foto';f.appendChild(i);if(p.caption){const c=document.createElement('figcaption');c.textContent=p.caption;f.appendChild(c)}area.appendChild(f)})}
}
function draft(){if(restoring)return;$('draftStatus').textContent='Alterações no formulário ainda não salvas.'}
function schedule(){draft()}
function renderPhotos(){
 const box=$('photoList');box.innerHTML='';if(!photos.length){box.innerHTML='<div class="empty">Nenhuma foto adicionada.</div>';return}
 photos.forEach((p,i)=>{const row=document.createElement('div');row.className='photoitem';const img=document.createElement('img');img.src=p.data;img.alt='Foto';const input=document.createElement('input');input.value=p.caption||'';input.placeholder='Legenda da foto';input.addEventListener('input',()=>{photos[i].caption=input.value;preview();schedule()});const del=document.createElement('button');del.className='danger';del.textContent='Remover';del.onclick=()=>{photos.splice(i,1);renderPhotos();preview();schedule()};row.append(img,input,del);box.appendChild(row)})
}
function imageData(file){
 return new Promise((resolve,reject)=>{
  if(!file)return reject(Error('Selecione um arquivo.'));
  if(!file.type.startsWith('image/'))return reject(Error('O arquivo selecionado não é uma imagem reconhecida.'));
  if(file.size>15*1024*1024)return reject(Error('O arquivo tem mais de 15 MB. Reduza o tamanho e tente novamente.'));
  const r=new FileReader();r.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
  r.onload=()=>{const data=String(r.result||'');const img=new Image();img.onerror=()=>reject(Error('Formato de imagem incompatível. Use PNG ou JPG.'));
   img.onload=()=>{try{const scale=Math.min(1,800/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a imagem.');ctx.drawImage(img,0,0,canvas.width,canvas.height);const out=canvas.toDataURL('image/webp',.65);if(out.length>650000)throw Error('A imagem comprimida ainda está muito grande. Escolha uma foto menor.');resolve(out)}catch(err){reject(err)}};
   img.src=data;
  };r.readAsDataURL(file)
 })
}
$('photoFiles').addEventListener('change',async e=>{
 const files=[...e.target.files];let count=0;$('photoStatus').textContent='Preparando imagens...';
 for(const f of files){try{photos.push({data:await imageData(f),caption:f.name.replace(/\.[^.]+$/,'')});count++}catch(err){$('photoStatus').textContent=err.message||'Falha ao processar uma imagem.'}}
 renderPhotos();preview();draft();if(count)$('photoStatus').textContent=count+' imagem(ns) adicionada(s). Salve o relatório para guardar as fotos.';e.target.value=''
});
async function loadPhotos(reportId){
 const snap=await getDocs(collection(reportRef(reportId),'photos'));
 return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
}
async function saveReport(){
 if(!activeUser){alert('Faça login antes de salvar.');return}
 if(editingId&&!can('reports.edit')){requirePermission('reports.edit');return}
 if(!editingId&&!can('reports.create')){requirePermission('reports.create');return}
 const button=$('saveBtn');button.disabled=true;$('draftStatus').textContent='Salvando relatório...';
 try{
  const id=editingId||('rpt-'+Date.now().toString(36));
  const r={...getFields(),id,model:getModel(),updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp(),ownerUid:activeUser.uid};
  await setDoc(reportRef(id),r,{merge:true});
  const photoCollection=collection(reportRef(id),'photos');
  const oldPhotos=await getDocs(photoCollection);
  const keepIds=new Set(photos.filter(p=>p.id).map(p=>p.id));
  await Promise.all(oldPhotos.docs.filter(d=>!keepIds.has(d.id)).map(d=>deleteDoc(d.ref)));
  for(let i=0;i<photos.length;i++){
   const p=photos[i],photoId=p.id||('photo-'+i+'-'+Date.now().toString(36));
   await setDoc(doc(photoCollection,photoId),{data:p.data,caption:p.caption||'',order:i,updatedAt:new Date().toISOString()});
   p.id=photoId;
  }
  editingId=id;
  await loadSavedReports();
  $('draftStatus').textContent='Relatório e fotos salvos com sucesso.';
  alert('Relatório salvo com sucesso.');
 }catch(error){console.error(error);$('draftStatus').textContent='Falha ao salvar o relatório: '+friendlyAuthError(error);alert('Não foi possível salvar o relatório. '+friendlyAuthError(error))}
 finally{button.disabled=false}
}
async function loadSavedReports(){
 const box=$('savedList');box.innerHTML='<div class="empty">Carregando relatórios...</div>';
 try{
  const snap=await getDocs(userReportsRef());
  reportCache=snap.docs.map(d=>({id:d.id,ownerUid:d.ref.parent.parent?.id,...d.data()})).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  renderSaved();
 }catch(error){console.error(error);box.innerHTML='<div class="empty">Erro ao consultar relatórios: '+escapeHtml(friendlyAuthError(error))+'</div>'}
}

function renderSaved(){
 const q=val('search').toLowerCase().trim(),type=val('filter'),box=$('savedList');box.innerHTML='';
 const list=reportCache.filter(r=>(!type||r.type===type)&&(!q||[r.client,r.equipment,r.responsible,r.location,r.id].join(' ').toLowerCase().includes(q)));
 if(!list.length){box.innerHTML='<div class="empty">Nenhum relatório encontrado.</div>';return}
 list.forEach(r=>{
  const card=document.createElement('div');card.className='saved';const info=document.createElement('div');const title=document.createElement('strong');title.textContent=r.client||'Cliente não informado';const meta=document.createElement('small');meta.textContent=(r.type||'Relatório')+' | '+fmtDate(r.date)+' | '+(r.equipment||'Equipamento não informado');
  info.append(title,meta);const actions=document.createElement('div');actions.className='actions';
  [['Abrir relatório','primary',()=>loadReport(r.id,r.ownerUid)],['Imprimir','light',async()=>{await loadReport(r.id,r.ownerUid);setTimeout(()=>window.print(),150)}],...(can('reports.delete')?[['Excluir','danger',async()=>{if(confirm('Deseja excluir este relatório?')){try{const ps=await getDocs(collection(reportRef(r.id,r.ownerUid),'photos'));await Promise.all(ps.docs.map(d=>deleteDoc(d.ref)));await deleteDoc(reportRef(r.id,r.ownerUid));await loadSavedReports()}catch(e){alert('Não foi possível excluir: '+friendlyAuthError(e))}}}]]:[])].forEach(([label,cls,fn])=>{const b=document.createElement('button');b.className=cls;b.textContent=label;b.onclick=fn;actions.appendChild(b)});
  card.append(info,actions);box.appendChild(card)
 })
}
async function loadReport(id,ownerUid=activeUser?.uid){
 const snap=await getDoc(reportRef(id,ownerUid));if(!snap.exists()){alert('Este relatório não foi encontrado.');return}
 const r={id:snap.id,ownerUid,...snap.data()};restoring=true;setFields(r);photos=await getDocs(collection(reportRef(id,ownerUid),'photos')).then(s=>s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0)));editingId=id;
 if(isSystemAdmin()){setModel(r.model||defaultModel);$('editor').classList.add('readonly-report')}else{const modelSnap=await getDoc(modelRef());setModel(modelSnap.exists()?modelSnap.data():r.model||defaultModel);$('editor').classList.remove('readonly-report')}
 renderPhotos();preview();restoring=false;draft();showPage('editor');window.scrollTo({top:0,behavior:'smooth'})
}
function pageAllowed(id){if(isAreaSupervisor()||isMechanic())return id==='gestaoOperacional';if(id==='gestaoOperacional')return isMaster();if(id==='agenda')return isAgendaUser();if(id==='agendaDashboard')return isSystemAdmin();if(id==='simulation')return isMaster();if(id==='users')return isSystemAdmin();if(id==='model')return can('model.view')||can('model.edit');if(id==='saved')return can('reports.view');if(id==='editor')return can('reports.create')||can('reports.edit');return ['home','trainings'].includes(id)}
function getInitialPage(user){if(isAreaSupervisor()||isMechanic())return 'gestaoOperacional';try{const uid=user?.uid||user?.id||activeUser?.uid;const saved=uid?localStorage.getItem('relatoriopro-last-page-'+uid):'';if(saved&&document.getElementById(saved)&&pageAllowed(saved))return saved}catch(e){}return 'home'}
function showPage(id){if((isAreaSupervisor()||isMechanic())&&id!=='gestaoOperacional'){showPage('gestaoOperacional');return}if(id==='agendaDashboard'&&!isSystemAdmin()){alert('O Painel Gerencial está disponível somente para perfis administrativos.');return}if(id==='agenda'&&!isAgendaUser()){alert('A agenda está disponível para instrutores, consultores e usuários administrativos.');return}if(id==='simulation'&&!isMaster()){alert('A simulação está disponível apenas para o usuário mestre.');return}if(id==='gestaoOperacional'&&!(isMaster()||isAreaSupervisor()||isMechanic())){alert('A Gestão Operacional está disponível apenas para perfis autorizados.');return}if(id==='users'&&!isSystemAdmin()){alert('Apenas usuários administrativos podem gerenciar usuários.');return}if(id==='model'&&!can('model.view')&&!can('model.edit')){requirePermission('model.view');return}if(id==='saved'&&!can('reports.view')){requirePermission('reports.view');return}if(id==='editor'&&!can('reports.create')&&!can('reports.edit')){requirePermission('reports.create');return}if(!document.getElementById(id)||!pageAllowed(id))return;$('appShell').classList.toggle('report-editor-active',id==='editor');$('appShell').classList.toggle('training-page-active',id==='trainings');document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.page===id));try{if(activeUser)localStorage.setItem('relatoriopro-last-page-'+activeUser.uid,id)}catch(e){}if(id==='saved')loadSavedReports();if(id==='trainings')loadTrainings();if(id==='users')loadUsers();if(id==='agenda')loadAgenda();if(id==='agendaDashboard')loadAgendaDashboard();if(id==='editor')preview();if(id==='gestaoOperacional'){initOperationalModule({supabase,profile:currentProfile,isMaster:isMaster()}).then(()=>{const root=$('gestaoOperacional');if(root?.showOperationalSection&&!document.querySelector('.operational-main-tab.active'))root.showOperationalSection('overview')}).catch(error=>{console.error('[GestaoOperacional]',error);alert('Não foi possível carregar a Gestão Operacional: '+(error.message||error))})}}
function newReport(){
 if(!requirePermission('reports.create'))return;
 if((Object.values(getFields()).some(v=>String(v||'').trim())||photos.length)&&!confirm('Iniciar novo relatório? Salve antes se precisar manter o conteúdo atual.'))return;
 restoring=true;setFields({});$('date').value=new Date().toISOString().slice(0,10);$('type').value='Relatório de campo';photos=[];editingId=null;setModel(modelCache);renderPhotos();preview();restoring=false;draft();showPage('editor')
}
function printNow(){if(!requirePermission('reports.print'))return;preview();window.print()}
document.querySelectorAll('.tab[data-page]').forEach(t=>t.addEventListener('click',()=>showPage(t.dataset.page)));
document.querySelectorAll('.operational-main-tab').forEach(t=>t.addEventListener('click',()=>{
 const section=t.dataset.operationalSection;
 showPage('gestaoOperacional');
 document.querySelectorAll('.operational-main-tab').forEach(item=>item.classList.toggle('active',item===t));
 const root=$('gestaoOperacional');
 if(root?.showOperationalSection)root.showOperationalSection(section);
}));


document.querySelectorAll('[data-home-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.homePage)));
fields.forEach(id=>{ $(id).addEventListener('input',()=>{preview();schedule()});$(id).addEventListener('change',()=>{preview();schedule()})});
$('saveBtn').onclick=saveReport;$('newTop').onclick=newReport;$('printBtn').onclick=printNow;$('refresh').onclick=preview;
$('clearBtn').onclick=()=>{if(!confirm('Limpar campos e fotos do formulário?'))return;restoring=true;setFields({});$('date').value=new Date().toISOString().slice(0,10);$('type').value='Relatório de campo';photos=[];editingId=null;renderPhotos();preview();restoring=false;draft()};
$('applyModel').onclick=async()=>{
 if(!requirePermission('model.edit'))return;
 const m=getModel();$('modelStatus').textContent='Salvando identidade visual...';
 try{await setDoc(modelRef(),{...m,updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp()});modelCache=m;applyModelDOM(m);preview();$('modelStatus').textContent='Identidade visual salva e aplicada aos novos relatórios.'}
 catch(error){$('modelStatus').textContent='Não foi possível salvar o modelo: '+friendlyAuthError(error)}
};
$('resetModel').onclick=()=>{if(confirm('Restaurar identidade visual padrão?')){setModel(defaultModel);$('applyModel').click()}};
$('mLogo').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{logoData=await imageData(f);applyModelDOM(getModel());$('modelStatus').textContent='Logotipo carregado. Clique em Salvar e aplicar modelo.'}catch(err){$('modelStatus').textContent=err.message||'Falha ao carregar o logotipo.'}e.target.value=''});
$('removeLogo').onclick=()=>{logoData='';applyModelDOM(getModel());$('modelStatus').textContent='Logotipo removido. Clique em Salvar e aplicar modelo.'};


function buildGPTPayload(){return {client:$('client').value.trim(),equipment:$('equipment').value.trim(),type:$('type').value,branch:$('branch').value.trim(),location:$('location').value.trim(),responsible:$('responsible').value.trim(),date:$('date').value,notes:$('gptPrompt').value.trim(),fields:{objective:$('objective').value.trim(),observations:$('observations').value.trim(),activities:$('activities').value.trim(),results:$('results').value.trim(),conclusion:$('conclusion').value.trim()}}}
async function reportAIRequest(action,extra={}){const {data,error}=await supabase.auth.getSession();if(error)throw error;const token=data?.session?.access_token;if(!token)throw Error('Sessão expirada. Entre novamente.');const r=await fetch('/api/report-assistant',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(58000)}).catch(e=>{if(e.name==='TimeoutError'||e.name==='AbortError')throw Error('A geração demorou mais que o esperado. Tente novamente em instantes.');throw Error('Falha de conexão ao gerar o relatório. Verifique sua internet e tente novamente.')});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Falha na integração de IA.');return j}
$('openReportAI').addEventListener('click',()=>{$('gptAssistantBackdrop').hidden=false;$('gptPrompt').focus()});$('closeReportAI').addEventListener('click',()=>{$('gptAssistantBackdrop').hidden=true});$('gptAssistantBackdrop').addEventListener('click',e=>{if(e.target===$('gptAssistantBackdrop'))$('gptAssistantBackdrop').hidden=true});
$('generateReportAI').addEventListener('click',async()=>{const b=$('generateReportAI'),s=$('gptStatus');if(!$('gptPrompt').value.trim()&&!Object.values(getFields()).some(v=>String(v||'').trim())){s.textContent='Informe o relato ou preencha os campos antes de gerar.';return}b.disabled=true;$('gptResultWrap').style.display='none';s.textContent='Gerando relatório...';try{const j=await reportAIRequest('generate',{report:buildGPTPayload()});if(!j.fields)throw Error('Resposta inválida do assistente.');gptPendingResult=j.fields;const labels={objective:'OBJETIVO',observations:'PONTOS DE OBSERVAÇÃO',activities:'ATIVIDADES REALIZADAS',results:'RESULTADOS E RECOMENDAÇÕES',conclusion:'CONCLUSÃO'};$('gptResult').value=Object.entries(labels).map(([k,v])=>v+'\n'+(j.fields[k]||'')).join('\n\n');$('gptResultWrap').style.display='block';s.textContent='Relatório gerado. Revise antes de aplicar.'}catch(e){s.textContent=e.message||'Erro ao gerar relatório.'}finally{b.disabled=false}});
$('applyGPTResult').addEventListener('click',()=>{if(!gptPendingResult)return;const labels=[['objective','OBJETIVO'],['observations','PONTOS DE OBSERVAÇÃO'],['activities','ATIVIDADES REALIZADAS'],['results','RESULTADOS E RECOMENDAÇÕES'],['conclusion','CONCLUSÃO']];const text=$('gptResult').value;const positions=labels.map(([key,label])=>({key,label,index:text.indexOf(label+'\n')}));if(positions.some(x=>x.index<0)){ $('gptStatus').textContent='Não foi possível identificar todas as seções. Gere novamente ou mantenha os títulos originais.';return}for(let i=0;i<positions.length;i++){const p=positions[i],start=p.index+p.label.length+1,end=i+1<positions.length?positions[i+1].index:text.length;$(p.key).value=text.slice(start,end).trim()}preview();draft();$('gptAssistantBackdrop').hidden=true;$('gptStatus').textContent='Conteúdo sincronizado. Confira os campos e a prévia antes de salvar.'});
$('copyGPTResult').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('gptResult').value);$('gptStatus').textContent='Resultado copiado.'}catch(e){$('gptResult').select();$('gptStatus').textContent='Selecione e copie manualmente.'}});
$('search').addEventListener('input',renderSaved);$('filter').addEventListener('change',renderSaved);

$('logoutBtn').addEventListener('click',async()=>{try{await signOut(auth)}catch(e){alert(friendlyAuthError(e))}});
let authInitializationRun=0,initializingUserId=null,initializedUserId=null;
const initializationPromises=new Map();

// Todas as origens (login manual, restauração de sessão e refresh de token)
// compartilham a mesma inicialização por UID. Chamadas concorrentes aguardam
// a mesma Promise em vez de iniciar carregamentos paralelos ou retornar cedo.
function initializeUser(user){
 const uid=user?.id||user?.uid||null;
 if(!user){
  initializationPromises.clear();
  return initializeUserOnce(null);
 }
 if(initializedUserId===uid)return Promise.resolve();
 const pending=initializationPromises.get(uid);
 if(pending)return pending;
 const promise=initializeUserOnce(user);
 initializationPromises.set(uid,promise);
 promise.finally(()=>{
  if(initializationPromises.get(uid)===promise)initializationPromises.delete(uid);
 }).catch(()=>{});
 return promise;
}
async function initializeUserOnce(user){
 const uid=user?.id||user?.uid||null;
 if(!user){
  authInitializationRun++;
  initializingUserId=null;
  initializedUserId=null;
  activeUser=null;
  closeSimulation();
  currentProfile=null;
  $('appShell').hidden=true;
  $('authGate').hidden=false;
  $('changePasswordGate').hidden=true;
  const startupPanel=$('startupErrorGate');
  if(startupPanel)startupPanel.hidden=true;
  return;
 }
 const run=++authInitializationRun;
 initializingUserId=uid;
 initializedUserId=null;
 activeUser=user;
 let initializationComplete=false;
 const isCurrent=()=>run===authInitializationRun&&activeUser?.uid===uid&&backend.currentSupabaseUser?.uid===uid;

 try{
  let ps=null,offlineCachedProfile=null;
  try{ps=await getDoc(doc(db,'userProfiles',uid));}
  catch(error){
   if(navigator.onLine)throw error;
   try{const cached=JSON.parse(localStorage.getItem('relatoriopro-profile-cache-'+uid)||'null');if(cached&&cached.uid===uid&&cached.role==='mecanico'&&cached.active!==false&&cached.operationalAreaId)offlineCachedProfile=cached;}catch(_){}
   if(!offlineCachedProfile)throw new Error('Sem conexão e sem perfil operacional previamente validado neste dispositivo. Conecte-se à internet para entrar pela primeira vez.');
  }
  if(!isCurrent())return;

  if(offlineCachedProfile){
   currentProfile=offlineCachedProfile;
  }else if(uid===MASTER_UID){
   if(!ps.exists())throw new Error('Perfil mestre não encontrado na tabela profiles do Supabase.');
   currentProfile={uid,...ps.data(),role:'super_admin',roleLabel:ps.data().roleLabel||'Super administrador',permissions:PERMISSIONS.map(p=>p[0]),active:true};
  }else{
   if(!ps.exists()){
    throw new Error('LOGIN AUTENTICADO, MAS PERFIL NÃO LOCALIZADO: o Supabase aceitou suas credenciais, porém não foi encontrado um registro correspondente ao UID na tabela profiles. Verifique o cadastro do usuário e as políticas de leitura (RLS). A sessão foi preservada para diagnóstico.');
   }
   currentProfile={uid:ps.id,...ps.data()};
   if(currentProfile.active===false){
    throw new Error('ACESSO DESATIVADO: o perfil foi localizado na tabela profiles, mas o campo active está desativado. Solicite ao administrador a reativação do acesso. A sessão foi preservada para diagnóstico.');
   }
  }

  if(currentProfile?.role==='mecanico'&&!offlineCachedProfile){try{localStorage.setItem('relatoriopro-profile-cache-'+uid,JSON.stringify(currentProfile));}catch(_){}}

  // Este caminho libera o single-flight no finally. Após a troca de senha,
  // a chamada seguinte poderá inicializar a mesma conta normalmente.
  if(currentProfile.mustChangePassword){
   $('authGate').hidden=true;
   $('appShell').hidden=true;
   $('changePasswordGate').hidden=false;
   return;
  }

  $('changePasswordGate').hidden=true;
  $('authGate').hidden=true;
  $('appShell').hidden=false;
  applyAccessControl();
  $('appShell').classList.toggle('report-editor-active',!!document.querySelector('#editor.active'));

  if(can('model.view')||can('model.edit')){
   const ms=await getDoc(modelRef());
   if(!isCurrent())return;
   modelCache=ms.exists()?ms.data():{...defaultModel};
   if(!ms.exists()&&can('model.edit')){
    await setDoc(modelRef(),{...defaultModel,updatedAt:new Date().toISOString()});
    if(!isCurrent())return;
   }
  }else{
   modelCache={...defaultModel};
  }

  setModel(modelCache);
  if(can('reports.view')){
   const rs=await getDocs(userReportsRef());
   if(!isCurrent())return;
   reportCache=rs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  }else{
   reportCache=[];
  }

  if(!isCurrent())return;
  restoring=true;
  setFields({});
  $('date').value=new Date().toISOString().slice(0,10);
  $('type').value='Relatório de campo';
  photos=[];
  editingId=null;
  renderPhotos();
  preview();
  renderSaved();
  restoring=false;
  $('draftStatus').textContent='Conectado. Permissões carregadas.';
  if(isSystemAdmin())loadUsers();
  showPage(getInitialPage(user));
  // Exibe automaticamente somente uma vez por usuário. A marcação é
  // gravada antes de abrir para não repetir o guia em inicializações futuras.
  if(!hasSeenTour(uid))openTour(true,uid);
  initializationComplete=true;
 }catch(error){
  if(!isCurrent())return;
  restoring=false;
  console.error('[RelatorioPro] Falha ao inicializar usuário autenticado:',error);
  const message=error?.message||String(error||'Erro desconhecido');
  $('authGate').hidden=true;
  $('appShell').hidden=true;
  $('changePasswordGate').hidden=true;
  let panel=$('startupErrorGate');
  if(!panel){
   panel=document.createElement('section');
   panel.id='startupErrorGate';
   panel.style.cssText='position:fixed;inset:0;z-index:10001;background:#111720;color:#f8fafc;display:grid;place-items:center;padding:24px;font:14px system-ui';
   panel.innerHTML='<div style="width:min(100%,620px);background:#1b2532;border:1px solid #465366;border-radius:14px;padding:26px"><h2 style="margin:0 0 12px">Não foi possível carregar sua área de trabalho</h2><p id="startupErrorMessage" style="color:#d5dce5;line-height:1.6;overflow-wrap:anywhere"></p><p style="color:#aeb9c7;font-size:12px">Sua sessão permanece ativa. O erro abaixo identifica a etapa que falhou.</p><button id="startupRetryBtn" type="button" style="padding:12px 18px;border:0;border-radius:8px;background:#f2b705;color:#171a1f;font-weight:700;cursor:pointer">Tentar carregar novamente</button><button id="startupBackLoginBtn" type="button" style="margin-left:10px;padding:12px 18px;border:1px solid #718096;border-radius:8px;background:transparent;color:#fff;cursor:pointer">Voltar ao login</button></div>';
   document.body.appendChild(panel);
   $('startupRetryBtn').addEventListener('click',()=>{
    panel.hidden=true;
    if(auth.currentUser)initializeUser(auth.currentUser);
    else{$('authGate').hidden=false;panel.hidden=true;}
   });
   $('startupBackLoginBtn').addEventListener('click',async()=>{
    try{await signOut(auth)}catch(e){console.error(e)}
    panel.hidden=true;
    $('authGate').hidden=false;
   });
  }
  $('startupErrorMessage').textContent=message;
  panel.hidden=false;
 }finally{
  // Libera o estado mesmo em retornos antecipados (perfil bloqueado,
  // troca obrigatória de senha ou troca de sessão durante uma consulta).
  if(run===authInitializationRun&&initializingUserId===uid){
   if(initializationComplete)initializedUserId=uid;
   initializingUserId=null;
  }
 }
}
$('changePasswordForm').addEventListener('submit',async e=>{e.preventDefault();const error=$('changePasswordError'),btn=$('changePasswordBtn'),password=$('newPassword').value,confirmPassword=$('confirmNewPassword').value;error.textContent='';if(password.length<6){error.textContent='A senha deve ter pelo menos 6 caracteres.';return}if(password!==confirmPassword){error.textContent='As senhas não coincidem.';return}btn.disabled=true;try{if(!auth.currentUser)throw new Error('Sua sessão expirou. Entre novamente.');await updatePassword(auth.currentUser,password);const {error:profileError}=await supabase.rpc('complete_password_change');if(profileError)throw profileError;$('changePasswordForm').reset();$('changePasswordGate').hidden=true;await initializeUser(auth.currentUser)}catch(e){error.textContent=e.code==='auth/requires-recent-login'?'Por segurança, saia e entre novamente antes de trocar a senha.':friendlyAuthError(e)}finally{btn.disabled=false}});
onAuthStateChanged(auth,(user,event)=>{
 if(!user){
  // INITIAL_SESSION sem sessão mantém a tela inicial de login. SIGNED_OUT
  // encerra a interface; ambos são estados distintos e tratados explicitamente.
  if(event==="SIGNED_OUT")initializeUser(null);
  return;
 }
 initializeUser(user).catch(error=>{
  console.error('[RelatorioPro] Erro não tratado ao processar evento '+event+':',error);
  setAuthError(friendlyAuthError(error));
 });
});

/* Guia interativo: aparece no primeiro acesso por usuário e pode ser reaberto pelo botão Ajuda. */
let tourSteps=[],tourIndex=0,tourSpotlight=null;
function makeTourSteps(){
 const steps=[
  {title:'Bem-vindo ao RelatorioPro',text:'Olá, '+(currentProfile?.name||'bem-vindo')+'! Este guia foi adaptado ao seu perfil ('+(currentProfile?.roleLabel||currentProfile?.role||'usuário')+') e mostra somente as funções disponíveis para sua conta.',target:'.sidebar-brand'},
  {title:'Conheça o menu',text:'As abas do menu são liberadas conforme as permissões do seu perfil. Se uma função não aparecer, ela pode não estar habilitada para sua conta.',target:'.tabs'},
 ];
 if(can('reports.create')||can('reports.edit')){
  steps.push({title:'Criar e preencher relatórios',text:'Na aba “Relatório técnico”, preencha identificação, equipamento, objetivo, observações, atividades, resultados e conclusão. Adicione fotos quando necessário e registre apenas informações verificadas.',target:'[data-page="editor"]'});
  steps.push({title:'Salvar e revisar',text:'Revise as informações e a prévia. Use “Salvar relatório” para guardar o registro. Para gerar uma cópia, utilize “Imprimir / PDF”.',target:'#saveBtn'});
 }
 if(can('reports.view')) steps.push({title:'Consultar relatórios',text:'Na aba “Relatórios salvos”, localize registros anteriores e abra o relatório desejado. As opções de edição dependem das permissões da sua conta.',target:'[data-page="saved"]'});
 if(can('reports.print')) steps.push({title:'Imprimir ou gerar PDF',text:'Use “Imprimir / PDF” para abrir as opções de impressão do navegador e salvar uma cópia em PDF, quando disponível.',target:'#printBtn'});
 if(document.querySelector('[data-page="trainings"]')) steps.push({title:'Central de Conhecimento — Treinamentos',text:'Na aba “Treinamentos”, os perfis autorizados podem cadastrar um conteúdo, informar título, categoria, público-alvo e descrição, anexar slides, manuais SANY e outros materiais e salvar como rascunho ou enviar para aprovação. O conteúdo enviado fica na fila de aprovação administrativa. O administrador pode aprovar e publicar ou devolver para correção com um comentário. Após publicado, o treinamento e seus anexos ficam disponíveis na Biblioteca publicada para consulta da equipe. Em “Meus treinamentos”, o autor acompanha o status e pode reenviar conteúdos devolvidos após os ajustes.',target:'[data-page="trainings"]'});
 if(can('model.view')||can('model.edit')) steps.push({title:'Configurar layout e textos do relatório',text:'Esta área permite ajustar o modelo visual do relatório: nome da empresa, subtítulo, texto do rodapé, aviso de confidencialidade, cor de destaque e logotipo. Confira as alterações e clique em “Salvar e aplicar modelo”. Essas configurações afetam a apresentação dos relatórios conforme o escopo configurado no sistema.',target:'[data-page="model"]'});
 if(isSystemAdmin()) steps.push({title:'Administrar usuários e acessos',text:'Na aba “Usuários e acessos”, o perfil administrativo pode consultar e gerenciar contas conforme as permissões disponíveis. Confira o perfil e o estado de acesso antes de realizar alterações.',target:'[data-page="users"]'});
 if(isMaster()) {
  steps.push({title:'Ferramentas do mestre',text:'Sua conta mestre também tem acesso às ferramentas administrativas exclusivas que aparecem no menu. Utilize-as com cuidado, especialmente ao testar permissões e configurações.',target:'#sessionInfo'});
 }
 steps.push({title:'Ajuda sempre disponível',text:'Você pode rever estas orientações quando quiser: clique em “Guia rápido” no menu lateral. O conteúdo do guia muda conforme a conta conectada.',target:'#helpLaunch'});
 return steps;
}
function clearTourSpotlight(){if(tourSpotlight){tourSpotlight.classList.remove('tour-spotlight');tourSpotlight=null}}
function renderTourStep(){
 if(!tourSteps.length)return;
 clearTourSpotlight();
 const s=tourSteps[tourIndex],target=s.target?document.querySelector(s.target):null;
 $('tourTitle').textContent=s.title;$('tourText').textContent=s.text;
 $('tourCount').textContent='Passo '+(tourIndex+1)+' de '+tourSteps.length;
 $('tourProgressBar').style.width=((tourIndex+1)/tourSteps.length*100)+'%';
 $('tourBack').hidden=tourIndex===0;
 $('tourNext').textContent=tourIndex===tourSteps.length-1?'Concluir':'Próximo';
 $('tourSkip').hidden=tourIndex===tourSteps.length-1;
 if(target&&!target.hidden){tourSpotlight=target;target.classList.add('tour-spotlight')}
}
function tourStorageKey(uid){return 'relatoriopro-tour-complete-'+uid}
function markTourSeen(uid){
 if(!uid)return;
 const key=tourStorageKey(uid);
 try{localStorage.setItem(key,'1')}catch(_){}
 try{sessionStorage.setItem(key,'1')}catch(_){}
}
function hasSeenTour(uid){
 if(!uid)return true;
 const key=tourStorageKey(uid);
 try{if(localStorage.getItem(key)==='1')return true}catch(_){}
 try{if(sessionStorage.getItem(key)==='1')return true}catch(_){}
 return false;
}
function openTour(firstVisit=false,userId=null){
 tourSteps=makeTourSteps();tourIndex=0;
 if(!tourSteps.length)return;
 const uid=userId||activeUser?.uid||activeUser?.id||currentProfile?.uid||currentProfile?.id;
 if(firstVisit)markTourSeen(uid);
 $('tourBackdrop').hidden=false;document.body.style.overflow='hidden';renderTourStep();
}
function closeTour(completed=false){
 clearTourSpotlight();$('tourBackdrop').hidden=true;document.body.style.overflow='';
 const uid=activeUser?.uid||activeUser?.id||currentProfile?.uid||currentProfile?.id;
 markTourSeen(uid);
}
function nextTourStep(){
 if(tourIndex>=tourSteps.length-1){closeTour(true);return}
 tourIndex++;renderTourStep();
}
$('helpLaunch').addEventListener('click',openTour);
$('tourClose').addEventListener('click',()=>closeTour(false));
$('tourSkip').addEventListener('click',()=>closeTour(true));
$('tourNext').addEventListener('click',nextTourStep);
$('tourBack').addEventListener('click',()=>{if(tourIndex>0){tourIndex--;renderTourStep()}});
$('tourBackdrop').addEventListener('click',e=>{if(e.target===$('tourBackdrop'))closeTour(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('tourBackdrop').hidden)closeTour(false)});
