---
name: create-reel
description: Create vertical captioned reels from a local video or YouTube excerpt, with a solid background and static text above the uncropped picture. Use for this repository's meme-style Instagram reel exports and revisions.
---

# Create Reel

Use yt-dlp to download a requested YouTube excerpt when needed, then use the bundled renderer for one local video and a static caption. Accept the user's wording, colors, and optional trim; do not substitute a different caption or silently cut the clip. Publishing, montages, and timed subtitles are outside this workflow.

## Inputs and defaults

- Require an unambiguous local video or YouTube URL and caption. Resolve these and the requested excerpt from the current request and earlier conversation; ask only for missing or ambiguous information.
- For YouTube, require a clear excerpt range or an explicit whole-video request before downloading. Convert clear contextual instructions such as “1:30 to 2:45” or “30 seconds starting at 1:30” into source timestamps. If a description does not establish clear boundaries, ask rather than guessing. A link's start timestamp alone does not establish an end.
- Black background, white centered Liberation Sans Bold text, 54 px (reduced only when necessary, minimum 40 px).
- 1080 × 1920 at 30 fps; fit the whole picture into a 1080 × 608 region beginning at y=700. Rotation metadata and display aspect ratio are respected. Portrait and square sources are centered inside this region.
- Preserve the full local video's duration, or the requested YouTube excerpt, and original audio unless a trim is requested. Renderer `--start` and `--end` are seconds in its local input, with end exclusive.
- Export H.264, CRF 18, medium preset, yuv420p, fast start; AAC at 192 kbps and 48 kHz when audio exists. Silent sources stay silent.

## Workflow

For a YouTube source, first follow **Download a YouTube excerpt** below. Then continue with the downloaded local file; local sources enter directly here.

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

## Download a YouTube excerpt

Use yt-dlp's time-range selection to download the requested portion of the original video:

```bash
yt-dlp \
  --download-sections "*00:01:30-00:02:45" \
  -o "clip.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

The quoted leading `*` selects a time range rather than a chapter name. For actual downloads, create a unique temporary directory and use this fuller command, substituting the resolved range and URL with safely quoted arguments:

```bash
reel_download_dir=$(mktemp -d /tmp/create-reel-download.XXXXXX)
yt-dlp \
  --ignore-config \
  --no-playlist \
  --download-sections "*00:01:30-00:02:45" \
  --force-keyframes-at-cuts \
  --print after_move:filepath \
  -o "$reel_download_dir/clip.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

- `--force-keyframes-at-cuts` re-encodes around cuts at a performance cost to reduce cut-boundary artifacts. `--ignore-config` keeps personal yt-dlp settings from changing the requested download. See the [yt-dlp options](https://github.com/yt-dlp/yt-dlp#usage-and-options).
- For an explicit whole-video request, omit `--download-sections` and `--force-keyframes-at-cuts`. Never fall back to a full download when an excerpt download fails.
- Use the actual path printed by `--print after_move:filepath`; do not assume an MP4 extension. Preserve audio when present. On failure or missing dependencies, report the actionable error instead of continuing with an incomplete file.
- Inspect the downloaded file with FFprobe and check its duration against the requested interval (within 0.15 seconds), plus frames near both boundaries. Resolve a mismatch or report the limitation before rendering; do not silently accept a different excerpt.
- The excerpt now starts at local time zero. Pass it to the renderer **without** the original YouTube `--start` or `--end`; applying them again would trim twice. Any separately requested adjustment must use offsets relative to the downloaded excerpt.
- Keep downloads separate from final exports and earlier source files. In the final response, include the source URL and original excerpt range alongside the normal MP4 and preview links.

## Dependencies and maintenance

Requires Python 3, Pillow (for font measurement and color parsing), FFmpeg with `libx264`, `aac`, and `drawtext`, FFprobe, fontconfig (`fc-match`), and Liberation Sans Bold. Missing dependencies produce an actionable error; do not install system packages automatically.

YouTube inputs additionally require the `yt-dlp` CLI; section downloads also use FFmpeg. YouTube extraction may also require a supported JavaScript runtime. If yt-dlp reports no runtime, select an installed supported runtime (for example, add `--js-runtimes node` for Node) or report the missing dependency; `--ignore-config` also ignores runtime settings in personal configuration. Local inputs do not require yt-dlp.

Keep rendering logic in `scripts/render_reel.py`. Run `python -m unittest discover -s /absolute/path/to/create-reel/scripts -p 'test_*.py'` after changes. Validate the skill using the skill-creator's `quick_validate.py` when available, and exercise the renderer on a real clip with a visually inspected preview.
