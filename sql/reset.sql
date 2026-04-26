begin;

-- Remove bucket objects first so the bucket can be dropped cleanly.
delete from storage.objects where bucket_id = 'catblog-images';
delete from storage.buckets where id = 'catblog-images';

drop trigger if exists post_images_set_updated_at on post_images;
drop trigger if exists posts_set_updated_at on posts;
drop trigger if exists cats_set_updated_at on cats;

drop table if exists post_images;
drop table if exists posts;
drop table if exists cats;

drop function if exists set_updated_at_timestamp();

commit;
