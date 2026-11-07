-- Rollback: kembalikan URL hero ke nilai Cloudinary lama.

update public.hero_content
set video_url = 'https://res.cloudinary.com/kq5d3al5/video/upload/v1791866370/KONTEN_VIDEO_WEBSITE.mp4'
where id = 1;
