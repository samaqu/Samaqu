-- Pulihkan video hero dari Cloudinary yang sudah 404 ke R2 Worker (path root).
-- Data saja; tidak ada perubahan skema.

update public.hero_content
set video_url = 'https://samaqu-media.samaqu.workers.dev/KONTEN%20VIDEO%20WEBSITE.mp4'
where id = 1;
