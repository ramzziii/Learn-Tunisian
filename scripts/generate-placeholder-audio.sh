#!/usr/bin/env bash
# Generates placeholder audio for every word_variants row in supabase/seed.sql
# using macOS's built-in Arabic text-to-speech voice ("Majed"), so the app has
# real (if not authentic) audio to play instead of silence.
#
# IMPORTANT CAVEAT: "Majed" reads Modern Standard Arabic. It does NOT produce
# authentic Tunisian dialect pronunciation — it's a functional stand-in for
# testing the audio pipeline, same "unverified draft" status as the rest of
# this seed content. Replace with real recordings once available.
#
# macOS only (uses `say` and `afconvert`, both macOS-only tools). Requires
# python3. Output goes to ./generated-audio/<unit>/<file>.m4a, matching the
# folder structure of the "audio" Supabase Storage bucket — upload the whole
# tree there (preserving folders) to make it live.
#
# Usage: ./scripts/generate-placeholder-audio.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v say >/dev/null || ! command -v afconvert >/dev/null; then
  echo "This script requires macOS (say, afconvert). Aborting." >&2
  exit 1
fi

if ! say -v '?' | grep -q '^Majed'; then
  echo "The 'Majed' Arabic voice isn't installed. In System Settings ->" >&2
  echo "Accessibility -> Spoken Content -> Voices, add an Arabic voice, then retry." >&2
  exit 1
fi

OUTDIR="generated-audio"
RATE=145 # words per minute; slower than the ~175-200 default for clarity

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

MANIFEST=$(mktemp)
trap 'rm -f "$MANIFEST"' EXIT

python3 -c "
import json, re
content = open('supabase/seed.sql').read()
section = content.split('insert into public.word_variants')[1]
row_re = re.compile(
    r\"\('([^']*(?:''[^']*)*)',\s*'([^']*)',\s*'([^']*(?:''[^']*)*)',\s*'([^']*(?:''[^']*)*)',\s*'([^']*(?:''[^']*)*)',\"
)
for m in row_re.finditer(section):
    wgid, label, arabic, translit, audio_path = m.groups()
    unesc = lambda s: s.replace(chr(39)+chr(39), chr(39))
    print(unesc(arabic) + '\t' + unesc(audio_path))
" > "$MANIFEST"

count=0
while IFS=$'\t' read -r arabic audio_path; do
  # seed.sql references .m4a paths; write to those paths directly.
  outfile="$OUTDIR/$audio_path"
  mkdir -p "$(dirname "$outfile")"
  aiff_tmp=$(mktemp /tmp/placeholder-voice-XXXX.aiff)
  say -v Majed -r "$RATE" "$arabic" -o "$aiff_tmp"
  afconvert "$aiff_tmp" "$outfile" -f mp4f -d aac
  rm -f "$aiff_tmp"
  count=$((count + 1))
done < "$MANIFEST"

echo "Generated $count audio files in $OUTDIR/"
echo "Upload the contents of $OUTDIR/ to the 'audio' Supabase Storage bucket, preserving the folder structure."
