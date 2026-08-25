#!/bin/bash
# Convert a screen recording of the hover expand/collapse animation into an
# optimized GIF for docs/preview-anim.gif (two-pass palette, small & crisp).
#
# Usage:
#   bash scripts/make-preview-gif.sh <input-video> [fps] [width]
#   bash scripts/make-preview-gif.sh ~/Videos/balance.webm 30 800
#
# Input can be any ffmpeg-readable video (mp4/mkv/webm/mov/gif...).
# Output: docs/preview-anim.gif (loops forever, optimized palette).
set -euo pipefail

IN="${1:?usage: make-preview-gif.sh <input-video> [fps] [width]}"
FPS="${2:-30}"
WIDTH="${3:-800}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/preview-anim.gif"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v ffmpeg >/dev/null || { echo "ffmpeg required" >&2; exit 1; }

# Full-length conversion: static segments are frame-merged (mpdecimate) so
# holds cost almost nothing while motion stays at full fps; no dithering —
# flat UI colors compress better and look cleaner.
vf="fps=${FPS},mpdecimate=hi=64*12:lo=64*5:frac=0.33,scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle"

ffmpeg -y -i "$IN" -loop 0 -vf "$vf" -an "$OUT" 2>/dev/null
ls -la "$OUT"
echo "=== done: $OUT ==="
