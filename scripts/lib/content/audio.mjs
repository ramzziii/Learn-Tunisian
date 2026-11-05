// Bulk audio: matches recording files named <word_group_id>__<variant_label>.mp3
// (or .m4a) to forms, uploads them unchanged to the existing "audio" bucket,
// sets audio_path and marks is_native_voice = true. Only forms whose text a
// native reviewer has approved are accepted (record after review). Text
// review (native_verified) is never touched here.
import { AUDIO_EXTENSIONS, LABEL_SORT, LABELS, audioFileName } from './validate.mjs';

export const AUDIO_BUCKET = 'audio';
const FILE_PATTERN = new RegExp(`^([a-z0-9_]+)__(${LABELS.join('|')})\\.(${AUDIO_EXTENSIONS.join('|')})$`);
const CONTENT_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4' };

export const hasNativeAudio = (v) => !!(v.is_native_voice && v.audio_path);

/**
 * Sorts a folder's file names into: matches (to upload), misnamed, unknown
 * (no such word/form), not approved, already recorded, ambiguous, duplicate;
 * plus the approved forms still missing a native recording afterwards.
 */
export function matchAudioFiles(fileNames, snapshot, { replace = false } = {}) {
  const result = { matches: [], misnamed: [], unknown: [], notApproved: [], alreadyNative: [], ambiguous: [], duplicates: [] };
  const byKey = new Map();
  for (const v of snapshot.word_variants) {
    if (v.content_status === 'archived') continue;
    const key = `${v.word_group_id}__${v.variant_label}`;
    byKey.set(key, [...(byKey.get(key) ?? []), v]);
  }

  const seen = new Map();
  for (const name of [...fileNames].sort()) {
    if (name.startsWith('.')) continue; // .DS_Store and other hidden files
    const m = FILE_PATTERN.exec(name);
    if (!m) {
      const hint = FILE_PATTERN.test(name.toLowerCase()) ? 'use lowercase' : 'expected <word_group_id>__<variant_label>.mp3';
      result.misnamed.push({ file: name, hint });
      continue;
    }
    const [, groupId, label, ext] = m;
    const key = `${groupId}__${label}`;
    if (seen.has(key)) {
      result.duplicates.push({ files: [seen.get(key), name] });
      result.matches = result.matches.filter((x) => x.file !== seen.get(key));
      continue;
    }
    seen.set(key, name);
    const candidates = byKey.get(key) ?? [];
    if (candidates.length === 0) result.unknown.push({ file: name });
    else if (candidates.length > 1) result.ambiguous.push({ file: name, count: candidates.length });
    else if (candidates[0].content_status !== 'approved') result.notApproved.push({ file: name, status: candidates[0].content_status });
    else if (hasNativeAudio(candidates[0]) && !replace) result.alreadyNative.push({ file: name });
    else result.matches.push({ file: name, ext, variant: candidates[0] });
  }

  const matched = new Set(result.matches.map((x) => x.variant.id));
  const groups = new Map(snapshot.word_groups.map((g) => [g.id, g]));
  result.stillMissing = snapshot.word_variants
    .filter((v) => v.content_status === 'approved' && !hasNativeAudio(v) && !matched.has(v.id))
    .filter((v) => groups.get(v.word_group_id)?.content_status !== 'rejected')
    .sort((a, b) => a.word_group_id.localeCompare(b.word_group_id) || (LABEL_SORT[a.variant_label] ?? 9) - (LABEL_SORT[b.variant_label] ?? 9))
    .map((v) => audioFileName(v.word_group_id, v.variant_label));
  return result;
}

/** A new path per upload (like the in-app recorder), so a CDN can never keep serving an older file. */
export const storagePathFor = (variant, ext, stamp) => `${variant.word_group_id}/${variant.word_group_id}__${variant.variant_label}-${stamp}.${ext}`;

/** Uploads then points the form at it. Previous files are left in place and listed. */
export async function applyAudio(db, matches, readBytes, { speakerName = null, stamp = Date.now() } = {}) {
  const done = [];
  for (const m of matches) {
    const bytes = await readBytes(m.file);
    const path = storagePathFor(m.variant, m.ext, stamp);
    await db.upload(AUDIO_BUCKET, path, bytes, CONTENT_TYPES[m.ext]);
    await db.update('word_variants', { audio_path: path, is_native_voice: true, ...(speakerName ? { speaker_name: speakerName } : {}) }, { id: m.variant.id });
    done.push({ file: m.file, path, previous: m.variant.audio_path ?? null });
  }
  return done;
}

export function describeAudioMatch(r) {
  const lines = [];
  const p = (s = '') => lines.push(s);
  const list = (title, items, fmt) => {
    p(`${title}: ${items.length}`);
    for (const x of items) p(`  ${fmt(x)}`);
  };
  list('Ready to upload', r.matches, (x) => `${x.file} -> ${x.variant.word_group_id} (${x.variant.variant_label})`);
  list('Misnamed', r.misnamed, (x) => `${x.file} (${x.hint})`);
  list('No such word or form', r.unknown, (x) => x.file);
  list('Not approved yet (record after review)', r.notApproved, (x) => `${x.file} (${x.status})`);
  list('Already has a native recording (use --replace)', r.alreadyNative, (x) => x.file);
  list('Ambiguous (several forms with that label)', r.ambiguous, (x) => `${x.file} (${x.count})`);
  list('Same form twice', r.duplicates, (x) => x.files.join(' and '));
  p(`Approved forms still without a native recording after this: ${r.stillMissing.length}`);
  for (const name of r.stillMissing.slice(0, 50)) p(`  ${name}`);
  if (r.stillMissing.length > 50) p(`  … and ${r.stillMissing.length - 50} more (see export-recording-list)`);
  return lines.join('\n');
}
