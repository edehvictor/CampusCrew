begin;

alter table public.campuscrew_stellar_tasks
  add column revision integer not null default 1 check (revision > 0),
  add column updated_at timestamptz;
alter table public.campuscrew_stellar_applications
  add column revision integer not null default 1 check (revision > 0),
  add column task_revision integer not null default 1 check (task_revision > 0),
  add column updated_at timestamptz;

-- All edits, applications and selection take the task lock first. A booking
-- freezes the scope and every quote even if funding has not started yet.
create function public.campuscrew_task_edit_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id or new.requester_wallet is distinct from old.requester_wallet
    or new.created_at is distinct from old.created_at or new.network is distinct from old.network
    or new.asset is distinct from old.asset then raise exception 'Task identity cannot change';end if;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=old.id) then
    raise exception 'This task is locked because a provider has been selected';
  end if;
  new.title:=trim(new.title);new.scope:=trim(new.scope);new.timing:=trim(new.timing);
  if char_length(new.title)=0 or char_length(new.scope)=0 or char_length(new.timing)=0 then raise exception 'Fill in the task details';end if;
  new.revision:=old.revision+1;new.updated_at:=now();
  return new;
end; $$;
create trigger campuscrew_task_edit_guard before update on public.campuscrew_stellar_tasks for each row execute function public.campuscrew_task_edit_guard();

create function public.campuscrew_application_edit_guard() returns trigger language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks;
begin
  if new.id is distinct from old.id or new.request_id is distinct from old.request_id
    or new.provider_wallet is distinct from old.provider_wallet or new.created_at is distinct from old.created_at then raise exception 'Application identity cannot change';end if;
  select * into task from public.campuscrew_stellar_tasks where id=old.request_id for update;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=old.request_id) then
    raise exception 'Applications are locked because a provider has been selected';end if;
  if not exists(select 1 from public.campuscrew_stellar_profiles where wallet=new.provider_wallet and task.category=any(skills) and task.area=any(coverage)) then
    raise exception 'Add this service and coverage area to your profile before applying';end if;
  new.note:=trim(new.note);new.availability:=trim(new.availability);
  if char_length(new.note)=0 or char_length(new.availability)=0 then raise exception 'Add your availability and application note';end if;
  new.revision:=old.revision+1;new.task_revision:=task.revision;new.updated_at:=now();
  return new;
end; $$;
create trigger campuscrew_application_edit_guard before update on public.campuscrew_stellar_applications for each row execute function public.campuscrew_application_edit_guard();

create function public.campuscrew_stellar_edit_task(p_wallet text,p_request_id uuid,p_revision integer,p_title text,p_category text,p_area text,p_timing text,p_budget numeric,p_scope text,p_evidence_required boolean)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; applicant record; actor_name text;
begin
  select * into task from public.campuscrew_stellar_tasks where id=p_request_id for update;
  if not found or task.requester_wallet<>p_wallet then raise exception 'Only the task owner can edit this task';end if;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=p_request_id) then raise exception 'This task is locked because a provider has been selected';end if;
  if p_revision is null or task.revision<>p_revision then raise exception 'This task changed. Close the editor and review the latest version';end if;
  if row(task.title,task.category,task.area,task.timing,task.budget,task.scope,task.evidence_required)
    is not distinct from row(trim(p_title),p_category,p_area,trim(p_timing),p_budget,trim(p_scope),p_evidence_required) then return;end if;
  update public.campuscrew_stellar_tasks set title=p_title,category=p_category,area=p_area,timing=p_timing,budget=p_budget,scope=p_scope,evidence_required=p_evidence_required where id=p_request_id;
  select display_name into actor_name from public.campuscrew_stellar_profiles where wallet=p_wallet;
  for applicant in select provider_wallet from public.campuscrew_stellar_applications where request_id=p_request_id loop
    perform public.campuscrew_experience_notify(applicant.provider_wallet,'task-edited:'||p_request_id||':'||(task.revision+1),p_request_id,
      actor_name||' updated the task. Review the changes and confirm your application.');
  end loop;
end; $$;

create function public.campuscrew_stellar_apply_v2(p_wallet text,p_request_id uuid,p_task_revision integer,p_amount numeric,p_availability text,p_note text)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks;
begin
  select * into task from public.campuscrew_stellar_tasks where id=p_request_id for update;
  if not found or task.requester_wallet=p_wallet or exists(select 1 from public.campuscrew_stellar_bookings where request_id=p_request_id) then raise exception 'Task unavailable';end if;
  if p_task_revision is null or task.revision<>p_task_revision then raise exception 'This task changed. Review the latest details before applying';end if;
  if not exists(select 1 from public.campuscrew_stellar_profiles where wallet=p_wallet and task.category=any(skills) and task.area=any(coverage)) then raise exception 'Add this service and coverage area to your profile before applying';end if;
  insert into public.campuscrew_stellar_applications(request_id,provider_wallet,amount,availability,note,task_revision)
    values(p_request_id,p_wallet,p_amount,trim(p_availability),trim(p_note),task.revision) on conflict(request_id,provider_wallet) do nothing;
end; $$;

create function public.campuscrew_stellar_edit_application(p_wallet text,p_request_id uuid,p_application_id uuid,p_revision integer,p_task_revision integer,p_amount numeric,p_availability text,p_note text)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; application public.campuscrew_stellar_applications; actor_name text;
begin
  select * into task from public.campuscrew_stellar_tasks where id=p_request_id for update;
  if not found then raise exception 'Task unavailable';end if;
  select * into application from public.campuscrew_stellar_applications where id=p_application_id and request_id=p_request_id and provider_wallet=p_wallet for update;
  if not found then raise exception 'Only the applicant can edit this application';end if;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=p_request_id) then raise exception 'Applications are locked because a provider has been selected';end if;
  if p_task_revision is null or task.revision<>p_task_revision then raise exception 'This task changed. Close the editor and review the latest details';end if;
  if p_revision is null or application.revision<>p_revision then raise exception 'This application changed. Close the editor and review the latest version';end if;
  if row(application.amount,application.availability,application.note,application.task_revision)
    is not distinct from row(p_amount,trim(p_availability),trim(p_note),task.revision) then return;end if;
  update public.campuscrew_stellar_applications set amount=p_amount,availability=p_availability,note=p_note where id=p_application_id;
  select display_name into actor_name from public.campuscrew_stellar_profiles where wallet=p_wallet;
  perform public.campuscrew_experience_notify(task.requester_wallet,'application-edited:'||p_application_id||':'||(application.revision+1),p_request_id,
    actor_name||' updated their application. Review the latest offer.');
end; $$;

create function public.campuscrew_stellar_select_provider_v2(p_wallet text,p_request_id uuid,p_application_id uuid,p_task_revision integer,p_application_revision integer)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; application public.campuscrew_stellar_applications; selected uuid;
begin
  select * into task from public.campuscrew_stellar_tasks where id=p_request_id for update;
  if not found or task.requester_wallet<>p_wallet then raise exception 'Task unavailable';end if;
  select * into application from public.campuscrew_stellar_applications where id=p_application_id and request_id=p_request_id and provider_wallet<>p_wallet;
  if not found then raise exception 'Application unavailable';end if;
  if p_task_revision is null or task.revision<>p_task_revision then raise exception 'This task changed. Review the latest details before selecting a provider';end if;
  if p_application_revision is null or application.revision<>p_application_revision then raise exception 'This application changed. Review the latest offer before selecting';end if;
  if application.task_revision<>task.revision then raise exception 'This applicant must review the updated task before you can select them';end if;
  select application_id into selected from public.campuscrew_stellar_bookings where request_id=p_request_id;
  if found then
    if selected=p_application_id then return;end if;
    raise exception 'A provider has already been selected';
  end if;
  insert into public.campuscrew_stellar_bookings(request_id,application_id,amount) values(p_request_id,p_application_id,application.amount);
end; $$;

-- Legacy clients must refresh rather than create offers or accept prices that
-- were not reviewed. New endpoints retain compatibility until this is applied.
create or replace function public.campuscrew_stellar_apply(p_wallet text,p_request_id uuid,p_amount numeric,p_availability text,p_note text)
returns void language plpgsql set search_path='' as $$ begin raise exception 'Refresh CampusCrew before applying for this task';end; $$;
create or replace function public.campuscrew_stellar_select_provider(p_wallet text,p_request_id uuid,p_application_id uuid)
returns void language plpgsql set search_path='' as $$ begin raise exception 'Refresh CampusCrew before selecting a provider';end; $$;

create or replace function public.campuscrew_stellar_board(p_wallet text)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'title',t.title,'category',t.category,'area',t.area,'timing',t.timing,'budget',t.budget,'scope',t.scope,'customer',owner.display_name,
    'revision',t.revision,'updatedAt',t.updated_at,'own',coalesce(t.requester_wallet=p_wallet,false),
    'applicationCount',(select count(*) from public.campuscrew_stellar_applications where request_id=t.id),
    'accepted',case when t.requester_wallet=p_wallet or selected.provider_wallet=p_wallet then b.application_id end,
    'status',case when b.request_id is null then 'Open' else 'Awaiting funding' end,
    'quotes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'provider',profile.display_name,'own',a.provider_wallet=p_wallet,'amount',a.amount,'availability',a.availability,'note',a.note,
      'revision',a.revision,'taskRevision',a.task_revision,'updatedAt',a.updated_at,'bio',profile.bio,'skills',profile.skills,'coverage',profile.coverage
    ) order by a.created_at) from public.campuscrew_stellar_applications a join public.campuscrew_stellar_profiles profile on profile.wallet=a.provider_wallet
    where a.request_id=t.id and (t.requester_wallet=p_wallet or a.provider_wallet=p_wallet)),'[]'::jsonb)
  ) order by t.created_at desc),'[]'::jsonb)
  from public.campuscrew_stellar_tasks t join public.campuscrew_stellar_profiles owner on owner.wallet=t.requester_wallet
  left join public.campuscrew_stellar_bookings b on b.request_id=t.id left join public.campuscrew_stellar_applications selected on selected.id=b.application_id
  where b.request_id is null or t.requester_wallet=p_wallet or exists(select 1 from public.campuscrew_stellar_applications a where a.request_id=t.id and a.provider_wallet=p_wallet);
$$;

revoke execute on function public.campuscrew_task_edit_guard(),public.campuscrew_application_edit_guard(),
public.campuscrew_stellar_edit_task(text,uuid,integer,text,text,text,text,numeric,text,boolean),
public.campuscrew_stellar_apply_v2(text,uuid,integer,numeric,text,text),
public.campuscrew_stellar_edit_application(text,uuid,uuid,integer,integer,numeric,text,text),
public.campuscrew_stellar_select_provider_v2(text,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.campuscrew_task_edit_guard(),public.campuscrew_application_edit_guard(),
public.campuscrew_stellar_edit_task(text,uuid,integer,text,text,text,text,numeric,text,boolean),
public.campuscrew_stellar_apply_v2(text,uuid,integer,numeric,text,text),
public.campuscrew_stellar_edit_application(text,uuid,uuid,integer,integer,numeric,text,text),
public.campuscrew_stellar_select_provider_v2(text,uuid,uuid,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
