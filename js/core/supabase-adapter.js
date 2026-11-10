
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Upload } from "https://esm.sh/tus-js-client@4.3.1/lib.esm/browser/index.js";

/**
 * Adaptador de infraestrutura Supabase.
 * Mantém compatibilidade com a camada de dados legada do RelatorioPro.
 */
export function createSupabaseAdapter({ $, supabaseUrl, supabaseAnonKey }) {
const SUPABASE_URL = supabaseUrl;
const SUPABASE_ANON_KEY = supabaseAnonKey;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const creatorClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
let currentSupabaseUser = null;
function normalizeUser(user) { return user ? { ...user, uid: user.id || user.uid } : null; }
const auth = {};
Object.defineProperty(auth, "currentUser", { get: () => currentSupabaseUser });
const db = { provider: "supabase" };
const storage = { provider: "supabase" };
const MASTER_UID = "5c6800f9-426b-44b3-842d-ba6485cc017e";

const fieldMap = {
  ownerUid:"owner_id", ownerName:"owner_name", roleLabel:"role_label", operationalAreaId:"operational_area_id",
  mustChangePassword:"must_change_password", updatedAt:"updated_at",
  createdAt:"created_at", reviewedBy:"reviewed_by", reviewedAt:"reviewed_at",
  approvedBy:"reviewed_by", approvedAt:"reviewed_at", reviewComment:"review_comment",
  reportDate:"report_date", appointmentDate:"appointment_date", appointmentTime:"appointment_time",
  assigneeName:"assignee_name", updatedBy:"updated_by", activityType:"activity_type",
  contentType:"content_type", size:"size_bytes", order:"order_index"
};
const reverseFieldMap = Object.fromEntries(Object.entries(fieldMap).map(([a,b])=>[b,a]));
function tableRef(table, id=null, ownerId=null, reportId=null) {
  const parent = ownerId ? { id: ownerId, parent: { id: ownerId } } : null;
  return { __sb:true, table, id, ownerId, reportId, parent };
}
// Referência global dos perfis cadastrados; usada pela gestão de usuários e pela agenda.
const profilesRef = tableRef("profiles");
function collection(_db, ...parts) {
  if (_db && _db.__sb && _db.table === "reports" && parts[0] === "photos") return tableRef("report_photos",null,_db.ownerId,_db.id);
  if (parts[0] === "userProfiles") return tableRef("profiles");
  if (parts[0] === "users" && parts[2] === "reports") return tableRef("reports",null,parts[1]);
  if (parts[0] === "users" && parts[2] === "agenda") return tableRef("agenda",null,parts[1]);
  if (parts[0] === "relatoriopro-trainings") return tableRef("trainings");
  throw new Error("Coleção não mapeada no Supabase: "+parts.join("/"));
}
function collectionGroup(_db, name) {
  if (name === "reports" || name === "agenda") return tableRef(name);
  throw new Error("Coleção global não mapeada: "+name);
}
function doc(base, ...parts) {
  if (base && base.__sb) {
    if (parts.length === 0) return tableRef(base.table,crypto.randomUUID(),base.ownerId,base.reportId);
    if (base.table === "reports" && parts[0] === "photos") return tableRef("report_photos",null,base.ownerId,base.id);
    if (base.table === "user_settings" && parts.length === 1) return tableRef("user_settings",parts[0],base.ownerId);
    return tableRef(base.table,parts[0],base.ownerId,base.reportId);
  }
  if (base === db) {
    if (parts[0] === "userProfiles") return tableRef("profiles",parts[1]);
    if (parts[0] === "users" && parts[2] === "reports") return tableRef("reports",parts[3],parts[1]);
    if (parts[0] === "users" && parts[2] === "agenda") return tableRef("agenda",parts[3],parts[1]);
    if (parts[0] === "users" && parts[2] === "settings") return tableRef("user_settings",parts[3],parts[1]);
    if (parts[0] === "relatoriopro-trainings") return tableRef("trainings",parts[1]);
  }
  throw new Error("Documento não mapeado no Supabase.");
}
function where(field, op, value) { return { field: fieldMap[field] || field, op, value }; }
function query(ref, ...filters) { return { ...ref, filters }; }
function serverTimestamp() { return new Date().toISOString(); }
function mapRow(table,row) {
  if (!row) return row;
  const legacy = row.legacy_data && typeof row.legacy_data === "object" ? row.legacy_data : {};
  if (table === "profiles") return { ...legacy, uid:row.id, id:row.id, email:row.email, name:row.name, role:row.role, roleLabel:row.role_label, permissions:row.permissions||[], operationalAreaId:row.operational_area_id||null, active:row.active, mustChangePassword:row.must_change_password, createdAt:row.created_at, updatedAt:row.updated_at };
  if (table === "reports") return { ...legacy, id:row.id, ownerUid:row.owner_id, type:row.type, date:row.report_date, responsible:row.responsible, client:row.client, branch:row.branch, equipment:row.equipment, location:row.location, objective:row.objective, observations:row.observations, activities:row.activities, results:row.results, conclusion:row.conclusion, model:row.model||{}, updatedAt:row.updated_at, createdAt:row.created_at };
  if (table === "report_photos") return { ...legacy, id:row.id, data:row.data, caption:row.caption, order:row.order_index, updatedAt:row.updated_at };
  if (table === "user_settings") return { ...(row.data||{}), updatedAt:row.updated_at };
  if (table === "trainings") return { ...legacy, id:row.id, title:row.title, category:row.category, audience:row.audience, description:row.description, ownerUid:row.owner_id, ownerName:row.owner_name, status:row.status, reviewComment:row.review_comment, approvedBy:row.reviewed_by, approvedAt:row.reviewed_at, version:row.version, createdAt:row.created_at, updatedAt:row.updated_at, attachments:Array.isArray(legacy.attachments)?legacy.attachments:[] };
  if (table === "agenda") return { ...legacy, id:row.id, ownerUid:row.owner_id, date:row.appointment_date, time:row.appointment_time, client:row.client, location:row.location, equipment:row.equipment, type:row.activity_type, status:row.status, notes:row.notes, assigneeName:row.assignee_name, updatedBy:row.updated_by, updatedAt:row.updated_at };
  return row;
}
function mapWrite(ref,data) {
  const d={...data}, table=ref.table, legacy={};
  for (const k of ["uid","id","createdAt","updatedAt","updatedAtServer","ownerUid","ownerName","roleLabel","mustChangePassword","passwordChangedAt","reviewComment","approvedBy","approvedAt","assigneeUid","assigneeName","updatedBy","attachments","coverPath","size","contentType","order","conflictOverride","conflictReason","conflictAt","conflictBy"]) {
    if (Object.prototype.hasOwnProperty.call(d,k)) { if (!["id","ownerUid","createdAt","updatedAt","roleLabel","mustChangePassword","reviewComment","approvedBy","approvedAt","assigneeName","updatedBy","attachments","size","contentType","order"].includes(k)) legacy[k]=d[k]; delete d[k]; }
  }
  if (table === "profiles") {
    const out={id:ref.id,email:data.email||"",name:data.name||"",role:data.role||"consultor_tecnico",role_label:data.roleLabel||data.role_label||"",permissions:data.permissions||[],active:data.active!==false,must_change_password:data.mustChangePassword??data.must_change_password??false,updated_at:new Date().toISOString()};
    const operationalAreaId=data.operationalAreaId||data.operational_area_id||null;
    if(operationalAreaId)out.operational_area_id=operationalAreaId;
    if (data.createdBy) out.created_by=data.createdBy;
    const extra={...legacy}; if(Object.keys(extra).length)out.legacy_data=extra;
    return out;
  }
  if (table === "reports") return {id:ref.id,owner_id:ref.ownerId||data.ownerUid,type:data.type||"",report_date:data.date||null,responsible:data.responsible||"",client:data.client||"",branch:data.branch||"",equipment:data.equipment||"",location:data.location||"",objective:data.objective||"",observations:data.observations||"",activities:data.activities||"",results:data.results||"",conclusion:data.conclusion||"",model:data.model||{},legacy_data:legacy,updated_at:new Date().toISOString()};
  if (table === "report_photos") return {id:ref.id,owner_id:ref.ownerId,report_id:ref.reportId,data:data.data||"",caption:data.caption||"",order_index:data.order??0,legacy_data:legacy,updated_at:new Date().toISOString()};
  if (table === "user_settings") return {owner_id:ref.ownerId,setting_key:ref.id,data:{...data},updated_at:new Date().toISOString()};
  if (table === "trainings") {
    const ld={...legacy,docType:data.docType||legacy.docType,equipment:data.equipment||legacy.equipment,updatedOn:data.updatedOn||legacy.updatedOn,language:data.language||legacy.language,fileName:data.fileName||legacy.fileName,path:data.path||legacy.path,size:data.size??legacy.size,contentType:data.contentType||legacy.contentType,attachments:Array.isArray(data.attachments)?data.attachments:(legacy.attachments||[])};
    return {id:ref.id,title:data.title||"",category:data.category||"",audience:data.audience||"",description:data.description||"",owner_id:ref.ownerId||data.ownerUid,owner_name:data.ownerName||"",status:data.status||"draft",review_comment:data.reviewComment||"",reviewed_by:data.approvedBy||null,reviewed_at:data.approvedAt||null,version:data.version||1,legacy_data:ld,updated_at:new Date().toISOString()};
  }
  if (table === "agenda") return {id:ref.id,owner_id:ref.ownerId||data.ownerUid,appointment_date:data.date,appointment_time:data.time||null,client:data.client||"",location:data.location||"",equipment:data.equipment||"",activity_type:data.type||"",status:data.status||"Agendado",notes:data.notes||"",assignee_name:data.assigneeName||"",updated_by:data.updatedBy||null,legacy_data:{assigneeUid:data.assigneeUid||data.ownerUid,category:data.category||data.type||"",focus:data.focus||""},updated_at:new Date().toISOString()};
  throw new Error("Tabela não mapeada para gravação: "+table);
}
function applyFilters(q,ref) {
  if (ref.ownerId) q=q.eq("owner_id",ref.ownerId);
  for (const f of ref.filters||[]) { if(f.op==="==")q=q.eq(f.field,f.value); else if(f.op==="!=")q=q.neq(f.field,f.value); else if(f.op==="in")q=q.in(f.field,f.value); }
  return q;
}
async function getDocs(ref) {
  const {data,error}=await applyFilters(supabase.from(ref.table).select("*"),ref);
  if(error)throw error;
  const docs=(data||[]).map(row=>({id:row.id,ref:{id:row.id,parent:ref.table==="reports"||ref.table==="agenda"?{parent:{id:row.owner_id}}:null},exists:()=>true,data:()=>mapRow(ref.table,row)}));
  return {docs,empty:docs.length===0,size:docs.length};
}
async function getDoc(ref) {
  let q=supabase.from(ref.table).select("*");
  if(ref.id)q=q.eq(ref.table==="profiles"?"id":ref.table==="user_settings"?"setting_key":"id",ref.id);
  if(ref.ownerId)q=q.eq("owner_id",ref.ownerId);
  if(ref.reportId)q=q.eq("report_id",ref.reportId);
  const {data,error}=await q.maybeSingle();
  if(error)throw error;
  const row=data||null;
  return {id:ref.id,ref,exists:()=>!!row,data:()=>mapRow(ref.table,row)};
}
async function setDoc(ref,data,options={}) {
  let writeData=data;
  if (options.merge && ref.id) {
    const existing=await getDoc(ref);
    if (existing.exists()) writeData={...existing.data(),...data};
  }
  const payload=mapWrite(ref,writeData);
  const conflict={profiles:"id",reports:"owner_id,id",report_photos:"owner_id,report_id,id",user_settings:"owner_id,setting_key",trainings:"id",agenda:"owner_id,id"}[ref.table];
  const {error}=await supabase.from(ref.table).upsert(payload,{onConflict:conflict});
  if(error)throw error;
  return {id:ref.id};
}
async function createUserProfile(uid,data) {
  const payload=mapWrite(tableRef("profiles",uid),data);
  const {error}=await supabase.from("profiles").insert(payload);
  if(error)throw error;
  return {id:uid};
}
async function updateDoc(ref,data) {
  if (ref.table === "trainings") {
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error("Treinamento não encontrado para atualização.");
    const merged = {...existing.data(), ...data};
    const payload = mapWrite(ref, merged);
    const {error} = await supabase.from("trainings").update(payload).eq("id", ref.id);
    if (error) throw error;
    return {id:ref.id};
  }
  return setDoc(ref,data,{merge:true});
}
async function deleteDoc(ref) {
  let q=supabase.from(ref.table).delete();
  if(ref.id)q=q.eq(ref.table==="profiles"?"id":ref.table==="user_settings"?"setting_key":"id",ref.id);
  if(ref.ownerId)q=q.eq("owner_id",ref.ownerId);
  if(ref.reportId)q=q.eq("report_id",ref.reportId);
  const {error}=await q;
  if(error)throw error;
}
async function signInWithEmailAndPassword(_auth,email,password) {
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw error; currentSupabaseUser=normalizeUser(data.user); return {user:currentSupabaseUser};
}
async function signOut() {
  const {error}=await supabase.auth.signOut();
  if(error)throw error;
  // O evento SIGNED_OUT é a única fonte de transição visual do encerramento.
}
async function updatePassword(user,password) { const {data,error}=await supabase.auth.updateUser({password}); if(error)throw error; currentSupabaseUser=normalizeUser(data.user); return data; }
async function sendPasswordResetEmail(_auth,email) { const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin}); if(error)throw error; }
async function createUserWithEmailAndPassword(_auth,email,password) {
  const {data,error}=await creatorClient.auth.signUp({email,password});
  if(error)throw error;
  if(!data.user)throw new Error("O Supabase não retornou o usuário criado.");
  return {user:normalizeUser(data.user)};
}
function onAuthStateChanged(_auth,callback) {
  // IMPORTANTE: não consultar Supabase nem inicializar o app dentro do callback
  // síncrono de onAuthStateChange. O cliente mantém um lock interno durante o
  // evento; iniciar getDoc/getSession nesse mesmo callback pode provocar espera
  // circular e deixar a interface presa em transições de autenticação.
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
    const eventUser=normalizeUser(session?.user);
    // Despacha o trabalho para depois que o callback do Supabase terminar.
    window.setTimeout(async()=>{
      try{
        // Confirma o estado persistido atual antes de alterar a interface.
        // Isso descarta eventos antigos (SIGNED_OUT/INITIAL_SESSION) que
        // possam chegar fora de ordem durante um login ou refresh de token.
        const {data,error}=await supabase.auth.getSession();
        if(error){
          console.error('[RelatorioPro] Não foi possível confirmar a sessão após '+event+':',error);
          return; // Falha ao consultar sessão nunca equivale a logout.
        }
        const sessionUser=normalizeUser(data?.session?.user);
        if(sessionUser){
          currentSupabaseUser=sessionUser;
          callback(sessionUser,event);
          return;
        }
        if(event==='SIGNED_OUT'){
          currentSupabaseUser=null;
          callback(null,event);
          return;
        }
        // INITIAL_SESSION sem usuário é normal no primeiro carregamento.
        // Não altera a interface nem apaga dados de inicialização.
        if(event==='INITIAL_SESSION'&&!eventUser)return;
      }catch(error){
        console.error('[RelatorioPro] Falha ao processar evento de autenticação '+event+':',error);
        // Erros transitórios não devem derrubar uma sessão que ainda pode ser válida.
      }
    },0);
  });
  return ()=>subscription.unsubscribe();
}
function storageRef(_storage,path) { return {path}; }
async function uploadBytes(ref,file,options={}) {
  const bucket="training-attachments-private";
  // Arquivos acima de 6 MB usam a implementação TUS exclusiva para navegador.
  // O import aponta explicitamente para lib.esm/browser para impedir que o
  // bundler/CDN selecione a implementação Node.js (Buffer/Readable).
  if(file.size>6*1024*1024){
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    if(sessionError)throw sessionError;
    if(!session?.access_token)throw new Error("Sessão expirada. Entre novamente para enviar arquivos.");
    const endpoint=SUPABASE_URL.replace(".supabase.co",".storage.supabase.co")+"/storage/v1/upload/resumable";
    let upload=null;
    try{
      await new Promise((resolve,reject)=>{
        upload=new Upload(file,{
          endpoint,
          retryDelays:[0,3000,5000,10000,20000],
          chunkSize:6*1024*1024,
          uploadDataDuringCreation:true,
          removeFingerprintOnSuccess:true,
          fingerprint:async()=> "relatoriopro:"+bucket+":"+ref.path+":"+file.size+":"+(file.lastModified||0),
          headers:{authorization:"Bearer "+session.access_token,apikey:SUPABASE_ANON_KEY,"x-upsert":"true"},
          metadata:{
            bucketName:bucket,
            objectName:ref.path,
            contentType:options.contentType||file.type||"application/octet-stream",
            cacheControl:"3600",
            metadata:JSON.stringify(options.customMetadata||{})
          },
          onError:reject,
          onProgress:(sent,total)=>{
            const status=$("trainingFilesStatus");
            if(status&&total)status.textContent="Enviando "+file.name+" · "+Math.round(sent/total*100)+"%";
          },
          onSuccess:resolve
        });
        upload.findPreviousUploads().then(previous=>{
          if(previous.length)upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        }).catch(reject);
      });
    }catch(error){
      try{if(upload)await upload.abort(true)}catch(_){}
      throw error;
    }
    return {path:ref.path};
  }
  const {error}=await supabase.storage.from(bucket).upload(ref.path,file,{contentType:options.contentType,upsert:true});
  if(error)throw error;
  return {path:ref.path};
}
async function getDownloadURL(ref) {
  const {data,error}=await supabase.storage.from("training-attachments-private").createSignedUrl(ref.path,3600);
  if(error)throw error; return data.signedUrl;
}

  return {
    SUPABASE_URL, SUPABASE_ANON_KEY, supabase, creatorClient, auth, db, storage,
    MASTER_UID, fieldMap, reverseFieldMap, profilesRef,
    normalizeUser,
    collection, collectionGroup, doc, where, query, serverTimestamp,
    mapRow, mapWrite, applyFilters, getDocs, getDoc, setDoc, createUserProfile,
    updateDoc, deleteDoc, signInWithEmailAndPassword, signOut, updatePassword,
    sendPasswordResetEmail, createUserWithEmailAndPassword, onAuthStateChanged,
    storageRef, uploadBytes, getDownloadURL,
    get currentSupabaseUser() { return currentSupabaseUser; },
    set currentSupabaseUser(value) { currentSupabaseUser = value; }
  };
}
