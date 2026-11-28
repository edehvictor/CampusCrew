begin;
alter table public.campuscrew_booking_evidence add column if not exists removed_at timestamptz;
alter table public.campuscrew_booking_evidence add column if not exists object_deleted_at timestamptz;
create index if not exists campuscrew_evidence_cleanup on public.campuscrew_booking_evidence(removed_at) where removed_at is not null and object_deleted_at is null;

create or replace function public.campuscrew_evidence_submission_pending(p_id uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.campuscrew_stellar_payment_intents where request_id=p_id and operation='submit' and status in('prepared','submitted'));
$$;

create or replace function public.campuscrew_experience_evidence(p_wallet text,p_request_id uuid,p_id uuid,p_name text,p_path text,p_mime text,p_bytes integer)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows; f public.campuscrew_booking_evidence;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or p_wallet not in(e.organizer,e.provider) then raise exception 'This booking is private';end if;
 select * into f from public.campuscrew_booking_evidence where id=p_id;
 if found then
   if f.request_id<>p_request_id or f.uploader<>p_wallet or f.object_path<>p_path or f.name<>p_name or f.mime<>p_mime or f.bytes<>p_bytes then raise exception 'This upload identifier belongs to another attachment';end if;
   if f.removed_at is not null then raise exception 'This attachment was removed. Select the file again';end if;
   return;
 end if;
 if not ((e.provider=p_wallet and e.chain_state='Funded' and not public.campuscrew_evidence_submission_pending(p_request_id))
   or (p_wallet in(e.organizer,e.provider) and e.chain_state='Disputed')) then raise exception 'Evidence is locked while completion is being submitted or after submission';end if;
 if (select count(*) from public.campuscrew_booking_evidence where request_id=p_request_id and uploader=p_wallet and removed_at is null)>=3 then raise exception 'Up to three evidence files per person per booking';end if;
 insert into public.campuscrew_booking_evidence(id,request_id,uploader,name,object_path,mime,bytes) values(p_id,p_request_id,p_wallet,p_name,p_path,p_mime,p_bytes);
end; $$;

create or replace function public.campuscrew_remove_evidence(p_wallet text,p_request_id uuid,p_id uuid)
returns text language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows; f public.campuscrew_booking_evidence;
begin
 -- Same lock order as upload and the completion-intent trigger.
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or e.provider is distinct from p_wallet then raise exception 'Only the selected provider can remove their unsubmitted attachment';end if;
 select * into f from public.campuscrew_booking_evidence where id=p_id and request_id=p_request_id and uploader=p_wallet for update;
 if not found then raise exception 'Attachment unavailable';end if;
 if f.removed_at is not null then return f.object_path;end if;
 if e.chain_state is distinct from 'Funded' or public.campuscrew_evidence_submission_pending(p_request_id) then raise exception 'Evidence is locked after completion approval starts or while a dispute is open';end if;
 update public.campuscrew_booking_evidence set removed_at=now() where id=p_id;
 insert into public.campuscrew_booking_events(request_id,event_key,label) values(p_request_id,'evidence-removed:'||p_id,'Provider removed an unsubmitted attachment') on conflict(event_key) do nothing;
 return f.object_path;
end; $$;

create or replace function public.campuscrew_experience_review_gate() returns trigger language plpgsql set search_path='' as $$
begin
 if new.operation='submit' then
   perform 1 from public.campuscrew_stellar_escrows where request_id=new.request_id for update;
   if new.status in('prepared','submitted') and (select evidence_required from public.campuscrew_stellar_tasks where id=new.request_id)
     and not exists(select 1 from public.campuscrew_booking_evidence f join public.campuscrew_stellar_escrows e on e.request_id=f.request_id where f.request_id=new.request_id and f.uploader=e.provider and f.removed_at is null)
     then raise exception 'This task requires completion evidence. Upload a photo or document first';end if;
 end if;
 return new;
end; $$;
revoke execute on function public.campuscrew_evidence_submission_pending(uuid),public.campuscrew_remove_evidence(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.campuscrew_evidence_submission_pending(uuid),public.campuscrew_remove_evidence(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
