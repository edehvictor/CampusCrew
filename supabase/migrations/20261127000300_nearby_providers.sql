begin;

-- One current, coarse location per provider. No exact GPS or location history.
create table public.campuscrew_provider_locations (
  wallet text primary key references public.campuscrew_stellar_profiles(wallet) on delete cascade,
  latitude_grid numeric(5,2) not null check (latitude_grid between -90 and 90),
  longitude_grid numeric(5,2) not null check (longitude_grid between -180 and 180),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index campuscrew_provider_location_expiry on public.campuscrew_provider_locations(expires_at);
create table public.campuscrew_nearby_search_limits (
  wallet text primary key references public.campuscrew_stellar_profiles(wallet) on delete cascade,
  last_searched_at timestamptz not null
);
alter table public.campuscrew_provider_locations enable row level security;
alter table public.campuscrew_nearby_search_limits enable row level security;
revoke all on public.campuscrew_provider_locations, public.campuscrew_nearby_search_limits from public, anon, authenticated;
grant select,insert,update,delete on public.campuscrew_provider_locations, public.campuscrew_nearby_search_limits to service_role;

create function public.campuscrew_nearby_publish(p_wallet text,p_lat double precision,p_lng double precision,p_accuracy double precision)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_accuracy not between 0 and 1500 then
    raise exception 'Your location estimate is unavailable or too broad. Try on a phone, or browse by area.';
  end if;
  perform 1 from public.campuscrew_stellar_profiles where wallet=p_wallet and cardinality(skills)>0
    and (coverage && array['On campus','Around Nsukka']) for update;
  if not found then raise exception 'Add a local service and coverage area to your profile first.'; end if;
  insert into public.campuscrew_provider_locations(wallet,latitude_grid,longitude_grid,updated_at,expires_at)
    values(p_wallet,round(p_lat::numeric,2),round(p_lng::numeric,2),now(),now()+interval '30 minutes')
    on conflict(wallet) do update set latitude_grid=excluded.latitude_grid,longitude_grid=excluded.longitude_grid,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
  select jsonb_build_object('sharing',true,'updatedAt',updated_at,'expiresAt',expires_at) into result
    from public.campuscrew_provider_locations where wallet=p_wallet;
  return result;
end; $$;

create function public.campuscrew_nearby_search(p_wallet text,p_lat double precision,p_lng double precision,p_radius integer,p_category text default null)
returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_radius is null or p_radius not in(1,3,5,10,20) then raise exception 'Choose a valid location and distance.';end if;
  if p_category is not null and p_category not in('Cleaning','Hair & beauty','Tutoring','Repairs','Tech & design','Errands') then raise exception 'Choose a valid service.';end if;
  perform 1 from public.campuscrew_stellar_profiles where wallet=p_wallet for update;
  if not found then raise exception 'Complete your CampusCrew profile to find nearby help.';end if;
  if exists(select 1 from public.campuscrew_nearby_search_limits where wallet=p_wallet and last_searched_at>now()-interval '2 seconds') then
    raise exception 'Please wait a moment before searching again.';
  end if;
  insert into public.campuscrew_nearby_search_limits values(p_wallet,now()) on conflict(wallet) do update set last_searched_at=excluded.last_searched_at;
  -- Search origins are coarsened too, and are never stored. Distances are bands,
  -- not GPS coordinates, directions, arrival times or identity verification.
  select coalesce(jsonb_agg(item order by band,display_name,public_id),'[]'::jsonb) into result from (
    select p.display_name,p.public_id, d.band,
      (public.campuscrew_experience_profiles(p.public_id)->0) || jsonb_build_object('distanceKm',d.band,'locationUpdatedAt',l.updated_at,'locationExpiresAt',l.expires_at) item
    from public.campuscrew_provider_locations l
    join public.campuscrew_stellar_profiles p on p.wallet=l.wallet
    cross join lateral (select greatest(1,ceil(6371 * 2 * asin(sqrt(least(1.0,greatest(0.0,
      power(sin(radians(l.latitude_grid::double precision-round(p_lat::numeric,2)::double precision)/2),2)
      +cos(radians(round(p_lat::numeric,2)::double precision))*cos(radians(l.latitude_grid::double precision))
      *power(sin(radians(l.longitude_grid::double precision-round(p_lng::numeric,2)::double precision)/2),2)
    ))))))::integer band) d
    where l.expires_at>now() and p.wallet<>p_wallet and cardinality(p.skills)>0
      and (p.coverage && array['On campus','Around Nsukka'])
      and (p_category is null or p_category=any(p.skills)) and d.band<=p_radius
    order by d.band,p.display_name,p.public_id limit 50
  ) found;
  return result;
end; $$;
revoke execute on function public.campuscrew_nearby_publish(text,double precision,double precision,double precision),public.campuscrew_nearby_search(text,double precision,double precision,integer,text) from public,anon,authenticated;
grant execute on function public.campuscrew_nearby_publish(text,double precision,double precision,double precision),public.campuscrew_nearby_search(text,double precision,double precision,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
