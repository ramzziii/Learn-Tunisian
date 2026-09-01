-- Talk to a Tunisian: RAG grounding content + native-reviewer workflow.
--
-- Adds a second, richer grounding source alongside word_groups/word_variants:
-- a small corpus of native-speaker-verified phrases, sentences, and full
-- conversation exchanges, retrieved by semantic similarity (pgvector) to
-- whatever the learner just said. A corrections log lets real AI conversation
-- turns get reviewed and promoted into that verified corpus over time.
--
-- Same verification principle as 0006_content_verification.sql: only rows
-- with native_verified = true are ever eligible for retrieval — enforced
-- both in match_verified_content() below and in RLS, not just app logic.

create extension if not exists vector with schema extensions;

-- ============================================================================
-- PHRASES — short common phrases.
-- ============================================================================
create table public.phrases (
  id uuid primary key default gen_random_uuid(),
  tunisian_text text not null,
  english_text text not null,
  transliteration text not null,
  topic text,
  formality text,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  speaker_gender text check (speaker_gender in ('masculine', 'feminine')),
  region text,
  embedding extensions.vector(1536),
  native_verified boolean not null default false,
  native_reviewer text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- SENTENCES — fuller example sentences, optionally tied to an existing
-- word_group so a sentence can illustrate a specific vocabulary concept in
-- context (nullable — not every sentence needs one).
-- ============================================================================
create table public.sentences (
  id uuid primary key default gen_random_uuid(),
  tunisian_text text not null,
  english_text text not null,
  transliteration text not null,
  topic text,
  related_word_group_id text references public.word_groups (id) on delete set null,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  speaker_gender text check (speaker_gender in ('masculine', 'feminine')),
  region text,
  embedding extensions.vector(1536),
  native_verified boolean not null default false,
  native_reviewer text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- CONVERSATION EXAMPLES — short verified exchanges for a scenario. `turns` is
-- an ordered jsonb array of {speaker: 'tutor'|'learner', tunisian_text,
-- english_text} rather than a child table — simpler for a handful of turns
-- per example, and the embedding is computed over all turns combined, so
-- there's no per-turn row that would need its own embedding anyway.
-- `scenario` matches an existing TALK_SCENARIOS id (cafe/market/
-- meeting_someone/family/food) so retrieval and manual curation share one
-- taxonomy instead of inventing a second one.
-- ============================================================================
create table public.conversation_examples (
  id uuid primary key default gen_random_uuid(),
  scenario text not null,
  turns jsonb not null,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  region text,
  embedding extensions.vector(1536),
  native_verified boolean not null default false,
  native_reviewer text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- CORRECTIONS — review log. Every AI-generated conversation turn gets logged
-- here as a pending candidate (is_correct null); a reviewer marks it correct
-- (promotes as-is) or incorrect (promotes corrected_text instead) via the
-- talk-review Edge Function, which inserts into phrases/sentences directly —
-- this table is the log/queue, not retrievable content itself.
--
-- profile_id and target_table are additions beyond the original spec: profile_id
-- is needed to enforce the per-profile daily turn cap (count today's rows for
-- a profile) and gives the reviewer useful context; target_table records which
-- table an approval should promote into. Not adding native_verified/
-- native_reviewer here — is_correct/reviewer_name already serve that exact
-- purpose for a review-log row.
-- ============================================================================
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  ai_generated_text text not null,
  target_table text not null default 'sentence' check (target_table in ('phrase', 'sentence')),
  is_correct boolean,
  corrected_text text,
  reviewer_name text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index corrections_profile_created_idx on public.corrections (profile_id, created_at);
create index corrections_pending_idx on public.corrections (created_at) where is_correct is null;

-- ============================================================================
-- AI USAGE LOG — token counts per OpenAI call, so actual cost is visible
-- (query this table directly — no dashboard UI for it yet, wasn't asked for).
-- ============================================================================
create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  call_type text not null check (call_type in ('chat', 'embedding')),
  model text not null,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RETRIEVAL — cosine similarity across all three verified content tables.
-- Returns pre-formatted display text per source rather than raw columns, so
-- the calling Edge Function doesn't need to know three different row shapes.
--
-- No ivfflat/hnsw index yet: with a seed corpus of ~10 rows, an approximate
-- index would hurt recall more than a full table scan costs in latency. Add
-- one (e.g. `create index on public.phrases using ivfflat (embedding
-- extensions.vector_cosine_ops) with (lists = 100);`, same for sentences/
-- conversation_examples) once real content grows past a few hundred rows.
-- ============================================================================
create function public.match_verified_content(
  query_embedding extensions.vector(1536),
  match_count int default 6
)
returns table (source text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select * from (
    select
      'phrase' as source,
      'Phrase: ' || tunisian_text || ' (' || transliteration || ') = ' || english_text as content,
      1 - (embedding <=> query_embedding) as similarity
    from public.phrases
    where native_verified and embedding is not null

    union all

    select
      'sentence',
      'Sentence: ' || tunisian_text || ' (' || transliteration || ') = ' || english_text,
      1 - (embedding <=> query_embedding)
    from public.sentences
    where native_verified and embedding is not null

    union all

    select
      'conversation_example',
      'Example exchange (' || scenario || '): ' || (
        select string_agg(
          (turn->>'speaker') || ': ' || (turn->>'tunisian_text') || ' = ' || (turn->>'english_text'),
          ' | '
        )
        from jsonb_array_elements(turns) as turn
      ),
      1 - (embedding <=> query_embedding)
    from public.conversation_examples
    where native_verified and embedding is not null
  ) combined
  order by similarity desc
  limit match_count;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- phrases/sentences/conversation_examples: readable (verified rows only —
-- defense in depth alongside match_verified_content's own filter) and
-- insertable by any authenticated household member — same open trust model
-- word_groups already uses, and matches the "no new role system for now"
-- decision for the reviewer workflow. Revisit if this app ever has reviewers
-- or learners outside one trusted household account.
-- corrections/ai_usage_log: full authenticated access, same reasoning.
-- ============================================================================
alter table public.phrases enable row level security;
alter table public.sentences enable row level security;
alter table public.conversation_examples enable row level security;
alter table public.corrections enable row level security;
alter table public.ai_usage_log enable row level security;

create policy "phrases_read_verified" on public.phrases
  for select using (native_verified and auth.role() = 'authenticated');
create policy "phrases_insert_authenticated" on public.phrases
  for insert with check (auth.role() = 'authenticated');

create policy "sentences_read_verified" on public.sentences
  for select using (native_verified and auth.role() = 'authenticated');
create policy "sentences_insert_authenticated" on public.sentences
  for insert with check (auth.role() = 'authenticated');

create policy "conversation_examples_read_verified" on public.conversation_examples
  for select using (native_verified and auth.role() = 'authenticated');
create policy "conversation_examples_insert_authenticated" on public.conversation_examples
  for insert with check (auth.role() = 'authenticated');

create policy "corrections_all_authenticated" on public.corrections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "ai_usage_log_all_authenticated" on public.ai_usage_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
