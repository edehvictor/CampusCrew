begin;
alter table public.campuscrew_stellar_escrows add column settled_at timestamptz;
update public.campuscrew_stellar_escrows set settled_at=now() where chain_state='Paid';
create function public.campuscrew_experience_settled_at() returns trigger language plpgsql set search_path='' as $$
begin if new.chain_state='Paid' and old.chain_state is distinct from 'Paid' then new.settled_at:=now();end if;return new;end; $$;
create trigger campuscrew_settlement_time before update on public.campuscrew_stellar_escrows for each row execute function public.campuscrew_experience_settled_at();
create or replace function public.campuscrew_experience_review_visible(p_request_id uuid,p_created_at timestamptz)
returns boolean language sql stable set search_path='' as $$
 select (select count(*) from public.campuscrew_reviews where request_id=p_request_id)=2
 or exists(select 1 from public.campuscrew_stellar_escrows where request_id=p_request_id and settled_at<=now()-interval '14 days');
$$;
create or replace function public.campuscrew_experience_review(p_wallet text,p_request_id uuid,p_stars integer,p_comment text)
returns void language plpgsql set search_path='' as $$
declare e public.campuscrew_stellar_escrows;
begin
 select * into e from public.campuscrew_stellar_escrows where request_id=p_request_id for update;
 if not found or p_wallet not in(e.organizer,e.provider) then raise exception 'This booking is private';end if;
 if e.chain_state<>'Paid' or e.settlement_tx is null then raise exception 'Reviews open after confirmed payout';end if;
 if e.settled_at is null or e.settled_at<now()-interval '14 days' then raise exception 'The review window has closed';end if;
 insert into public.campuscrew_reviews(request_id,reviewer,reviewee,stars,comment)
 values(p_request_id,p_wallet,case when p_wallet=e.organizer then e.provider else e.organizer end,p_stars,trim(p_comment));
end; $$;
create function public.campuscrew_experience_profiles(p_id uuid default null) returns jsonb language sql stable set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',p.public_id,'name',p.display_name,'area',p.area,'bio',p.bio,'skills',p.skills,'coverage',p.coverage,
'stats',jsonb_build_object('completed',(select count(*) from public.campuscrew_stellar_escrows e where e.provider=p.wallet and e.chain_state='Paid' and e.settlement_tx is not null),
'clients',(select count(distinct organizer) from public.campuscrew_stellar_escrows e where e.provider=p.wallet and e.chain_state='Paid' and e.settlement_tx is not null),
'repeatClients',(select count(*) from(select organizer from public.campuscrew_stellar_escrows e where e.provider=p.wallet and e.chain_state='Paid' and e.settlement_tx is not null group by organizer having count(*)>1) r),
'rating',(select round(avg(stars),1) from public.campuscrew_reviews r join public.campuscrew_stellar_escrows e on e.request_id=r.request_id where r.reviewee=p.wallet and r.reviewer=e.organizer and public.campuscrew_experience_review_visible(r.request_id,r.created_at)),
'reviewCount',(select count(*) from public.campuscrew_reviews r join public.campuscrew_stellar_escrows e on e.request_id=r.request_id where r.reviewee=p.wallet and r.reviewer=e.organizer and public.campuscrew_experience_review_visible(r.request_id,r.created_at))),
'reviews',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'stars',r.stars,'comment',r.comment,'createdAt',r.created_at)),'[]'::jsonb)
from public.campuscrew_reviews r join public.campuscrew_stellar_escrows e on e.request_id=r.request_id where r.reviewee=p.wallet and r.reviewer=e.organizer and public.campuscrew_experience_review_visible(r.request_id,r.created_at))
)),'[]'::jsonb) from(select * from public.campuscrew_stellar_profiles where (p_id is null and cardinality(skills)>0) or public_id=p_id order by display_name,public_id limit 100) p;
$$;
revoke execute on function public.campuscrew_experience_profiles(uuid),public.campuscrew_experience_settled_at() from public,anon,authenticated;
grant execute on function public.campuscrew_experience_profiles(uuid),public.campuscrew_experience_settled_at() to service_role;
notify pgrst,'reload schema';commit;
