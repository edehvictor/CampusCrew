begin;
alter table public.campuscrew_stellar_tasks add column removed_at timestamptz;
alter table public.campuscrew_stellar_applications add column withdrawn_at timestamptz;
alter table public.campuscrew_stellar_escrows add column prefunded boolean not null default false;

-- Payment recovery records are private; a prepared intent is not a task listing.
create table public.campuscrew_publication_intents (
  id uuid primary key, request_id uuid not null, wallet text not null references public.campuscrew_stellar_profiles(wallet),
  operation text not null check(operation in ('publish','cancel')),
  contract_id text not null, tx_hash text not null unique check(tx_hash ~ '^[a-f0-9]{64}$'),
  draft jsonb not null, publication_deadline bigint not null,
  status text not null default 'prepared' check(status in('prepared','submitted','confirmed','failed')),
  expires_at timestamptz not null, checked_at timestamptz, created_at timestamptz not null default now()
);
create table public.campuscrew_task_publications (
  request_id uuid primary key references public.campuscrew_stellar_tasks(id),
  organizer text not null references public.campuscrew_stellar_profiles(wallet),
  contract_id text not null, budget numeric(12,2) not null check(budget>0 and budget<=1000000),
  expires_at bigint not null, funding_tx text not null unique check(funding_tx ~ '^[a-f0-9]{64}$'),
  cancellation_tx text check(cancellation_tx ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check(status in('active','cancelled')),
  confirmed_ledger bigint not null check(confirmed_ledger>0)
);
create index campuscrew_publication_pending on public.campuscrew_publication_intents(wallet,checked_at) where status in('prepared','submitted');
create index campuscrew_publication_cancel_lookup on public.campuscrew_publication_intents(request_id) where operation='cancel' and status in('prepared','submitted');
alter table public.campuscrew_publication_intents enable row level security;
alter table public.campuscrew_task_publications enable row level security;
revoke all on public.campuscrew_publication_intents,public.campuscrew_task_publications from public,anon,authenticated;
grant select,insert,update on public.campuscrew_publication_intents,public.campuscrew_task_publications to service_role;

create function public.campuscrew_publication_pending_cancel(p_id uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.campuscrew_publication_intents where request_id=p_id and operation='cancel' and status in('prepared','submitted'));
$$;

create function public.campuscrew_record_publication(p_intent uuid,p_hash text,p_ledger bigint)
returns uuid language plpgsql set search_path='' as $$
declare intent public.campuscrew_publication_intents; v jsonb; existing public.campuscrew_task_publications;
begin
 select * into intent from public.campuscrew_publication_intents where id=p_intent for update;
 if not found or intent.operation<>'publish' or intent.tx_hash<>p_hash or p_ledger<=0 or intent.status not in('submitted','confirmed') then raise exception 'Funding confirmation does not match this task';end if;
 select * into existing from public.campuscrew_task_publications where request_id=intent.request_id;
 if found then
   if existing.funding_tx<>p_hash or existing.organizer<>intent.wallet then raise exception 'Task already funded by a different transaction';end if;
   return intent.request_id;
 end if;
 v:=intent.draft;
 -- Called only after the server verifies the successful transaction and matching
 -- on-chain reserve. Browser database roles cannot call this function.
 insert into public.campuscrew_stellar_tasks(id,requester_wallet,title,category,area,timing,budget,scope,evidence_required)
 values(intent.request_id,intent.wallet,v->>'title',v->>'category',v->>'area',v->>'timing',(v->>'budget')::numeric,v->>'scope',(v->>'evidenceRequired')::boolean);
 insert into public.campuscrew_task_publications(request_id,organizer,contract_id,budget,expires_at,funding_tx,confirmed_ledger)
 values(intent.request_id,intent.wallet,intent.contract_id,(v->>'budget')::numeric,intent.publication_deadline,p_hash,p_ledger);
 update public.campuscrew_publication_intents set status='confirmed' where id=p_intent;
 return intent.request_id;
end; $$;

create function public.campuscrew_prepare_publication_cancel(p_intent uuid,p_id uuid,p_wallet text,p_contract text,p_hash text,p_expires timestamptz,p_deadline bigint)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks;
begin
 select * into task from public.campuscrew_stellar_tasks where id=p_id for update;
 if not found or task.requester_wallet is distinct from p_wallet or task.removed_at is not null then raise exception 'Task unavailable';end if;
 if exists(select 1 from public.campuscrew_stellar_bookings b left join public.campuscrew_stellar_escrows e on e.request_id=b.request_id where b.request_id=p_id and (not exists(select 1 from public.campuscrew_task_publications p where p.request_id=p_id) or e.chain_state is not null)) then raise exception 'Cancel the booking instead. Its records and payment history must remain available';end if;
 if public.campuscrew_publication_pending_cancel(p_id) then raise exception 'A refund approval is already pending. Check refund before retrying';end if;
 if not exists(select 1 from public.campuscrew_task_publications where request_id=p_id and organizer=p_wallet and contract_id=p_contract and status='active') then raise exception 'Funded task unavailable';end if;
 insert into public.campuscrew_publication_intents(id,request_id,wallet,operation,contract_id,tx_hash,draft,publication_deadline,expires_at)
 values(p_intent,p_id,p_wallet,'cancel',p_contract,p_hash,jsonb_build_object('budget',task.budget,'title',task.title),p_deadline,p_expires);
end; $$;

create function public.campuscrew_remove_task(p_wallet text,p_id uuid,p_intent uuid default null,p_hash text default null)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; publication public.campuscrew_task_publications; intent public.campuscrew_publication_intents; applicant record; actor_name text;
begin
 select * into task from public.campuscrew_stellar_tasks where id=p_id for update;
 if not found or task.requester_wallet is distinct from p_wallet then raise exception 'Only the owner can remove this task';end if;
 if task.removed_at is not null then return;end if;
 if exists(select 1 from public.campuscrew_stellar_bookings b left join public.campuscrew_stellar_escrows e on e.request_id=b.request_id where b.request_id=p_id and (not exists(select 1 from public.campuscrew_task_publications p where p.request_id=p_id) or e.chain_state is not null)) then raise exception 'Cancel the booking instead. Its records and payment history must remain available';end if;
 select * into publication from public.campuscrew_task_publications where request_id=p_id;
 if found then
   select * into intent from public.campuscrew_publication_intents where id=p_intent for update;
   if not found or intent.request_id<>p_id or intent.wallet<>p_wallet or intent.operation<>'cancel' or intent.tx_hash is distinct from p_hash or intent.status not in('submitted','confirmed') then raise exception 'Confirm the on-chain refund before removing this funded task';end if;
   update public.campuscrew_task_publications set status='cancelled',cancellation_tx=p_hash where request_id=p_id;
   update public.campuscrew_publication_intents set status='confirmed' where id=p_intent;
 end if;
 update public.campuscrew_stellar_tasks set removed_at=now() where id=p_id;
 select display_name into actor_name from public.campuscrew_stellar_profiles where wallet=p_wallet;
 for applicant in select provider_wallet from public.campuscrew_stellar_applications where request_id=p_id and withdrawn_at is null loop
   perform public.campuscrew_experience_notify(applicant.provider_wallet,'task-removed:'||p_id,p_id,actor_name||' removed the task. Applications are closed.');
 end loop;
end; $$;

create function public.campuscrew_withdraw_application(p_wallet text,p_id uuid,p_application uuid,p_revision integer)
returns void language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; application public.campuscrew_stellar_applications; actor_name text;
begin
 select * into task from public.campuscrew_stellar_tasks where id=p_id for update;
 if not found then raise exception 'Task unavailable';end if;
 select * into application from public.campuscrew_stellar_applications where id=p_application and request_id=p_id and provider_wallet=p_wallet for update;
 if not found then raise exception 'Only the applicant can withdraw this application';end if;
 if application.withdrawn_at is not null then return;end if;
 if exists(select 1 from public.campuscrew_stellar_bookings where request_id=p_id) then raise exception 'Selection has closed applications. Use the booking cancellation or dispute controls';end if;
 if p_revision is null or p_revision<>application.revision then raise exception 'This application changed. Review it before withdrawing';end if;
 update public.campuscrew_stellar_applications set withdrawn_at=now() where id=p_application;
 select display_name into actor_name from public.campuscrew_stellar_profiles where wallet=p_wallet;
 perform public.campuscrew_experience_notify(task.requester_wallet,'application-withdrawn:'||p_application||':'||(application.revision+1),p_id,actor_name||' withdrew their application.');
end; $$;

create function public.campuscrew_funded_application_gate() returns trigger language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks; publication public.campuscrew_task_publications;
begin
 select * into task from public.campuscrew_stellar_tasks where id=new.request_id for update;
 select * into publication from public.campuscrew_task_publications where request_id=new.request_id;
 if task.removed_at is not null or not found or publication.status<>'active' or publication.expires_at<=extract(epoch from now()) or public.campuscrew_publication_pending_cancel(new.request_id) then raise exception 'This task is not accepting applications';end if;
 if new.amount>publication.budget then raise exception 'Your quote cannot exceed the funded budget';end if;
 if exists(select 1 from public.campuscrew_stellar_bookings where request_id=new.request_id) then raise exception 'A provider has already been selected';end if;
 return new;
end; $$;
create trigger campuscrew_funded_application_gate before insert on public.campuscrew_stellar_applications for each row execute function public.campuscrew_funded_application_gate();

create function public.campuscrew_funded_selection_gate() returns trigger language plpgsql set search_path='' as $$
declare publication public.campuscrew_task_publications; application public.campuscrew_stellar_applications;
begin
 perform 1 from public.campuscrew_stellar_tasks where id=new.request_id and removed_at is null for update;
 if not found then raise exception 'Task unavailable';end if;
 select * into publication from public.campuscrew_task_publications where request_id=new.request_id;
 if not found or publication.status<>'active' or publication.expires_at<=extract(epoch from now()) or public.campuscrew_publication_pending_cancel(new.request_id) then raise exception 'The task must have an active funded budget before selection';end if;
 select * into application from public.campuscrew_stellar_applications where id=new.application_id and request_id=new.request_id;
 if not found or application.withdrawn_at is not null then raise exception 'This application was withdrawn';end if;
 if new.amount<>application.amount or new.amount>publication.budget then raise exception 'The selected quote exceeds or differs from the funded agreement';end if;
 return new;
end; $$;
create trigger campuscrew_funded_selection_gate before insert on public.campuscrew_stellar_bookings for each row execute function public.campuscrew_funded_selection_gate();

alter function public.campuscrew_stellar_prepare_escrow(text,uuid,text,text,text,text) rename to campuscrew_prepare_legacy_escrow;
create function public.campuscrew_stellar_prepare_escrow(p_wallet text,p_request_id uuid,p_chain_id text,p_contract text,p_token text,p_resolver text)
returns jsonb language plpgsql set search_path='' as $$
declare terms public.campuscrew_stellar_escrows; publication public.campuscrew_task_publications; booking public.campuscrew_stellar_bookings; provider_wallet text;
begin
 select * into publication from public.campuscrew_task_publications where request_id=p_request_id;
 if not found then return public.campuscrew_prepare_legacy_escrow(p_wallet,p_request_id,p_chain_id,p_contract,p_token,p_resolver);end if;
 select * into booking from public.campuscrew_stellar_bookings where request_id=p_request_id for update;
 if not found or publication.organizer is distinct from p_wallet then raise exception 'Only the task owner can assign this escrow';end if;
 if public.campuscrew_publication_pending_cancel(p_request_id) then raise exception 'A refund is awaiting confirmation';end if;
 if publication.contract_id<>p_contract or publication.status<>'active' or booking.amount>publication.budget then raise exception 'Funded publication does not match this booking';end if;
 select * into terms from public.campuscrew_stellar_escrows where request_id=p_request_id;
 if found then
   if terms.contract_id<>p_contract or terms.chain_id<>p_chain_id or terms.token_id<>p_token or terms.resolver<>p_resolver then raise exception 'Escrow deployment does not match';end if;
   return to_jsonb(terms);
 end if;
 select a.provider_wallet into provider_wallet from public.campuscrew_stellar_applications a where a.id=booking.application_id;
 insert into public.campuscrew_stellar_escrows(request_id,chain_id,contract_id,token_id,resolver,organizer,provider,amount,funding_deadline,work_deadline,prefunded,funding_tx)
 values(p_request_id,p_chain_id,p_contract,p_token,p_resolver,p_wallet,provider_wallet,booking.amount,publication.expires_at,extract(epoch from now())::bigint+1209600,true,publication.funding_tx) returning * into terms;
 return to_jsonb(terms);
end; $$;

-- Guards, board serialization and reapplication support follow below.

create or replace function public.campuscrew_task_edit_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id is distinct from old.id or new.requester_wallet is distinct from old.requester_wallet
    or new.created_at is distinct from old.created_at or new.network is distinct from old.network
    or new.asset is distinct from old.asset then raise exception 'Task identity cannot change';end if;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=old.id) and not (new.removed_at is not null and exists(select 1 from public.campuscrew_task_publications where request_id=old.id and status='cancelled')) then
    raise exception 'This task is locked because a provider has been selected';
  end if;
  if old.removed_at is not null then raise exception 'This task was removed';end if;
  if exists(select 1 from public.campuscrew_task_publications where request_id=old.id) and new.budget is distinct from old.budget then
    raise exception 'The funded budget is fixed. Remove and refund this task before posting a different budget';end if;
  if new.removed_at is null and public.campuscrew_publication_pending_cancel(old.id) then raise exception 'A cancellation is awaiting confirmation';end if;
  new.title:=trim(new.title);new.scope:=trim(new.scope);new.timing:=trim(new.timing);
  if char_length(new.title)=0 or char_length(new.scope)=0 or char_length(new.timing)=0 then raise exception 'Fill in the task details';end if;
  new.revision:=old.revision+1;new.updated_at:=now();
  return new;
end; $$;

create or replace function public.campuscrew_application_edit_guard() returns trigger language plpgsql set search_path='' as $$
declare task public.campuscrew_stellar_tasks;
begin
  if new.id is distinct from old.id or new.request_id is distinct from old.request_id
    or new.provider_wallet is distinct from old.provider_wallet or new.created_at is distinct from old.created_at then raise exception 'Application identity cannot change';end if;
  select * into task from public.campuscrew_stellar_tasks where id=old.request_id for update;
  if exists(select 1 from public.campuscrew_stellar_bookings where request_id=old.request_id) then
    raise exception 'Applications are locked because a provider has been selected';end if;
  if new.withdrawn_at is not null then
    if new.amount is distinct from old.amount or new.note is distinct from old.note or new.availability is distinct from old.availability then
      raise exception 'Withdraw without changing the application';end if;
    new.revision:=old.revision+1;new.task_revision:=old.task_revision;new.updated_at:=now();return new;
  end if;
  if task.removed_at is not null or public.campuscrew_publication_pending_cancel(task.id)
    or not exists(select 1 from public.campuscrew_task_publications where request_id=task.id and status='active' and expires_at>extract(epoch from now()) and budget>=new.amount) then
    raise exception 'The task is closed or the quote exceeds its funded budget';end if;
  if not exists(select 1 from public.campuscrew_stellar_profiles where wallet=new.provider_wallet and task.category=any(skills) and task.area=any(coverage)) then
    raise exception 'Add this service and coverage area to your profile before applying';end if;
  new.note:=trim(new.note);new.availability:=trim(new.availability);
  if char_length(new.note)=0 or char_length(new.availability)=0 then raise exception 'Add your availability and application note';end if;
  new.revision:=old.revision+1;new.task_revision:=task.revision;new.updated_at:=now();
  return new;
end; $$;

create or replace function public.campuscrew_stellar_edit_application(p_wallet text,p_request_id uuid,p_application_id uuid,p_revision integer,p_task_revision integer,p_amount numeric,p_availability text,p_note text)
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
  if row(application.amount,application.availability,application.note,application.task_revision,application.withdrawn_at)
    is not distinct from row(p_amount,trim(p_availability),trim(p_note),task.revision,null::timestamptz) then return;end if;
  update public.campuscrew_stellar_applications set amount=p_amount,availability=p_availability,note=p_note,withdrawn_at=null where id=p_application_id;
  select display_name into actor_name from public.campuscrew_stellar_profiles where wallet=p_wallet;
  perform public.campuscrew_experience_notify(task.requester_wallet,'application-edited:'||p_application_id||':'||(application.revision+1),p_request_id,
    actor_name||' updated their application. Review the latest offer.');
end; $$;


create or replace function public.campuscrew_stellar_board(p_wallet text)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'title',t.title,'category',t.category,'area',t.area,'timing',t.timing,'budget',t.budget,'scope',t.scope,'customer',owner.display_name,
    'lifecycleReady',true,'revision',t.revision,'updatedAt',t.updated_at,'own',coalesce(t.requester_wallet=p_wallet,false),
    'applicationCount',(select count(*) from public.campuscrew_stellar_applications where request_id=t.id and withdrawn_at is null),
    'accepted',case when t.requester_wallet=p_wallet or selected.provider_wallet=p_wallet then b.application_id end,
    'status',case when t.removed_at is not null then 'Removed' when b.request_id is not null then case when publication.request_id is not null then 'Awaiting assignment' else 'Awaiting funding' end
      when publication.request_id is null then 'Funding required'
      when public.campuscrew_publication_pending_cancel(t.id) then 'Closing'
      when publication.expires_at<=extract(epoch from now()) then 'Expired' else 'Open' end,
    'publication',case when publication.request_id is not null then jsonb_build_object('fundingTx',publication.funding_tx,'budget',publication.budget,'expiresAt',publication.expires_at,'cancellationTx',publication.cancellation_tx) end,
    'quotes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'provider',profile.display_name,'own',a.provider_wallet=p_wallet,'amount',a.amount,'availability',a.availability,'note',a.note,
      'withdrawnAt',a.withdrawn_at,'revision',a.revision,'taskRevision',a.task_revision,'updatedAt',a.updated_at,'bio',profile.bio,'skills',profile.skills,'coverage',profile.coverage
    ) order by a.created_at) from public.campuscrew_stellar_applications a join public.campuscrew_stellar_profiles profile on profile.wallet=a.provider_wallet
    where a.request_id=t.id and (t.requester_wallet=p_wallet or a.provider_wallet=p_wallet)),'[]'::jsonb)
  ) order by t.created_at desc),'[]'::jsonb)
  from public.campuscrew_stellar_tasks t join public.campuscrew_stellar_profiles owner on owner.wallet=t.requester_wallet
  left join public.campuscrew_task_publications publication on publication.request_id=t.id
  left join public.campuscrew_stellar_bookings b on b.request_id=t.id left join public.campuscrew_stellar_applications selected on selected.id=b.application_id
  where (b.request_id is null and t.removed_at is null and publication.status='active'
    and publication.expires_at>extract(epoch from now()) and not public.campuscrew_publication_pending_cancel(t.id))
    or t.requester_wallet=p_wallet or exists(select 1 from public.campuscrew_stellar_applications a where a.request_id=t.id and a.provider_wallet=p_wallet);
$$;

revoke execute on function public.campuscrew_publication_pending_cancel(uuid),
public.campuscrew_record_publication(uuid,text,bigint),
public.campuscrew_prepare_publication_cancel(uuid,uuid,text,text,text,timestamptz,bigint),
public.campuscrew_remove_task(text,uuid,uuid,text),
public.campuscrew_withdraw_application(text,uuid,uuid,integer),
public.campuscrew_funded_application_gate(),public.campuscrew_funded_selection_gate(),
public.campuscrew_stellar_prepare_escrow(text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.campuscrew_publication_pending_cancel(uuid),
public.campuscrew_record_publication(uuid,text,bigint),
public.campuscrew_prepare_publication_cancel(uuid,uuid,text,text,text,timestamptz,bigint),
public.campuscrew_remove_task(text,uuid,uuid,text),
public.campuscrew_withdraw_application(text,uuid,uuid,integer),
public.campuscrew_funded_application_gate(),public.campuscrew_funded_selection_gate(),
public.campuscrew_stellar_prepare_escrow(text,uuid,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
