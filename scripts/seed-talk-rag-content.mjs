#!/usr/bin/env node
// Seeds a small corpus of phrases/sentences/conversation_examples for the
// "Talk to a Tunisian" RAG retrieval pipeline (see
// supabase/migrations/0008_talk_rag_content.sql), so there's something for
// match_verified_content() to actually retrieve when testing end to end.
//
// IMPORTANT: this content is drafted by an AI, not a native Tunisian
// speaker, so it's inserted with native_verified = false — same principle
// as every other unverified seed in this app (see 0006_content_verification.sql).
// It won't be picked up by retrieval until reviewed and flipped to verified
// via app/admin/corrections.tsx (or a direct SQL update if you're confident
// in a row and don't need the reviewer flow for it).
//
// Requires real API calls (OpenAI embeddings + a privileged Supabase write),
// so this is a manual one-off script, not something the app runs itself.
// Needs the raw service-role key specifically because it writes content
// before any user session exists — never put these in .env / EXPO_PUBLIC_*:
//
//   OPENAI_API_KEY=sk-...
//   SUPABASE_URL=https://your-project-ref.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...   (Project Settings -> API -> service_role)
//
// Usage:
//   OPENAI_API_KEY=sk-... SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-talk-rag-content.mjs

import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing OPENAI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const phrases = [
  { tunisian_text: 'شنية تحب تشرب؟', english_text: 'What would you like to drink?', transliteration: 'chnowa theb teshreb?', topic: 'cafe', formality: 'casual' },
  { tunisian_text: 'نحب قهوة', english_text: "I'd like a coffee", transliteration: 'nheb qahwa', topic: 'cafe', formality: 'casual' },
  { tunisian_text: 'بقداش هذا؟', english_text: 'How much is this?', transliteration: "b9adéch hedha?", topic: 'market', formality: 'casual' },
  { tunisian_text: 'عسلامة، كيفاش الحال؟', english_text: 'Hello, how are you?', transliteration: 'aslema, kifesh el-hal?', topic: 'meeting_someone', formality: 'casual' },
];

const sentences = [
  { tunisian_text: 'نحب ناكل حاجة، فمّة شنوة اليوم؟', english_text: "I want to eat something, what's there today?", transliteration: 'nheb nekol haja, famma chnowa lyoum?', topic: 'food' },
  { tunisian_text: 'هذا الماء بارد برشة، تحب واحد آخر؟', english_text: 'This water is very cold, would you like another one?', transliteration: 'hedha el-ma bared barcha, theb wahed akhor?', topic: 'cafe' },
];

const conversationExamples = [
  {
    scenario: 'cafe',
    turns: [
      { speaker: 'tutor', tunisian_text: 'عسلامة! شنية تحب تشرب؟', english_text: 'Hello! What would you like to drink?' },
      { speaker: 'learner', tunisian_text: 'نحب قهوة، يعيشك', english_text: 'I would like a coffee, thank you' },
      { speaker: 'tutor', tunisian_text: 'طيب، دقيقة وجاية', english_text: "Okay, one minute and it's coming" },
    ],
  },
  {
    scenario: 'market',
    turns: [
      { speaker: 'tutor', tunisian_text: 'مرحبا، شنوة تحب تشري اليوم؟', english_text: 'Welcome, what would you like to buy today?' },
      { speaker: 'learner', tunisian_text: 'نحب تفاح أحمر', english_text: 'I want red apples' },
      { speaker: 'tutor', tunisian_text: 'عندي تفاح مزيان برشة اليوم', english_text: 'I have very good apples today' },
    ],
  },
];

async function embed(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embeddings call failed (${response.status}): ${await response.text()}`);
  }
  const json = await response.json();
  return json.data[0].embedding;
}

async function seedPhrases() {
  for (const phrase of phrases) {
    const embedding = await embed(`${phrase.tunisian_text} ${phrase.english_text} ${phrase.transliteration}`);
    const { error } = await supabase.from('phrases').insert({ ...phrase, embedding, native_verified: false });
    if (error) throw error;
    console.log(`phrase: ${phrase.english_text}`);
  }
}

async function seedSentences() {
  for (const sentence of sentences) {
    const embedding = await embed(`${sentence.tunisian_text} ${sentence.english_text} ${sentence.transliteration}`);
    const { error } = await supabase.from('sentences').insert({ ...sentence, embedding, native_verified: false });
    if (error) throw error;
    console.log(`sentence: ${sentence.english_text}`);
  }
}

async function seedConversationExamples() {
  for (const example of conversationExamples) {
    const combinedText = example.turns.map((t) => `${t.tunisian_text} ${t.english_text}`).join(' ');
    const embedding = await embed(combinedText);
    const { error } = await supabase
      .from('conversation_examples')
      .insert({ scenario: example.scenario, turns: example.turns, embedding, native_verified: false });
    if (error) throw error;
    console.log(`conversation_example: ${example.scenario}`);
  }
}

async function main() {
  console.log(`Seeding ${phrases.length} phrases, ${sentences.length} sentences, ${conversationExamples.length} conversation_examples (all native_verified = false)...`);
  await seedPhrases();
  await seedSentences();
  await seedConversationExamples();
  console.log(
    'Done — inserted as native_verified = false. app/admin/corrections.tsx only reviews AI-generated ' +
      'conversation turns (the corrections table), not these seed rows, so to make any of them retrieval-' +
      'eligible: review the content yourself, then flip it directly (Supabase table editor, or ' +
      "`update public.phrases set native_verified = true, native_reviewer = '<you>' where id = '...';`, same for sentences/conversation_examples)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
