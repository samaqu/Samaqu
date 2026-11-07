-- Verifikasi URL video hero sudah memakai Worker R2.

select id, video_url
from public.hero_content
where id = 1;
