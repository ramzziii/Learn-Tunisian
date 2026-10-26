// Explanation recordings: stored in their own columns (never in audio_path),
// written only by admins, and — for a translation answer — readable only by
// the requester, exactly like the pronunciation recording.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: string) => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { join } = require('path') as { join: (...parts: string[]) => string };
declare const __dirname: string;

const sql = readFileSync(join(__dirname, '../../../supabase/migrations/0016_explanation_audio.sql'), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

function fn(name: string): string {
  const match = new RegExp(`create (or replace )?function public\\.${name}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`, 'i').exec(body);
  if (!match) throw new Error(`function ${name} not found`);
  return match[0];
}

it('adds a separate explanation column to word variants (existing admin-only write policies cover it)', () => {
  expect(body).toMatch(/alter table public\.word_variants\s+add column explanation_audio_path text check \(char_length\(explanation_audio_path\) <= 300\)/i);
  // No new policies on word_variants: writes stay admin-only (0009).
  expect(body).not.toMatch(/create policy "[^"]+" on public\.word_variants/i);
  expect(body).not.toMatch(/drop policy "word_variants/i);
});

it('adds a separate explanation column to translation answers', () => {
  expect(body).toMatch(
    /alter table public\.translation_requests\s+add column answer_explanation_audio_path text check \(char_length\(answer_explanation_audio_path\) <= 300\)/i
  );
});

describe('admin_set_translation_explanation_audio', () => {
  const setter = () => fn('admin_set_translation_explanation_audio');

  it('is admin-only, SECURITY DEFINER, with a pinned search_path', () => {
    expect(setter()).toMatch(/security definer/i);
    expect(setter()).toMatch(/set search_path = public/i);
    expect(setter()).toMatch(/if not public\.is_admin\(\) then\s+raise exception '[^']*' using errcode = '42501'/i);
  });

  it('only points inside that request’s own folder (or clears it), and only while open', () => {
    expect(setter()).toMatch(/p_audio_path is not null and not \(p_audio_path like p_request_id::text \|\| '\/%'\)/i);
    expect(setter()).toMatch(/set answer_explanation_audio_path = p_audio_path/i);
    expect(setter()).toMatch(/status in \('submitted', 'in_progress'\)/i);
    expect(setter()).not.toMatch(/answer_audio_path\s*=/i); // never touches the pronunciation
  });

  it('can’t be called anonymously', () => {
    expect(body).toMatch(/revoke all on function public\.admin_set_translation_explanation_audio\(uuid, text\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.admin_set_translation_explanation_audio\(uuid, text\) to authenticated/i);
  });
});

describe('my_translation_requests (rebuilt with the explanation)', () => {
  it('is dropped and recreated (its result columns change), keeping ownership and visibility rules', () => {
    expect(body).toMatch(/drop function public\.my_translation_requests\(\)/i);
    const mine = fn('my_translation_requests');
    expect(mine).toMatch(/security definer/i);
    expect(mine).toMatch(/where r\.account_id = auth\.uid\(\)\s+and r\.status in \('submitted', 'in_progress', 'answered'\)/i);
    expect(mine).toMatch(/case when r\.status = 'answered' then r\.answer_explanation_audio_path end/i);
    expect(mine).toMatch(/case when r\.status = 'answered' then r\.answer_audio_path end/i);
    expect(mine).not.toMatch(/handled_by|email_status|client_request_id/i);
  });

  it('keeps its grants', () => {
    expect(body).toMatch(/revoke all on function public\.my_translation_requests\(\) from public, anon/i);
    expect(body).toMatch(/grant execute on function public\.my_translation_requests\(\) to authenticated/i);
  });
});

it('the requester can read only their own answered request’s two files — nothing wider', () => {
  expect(body).toMatch(/drop policy "translation_audio_read_own_answer" on storage\.objects/i);
  expect(body).toMatch(
    /for select using \(\s*bucket_id = 'translation-audio'\s+and \(\s*public\.is_admin\(\)\s+or exists \(\s*select 1 from public\.translation_requests r\s+where r\.account_id = auth\.uid\(\)\s+and r\.status = 'answered'\s+and storage\.objects\.name in \(r\.answer_audio_path, r\.answer_explanation_audio_path\)/i
  );
});
