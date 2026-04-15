begin;

with seed_posts (title, slug, date, mood, body) as (
  values
    (
      'Why I Keep Trying To Eat Cardboard (A Pica Manifesto)',
      'why-i-keep-trying-to-eat-cardboard-a-pica-manifesto',
      date '2026-03-26',
      'Unhinged',
      'My name is Java, and I have pica. The shipping box looked at me and I took that personally.
Human replaced my cardboard ambitions with safe chew toys. I respect this choice, but only academically.
I will continue conducting taste audits on paper products for the sake of science.'
    ),
    (
      'Why 4 A.M. Zoomies Are Essential Product Strategy',
      'why-4-am-zoomies-are-essential-product-strategy',
      date '2026-03-12',
      'Mischief',
      'Human says I have "too much energy." Incorrect. I am a visionary with a time-boxed execution window.
At exactly 4:03 a.m., I sprint hallway-to-hallway, perform a high-stakes couch launch, and briefly scream into the void.
This is not chaos. This is agile delivery with no standup and perfect velocity.'
    ),
    (
      'I Sat On The Keyboard And Accidentally Wrote Poetry',
      'i-sat-on-the-keyboard-and-accidentally-wrote-poetry',
      date '2026-03-16',
      'Dramatic',
      'Today I stepped onto the glowing rectangle and produced: qqqqq;;;\\/////AAAA.
Human called it "gibberish." I call it modernist minimalism.
A true artist does not explain the work, then immediately asks for tuna.'
    ),
    (
      'Window Watch: A Comprehensive Bird Market Analysis',
      'window-watch-a-comprehensive-bird-market-analysis',
      date '2026-03-20',
      'Analytical',
      'I observed twelve birds, one squirrel, and a suspicious leaf with confidence problems.
Key insight: birds remain overvalued and difficult to acquire, despite strong chatter.
I recommend continued investment in chirp-monitoring from the sun patch near the ficus.'
    ),
    (
      'How To Pretend You Are Starving (Even After Lunch)',
      'how-to-pretend-you-are-starving-even-after-lunch',
      date '2026-03-22',
      'Entrepreneurial',
      'Step one: make direct eye contact with bowl.
Step two: emit one tiny meow suggesting historical injustice.
Step three: if denied, roll onto side and display fluffy tummy for emotional leverage.
Works 83% of the time. 100% if guests are present.'
    )
), upserted_posts as (
  insert into posts (title, slug, date, mood, body)
  select title, slug, date, mood, body
  from seed_posts
  on conflict (slug) do update set
    title = excluded.title,
    date = excluded.date,
    mood = excluded.mood,
    body = excluded.body,
    updated_at = now()
  returning id, slug
)
delete from post_images
where post_id in (
  select id from upserted_posts
);

insert into post_images (post_id, storage_path, alt, caption, sort_order, is_cover)
select
  p.id,
  i.storage_path,
  i.alt,
  i.caption,
  i.sort_order,
  i.is_cover
from (
  values
    (
      'why-i-keep-trying-to-eat-cardboard-a-pica-manifesto',
      'java/cardboard-inspection.svg',
      'Java inspecting a cardboard box with suspicious intensity',
      'Box quality assurance in progress.',
      0,
      true
    ),
    (
      'why-i-keep-trying-to-eat-cardboard-a-pica-manifesto',
      'java/chew-toy-break.svg',
      'Java taking a break with a safe chew toy',
      'Compromise achieved: approved chew toy rotation.',
      1,
      false
    ),
    (
      'why-4-am-zoomies-are-essential-product-strategy',
      'java/zoomies-hallway.svg',
      'Java mid-zoomie in the hallway',
      '',
      0,
      true
    ),
    (
      'window-watch-a-comprehensive-bird-market-analysis',
      'java/window-watch.svg',
      'Java sitting by the window monitoring birds',
      'Surveillance station alpha is fully operational.',
      0,
      true
    )
) as i (slug, storage_path, alt, caption, sort_order, is_cover)
join posts p on p.slug = i.slug
on conflict (post_id, storage_path) do update set
  alt = excluded.alt,
  caption = excluded.caption,
  sort_order = excluded.sort_order,
  is_cover = excluded.is_cover,
  updated_at = now();

commit;
