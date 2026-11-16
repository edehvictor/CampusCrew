create table public.campuscrew_profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  wallet text not null unique check (wallet ~ '^0x[0-9a-f]{40}$'),
  identity_root text unique check (identity_root ~ '^0x[0-9a-f]{40}$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  area text not null check (area in ('On campus', 'Around Nsukka', 'Online')),
  skills text[] not null default '{}',
  coverage text[] not null default '{}',
  bio text not null default '' check (char_length(bio) <= 300),
  check (skills <@ array['Cleaning', 'Hair & beauty', 'Tutoring', 'Repairs', 'Tech & design', 'Errands']),
  check (coverage <@ array['On campus', 'Around Nsukka', 'Online']),
  check ((cardinality(skills) = 0) = (cardinality(coverage) = 0))
);

create table public.campuscrew_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.campuscrew_profiles(id),
  title text not null check (char_length(title) between 1 and 100),
  category text not null check (category in ('Cleaning', 'Hair & beauty', 'Tutoring', 'Repairs', 'Tech & design', 'Errands')),
  area text not null check (area in ('On campus', 'Around Nsukka', 'Online')),
  timing text not null check (char_length(timing) between 1 and 80),
  budget integer not null check (budget between 1 and 1000000000),
  scope text not null check (char_length(scope) between 1 and 750),
  created_at timestamptz not null default now()
);

create table public.campuscrew_applications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.campuscrew_requests(id),
  provider_id uuid not null references public.campuscrew_profiles(id),
  amount integer not null check (amount between 1 and 1000000000),
  availability text not null check (char_length(availability) between 1 and 80),
  note text not null check (char_length(note) between 1 and 750),
  created_at timestamptz not null default now(),
  unique (request_id, provider_id),
  unique (request_id, id)
);

create table public.campuscrew_bookings (
  request_id uuid primary key references public.campuscrew_requests(id),
  application_id uuid not null,
  foreign key (request_id, application_id) references public.campuscrew_applications(request_id, id),
  payer_wallet text not null check (payer_wallet ~ '^0x[0-9a-f]{40}$'),
  provider_wallet text not null check (provider_wallet ~ '^0x[0-9a-f]{40}$'),
  check (payer_wallet <> provider_wallet),
  escrow_address text not null check (escrow_address ~ '^0x[0-9a-f]{40}$'),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  amount_atomic text not null check (amount_atomic ~ '^[1-9][0-9]{0,77}$'),
  payment_state smallint not null default 0 check (payment_state between 0 and 3),
  completion text check (char_length(completion) between 1 and 750),
  refund_after bigint,
  funding_tx text check (funding_tx ~ '^0x[0-9a-f]{64}$'),
  settlement_tx text check (settlement_tx ~ '^0x[0-9a-f]{64}$')
);

create index campuscrew_requests_by_owner on public.campuscrew_requests(requester_id);
create index campuscrew_applications_by_provider on public.campuscrew_applications(provider_id);

alter table public.campuscrew_profiles enable row level security;
alter table public.campuscrew_requests enable row level security;
alter table public.campuscrew_applications enable row level security;
alter table public.campuscrew_bookings enable row level security;

revoke all on public.campuscrew_profiles, public.campuscrew_requests, public.campuscrew_applications, public.campuscrew_bookings from public, anon, authenticated;
grant select, insert, update on public.campuscrew_profiles, public.campuscrew_requests, public.campuscrew_applications, public.campuscrew_bookings to service_role;

create function public.campuscrew_apply(
  p_user_id uuid, p_request_id uuid, p_amount integer, p_availability text, p_note text
) returns void language plpgsql set search_path = '' as $$
declare
  req public.campuscrew_requests;
begin
  select * into req from public.campuscrew_requests where id = p_request_id for update;
  if not found or req.requester_id = p_user_id
     or exists (select 1 from public.campuscrew_bookings where request_id = p_request_id) then
    raise exception 'Request unavailable';
  end if;
  if not exists (
    select 1 from public.campuscrew_profiles
    where id = p_user_id and identity_root is not null
      and req.category = any(skills) and req.area = any(coverage)
  ) then
    raise exception 'Provider profile does not cover this request';
  end if;
  insert into public.campuscrew_applications(request_id, provider_id, amount, availability, note)
  values (p_request_id, p_user_id, p_amount, p_availability, p_note);
end;
$$;

create function public.campuscrew_select_provider(
  p_user_id uuid, p_request_id uuid, p_application_id uuid,
  p_escrow_address text, p_token_address text, p_decimals integer
) returns void language plpgsql set search_path = '' as $$
declare
  req public.campuscrew_requests;
  application public.campuscrew_applications;
  payer_wallet text;
  service_wallet text;
begin
  select * into req from public.campuscrew_requests where id = p_request_id for update;
  if not found or req.requester_id <> p_user_id then
    raise exception 'Request unavailable';
  end if;
  if exists (select 1 from public.campuscrew_bookings where request_id = p_request_id) then
    raise exception 'Provider already selected';
  end if;
  select * into application from public.campuscrew_applications
  where id = p_application_id and request_id = p_request_id;
  if not found then
    raise exception 'Application unavailable';
  end if;
  select wallet into payer_wallet from public.campuscrew_profiles where id = p_user_id and identity_root is not null;
  select wallet into service_wallet from public.campuscrew_profiles where id = application.provider_id and identity_root is not null;
  if payer_wallet is null or service_wallet is null or payer_wallet = service_wallet then
    raise exception 'Both participants need verified wallets';
  end if;
  insert into public.campuscrew_bookings(
    request_id, application_id, payer_wallet, provider_wallet, escrow_address, token_address, amount_atomic
  ) values (
    p_request_id, p_application_id, payer_wallet, service_wallet, p_escrow_address, p_token_address,
    (application.amount::numeric * pg_catalog.power(10::numeric, p_decimals))::numeric(78,0)::text
  );
end;
$$;

create function public.campuscrew_complete(
  p_user_id uuid, p_request_id uuid, p_completion text
) returns void language plpgsql set search_path = '' as $$
begin
  update public.campuscrew_bookings b
  set completion = p_completion
  from public.campuscrew_applications a
  where b.request_id = p_request_id and b.application_id = a.id
    and a.provider_id = p_user_id and b.payment_state = 1 and b.completion is null;
  if not found then
    raise exception 'Funded booking unavailable';
  end if;
end;
$$;

create function public.campuscrew_board(p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'category', r.category, 'area', r.area, 'timing', r.timing,
    'budget', r.budget, 'scope', r.scope, 'customer', poster.display_name,
    'own', coalesce(r.requester_id = p_user_id, false),
    'applicationCount', (select count(*) from public.campuscrew_applications where request_id = r.id),
    'accepted', case when r.requester_id = p_user_id or chosen.provider_id = p_user_id then b.application_id end,
    'status', case
      when b.request_id is null then 'Open'
      when b.payment_state = 3 then 'Refunded'
      when b.payment_state = 2 then 'Paid'
      when b.payment_state = 0 then 'Awaiting funding'
      when b.completion is not null then 'Ready for review'
      else 'Funded' end,
    'completion', case when r.requester_id = p_user_id or chosen.provider_id = p_user_id then b.completion end,
    'payment', case when r.requester_id = p_user_id or chosen.provider_id = p_user_id then jsonb_build_object(
      'fundingTx', b.funding_tx, 'settlementTx', b.settlement_tx, 'refundAfter', b.refund_after,
      'requesterRefundAvailable', b.refund_after <= extract(epoch from now())
    ) end,
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'provider', ap.display_name, 'own', a.provider_id = p_user_id,
        'amount', a.amount, 'availability', a.availability, 'note', a.note,
        'bio', ap.bio, 'skills', ap.skills, 'coverage', ap.coverage
      ) order by a.created_at)
      from public.campuscrew_applications a
      join public.campuscrew_profiles ap on ap.id = a.provider_id
      where a.request_id = r.id and (r.requester_id = p_user_id or a.provider_id = p_user_id)
    ), '[]'::jsonb)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.campuscrew_requests r
  join public.campuscrew_profiles poster on poster.id = r.requester_id
  left join public.campuscrew_bookings b on b.request_id = r.id
  left join public.campuscrew_applications chosen on chosen.id = b.application_id
  where b.request_id is null or r.requester_id = p_user_id
    or exists (select 1 from public.campuscrew_applications a where a.request_id = r.id and a.provider_id = p_user_id);
$$;

revoke execute on function public.campuscrew_apply(uuid,uuid,integer,text,text),
  public.campuscrew_select_provider(uuid,uuid,uuid,text,text,integer),
  public.campuscrew_complete(uuid,uuid,text), public.campuscrew_board(uuid)
  from public, anon, authenticated;
grant execute on function public.campuscrew_apply(uuid,uuid,integer,text,text),
  public.campuscrew_select_provider(uuid,uuid,uuid,text,text,integer),
  public.campuscrew_complete(uuid,uuid,text), public.campuscrew_board(uuid)
  to service_role;
