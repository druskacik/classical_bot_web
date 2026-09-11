---
name: create-reel
description: Create vertical captioned reels from a local video, with a solid background and static text above the uncropped picture. Use for this repository's meme-style Instagram reel exports and revisions.
---

# Create Reel

Use the bundled renderer for one local video and a static caption. Accept the user's wording, colors, and optional trim; do not substitute a different caption or silently cut the clip. Downloads, publishing, montages, and timed subtitles are outside this workflow.

## Inputs and defaults

- Require an unambiguous local video and caption. If either is missing, ask for it; otherwise proceed with defaults.
- Black background, white centered Liberation Sans Bold text, 54 px (reduced only when necessary, minimum 40 px).
- 1080 × 1920 at 30 fps; fit the whole picture into a 1080 × 608 region beginning at y=700. Rotation metadata and display aspect ratio are respected. Portrait and square sources are centered inside this region.
- Preserve the full duration and original audio unless a trim is requested. `--start` and `--end` are seconds in the source, with end exclusive.
- Export H.264, CRF 18, medium preset, yuv420p, fast start; AAC at 192 kbps and 48 kHz when audio exists. Silent sources stay silent.

## Workflow

1. Use FFprobe to inspect duration, dimensions, display rotation, and audio. Extract and inspect a representative source frame with FFmpeg and the available image viewer.
2. Write the exact caption to a temporary UTF-8 file using a file-writing tool or safely quoted heredoc. Preserve explicit line breaks. Never interpolate user text into shell commands or FFmpeg filters.
3. Run the helper from any directory, using absolute input and caption paths. Resolve the helper relative to this skill; the default output directory is this repository's `output/reels/`.

   ```bash
   python /absolute/path/to/create-reel/scripts/render_reel.py \
     --input /absolute/path/to/video.mp4 \
     --caption-file /tmp/reel-caption.txt
   ```

   Optional arguments: `--background '#102030'`, `--text-color white`, `--start 5`, `--end 25`, `--output /absolute/path/to/reel.mp4`.

4. The helper checks dependencies, lays out the caption, renders, validates metadata, fully decodes the export, and creates a JPEG preview. Caption lines wrap within 936 px; at most four rendered lines fit. If text cannot fit at 40 px, ask for a shorter caption rather than rewriting or clipping it.
5. Inspect the JPEG with the image viewer. Check caption spelling, contrast, clipping, full picture visibility, and composition. For trims, inspect frames near the start and end; use audio/video playback when available to check synchronization. Do not claim to have listened if only technical validation was possible.
6. Return clickable MP4 and preview links, dimensions, and duration. Mention any material departure from the request.

The helper prints a JSON summary with paths and verified metadata. Default names are numbered if already present; explicit output paths must be unused. Never overwrite source media or earlier exports.

## Dependencies and maintenance

Requires Python 3, Pillow (for font measurement and color parsing), FFmpeg with `libx264`, `aac`, and `drawtext`, FFprobe, fontconfig (`fc-match`), and Liberation Sans Bold. Missing dependencies produce an actionable error; do not install system packages automatically.

Keep rendering logic in `scripts/render_reel.py`. Run `python -m unittest discover -s /absolute/path/to/create-reel/scripts -p 'test_*.py'` after changes. Validate the skill using the skill-creator's `quick_validate.py` when available, and exercise the renderer on a real clip with a visually inspected preview.
