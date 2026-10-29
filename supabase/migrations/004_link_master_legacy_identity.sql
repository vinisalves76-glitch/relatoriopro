-- Vincula a conta mestre do Supabase ao UID legado do Firebase.
-- Necessário para manter a propriedade dos dados antigos durante a migração gradual.
-- Executar no SQL Editor somente após confirmar que o perfil mestre existe.
do $$
declare
  affected_rows integer;
begin
  update public.profiles
     set legacy_firebase_uid = 'sQYjYwjn2vOKtXty7NOT9CO43Mk1',
         updated_at = now()
   where id = '5c6800f9-426b-44b3-842d-ba6485cc017e'::uuid
     and lower(email) = lower('vinicius.alves@irmen.com.br')
     and (legacy_firebase_uid is null
          or legacy_firebase_uid = 'sQYjYwjn2vOKtXty7NOT9CO43Mk1');

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Vínculo legado do mestre não aplicado: esperado 1 perfil correspondente, encontrados/atualizados %.', affected_rows;
  end if;
end $$;
