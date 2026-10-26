-- 20261026_web_analytics_detail.sql
--
-- Detail tambahan untuk halaman /ops/trafik (referrer, negara/kota, browser, OS, UTM).
-- Jalankan SEKALI setelah 20261026_web_analytics.sql.
--
-- Catatan: setelah kolom baru ini dipakai middleware, jalankan file ini SEBELUM deploy
-- berikutnya — kalau tidak, insert kunjungan akan ditolak (kolom belum ada).

alter table public.web_visits
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists language text;

create index if not exists web_visits_day_referrer_idx on public.web_visits (day, referrer_host);
create index if not exists web_visits_day_country_idx on public.web_visits (day, country);
create index if not exists web_visits_day_browser_idx on public.web_visits (day, browser);
create index if not exists web_visits_day_os_idx on public.web_visits (day, os);

/**
 * Rincian satu dimensi (halaman, referrer, negara, kota, perangkat, browser, OS, UTM).
 * Dimensi dibatasi whitelist — tidak ada input bebas masuk ke SQL.
 */
create or replace function public.samaqu_web_breakdown(
  p_since date,
  p_until date,
  p_dimension text,
  p_limit integer default 10
)
returns table (value text, pageviews bigint, visitors bigint)
language plpgsql
stable
as $$
declare
  col text;
begin
  col := case p_dimension
    when 'path' then 'path'
    when 'referrer' then 'referrer_host'
    when 'country' then 'country'
    when 'region' then 'region'
    when 'city' then 'city'
    when 'device' then 'device'
    when 'browser' then 'browser'
    when 'os' then 'os'
    when 'utm_source' then 'utm_source'
    when 'utm_medium' then 'utm_medium'
    when 'utm_campaign' then 'utm_campaign'
    when 'language' then 'language'
    else null
  end;

  if col is null then
    raise exception 'dimensi tidak dikenal: %', p_dimension;
  end if;

  return query execute format(
    'select coalesce(%I, ''(tidak diketahui)'') as value,
            count(*)::bigint as pageviews,
            count(distinct visitor_hash)::bigint as visitors
       from public.web_visits
      where day >= $1 and day <= $2
      group by 1
      order by count(*) desc
      limit $3',
    col
  ) using p_since, p_until, greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

/** Sebaran per jam (WIB) untuk satu hari — dipakai grafik "jam sibuk". */
create or replace function public.samaqu_web_hourly(p_day date)
returns table (hour integer, pageviews bigint, visitors bigint)
language sql
stable
as $$
  select extract(hour from v.visited_at at time zone 'Asia/Jakarta')::integer as hour,
         count(*)::bigint as pageviews,
         count(distinct v.visitor_hash)::bigint as visitors
  from public.web_visits v
  where v.day = p_day
  group by 1
  order by 1;
$$;

revoke all on function public.samaqu_web_breakdown(date, date, text, integer) from public, anon, authenticated;
revoke all on function public.samaqu_web_hourly(date) from public, anon, authenticated;
grant execute on function public.samaqu_web_breakdown(date, date, text, integer) to service_role;
grant execute on function public.samaqu_web_hourly(date) to service_role;
