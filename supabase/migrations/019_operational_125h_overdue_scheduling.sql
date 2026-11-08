-- IRMEN RelatorioPro | Registro rastreável de inspeções 125h atrasadas
begin;

alter table public.operational_125h_schedules
  add column if not exists is_overdue boolean not null default false,
  add column if not exists overdue_reason text not null default '';

create or replace function public.validate_operational_125h_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_current numeric(12,1);
  v_next numeric(12,1);
begin
  select e.current_horimeter, c.last_service_horimeter + 125
    into v_current, v_next
  from public.operational_equipment e
  left join public.operational_125h_control c on c.equipment_id = e.id
  where e.id = new.equipment_id and e.area_id = new.area_id;

  if not found then
    raise exception 'Equipamento não pertence à área informada.';
  end if;

  if new.planned_horimeter < coalesce(v_current,0) then
    raise exception 'Horímetro planejado não pode ser menor que o horímetro atual.';
  end if;

  -- O vencimento é determinado pela leitura atual do equipamento, não pelo horímetro futuro escolhido no formulário.
  new.is_overdue := v_next is not null and coalesce(v_current,0) >= v_next;
  if new.is_overdue then
    if nullif(trim(new.overdue_reason),'') is null then
      raise exception 'Inspeção 125h vencida: informe obrigatoriamente a justificativa do atraso.';
    end if;
  else
    new.overdue_reason := '';
    if v_next is not null and new.planned_horimeter > v_next then
      raise exception 'Agendamento ultrapassa o limite da próxima manutenção de 125 horas.';
    end if;
  end if;

  return new;
end;
$$;

commit;
