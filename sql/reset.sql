begin;

-- Remove bucket objects first so the bucket can be dropped cleanly.
delete from storage.objects where bucket_id like 'catblog%';
delete from storage.buckets where id like 'catblog%';

drop trigger if exists post_images_set_updated_at on post_images;
drop trigger if exists posts_set_updated_at on posts;
drop trigger if exists cats_set_updated_at on cats;
drop trigger if exists site_settings_set_updated_at on site_settings;

drop table if exists post_images;
drop table if exists posts;
drop table if exists cats;
drop table if exists site_settings;

drop function if exists ensure_cat_storage_bucket();
drop function if exists cat_bucket_id(text);
drop function if exists set_updated_at_timestamp();

commit;
