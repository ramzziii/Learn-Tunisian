// Admin "Native Recordings": which word forms still need a native voice,
// in what order, and what skipping / restoring / saving writes.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
const mockSaveRecorded = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
jest.mock('@/data/admin/audioUpload', () => ({
  saveRecordedWordVariantAudio: (...a: unknown[]) => mockSaveRecorded(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const queue = require('@/data/admin/recordingQueue');

const variantRow = (id: string, groupId: string, overrides: Record<string, unknown> = {}) => ({
  id,
  word_group_id: groupId,
  variant_label: 'primary',
  word_arabic: 'كلمة',
  transliteration: id,
  audio_path: null,
  notes: null,
  sort_order: 0,
  native_verified: false,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  speaker_name: null,
  dialect_notes: null,
  is_native_voice: false,
  approved_by: null,
  approved_at: null,
  in_repeat_after_me: false,
  recording_skipped_at: null,
  recording_skipped_by: null,
  ...overrides,
});
const groupRow = (id: string, unitId: string, lessonNumber: number, sortOrder: number) => ({
  id,
  unit_id: unitId,
  lesson_number: lessonNumber,
  english_meaning: `meaning ${id}`,
  image_keyword: null,
  image_path: null,
  sort_order: sortOrder,
  content_status: 'approved',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

function seed(variants: unknown[]) {
  mockDb.respond('word_variants.select', { data: variants, error: null });
  mockDb.respond('word_groups.select', {
    data: [groupRow('g2', 'u2', 1, 0), groupRow('g1', 'u1', 2, 0), groupRow('g0', 'u1', 1, 5)],
    error: null,
  });
  mockDb.respond('units.select', {
    data: [
      { id: 'u1', name: 'Basics', sort_order: 1 },
      { id: 'u2', name: 'Greetings', sort_order: 100 },
    ],
    error: null,
  });
}

beforeEach(() => {
  mockDb.reset();
  mockSaveRecorded.mockReset();
});

describe('fetchRecordingQueue', () => {
  it('lists every form that has no audio, a missing file, or a non-native recording', async () => {
    seed([
      variantRow('no-audio', 'g1'),
      variantRow('missing-file', 'g1', { variant_label: 'also_heard', audio_path: 'g1/gone.m4a', is_native_voice: true }),
      variantRow('not-native', 'g1', { variant_label: 'masculine', audio_path: 'g1/old.m4a' }),
      variantRow('done', 'g1', { variant_label: 'feminine', audio_path: 'g1/ok.m4a', is_native_voice: true }),
    ]);
    mockDb.respond('storage.list:g1', { data: [{ name: 'old.m4a' }, { name: 'ok.m4a' }], error: null });

    const items = await queue.fetchRecordingQueue();

    expect(items.map((i: { variant: { id: string }; reason: string }) => [i.variant.id, i.reason])).toEqual([
      // primary → masculine → also heard within a word
      ['no-audio', 'no_audio'],
      ['not-native', 'not_native'],
      ['missing-file', 'missing_file'],
    ]);
    expect(items[0]).toMatchObject({ englishMeaning: 'meaning g1', unitName: 'Basics', lessonNumber: 2 });
  });

  it('leaves out skipped forms and archived/rejected content', async () => {
    seed([variantRow('skipped', 'g1', { recording_skipped_at: '2026-10-01T00:00:00Z' }), variantRow('ok', 'g1')]);

    const items = await queue.fetchRecordingQueue();

    expect(items.map((i: { variant: { id: string } }) => i.variant.id)).toEqual(['ok']);
    expect(mockDb.queries[0].calls).toContainEqual(['in', 'content_status', ['draft', 'pending_review', 'approved']]);
  });

  it('orders by unit, lesson, word, then form', async () => {
    seed([
      variantRow('greetings-word', 'g2'),
      variantRow('basics-lesson2', 'g1'),
      variantRow('basics-lesson1-b', 'g0', { sort_order: 1 }),
      variantRow('basics-lesson1-a', 'g0', { sort_order: 0 }),
    ]);

    const items = await queue.fetchRecordingQueue();

    expect(items.map((i: { variant: { id: string } }) => i.variant.id)).toEqual([
      'basics-lesson1-a',
      'basics-lesson1-b',
      'basics-lesson2',
      'greetings-word',
    ]);
  });

  it('checks each audio folder once', async () => {
    seed([
      variantRow('a', 'g1', { audio_path: 'g1/a.m4a' }),
      variantRow('b', 'g1', { audio_path: 'g1/b.m4a', variant_label: 'also_heard' }),
    ]);
    mockDb.respond('storage.list:g1', { data: [], error: null });

    await queue.fetchRecordingQueue();

    expect(mockDb.storageLists).toEqual(['g1']);
  });

  it('if a folder can’t be checked, its files are not reported as missing', async () => {
    seed([variantRow('a', 'g1', { audio_path: 'g1/a.m4a', is_native_voice: true })]);
    mockDb.respond('storage.list:g1', { data: null, error: { message: 'network' } });

    await expect(queue.fetchRecordingQueue()).resolves.toEqual([]);
  });

  it('surfaces a database failure', async () => {
    mockDb.respond('word_variants.select', { data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(queue.fetchRecordingQueue()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchSkippedRecordings', () => {
  it('lists skipped forms that still need a recording', async () => {
    seed([
      variantRow('skipped', 'g1', { recording_skipped_at: '2026-10-01T00:00:00Z' }),
      variantRow('skipped-but-recorded-since', 'g1', {
        variant_label: 'also_heard',
        recording_skipped_at: '2026-10-01T00:00:00Z',
        audio_path: 'g1/new.m4a',
        is_native_voice: true,
      }),
      variantRow('not-skipped', 'g1', { variant_label: 'masculine' }),
    ]);
    mockDb.respond('storage.list:g1', { data: [{ name: 'new.m4a' }], error: null });

    const items = await queue.fetchSkippedRecordings();

    expect(items.map((i: { variant: { id: string } }) => i.variant.id)).toEqual(['skipped']);
  });
});

describe('skip / restore', () => {
  it('skip permanently records when and by whom', async () => {
    mockDb.respond('word_variants.update', { data: variantRow('v1', 'g1', { recording_skipped_at: '2026-10-24T00:00:00Z', recording_skipped_by: 'admin-1' }), error: null });

    const saved = await queue.skipRecording('v1', 'admin-1');

    const payload = mockDb.writes()[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ recording_skipped_by: 'admin-1', updated_by: 'admin-1' });
    expect(Date.parse(payload.recording_skipped_at as string)).not.toBeNaN();
    expect(saved.recordingSkippedAt).toBe('2026-10-24T00:00:00Z');
  });

  it('restore puts it back in the queue', async () => {
    mockDb.respond('word_variants.update', { data: variantRow('v1', 'g1'), error: null });

    await queue.restoreSkippedRecording('v1', 'admin-1');

    expect(mockDb.writes()[0].payload).toMatchObject({ recording_skipped_at: null, recording_skipped_by: null });
  });

  it('a refused skip rejects (never looks done)', async () => {
    mockDb.respond('word_variants.update', { data: null, error: { message: 'permission denied', code: '42501' } });
    await expect(queue.skipRecording('v1', 'admin-1')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('saveQueueRecording', () => {
  const item = {
    variant: { id: 'v1', wordGroupId: 'g1', audioPath: 'g1/old.m4a' },
    englishMeaning: 'hello',
    unitName: 'Basics',
    lessonNumber: 1,
    reason: 'not_native',
  };

  async function runSave(addToRepeatAfterMe: boolean, savedRow: Record<string, unknown>) {
    mockDb.respond('word_variants.update', { data: savedRow, error: null });
    mockSaveRecorded.mockImplementation(async ({ persistAudioPath }: { persistAudioPath: (p: string) => Promise<string | null> }) => {
      const persisted = await persistAudioPath('g1/v1-2000.m4a');
      return persisted;
    });
    return queue.saveQueueRecording({ item, localUri: 'file:///take.m4a', addToRepeatAfterMe, actorAccountId: 'admin-1' });
  }

  it('uploads with the safe save, then marks it native, applies the Repeat After Me box, clears any skip', async () => {
    const saved = await runSave(true, variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.m4a', is_native_voice: true, in_repeat_after_me: true }));

    expect(mockSaveRecorded).toHaveBeenCalledWith(
      expect.objectContaining({ localUri: 'file:///take.m4a', wordGroupId: 'g1', variantId: 'v1', previousPath: 'g1/old.m4a' })
    );
    expect(mockDb.writes()[0].payload).toMatchObject({
      audio_path: 'g1/v1-2000.m4a',
      is_native_voice: true,
      in_repeat_after_me: true,
      recording_skipped_at: null,
      recording_skipped_by: null,
      updated_by: 'admin-1',
    });
    expect(saved).toMatchObject({ audioPath: 'g1/v1-2000.m4a', isNativeVoice: true, inRepeatAfterMe: true });
  });

  it('unticked box keeps it out of Repeat After Me', async () => {
    await runSave(false, variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.m4a', is_native_voice: true }));
    expect(mockDb.writes()[0].payload).toMatchObject({ in_repeat_after_me: false });
  });

  it('rejects if the Repeat After Me choice didn’t stick (e.g. migration not applied)', async () => {
    const { in_repeat_after_me: _dropped, ...row } = variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.m4a', is_native_voice: true });
    await expect(runSave(true, row)).rejects.toThrow(/Repeat After Me/);
  });

  it('a failed upload/save rejects — the caller must not move on', async () => {
    mockSaveRecorded.mockRejectedValue(new Error('Audio uploaded, but saving it to this variant failed'));
    await expect(
      queue.saveQueueRecording({ item, localUri: 'file:///take.m4a', addToRepeatAfterMe: true, actorAccountId: 'admin-1' })
    ).rejects.toThrow(/saving it to this variant failed/);
  });
});
