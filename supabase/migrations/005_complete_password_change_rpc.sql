-- Permite concluir a primeira troca de senha sem conceder UPDATE geral em profiles.
-- A função só altera o sinalizador do próprio usuário autenticado.
create or replace function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão autenticada necessária.';
  end if;

  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = auth.uid()
     and active = true;

  if not found then
    raise exception 'Perfil ativo não encontrado para concluir a troca de senha.';
  end if;
end;
$$;

revoke all on function public.complete_password_change() from public;
revoke all on function public.complete_password_change() from anon;
grant execute on function public.complete_password_change() to authenticated;
