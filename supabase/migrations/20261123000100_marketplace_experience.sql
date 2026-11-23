begin;
alter table public.campuscrew_stellar_profiles add column public_id uuid not null default gen_random_uuid() unique;
alter table public.campuscrew_stellar_tasks add column evidence_required boolean not null default false;

create table public.campuscrew_notifications (
 id uuid primary key default gen_random_uuid(), wallet text not null references public.campuscrew_stellar_profiles(wallet),
 event_key text not null, request_id uuid references public.campuscrew_stellar_tasks(id), title text not null,
 created_at timestamptz not null default now(), read_at timestamptz, push_sent_at timestamptz,
 push_attempts integer not null default 0, push_claimed_at timestamptz,
 unique(wallet,event_key)
);
create index campuscrew_notifications_recipient on public.campuscrew_notifications(wallet,created_at desc);
create table public.campuscrew_booking_events (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.campuscrew_stellar_bookings(request_id),
 event_key text not null unique, label text not null, created_at timestamptz not null default now()
);
create table public.campuscrew_booking_messages (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.campuscrew_stellar_bookings(request_id),
 sender text not null references public.campuscrew_stellar_profiles(wallet), body text not null check(char_length(body) between 1 and 2000),
 client_id uuid not null, created_at timestamptz not null default now(), unique(sender,client_id)
);
create index campuscrew_messages_booking on public.campuscrew_booking_messages(request_id,created_at);
create table public.campuscrew_booking_evidence (
 id uuid primary key, request_id uuid not null references public.campuscrew_stellar_bookings(request_id),
 uploader text not null references public.campuscrew_stellar_profiles(wallet), name text not null check(char_length(name) between 1 and 120),
 object_path text not null unique, mime text not null check(mime in ('image/jpeg','image/png','image/webp','application/pdf')),
 bytes integer not null check(bytes between 1 and 5242880), created_at timestamptz not null default now()
);
create table public.campuscrew_reviews (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.campuscrew_stellar_bookings(request_id),
 reviewer text not null references public.campuscrew_stellar_profiles(wallet), reviewee text not null references public.campuscrew_stellar_profiles(wallet),
 stars integer not null check(stars between 1 and 5), comment text not null default '' check(char_length(comment)<=1000),
 network text not null default 'stellar-testnet' check(network='stellar-testnet'), created_at timestamptz not null default now(),
 unique(request_id,reviewer), check(reviewer<>reviewee)
);
create index campuscrew_reviews_recipient on public.campuscrew_reviews(reviewee,created_at desc);
create table public.campuscrew_push_subscriptions (
 endpoint text primary key, wallet text not null references public.campuscrew_stellar_profiles(wallet),
 subscription jsonb not null, created_at timestamptz not null default now()
);

create function public.campuscrew_experience_participant(p_wallet text,p_request_id uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.campuscrew_stellar_bookings b
 join public.campuscrew_stellar_tasks t on t.id=b.request_id
 join public.campuscrew_stellar_applications a on a.id=b.application_id
 where b.request_id=p_request_id and p_wallet in(t.requester_wallet,a.provider_wallet));
$$;
create function public.campuscrew_experience_notify(p_wallet text,p_key text,p_request_id uuid,p_title text)
returns void language sql set search_path='' as $$
 insert into public.campuscrew_notifications(wallet,event_key,request_id,title) values(p_wallet,p_key,p_request_id,p_title)
 on conflict(wallet,event_key) do nothing;
$$;
create function public.campuscrew_experience_event(p_request_id uuid,p_key text,p_label text)
returns void language plpgsql set search_path='' as $$
declare owner_wallet text; provider_wallet text;
begin
 select t.requester_wallet,a.provider_wallet into owner_wallet,provider_wallet from public.campuscrew_stellar_bookings b
 join public.campuscrew_stellar_tasks t on t.id=b.request_id join public.campuscrew_stellar_applications a on a.id=b.application_id
 where b.request_id=p_request_id;
 if owner_wallet is null then return; end if;
 insert into public.campuscrew_booking_events(request_id,event_key,label) values(p_request_id,p_key,p_label) on conflict(event_key) do nothing;
 perform public.campuscrew_experience_notify(owner_wallet,p_key,p_request_id,p_label);
 perform public.campuscrew_experience_notify(provider_wallet,p_key,p_request_id,p_label);
end; $$;
create function public.campuscrew_experience_application_event() returns trigger language plpgsql set search_path='' as $$
declare owner_wallet text;
begin
 select requester_wallet into owner_wallet from public.campuscrew_stellar_tasks where id=new.request_id;
 perform public.campuscrew_experience_notify(owner_wallet,'application:'||new.id,new.request_id,'New application for your task');
 return new;
end; $$;
create trigger campuscrew_application_notice after insert on public.campuscrew_stellar_applications for each row execute function public.campuscrew_experience_application_event();
create function public.campuscrew_experience_booking_event() returns trigger language plpgsql set search_path='' as $$
begin
 perform public.campuscrew_experience_event(new.request_id,'selected:'||new.request_id,'Provider selected ? review your booking');return new;
end; $$;
create trigger campuscrew_selection_notice after insert on public.campuscrew_stellar_bookings for each row execute function public.campuscrew_experience_booking_event();
create function public.campuscrew_experience_payment_event() returns trigger language plpgsql set search_path='' as $$
declare label text;
begin
 if new.chain_state is null or new.chain_state is not distinct from old.chain_state then return new;end if;
 label:=case new.chain_state when 'Proposed' then 'Escrow created ? provider can accept' when 'Funding' then 'Provider accepted ? ready to fund'
 when 'Funded' then 'Payment secured ? work can start' when 'Submitted' then 'Work submitted ? review completion'
 when 'Paid' then 'Payment released ? booking paid' when 'Disputed' then 'Dispute opened ? payout paused'
 when 'Refundable' then 'Booking cancelled or resolved ? check refund availability' else 'Booking updated' end;
 perform public.campuscrew_experience_event(new.request_id,'chain:'||new.request_id||':'||new.chain_state,label);
 return new;
end; $$;
create trigger campuscrew_payment_notice after update on public.campuscrew_stellar_escrows for each row execute function public.campuscrew_experience_payment_event();
create function public.campuscrew_experience_message(p_wallet text,p_request_id uuid,p_body text,p_client_id uuid)
returns void language plpgsql set search_path='' as $$
declare message_id uuid; recipient text;
begin
 if not public.campuscrew_experience_participant(p_wallet,p_request_id) then raise exception 'This booking is private';end if;
 if (select count(*) from public.campuscrew_booking_messages where sender=p_wallet and created_at>now()-interval '1 minute')>=20 then raise exception 'Wait a moment before sending another message';end if;
 insert into public.campuscrew_booking_messages(request_id,sender,body,client_id) values(p_request_id,p_wallet,trim(p_body),p_client_id)
 on conflict(sender,client_id) do nothing returning id into message_id;
 if message_id is not null then
 select case when t.requester_wallet=p_wallet then a.provider_wallet else t.requester_wallet end into recipient
 from public.campuscrew_stellar_bookings b join public.campuscrew_stellar_tasks t on t.id=b.request_id
 join public.campuscrew_stellar_applications a on a.id=b.application_id where b.request_id=p_request_id;
 perform public.campuscrew_experience_notify(recipient,'message:'||message_id,p_request_id,'New message in your booking');end if;
end; $$;
create function public.campuscrew_experience_review(p_wallet text,p_request_id uuid,p_stars integer,p_comment text)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or p_wallet not in(e.organizer,e.provider) then raise exception 'This booking is private';end if;
 if e.chain_state<>'Paid' or e.settlement_tx is null then raise exception 'Reviews open after confirmed payout';end if;
 insert into public.campuscrew_reviews(request_id,reviewer,reviewee,stars,comment)
 values(p_request_id,p_wallet,case when p_wallet=e.organizer then e.provider else e.organizer end,p_stars,trim(p_comment));
end; $$;
-- Public feedback stays hidden until both people respond or the 14-day window closes.
create function public.campuscrew_experience_review_visible(p_request_id uuid,p_created_at timestamptz)
returns boolean language sql stable set search_path='' as $$
 select (select count(*) from public.campuscrew_reviews where request_id=p_request_id)=2
 or p_created_at<=now()-interval '14 days';
$$;
-- Evidence is optional unless the task requires it. Only the selected provider can upload it before submission.
create function public.campuscrew_experience_evidence(p_wallet text,p_request_id uuid,p_id uuid,p_name text,p_path text,p_mime text,p_bytes integer)
returns void language plpgsql set search_path='' as $$
begin
 perform 1 from public.campuscrew_stellar_escrows where request_id=p_request_id and provider=p_wallet and chain_state='Funded' for update;
 if not found then raise exception 'Upload evidence as the selected provider before submitting completion';end if;
 if (select count(*) from public.campuscrew_booking_evidence where request_id=p_request_id)>=3 then raise exception 'Up to three evidence files per booking';end if;
 insert into public.campuscrew_booking_evidence(id,request_id,uploader,name,object_path,mime,bytes)
 values(p_id,p_request_id,p_wallet,p_name,p_path,p_mime,p_bytes);
end; $$;
create function public.campuscrew_experience_review_gate() returns trigger language plpgsql set search_path='' as $$
begin
 if new.operation='submit' and (select evidence_required from public.campuscrew_stellar_tasks where id=new.request_id)
 and not exists(select 1 from public.campuscrew_booking_evidence where request_id=new.request_id) then raise exception 'This task requires completion evidence. Upload a photo or document first';end if;
 return new;
end; $$;
create trigger campuscrew_completion_evidence before insert or update on public.campuscrew_stellar_payment_intents for each row execute function public.campuscrew_experience_review_gate();

do $$ declare tab text; f record;begin
 foreach tab in array array['campuscrew_notifications','campuscrew_booking_events','campuscrew_booking_messages','campuscrew_booking_evidence','campuscrew_reviews','campuscrew_push_subscriptions'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public, anon, authenticated',tab);
 execute format('grant select,insert,update,delete on public.%I to service_role',tab);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'campuscrew_experience_%' loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('campuscrew-evidence','campuscrew-evidence',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
