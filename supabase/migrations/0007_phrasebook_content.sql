-- Learn Tunisian: Phrasebook content — real, teachable phrases added to the
-- existing units -> lessons -> word_groups -> word_variants pipeline, not a
-- separate static content system. Each phrasebook category becomes one unit
-- + one lesson, exactly like the existing 5 curriculum units, so the exact
-- same exercise engine, spaced repetition, and mastery tracking apply.
--
-- is_curriculum distinguishes these from the sequential-unlock curriculum
-- map: phrasebook units default to false so app/home.tsx's lesson map (and
-- its lock/unlock progression) never shows them — they're reached through
-- the dedicated Phrasebook screens instead, launching the same
-- /lesson/[lessonId] session unchanged.
--
-- Content sourcing: English + transliteration for ~55 of these phrases were
-- transcribed directly from a real competitor app's published App Store
-- preview screenshots (categories: Greetings, First Encounters, Food,
-- Health, Help, Hotel, Transport, Shopping, "Local Expressions"). The
-- remaining phrases (a handful per category, and most of Emergencies, which
-- wasn't its own category in that source) are authored here to round things
-- out, kept simple and high-confidence.
--
-- Arabic script for every single phrase below is newly authored for this
-- migration — the source only ever showed transliteration. No native-speaker
-- review has happened, so every row gets native_verified = false, same as
-- every other word_variant in this app today (see 0006_content_verification.sql
-- and supabase/seed.sql's own "UNVERIFIED DRAFT" note). This is not a
-- regression in content quality, just staying honest the same way already.
--
-- audio_path values follow the same convention as seed.sql (a path inside
-- the "audio" storage bucket) so scripts/generate-placeholder-audio.sh can
-- produce placeholder TTS for these too — see that script's update in this
-- same change.
--
-- Run this AFTER 0001-0006 and after supabase/seed.sql.

alter table public.units add column is_curriculum boolean not null default true;

-- ============================================================================
-- GREETINGS
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Greetings', 100, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Greetings', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_greet_hello', 'Hello', 'waving hand', 1),
  ('pb_greet_peace', 'Peace be upon you', 'greeting handshake', 2),
  ('pb_greet_good_morning', 'Good morning', 'sunrise', 3),
  ('pb_greet_good_evening', 'Good evening', 'sunset', 4),
  ('pb_greet_how_are_you', 'How are you?', 'question mark', 5),
  ('pb_greet_im_fine', 'I am fine, thank you', 'smiling face', 6),
  ('pb_greet_thank_you', 'Thank you', 'gratitude hands', 7),
  ('pb_greet_goodbye', 'Goodbye', 'waving goodbye', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_greet_hello', 'primary', 'أعسلامة', '3aslema', 'greetings/pb_greet_hello.m4a', 'A casual, distinctly Tunisian hello — works any time of day.', 0),
  ('pb_greet_peace', 'primary', 'السلام عليكم', 'salaam 3likom', 'greetings/pb_greet_peace.m4a', 'A warmer, more formal greeting — common when entering a shop or meeting elders.', 0),
  ('pb_greet_good_morning', 'primary', 'صباح الخير', 'sbe7 el 5ir', 'greetings/pb_greet_good_morning.m4a', 'Said in the morning, replied to with the same phrase.', 0),
  ('pb_greet_good_evening', 'primary', 'مسا الخير', 'mse el 5ir', 'greetings/pb_greet_good_evening.m4a', 'Said from afternoon into the evening.', 0),
  ('pb_greet_how_are_you', 'primary', 'شنوة أحوالك؟', 'chnowa a7welek?', 'greetings/pb_greet_how_are_you.m4a', 'A natural follow-up right after greeting someone.', 0),
  ('pb_greet_im_fine', 'primary', 'لاباس، عيشك', 'labes, 3aychek', 'greetings/pb_greet_im_fine.m4a', 'The standard reply to "how are you?" — labes alone also works.', 0),
  ('pb_greet_thank_you', 'primary', 'عيشك', '3aychek', 'greetings/pb_greet_thank_you.m4a', 'The everyday way to say thanks, more common than the MSA shukran.', 0),
  ('pb_greet_goodbye', 'primary', 'بالسلامة', 'besslema', 'greetings/pb_greet_goodbye.m4a', 'A warm goodbye — literally wishing the other person safety.', 0);

-- ============================================================================
-- FIRST ENCOUNTERS
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('First Encounters', 101, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'First Encounters', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_first_whats_your_name', 'What is your name?', 'name tag', 1),
  ('pb_first_my_name_is', 'My name is...', 'name tag', 2),
  ('pb_first_nice_to_meet_you', 'Nice to meet you', 'handshake', 3),
  ('pb_first_where_are_you_from', 'Where are you from?', 'map pin', 4),
  ('pb_first_im_from', 'I am from...', 'map pin', 5),
  ('pb_first_do_you_speak_english', 'Do you speak English?', 'speech bubble', 6),
  ('pb_first_how_old_are_you', 'How old are you?', 'birthday cake', 7),
  ('pb_first_see_you_soon', 'See you soon', 'waving goodbye', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_first_whats_your_name', 'primary', 'شنوة إسمك؟', 'chnowa esmek?', 'first_encounters/pb_first_whats_your_name.m4a', 'A natural opener when meeting someone new.', 0),
  ('pb_first_my_name_is', 'primary', 'إسمي...', 'esmi...', 'first_encounters/pb_first_my_name_is.m4a', 'Follow with your name.', 0),
  ('pb_first_nice_to_meet_you', 'primary', 'فرصة سعيدة', 'forssa sa3ida', 'first_encounters/pb_first_nice_to_meet_you.m4a', 'Said right after introductions, same as in English.', 0),
  ('pb_first_where_are_you_from', 'primary', 'من وين إنتي؟', 'men win enti?', 'first_encounters/pb_first_where_are_you_from.m4a', 'Casual small-talk question — enti is said to a woman, enta to a man.', 0),
  ('pb_first_im_from', 'primary', 'أنا من...', 'ena men...', 'first_encounters/pb_first_im_from.m4a', 'Follow with your country or city.', 0),
  ('pb_first_do_you_speak_english', 'primary', 'تحكي انڤليزي؟', 'tehki inglizi?', 'first_encounters/pb_first_do_you_speak_english.m4a', 'Useful if you get stuck mid-conversation.', 0),
  ('pb_first_how_old_are_you', 'primary', 'قداش عندك في العمر؟', '9addech 3andek fel 3omr?', 'first_encounters/pb_first_how_old_are_you.m4a', 'Common in casual conversation, less so with strangers.', 0),
  ('pb_first_see_you_soon', 'primary', 'نشوفك قريب', 'nchoufek 9rib', 'first_encounters/pb_first_see_you_soon.m4a', 'A friendly way to end a first meeting.', 0);

-- ============================================================================
-- FOOD & DINING — deliberately a distinct name from the existing "Food"
-- curriculum unit (single-word vocabulary: bread, water, apple, ...) so
-- there's no ambiguity between the two in the data; this one is restaurant
-- phrases.
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Food & Dining', 102, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Food & Dining', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_food_want_coffee', 'I want a coffee', 'coffee cup', 1),
  ('pb_food_bottle_of_water', 'A bottle of water please', 'water bottle', 2),
  ('pb_food_delicious', 'The food is delicious', 'delicious meal', 3),
  ('pb_food_no_spicy', 'No spicy food', 'chili pepper crossed out', 4),
  ('pb_food_bill_please', 'The bill please', 'restaurant bill', 5),
  ('pb_food_what_recommend', 'What do you recommend?', 'menu', 6),
  ('pb_food_without_harissa', 'Without harissa please', 'chili paste crossed out', 7),
  ('pb_food_table_for_two', 'A table for two please', 'restaurant table', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_food_want_coffee', 'primary', 'نحب قهوة', 'n7eb 9ahwa', 'food_dining/pb_food_want_coffee.m4a', 'A simple, direct way to order at a café.', 0),
  ('pb_food_bottle_of_water', 'primary', 'دبوزة ماء بالله عليك', 'dabouza me bellehi', 'food_dining/pb_food_bottle_of_water.m4a', '"Dabouza" is the everyday Tunisian word for a bottle.', 0),
  ('pb_food_delicious', 'primary', 'الماكلة بنينة', 'el mekla bnina', 'food_dining/pb_food_delicious.m4a', 'A nice compliment to give your host or a server.', 0),
  ('pb_food_no_spicy', 'primary', 'ما نحبهاش حارة', 'ma n7ebhech 7arra', 'food_dining/pb_food_no_spicy.m4a', 'Worth knowing — Tunisian food often defaults to spicy.', 0),
  ('pb_food_bill_please', 'primary', 'الفاتورة بالله عليك', 'el facture bellehi', 'food_dining/pb_food_bill_please.m4a', 'Said at the end of a meal to ask for the check.', 0),
  ('pb_food_what_recommend', 'primary', 'شنوة تنصحني؟', 'chnowa tans7ni?', 'food_dining/pb_food_what_recommend.m4a', 'Good to ask a server when the menu is unfamiliar.', 0),
  ('pb_food_without_harissa', 'primary', 'من غير حريسة بالله عليك', 'men ghir harissa bellehi', 'food_dining/pb_food_without_harissa.m4a', 'Harissa (chili paste) is a default condiment in Tunisia — say this if you want it left out.', 0),
  ('pb_food_table_for_two', 'primary', 'طاولة لزوز بالله عليك', 'tawla le zouz bellehi', 'food_dining/pb_food_table_for_two.m4a', 'Said when arriving at a restaurant.', 0);

-- ============================================================================
-- HEALTH
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Health', 103, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Health', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_health_need_doctor', 'I need a doctor', 'doctor', 1),
  ('pb_health_feel_sick', 'I feel sick', 'sick face', 2),
  ('pb_health_wheres_pharmacy', 'Where is the pharmacy?', 'pharmacy cross', 3),
  ('pb_health_allergic', 'I am allergic to this', 'allergy warning', 4),
  ('pb_health_call_ambulance', 'Call an ambulance', 'ambulance', 5),
  ('pb_health_headache', 'I have a headache', 'headache', 6),
  ('pb_health_hurts_here', 'It hurts here', 'pain point', 7)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_health_need_doctor', 'primary', 'نحب طبيب', 'n7eb tbib', 'health/pb_health_need_doctor.m4a', 'A direct, urgent-sounding request — appropriate when you need one.', 0),
  ('pb_health_feel_sick', 'primary', 'حاسس روحي مريض', '7asses rou7i mridh', 'health/pb_health_feel_sick.m4a', 'A general "I feel unwell" — good opener before describing symptoms.', 0),
  ('pb_health_wheres_pharmacy', 'primary', 'وين الفارماسي؟', 'win el pharmacie?', 'health/pb_health_wheres_pharmacy.m4a', 'Pharmacies are common and well-marked in Tunisian towns.', 0),
  ('pb_health_allergic', 'primary', 'عندي أليرجي من هذا', '3andi allergie men hedha', 'health/pb_health_allergic.m4a', 'Important to know when ordering food or taking medicine.', 0),
  ('pb_health_call_ambulance', 'primary', 'عيط للأمبولانس', '3ayet lel ambulance', 'health/pb_health_call_ambulance.m4a', 'For a genuine emergency — "3ayet" means to call/shout for.', 0),
  ('pb_health_headache', 'primary', 'راسي يوجعني', 'rasi you3ejni', 'health/pb_health_headache.m4a', 'Literally "my head hurts me" — this pattern works for other body parts too.', 0),
  ('pb_health_hurts_here', 'primary', 'يوجعني هوني', 'you3ejni houni', 'health/pb_health_hurts_here.m4a', 'Useful alongside pointing, when describing pain to a doctor.', 0);

-- ============================================================================
-- HELP
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Help', 104, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Help', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_help_please', 'Please', 'polite request', 1),
  ('pb_help_excuse_me', 'Excuse me', 'polite tap on shoulder', 2),
  ('pb_help_can_you_help', 'Can you help me?', 'helping hand', 3),
  ('pb_help_speak_slowly', 'Speak slowly please', 'slow speech', 4),
  ('pb_help_repeat_please', 'Repeat please', 'repeat arrow', 5),
  ('pb_help_have_question', 'I have a question', 'question mark', 6),
  ('pb_help_no_problem', 'No problem', 'thumbs up', 7),
  ('pb_help_wheres_bathroom', 'Where is the bathroom?', 'restroom sign', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_help_please', 'primary', 'بالله عليك', 'bellehi', 'help/pb_help_please.m4a', 'The everyday, all-purpose "please" — attach it to almost any request.', 0),
  ('pb_help_excuse_me', 'primary', 'سامحني', 'sama7ni', 'help/pb_help_excuse_me.m4a', 'Use to get someone''s attention politely, or to apologize briefly.', 0),
  ('pb_help_can_you_help', 'primary', 'تنجم تعاونّي؟', 'tnajem t3awenni?', 'help/pb_help_can_you_help.m4a', 'A polite way to ask a stranger for assistance.', 0),
  ('pb_help_speak_slowly', 'primary', 'احكي بشوية بالله عليك', 'a7ki b chwaya bellehi', 'help/pb_help_speak_slowly.m4a', 'Very useful as a beginner — most people will happily slow down.', 0),
  ('pb_help_repeat_please', 'primary', 'عاود بالله عليك', '3awed bellehi', 'help/pb_help_repeat_please.m4a', 'Pairs well with "speak slowly please."', 0),
  ('pb_help_have_question', 'primary', 'عندي سؤال', '3andi sou2el', 'help/pb_help_have_question.m4a', 'A polite way to interrupt before asking something.', 0),
  ('pb_help_no_problem', 'primary', 'ما فمة حتى مشكل', 'ma fama 7atta mochkel', 'help/pb_help_no_problem.m4a', 'A relaxed, reassuring reply — "there is no problem at all."', 0),
  ('pb_help_wheres_bathroom', 'primary', 'وين التواليت؟', 'win el toilette?', 'help/pb_help_wheres_bathroom.m4a', 'A practical, frequently needed question.', 0);

-- ============================================================================
-- HOTEL
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Hotel', 105, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Hotel', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_hotel_have_reservation', 'I have a reservation', 'hotel booking', 1),
  ('pb_hotel_breakfast_included', 'Is breakfast included?', 'breakfast tray', 2),
  ('pb_hotel_room_key', 'The room key please', 'room key', 3),
  ('pb_hotel_no_hot_water', 'There is no hot water', 'shower', 4),
  ('pb_hotel_check_out_late', 'Can I check out late?', 'clock', 5),
  ('pb_hotel_need_towel', 'I need a towel', 'towel', 6),
  ('pb_hotel_have_wifi', 'Do you have wifi?', 'wifi signal', 7)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_hotel_have_reservation', 'primary', 'عندي ريزيرفاسيون', '3andi reservation', 'hotel/pb_hotel_have_reservation.m4a', 'Said when checking in.', 0),
  ('pb_hotel_breakfast_included', 'primary', 'الفطور موجود؟', 'el ftour mawjoud?', 'hotel/pb_hotel_breakfast_included.m4a', 'Worth confirming at check-in.', 0),
  ('pb_hotel_room_key', 'primary', 'مفتاح البيت بالله عليك', 'mefte7 el bit bellehi', 'hotel/pb_hotel_room_key.m4a', '"El bit" is the everyday Tunisian word for room.', 0),
  ('pb_hotel_no_hot_water', 'primary', 'ما فماش ماء سخون', 'ma famech me skhoun', 'hotel/pb_hotel_no_hot_water.m4a', 'Useful for reporting a room issue at the front desk.', 0),
  ('pb_hotel_check_out_late', 'primary', 'نجم نخرج متأخر؟', 'najjem nokhrej met2akher?', 'hotel/pb_hotel_check_out_late.m4a', 'Ask the front desk the night before if possible.', 0),
  ('pb_hotel_need_towel', 'primary', 'نحب فوطة', 'n7eb fouta', 'hotel/pb_hotel_need_towel.m4a', 'A simple housekeeping request.', 0),
  ('pb_hotel_have_wifi', 'primary', 'عندكم واي فاي؟', '3andkom wifi?', 'hotel/pb_hotel_have_wifi.m4a', 'Nearly universal question for any traveler.', 0);

-- ============================================================================
-- TRAVEL & DIRECTIONS
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Travel & Directions', 106, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Travel & Directions', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_travel_wheres_taxi', 'Where is the taxi?', 'taxi', 1),
  ('pb_travel_take_to_hotel', 'Take me to the hotel', 'hotel building', 2),
  ('pb_travel_stop_here', 'Stop here please', 'stop sign', 3),
  ('pb_travel_is_it_far', 'Is it far?', 'distance', 4),
  ('pb_travel_wheres_train_station', 'Where is the train station?', 'train station', 5),
  ('pb_travel_go_straight', 'Go straight', 'straight arrow', 6),
  ('pb_travel_turn_right', 'Turn right', 'right arrow', 7),
  ('pb_travel_turn_left', 'Turn left', 'left arrow', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_travel_wheres_taxi', 'primary', 'وين التاكسي؟', 'win el taxi?', 'travel/pb_travel_wheres_taxi.m4a', 'A common question when arriving somewhere new.', 0),
  ('pb_travel_take_to_hotel', 'primary', 'هزّني للأوتيل', 'hezzni lel hotel', 'travel/pb_travel_take_to_hotel.m4a', 'Said to a taxi driver — swap "hotel" for any destination.', 0),
  ('pb_travel_stop_here', 'primary', 'وقف هوني بالله عليك', 'wa9ef houni bellehi', 'travel/pb_travel_stop_here.m4a', 'Useful in a taxi when you reach your stop.', 0),
  ('pb_travel_is_it_far', 'primary', 'بعيد؟', 'b3id?', 'travel/pb_travel_is_it_far.m4a', 'Short and to the point — very commonly asked.', 0),
  ('pb_travel_wheres_train_station', 'primary', 'وين الڨار؟', 'win el gare?', 'travel/pb_travel_wheres_train_station.m4a', '"El gare" (from French) is the everyday word for train station.', 0),
  ('pb_travel_go_straight', 'primary', 'امشي طول', 'emchi toul', 'travel/pb_travel_go_straight.m4a', 'A basic direction word worth memorizing.', 0),
  ('pb_travel_turn_right', 'primary', 'ادخل على اليمين', 'odkhol 3la imin', 'travel/pb_travel_turn_right.m4a', 'Direction-giving phrase.', 0),
  ('pb_travel_turn_left', 'primary', 'ادخل على اليسار', 'odkhol 3la issar', 'travel/pb_travel_turn_left.m4a', 'Direction-giving phrase.', 0);

-- ============================================================================
-- SHOPPING
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Shopping', 107, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Shopping', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_shop_how_much', 'How much is this?', 'price tag', 1),
  ('pb_shop_too_expensive', 'That is expensive', 'expensive price tag', 2),
  ('pb_shop_lower_price', 'Can you lower the price?', 'discount', 3),
  ('pb_shop_i_want_this', 'I want this', 'shopping bag', 4),
  ('pb_shop_just_looking', 'I am just looking', 'browsing eyes', 5),
  ('pb_shop_accept_card', 'Do you accept card?', 'credit card', 6),
  ('pb_shop_one_kilo', 'Give me one kilo', 'kilogram scale', 7),
  ('pb_shop_come_back_later', 'I will come back later', 'clock', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_shop_how_much', 'primary', 'بقداش هذا؟', 'b9addech hedha?', 'shopping/pb_shop_how_much.m4a', 'The single most useful shopping phrase.', 0),
  ('pb_shop_too_expensive', 'primary', 'غالي برشة', 'ghali barcha', 'shopping/pb_shop_too_expensive.m4a', '"Barcha" means "a lot" — very common intensifier.', 0),
  ('pb_shop_lower_price', 'primary', 'تنجم تنقص شوية؟', 'tnajem tn9es chwaya?', 'shopping/pb_shop_lower_price.m4a', 'Light bargaining is normal in markets (souks).', 0),
  ('pb_shop_i_want_this', 'primary', 'نحب هذا', 'n7eb hedha', 'shopping/pb_shop_i_want_this.m4a', 'Simple and direct — pair with pointing.', 0),
  ('pb_shop_just_looking', 'primary', 'نتفرج برك', 'netfarrej bark', 'shopping/pb_shop_just_looking.m4a', 'A polite way to decline a vendor''s offer to help.', 0),
  ('pb_shop_accept_card', 'primary', 'تقبل كارط؟', 'ta9bel carte?', 'shopping/pb_shop_accept_card.m4a', 'Worth asking — many small vendors are cash-only.', 0),
  ('pb_shop_one_kilo', 'primary', 'أعطيني كيلو واحد', 'a3tini kilo we7ed', 'shopping/pb_shop_one_kilo.m4a', 'Common at markets selling produce by weight.', 0),
  ('pb_shop_come_back_later', 'primary', 'نرجع بعد', 'narja3 ba3d', 'shopping/pb_shop_come_back_later.m4a', 'A polite way to end a conversation without buying.', 0);

-- ============================================================================
-- DAILY LIFE
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Daily Life', 108, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Daily Life', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_daily_hopefully', 'Hopefully', 'crossed fingers', 1),
  ('pb_daily_little_by_little', 'Little by little', 'small steps', 2),
  ('pb_daily_thats_enough', 'That is enough', 'stop hand', 3),
  ('pb_daily_exactly', 'Exactly', 'checkmark', 4),
  ('pb_daily_see_you_tomorrow', 'See you tomorrow', 'calendar', 5),
  ('pb_daily_welcome', 'Welcome', 'open door', 6),
  ('pb_daily_what_time', 'What time is it?', 'clock face', 7),
  ('pb_daily_no_worries', 'No worries', 'relaxed face', 8)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_daily_hopefully', 'primary', 'ان شاء الله', 'nchallah', 'daily_life/pb_daily_hopefully.m4a', 'Used constantly in everyday speech, for almost any future plan.', 0),
  ('pb_daily_little_by_little', 'primary', 'شوية شوية', 'chwaya chwaya', 'daily_life/pb_daily_little_by_little.m4a', 'A common, gentle way to describe gradual progress.', 0),
  ('pb_daily_thats_enough', 'primary', 'بركة', 'barka', 'daily_life/pb_daily_thats_enough.m4a', 'Short and very common — "enough" or "stop."', 0),
  ('pb_daily_exactly', 'primary', 'إيه بالحق', 'ey bel7a9', 'daily_life/pb_daily_exactly.m4a', 'A strong way to agree with someone.', 0),
  ('pb_daily_see_you_tomorrow', 'primary', 'نشوفك غدوة', 'nchoufek ghodwa', 'daily_life/pb_daily_see_you_tomorrow.m4a', 'A friendly, casual goodbye.', 0),
  ('pb_daily_welcome', 'primary', 'مرحبا بيك', 'mar7be bik', 'daily_life/pb_daily_welcome.m4a', 'Said when someone arrives somewhere, or joins a conversation.', 0),
  ('pb_daily_what_time', 'primary', 'شنية الساعة؟', 'chneya essa3a?', 'daily_life/pb_daily_what_time.m4a', 'A basic, frequently needed daily question.', 0),
  ('pb_daily_no_worries', 'primary', 'ماعندكش بأس', 'ma3andekch bes', 'daily_life/pb_daily_no_worries.m4a', 'A reassuring, easygoing reply.', 0);

-- ============================================================================
-- EMERGENCIES — the most speculative category: not its own section in the
-- reference material, so kept small and limited to simple, high-confidence
-- phrases rather than padded out with less-certain content.
-- ============================================================================
with new_unit as (
  insert into public.units (name, sort_order, is_curriculum) values ('Emergencies', 109, false) returning id
),
new_lesson as (
  insert into public.lessons (unit_id, lesson_number, title, sort_order)
  select id, 1, 'Emergencies', 1 from new_unit returning unit_id
)
insert into public.word_groups (id, unit_id, lesson_number, english_meaning, image_keyword, sort_order)
select v.id, nl.unit_id, 1, v.english_meaning, v.image_keyword, v.sort_order
from new_lesson nl cross join (values
  ('pb_emerg_help', 'Help!', 'emergency alert', 1),
  ('pb_emerg_call_police', 'Call the police', 'police', 2),
  ('pb_emerg_fire', 'Fire!', 'fire', 3),
  ('pb_emerg_need_hospital', 'I need a hospital', 'hospital', 4),
  ('pb_emerg_dont_know_where', 'I do not know where I am', 'lost location pin', 5)
) as v(id, english_meaning, image_keyword, sort_order);

insert into public.word_variants (word_group_id, variant_label, word_arabic, transliteration, audio_path, notes, sort_order) values
  ('pb_emerg_help', 'primary', 'عاونوني!', '3awnouni!', 'emergencies/pb_emerg_help.m4a', 'A loud, urgent call for help.', 0),
  ('pb_emerg_call_police', 'primary', 'عيط للبوليس', '3ayet lel bolice', 'emergencies/pb_emerg_call_police.m4a', 'For a genuine emergency requiring police.', 0),
  ('pb_emerg_fire', 'primary', 'حريقة!', '7ri9!', 'emergencies/pb_emerg_fire.m4a', 'A short, urgent warning.', 0),
  ('pb_emerg_need_hospital', 'primary', 'نحب سبيطار', 'n7eb sbitar', 'emergencies/pb_emerg_need_hospital.m4a', '"Sbitar" is the everyday Tunisian word for hospital.', 0),
  ('pb_emerg_dont_know_where', 'primary', 'ما نعرفش وين أنا', 'ma na3refch win ena', 'emergencies/pb_emerg_dont_know_where.m4a', 'Useful if you get lost and need to explain your situation.', 0);
