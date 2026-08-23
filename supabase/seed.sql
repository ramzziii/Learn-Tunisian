-- Learn Tunisian: seed data
-- Loaded from tunisian_arabic_DRAFT_chatgpt_v2_variants.xlsx ("Lesson Content"
-- tab). This is still an UNVERIFIED DRAFT, not final content:
--   - Rows highlighted red or orange in that spreadsheet are flagged there as
--     uncertain pending native-speaker review (roughly half the rows, plus
--     all 4 feminine daily-phrase forms) — many "notes" values below say
--     "verify" for exactly this reason. Swap in corrected data once reviewed.
--   - audio_filename values reference recordings that don't exist yet — every
--     word_variants.audio_path below is a placeholder path; the app handles
--     missing/unreachable audio gracefully until real files are uploaded to
--     the "audio" storage bucket at these exact paths.
-- Run this AFTER 0001_init.sql, 0002_profile_dob_country.sql, and
-- 0003_word_variants.sql.
--
-- Safe to re-run: deleting all units cascades through lessons, word_groups,
-- and word_variants (and any profile progress tied to them), so this fully
-- replaces whatever content was loaded before — including the earlier
-- Greetings/Family/Numbers placeholder set from the original schema.

delete from public.units;

-- Daily Phrases is sorted first (not last, despite lesson_number 8) so its
-- lesson — the one with a plain word, the "let's go" also_heard case, and
-- the masculine/feminine pairs all in one place — is immediately unlocked
-- for testing, rather than gated behind completing 4 other lessons first.
-- Reorder once real content arrives and this stops being the structural
-- test case.
insert into public.units (name, sort_order) values
  ('Daily Phrases', 1),
  ('Colors', 2),
  ('Animals', 3),
  ('Food', 4),
  ('Body Parts', 5);

insert into public.lessons (unit_id, lesson_number, title, sort_order)
select id, v.lesson_number, v.unit_name, 1
from public.units u
join (values
  ('Colors', 4),
  ('Animals', 5),
  ('Food', 6),
  ('Body Parts', 7),
  ('Daily Phrases', 8)
) as v(unit_name, lesson_number) on u.name = v.unit_name;

-- ============================================================================
-- WORD GROUPS — one row per concept, id matches the spreadsheet's word_group_id
-- ============================================================================
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, u.id, v.lesson_number, v.english_meaning, v.image_keyword, v.sort_order from (values
  ('red', 'Colors', 4, 'red', 'red color', 1),
  ('blue', 'Colors', 4, 'blue', 'blue color', 2),
  ('yellow', 'Colors', 4, 'yellow', 'yellow color', 3),
  ('green', 'Colors', 4, 'green', 'green color', 4),
  ('orange', 'Colors', 4, 'orange', 'orange color', 5),
  ('black', 'Colors', 4, 'black', 'black color', 6),
  ('white', 'Colors', 4, 'white', 'white color', 7),
  ('pink', 'Colors', 4, 'pink', 'pink color', 8),
  ('purple', 'Colors', 4, 'purple', 'purple color', 9),
  ('brown', 'Colors', 4, 'brown', 'brown color', 10),
  ('cat', 'Animals', 5, 'cat', 'pet cat', 1),
  ('dog', 'Animals', 5, 'dog', 'pet dog', 2),
  ('bird', 'Animals', 5, 'bird', 'small bird', 3),
  ('fish', 'Animals', 5, 'fish', 'swimming fish', 4),
  ('horse', 'Animals', 5, 'horse', 'horse animal', 5),
  ('cow', 'Animals', 5, 'cow', 'cow animal', 6),
  ('sheep', 'Animals', 5, 'sheep', 'sheep animal', 7),
  ('chicken_animal', 'Animals', 5, 'chicken', 'live chicken', 8),
  ('rabbit', 'Animals', 5, 'rabbit', 'rabbit animal', 9),
  ('lion', 'Animals', 5, 'lion', 'lion animal', 10),
  ('bread', 'Food', 6, 'bread', 'loaf of bread', 1),
  ('water', 'Food', 6, 'water', 'glass of water', 2),
  ('milk', 'Food', 6, 'milk', 'glass of milk', 3),
  ('apple', 'Food', 6, 'apple', 'red apple', 4),
  ('banana', 'Food', 6, 'banana', 'yellow banana', 5),
  ('egg', 'Food', 6, 'egg', 'chicken egg', 6),
  ('rice', 'Food', 6, 'rice', 'bowl of rice', 7),
  ('chicken_food', 'Food', 6, 'chicken', 'cooked chicken', 8),
  ('cheese', 'Food', 6, 'cheese', 'cheese slice', 9),
  ('honey', 'Food', 6, 'honey', 'honey jar', 10),
  ('head', 'Body Parts', 7, 'head', 'human head', 1),
  ('hand', 'Body Parts', 7, 'hand', 'open hand', 2),
  ('foot', 'Body Parts', 7, 'foot', 'bare foot', 3),
  ('eye', 'Body Parts', 7, 'eye', 'human eye', 4),
  ('ear', 'Body Parts', 7, 'ear', 'human ear', 5),
  ('nose', 'Body Parts', 7, 'nose', 'human nose', 6),
  ('mouth', 'Body Parts', 7, 'mouth', 'open mouth', 7),
  ('hair', 'Body Parts', 7, 'hair', 'head hair', 8),
  ('tooth', 'Body Parts', 7, 'tooth', 'single tooth', 9),
  ('tummy', 'Body Parts', 7, 'tummy', 'child''s tummy', 10),
  ('im_hungry', 'Daily Phrases', 8, 'I''m hungry', 'hungry child', 1),
  ('im_thirsty', 'Daily Phrases', 8, 'I''m thirsty', 'thirsty child', 2),
  ('i_love_you', 'Daily Phrases', 8, 'I love you', 'parent hugging child', 3),
  ('good_morning', 'Daily Phrases', 8, 'good morning', 'morning greeting', 4),
  ('good_night', 'Daily Phrases', 8, 'good night', 'child bedtime', 5),
  ('im_happy', 'Daily Phrases', 8, 'I''m happy', 'happy child', 6),
  ('im_tired', 'Daily Phrases', 8, 'I''m tired', 'tired child', 7),
  ('letsgo', 'Daily Phrases', 8, 'let''s go', 'children walking', 8),
  ('more_please', 'Daily Phrases', 8, 'more please', 'child asking more', 9),
  ('all_done', 'Daily Phrases', 8, 'all done', 'empty plate', 10)
) as v(id, unit_name, lesson_number, english_meaning, image_keyword, sort_order)
join public.units u on u.name = v.unit_name;

-- ============================================================================
-- WORD VARIANTS — one row per way of saying a concept
-- ============================================================================
insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order)
values
  ('red', 'primary', 'أحمر', 'a7mer', 'colors/red.mp3', 'Common Tunisian form; masculine form.', 0),
  ('blue', 'primary', 'أزرق', 'azra9', 'colors/blue.mp3', 'Common Tunisian form; feminine agreement can be زرقا.', 0),
  ('yellow', 'primary', 'أصفر', 'asfar', 'colors/yellow.mp3', 'Common Tunisian form; masculine form.', 0),
  ('green', 'primary', 'أخضر', 'a5dher', 'colors/green.mp3', 'Common Tunisian form; masculine form.', 0),
  ('orange', 'primary', 'مشماشي', 'mechmechi', 'colors/orange.mp3', 'Tunisian-specific/common form; برتقالي is also used.', 0),
  ('black', 'primary', 'أكحل', 'ak7el', 'colors/black.mp3', 'Strongly Tunisian/common Derja form; feminine is كحلا.', 0),
  ('white', 'primary', 'أبيض', 'abyedh', 'colors/white.mp3', 'Common Tunisian form; feminine is بيضا.', 0),
  ('pink', 'primary', 'زهري', 'zahri', 'colors/pink.mp3', 'Common Tunisian form; وردي may also be heard.', 0),
  ('purple', 'primary', 'بنفسجي', 'banafsaji', 'colors/purple.mp3', 'Used in Tunisian, but خزامة/موف are also reported; verify preferred child vocabulary.', 0),
  ('brown', 'primary', 'بني', 'bonni', 'colors/brown.mp3', 'Common; قهوي is also used for brown in some contexts.', 0),
  ('cat', 'primary', 'قطوس', '9attous', 'animals/cat.mp3', 'Very common Tunisian Derja form; plural قطاطس.', 0),
  ('dog', 'primary', 'كلب', 'kelb', 'animals/dog.mp3', 'Common Tunisian form.', 0),
  ('bird', 'primary', 'عصفور', '3asfour', 'animals/bird.mp3', 'Common Tunisian word for bird.', 0),
  ('fish', 'primary', 'حوتة', '7outa', 'animals/fish.mp3', 'Common Tunisian form; حوت can also be used.', 0),
  ('horse', 'primary', 'حصان', '7san', 'animals/horse.mp3', 'Commonly understood Tunisian form; verify local preferred pronunciation/spelling.', 0),
  ('cow', 'primary', 'بقرة', 'ba9ra', 'animals/cow.mp3', 'Common Tunisian form.', 0),
  ('sheep', 'primary', 'خروف', '5rouf', 'animals/sheep.mp3', 'Common Tunisian form.', 0),
  ('chicken_animal', 'primary', 'دجاجة', 'djejja', 'animals/chicken_animal.mp3', 'Common form for a chicken; دجاج is the broader word for chicken/poultry.', 0),
  ('rabbit', 'primary', 'أرنب', 'arneb', 'animals/rabbit.mp3', 'Common Tunisian form.', 0),
  ('lion', 'primary', 'سبع', 'sba3', 'animals/lion.mp3', 'Common Tunisian colloquial term meaning lion; أسد is also understood but is more MSA/formal. Verify preferred form.', 0),
  ('bread', 'primary', 'خبز', 'khobz', 'food/bread.mp3', 'Common Tunisian form.', 0),
  ('water', 'primary', 'ما', 'ma', 'food/water.mp3', 'Very common Tunisian spoken form; ماء is the MSA spelling/form.', 0),
  ('milk', 'primary', 'حليب', '7lib', 'food/milk.mp3', 'Common Tunisian form.', 0),
  ('apple', 'primary', 'تفاح', 'tfa7', 'food/apple.mp3', 'Common Tunisian form.', 0),
  ('banana', 'primary', 'موز', 'mouz', 'food/banana.mp3', 'Common Tunisian form; بانان is also used.', 0),
  ('egg', 'primary', 'عظم', '3dham', 'food/egg.mp3', 'Tunisian usage uses عظم for an egg; this can look unusual to MSA speakers, so verify with native reviewer.', 0),
  ('rice', 'primary', 'روز', 'rouz', 'food/rice.mp3', 'Common Tunisian form.', 0),
  ('chicken_food', 'primary', 'دجاج', 'djej', 'food/chicken_food.mp3', 'Use for chicken as food/meat; لحم دجاج is more explicitly chicken meat.', 0),
  ('cheese', 'primary', 'جبن', 'jben', 'food/cheese.mp3', 'Common Tunisian form; جْبِن is a common spoken pronunciation.', 0),
  ('honey', 'primary', 'عسل', '3سل', 'food/honey.mp3', 'Common Tunisian form.', 0),
  ('head', 'primary', 'راس', 'ras', 'body_parts/head.mp3', 'Common Tunisian spoken form; رأس is the MSA spelling.', 0),
  ('hand', 'primary', 'يد', 'yed', 'body_parts/hand.mp3', 'Common Tunisian form; also used for hand/arm depending context.', 0),
  ('foot', 'primary', 'قدم', '9dem', 'body_parts/foot.mp3', 'Foot can also be expressed with ساق in Tunisian usage; verify preferred distinction between foot and leg.', 0),
  ('eye', 'primary', 'عين', '3in', 'body_parts/eye.mp3', 'Common Tunisian form.', 0),
  ('ear', 'primary', 'وذن', 'wedhen', 'body_parts/ear.mp3', 'Clearly Tunisian Derja; differs from the MSA form أذن.', 0),
  ('nose', 'primary', 'خشم', '5chem', 'body_parts/nose.mp3', 'Common Tunisian Derja; أنف is MSA/formal.', 0),
  ('mouth', 'primary', 'فم', 'fom', 'body_parts/mouth.mp3', 'Common Tunisian pronunciation; فم is also written in MSA.', 0),
  ('hair', 'primary', 'شعر', 'cha3r', 'body_parts/hair.mp3', 'Common Tunisian form.', 0),
  ('tooth', 'primary', 'سنّة', 'sinna', 'body_parts/tooth.mp3', 'Common Tunisian spoken form; plural سنّين.', 0),
  ('tummy', 'primary', 'كرش', 'kerch', 'body_parts/tummy.mp3', 'Informal/colloquial belly/tummy; verify whether a more child-friendly term is preferred.', 0),
  ('im_hungry', 'masculine', 'أنا جيعان', 'ena ji3an', 'daily_phrases/im_hungry_m.mp3', 'Masculine speaker form.', 2),
  ('im_hungry', 'feminine', 'أنا جيعانة', 'ena ji3ana', 'daily_phrases/im_hungry_f.mp3', 'Feminine form, derived from ChatGPT''s note on the original draft — unverified.', 3),
  ('im_thirsty', 'masculine', 'أنا عطشان', 'ena 3atshan', 'daily_phrases/im_thirsty_m.mp3', 'Masculine speaker form.', 2),
  ('im_thirsty', 'feminine', 'أنا عطشانة', 'ena 3atshana', 'daily_phrases/im_thirsty_f.mp3', 'Feminine form, derived from ChatGPT''s note on the original draft — unverified.', 3),
  ('i_love_you', 'primary', 'نحبك', 'n7ebbek', 'daily_phrases/i_love_you.mp3', 'Common Tunisian phrase; can be romantic or familial depending context.', 0),
  ('good_morning', 'primary', 'صباح الخير', 'sba7 el khir', 'daily_phrases/good_morning.mp3', 'Common Tunisian greeting.', 0),
  ('good_night', 'primary', 'تصبح على خير', 'tesba7 3la khir', 'daily_phrases/good_night.mp3', 'Common phrase; exact pronunciation varies with speaker/context.', 0),
  ('im_happy', 'masculine', 'أنا فرحان', 'ena far7an', 'daily_phrases/im_happy_m.mp3', 'Masculine speaker form.', 2),
  ('im_happy', 'feminine', 'أنا فرحانة', 'ena far7ana', 'daily_phrases/im_happy_f.mp3', 'Feminine form, derived from ChatGPT''s note on the original draft — unverified.', 3),
  ('im_tired', 'masculine', 'أنا تعبان', 'ena ta3ban', 'daily_phrases/im_tired_m.mp3', 'Masculine speaker form.', 2),
  ('im_tired', 'feminine', 'أنا تعبانة', 'ena ta3bana', 'daily_phrases/im_tired_f.mp3', 'Feminine form, derived from ChatGPT''s note on the original draft — unverified.', 3),
  ('letsgo', 'primary', 'يلا نمشيو', 'yalla nemchiw', 'daily_phrases/lets_go_primary.mp3', 'Very common colloquial expression.', 0),
  ('letsgo', 'also_heard', 'هيّا نمشيو', 'haya nemchiw', 'daily_phrases/lets_go_alt.mp3', 'Alternate way to say the same thing.', 1),
  ('more_please', 'primary', 'شوية أخرى، عيشك', 'chwaya okhra, 3aychek', 'daily_phrases/more_please.mp3', 'Natural way to ask for a little more, please; not a literal translation.', 0),
  ('all_done', 'primary', 'كملت', 'kamelt', 'daily_phrases/all_done.mp3', 'Means I finished / I''m finished; verify if all done for a child should use a different expression.', 0);
