begin;

create extension if not exists pgcrypto;

create table if not exists cats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into cats (name, slug, description)
values (
  'Java',
  'java',
  'A brave and chaotic storyteller who turned every day into an adventure log.'
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  cat_id uuid not null references cats(id) on delete restrict,
  title text not null,
  slug text not null unique,
  date date not null,
  mood text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table posts
add column if not exists cat_id uuid;

update posts
set cat_id = (
  select id
  from cats
  where slug = 'java'
  limit 1
)
where cat_id is null;

alter table posts
alter column cat_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_cat_id_fkey'
  ) then
    alter table posts
    add constraint posts_cat_id_fkey
    foreign key (cat_id) references cats(id) on delete restrict;
  end if;
end;
$$;

create table if not exists post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  storage_path text not null,
  alt text,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, storage_path)
);

create index if not exists idx_cats_name on cats(name);
create index if not exists idx_posts_date on posts(date desc);
create index if not exists idx_posts_cat_date on posts(cat_id, date desc);
create index if not exists idx_post_images_post_id on post_images(post_id);
create index if not exists idx_post_images_sort_order on post_images(post_id, sort_order);
create unique index if not exists ux_post_images_cover_per_post
  on post_images(post_id)
  where is_cover;

create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on posts;
create trigger posts_set_updated_at
before update on posts
for each row
execute function set_updated_at_timestamp();

drop trigger if exists cats_set_updated_at on cats;
create trigger cats_set_updated_at
before update on cats
for each row
execute function set_updated_at_timestamp();

drop trigger if exists post_images_set_updated_at on post_images;
create trigger post_images_set_updated_at
before update on post_images
for each row
execute function set_updated_at_timestamp();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catblog-images',
  'catblog-images',
  true,
  10485760,
  array['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

commit;
