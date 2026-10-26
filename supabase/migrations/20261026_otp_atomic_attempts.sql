-- Tambah percobaan OTP secara atomik.
--
-- Sebelumnya aplikasi membaca `attempts`, menambah 1 di aplikasi, lalu menulis kembali.
-- Dua permintaan paralel bisa sama-sama membaca nilai yang sama sehingga batas 5 percobaan
-- terlewati. Fungsi ini menaikkan attempts dalam satu UPDATE dan mengembalikan nilai terbaru.

create or replace function public.samaqu_otp_bump_attempts(p_id uuid, p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  update public.password_reset_otp
     set attempts = attempts + 1
   where id = p_id
     and attempts < p_max
  returning attempts into v_attempts;

  return coalesce(v_attempts, p_max);
end;
$$;

revoke all on function public.samaqu_otp_bump_attempts(uuid, integer) from public, anon, authenticated;
grant execute on function public.samaqu_otp_bump_attempts(uuid, integer) to service_role;
