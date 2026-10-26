// Admin "Native Recordings": which word forms still need a native voice,
// in what order, and what skipping / restoring / saving writes.
import { createFakeSupabase } from '@/test-utils/fakeSupabase';

const mockDb = createFakeSupabase();
const mockSaveRecorded = jest.fn();
const mockUploadAudio = jest.fn();
const mockDeleteAudio = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
jest.mock('@/data/admin/audioUpload', () => ({
  saveRecordedWordVariantAudio: (...a: unknown[]) => mockSaveRecorded(...a),
  uploadWordVariantAudio: (...a: unknown[]) => mockUploadAudio(...a),
  deleteWordVariantAudio: (...a: unknown[]) => mockDeleteAudio(...a),
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
  explanation_audio_path: null,
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
  mockUploadAudio.mockReset().mockResolvedValue('g1/v1-explanation-3000.m4a');
  mockDeleteAudio.mockReset().mockResolvedValue(undefined);
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

  it('an uploaded file’s format is passed to the safe save (a recording passes none)', async () => {
    mockDb.respond('word_variants.update', {
      data: variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.mp3', is_native_voice: true, in_repeat_after_me: true }),
      error: null,
    });
    mockSaveRecorded.mockImplementation(async ({ persistAudioPath }: { persistAudioPath: (p: string) => Promise<string | null> }) =>
      persistAudioPath('g1/v1-2000.mp3')
    );
    const format = { extension: 'mp3', contentType: 'audio/mpeg' };

    await queue.saveQueueRecording({ item, localUri: 'file:///cache/ahla.mp3', format, addToRepeatAfterMe: true, actorAccountId: 'admin-1' });

    expect(mockSaveRecorded).toHaveBeenCalledWith(expect.objectContaining({ localUri: 'file:///cache/ahla.mp3', format }));
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

describe('fetchMissingExplanations (Native Recordings → Missing Explanations)', () => {
  it('lists forms that have a pronunciation but no explanation yet, in working order', async () => {
    seed([
      variantRow('has-both', 'g1', { audio_path: 'g1/a.m4a', explanation_audio_path: 'g1/a-explanation.m4a' }),
      variantRow('needs-explanation', 'g1', { variant_label: 'masculine', audio_path: 'g1/b.m4a' }),
      variantRow('no-pronunciation-yet', 'g1', { variant_label: 'feminine' }),
      variantRow('greetings-needs', 'g2', { audio_path: 'g2/c.m4a' }),
    ]);

    const items = await queue.fetchMissingExplanations();

    expect(items.map((i: { variant: { id: string } }) => i.variant.id)).toEqual(['needs-explanation', 'greetings-needs']);
    expect(items[0]).toMatchObject({ englishMeaning: 'meaning g1', unitName: 'Basics', lessonNumber: 2 });
    expect(mockDb.queries[0].calls).toContainEqual(['in', 'content_status', ['draft', 'pending_review', 'approved']]);
  });
});

describe('saveQueueRecording with an explanation', () => {
  const item = { variant: { id: 'v1', wordGroupId: 'g1', audioPath: 'g1/old.m4a', explanationAudioPath: null } };
  const persistWith = (row: Record<string, unknown>) => {
    mockDb.respond('word_variants.update', { data: row, error: null });
    mockSaveRecorded.mockImplementation(async ({ persistAudioPath }: { persistAudioPath: (p: string) => Promise<string | null> }) =>
      persistAudioPath('g1/v1-2000.m4a')
    );
  };

  it('uploads the explanation as its own file, then saves both paths in one write', async () => {
    persistWith(
      variantRow('v1', 'g1', {
        audio_path: 'g1/v1-2000.m4a',
        explanation_audio_path: 'g1/v1-explanation-3000.m4a',
        is_native_voice: true,
        in_repeat_after_me: true,
      })
    );

    const saved = await queue.saveQueueRecording({
      item,
      localUri: 'file:///take.m4a',
      explanation: { localUri: 'file:///explain.mp3', format: { extension: 'mp3', contentType: 'audio/mpeg' } },
      addToRepeatAfterMe: true,
      actorAccountId: 'admin-1',
    });

    expect(mockUploadAudio).toHaveBeenCalledWith('file:///explain.mp3', 'g1', 'v1-explanation', { extension: 'mp3', contentType: 'audio/mpeg' });
    expect(mockDb.writes()).toHaveLength(1);
    expect(mockDb.writes()[0].payload).toMatchObject({ audio_path: 'g1/v1-2000.m4a', explanation_audio_path: 'g1/v1-explanation-3000.m4a' });
    expect(saved).toMatchObject({ audioPath: 'g1/v1-2000.m4a', explanationAudioPath: 'g1/v1-explanation-3000.m4a' });
  });

  it('without an explanation (box unticked), the explanation column is left alone', async () => {
    persistWith(variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.m4a', is_native_voice: true, in_repeat_after_me: true }));

    await queue.saveQueueRecording({ item, localUri: 'file:///take.m4a', addToRepeatAfterMe: true, actorAccountId: 'admin-1' });

    expect(mockUploadAudio).not.toHaveBeenCalled();
    expect(mockDb.writes()[0].payload).not.toHaveProperty('explanation_audio_path');
  });

  it('explanation upload fails: nothing is saved, and the pronunciation is not touched', async () => {
    mockUploadAudio.mockRejectedValue(new Error('Upload was blocked by Supabase Storage permissions'));

    await expect(
      queue.saveQueueRecording({
        item,
        localUri: 'file:///take.m4a',
        explanation: { localUri: 'file:///explain.m4a' },
        addToRepeatAfterMe: true,
        actorAccountId: 'admin-1',
      })
    ).rejects.toThrow(/explanation recording.*blocked/i);
    expect(mockSaveRecorded).not.toHaveBeenCalled();
    expect(mockDb.writes()).toHaveLength(0);
  });

  it('the save fails after the explanation uploaded: the new explanation file is cleaned up, old files kept', async () => {
    mockSaveRecorded.mockRejectedValue(new Error('Audio uploaded, but saving it to this variant failed'));

    await expect(
      queue.saveQueueRecording({
        item: { variant: { ...item.variant, explanationAudioPath: 'g1/v1-explanation-1000.m4a' } },
        localUri: 'file:///take.m4a',
        explanation: { localUri: 'file:///explain.m4a' },
        addToRepeatAfterMe: true,
        actorAccountId: 'admin-1',
      })
    ).rejects.toThrow(/saving it to this variant failed/);
    expect(mockDeleteAudio).toHaveBeenCalledWith('g1/v1-explanation-3000.m4a');
    expect(mockDeleteAudio).not.toHaveBeenCalledWith('g1/v1-explanation-1000.m4a');
  });

  it('a replaced explanation’s old file is deleted only after both are saved', async () => {
    persistWith(
      variantRow('v1', 'g1', {
        audio_path: 'g1/v1-2000.m4a',
        explanation_audio_path: 'g1/v1-explanation-3000.m4a',
        is_native_voice: true,
        in_repeat_after_me: true,
      })
    );

    await queue.saveQueueRecording({
      item: { variant: { ...item.variant, explanationAudioPath: 'g1/v1-explanation-1000.m4a' } },
      localUri: 'file:///take.m4a',
      explanation: { localUri: 'file:///explain.m4a' },
      addToRepeatAfterMe: true,
      actorAccountId: 'admin-1',
    });

    expect(mockDeleteAudio).toHaveBeenCalledWith('g1/v1-explanation-1000.m4a');
  });

  it('rejects (and cleans up) if the explanation column didn’t stick — e.g. migration 0016 not applied', async () => {
    persistWith(variantRow('v1', 'g1', { audio_path: 'g1/v1-2000.m4a', is_native_voice: true, in_repeat_after_me: true }));

    await expect(
      queue.saveQueueRecording({
        item,
        localUri: 'file:///take.m4a',
        explanation: { localUri: 'file:///explain.m4a' },
        addToRepeatAfterMe: true,
        actorAccountId: 'admin-1',
      })
    ).rejects.toThrow(/explanation.*0016/);
    expect(mockDeleteAudio).toHaveBeenCalledWith('g1/v1-explanation-3000.m4a');
  });
});

describe('saveQueueExplanation (adding one to existing content)', () => {
  it('saves only the explanation, through the same safe replace, never the pronunciation', async () => {
    mockDb.respond('word_variants.update', {
      data: variantRow('v1', 'g1', { audio_path: 'g1/v1-1.m4a', explanation_audio_path: 'g1/v1-explanation-4000.m4a' }),
      error: null,
    });
    mockSaveRecorded.mockImplementation(async ({ persistAudioPath }: { persistAudioPath: (p: string) => Promise<string | null> }) =>
      persistAudioPath('g1/v1-explanation-4000.m4a')
    );

    const saved = await queue.saveQueueExplanation({
      item: { variant: { id: 'v1', wordGroupId: 'g1', audioPath: 'g1/v1-1.m4a', explanationAudioPath: 'g1/v1-explanation-old.m4a' } },
      localUri: 'file:///explain.m4a',
      actorAccountId: 'admin-1',
    });

    expect(mockSaveRecorded).toHaveBeenCalledWith(
      expect.objectContaining({ wordGroupId: 'g1', variantId: 'v1-explanation', previousPath: 'g1/v1-explanation-old.m4a' })
    );
    const payload = mockDb.writes()[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ explanation_audio_path: 'g1/v1-explanation-4000.m4a' });
    expect(payload).not.toHaveProperty('audio_path');
    expect(payload).not.toHaveProperty('in_repeat_after_me');
    expect(saved.explanationAudioPath).toBe('g1/v1-explanation-4000.m4a');
  });

  it('a failed save rejects (the caller stays on the word)', async () => {
    mockSaveRecorded.mockRejectedValue(new Error('Upload was blocked'));
    await expect(
      queue.saveQueueExplanation({
        item: { variant: { id: 'v1', wordGroupId: 'g1', audioPath: 'g1/v1-1.m4a', explanationAudioPath: null } },
        localUri: 'file:///explain.m4a',
        actorAccountId: 'admin-1',
      })
    ).rejects.toThrow(/blocked/);
  });
});
