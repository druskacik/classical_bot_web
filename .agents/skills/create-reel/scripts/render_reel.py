#!/usr/bin/env python3
"""Render a local video in the repository's static-caption reel layout."""

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


class ReelError(Exception):
    pass


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise ReelError(f"{args[0]} failed: {result.stderr.strip()[-3000:]}")
    return result.stdout


def probe(path):
    return json.loads(run([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format',
        '-of', 'json', str(path),
    ]))


def dependencies():
    for command in ('ffmpeg', 'ffprobe', 'fc-match'):
        if not shutil.which(command):
            raise ReelError(f"Missing dependency: {command}. Install it before rendering.")
    try:
        from PIL import ImageColor, ImageFont
    except ImportError as exc:
        raise ReelError('Missing Python dependency: Pillow. Install it in your Python environment.') from exc
    encoders = run(['ffmpeg', '-hide_banner', '-encoders'])
    filters = run(['ffmpeg', '-hide_banner', '-filters'])
    for name, listing in (('libx264', encoders), ('aac', encoders), ('drawtext', filters)):
        if not re.search(r'\b' + name + r'\b', listing):
            raise ReelError(f"FFmpeg is missing required capability: {name}.")
    info = run(['fc-match', '-f', '%{family}\n%{style}\n%{file}', 'Liberation Sans:style=Bold']).splitlines()
    if len(info) < 3 or 'Liberation Sans' not in info[0] or 'Bold' not in info[1] or not Path(info[2]).is_file():
        raise ReelError('Missing font: Liberation Sans Bold. Install the Liberation fonts package.')
    return ImageColor, ImageFont, Path(info[2])


def color(value, image_color):
    try:
        rgb = image_color.getrgb(value)
        if len(rgb) != 3:
            raise ValueError('alpha is unsupported')
        return '0x' + ''.join(f'{channel:02x}' for channel in rgb)
    except (ValueError, TypeError) as exc:
        raise ReelError(f"Invalid solid color {value!r}; use a color name or #RRGGBB.") from exc


def wrap_caption(text, font, width=936):
    """Wrap at spaces while retaining explicit newlines and literal characters."""
    lines = []
    for paragraph in text.split('\n'):
        if not paragraph:
            lines.append('')
            continue
        remaining = paragraph
        while font.getlength(remaining) > width:
            breaks = [i for i, char in enumerate(remaining) if char == ' ' and i > 0
                      and font.getlength(remaining[:i]) <= width]
            if not breaks:
                return None
            cut = breaks[-1]
            lines.append(remaining[:cut])
            remaining = remaining[cut + 1:]
        lines.append(remaining)
    return lines


def caption_layout(text, font_path, image_font):
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    if not text.strip():
        raise ReelError('Caption must not be empty.')
    if any(ord(char) < 32 and char != '\n' for char in text):
        raise ReelError('Caption contains unsupported control characters; use spaces and newlines.')
    for size in range(54, 39, -1):
        font = image_font.truetype(str(font_path), size)
        lines = wrap_caption(text, font)
        if lines is not None and len(lines) <= 4:
            return size, lines
    raise ReelError('Caption cannot fit in four lines at 40 px. Supply a shorter caption.')


def trim_range(start, end, duration):
    end = duration if end is None else end
    if not all(math.isfinite(value) for value in (start, end, duration)):
        raise ReelError('Duration and trim times must be finite numbers.')
    if not 0 <= start < end <= duration:
        raise ReelError(f'Trim must satisfy 0 <= start < end <= source duration ({duration:.3f}s).')
    return end - start


def default_directory():
    # Installed layout: <repo>/.agents/skills/create-reel/scripts/render_reel.py
    return Path(__file__).resolve().parents[4] / 'output' / 'reels'


def output_paths(source, requested, directory=None):
    if requested:
        output = Path(requested).expanduser().absolute()
        if output.suffix.lower() != '.mp4':
            raise ReelError('Output must have an .mp4 extension.')
        preview = output.with_name(output.stem + '-preview.jpg')
        if output.exists() or preview.exists() or output.resolve() == source.resolve():
            raise ReelError('Output or preview already exists; choose an unused output name.')
        return output, preview
    directory = directory or default_directory()
    slug = re.sub(r'[^a-z0-9]+', '-', source.stem.lower()).strip('-')[:90] or 'video'
    number = 1
    while True:
        suffix = '' if number == 1 else f'-{number}'
        output = directory / f'{slug}-reel{suffix}.mp4'
        preview = output.with_name(output.stem + '-preview.jpg')
        if not output.exists() and not preview.exists():
            return output, preview
        number += 1


def verify(path, expected_duration, has_audio):
    metadata = probe(path)
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    audios = [s for s in metadata['streams'] if s['codec_type'] == 'audio']
    expected = {'width': 1080, 'height': 1920, 'codec_name': 'h264',
                'pix_fmt': 'yuv420p', 'r_frame_rate': '30/1', 'sample_aspect_ratio': '1:1'}
    if any(video.get(key) != value for key, value in expected.items()):
        raise ReelError('Export video metadata does not match the reel format.')
    duration = float(metadata['format']['duration'])
    if abs(duration - expected_duration) > 0.15:
        raise ReelError('Export duration differs from the requested interval.')
    if bool(audios) != has_audio:
        raise ReelError('Export audio presence does not match the source.')
    if audios and (audios[0]['codec_name'] != 'aac' or audios[0]['sample_rate'] != '48000'):
        raise ReelError('Export audio format is incorrect.')
    run(['ffmpeg', '-v', 'error', '-xerror', '-nostdin', '-i', str(path), '-f', 'null', '-'])
    return duration


def render(args):
    image_color, image_font, font_path = dependencies()
    source = Path(args.input).expanduser().resolve()
    if not source.is_file():
        raise ReelError(f'Input video does not exist: {source}')
    text = Path(args.caption_file).expanduser().read_text(encoding='utf-8')
    size, lines = caption_layout(text, font_path, image_font)
    background = color(args.background, image_color)
    foreground = color(args.text_color, image_color)
    metadata = probe(source)
    videos = [s for s in metadata['streams'] if s['codec_type'] == 'video'
              and not s.get('disposition', {}).get('attached_pic')]
    if not videos:
        raise ReelError('Input has no video stream.')
    video = videos[0]
    duration = float(metadata['format'].get('duration') or video.get('duration', 0))
    length = trim_range(args.start, args.end, duration)
    has_audio = any(s['codec_type'] == 'audio' for s in metadata['streams'])
    output, preview = output_paths(source, args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.reel-', dir=output.parent) as temp:
        work = Path(temp)
        shutil.copyfile(font_path, work / 'font.ttf')
        # Normalize display aspect ratio before fitting. FFmpeg autorotates by default.
        filters = [
            'scale=w=trunc(ih*dar/2)*2:h=ih:flags=lanczos', 'setsar=1',
            'scale=1080:608:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos',
            'setsar=1',
            f'pad=1080:608:(ow-iw)/2:(oh-ih)/2:color={background}',
            f'pad=1080:1920:0:700:color={background}',
        ]
        first_y = 580 - (len(lines) - 1) * 85
        for index, line in enumerate(lines):
            if not line:
                continue
            filename = f'caption-{index}.txt'
            (work / filename).write_text(line, encoding='utf-8')
            filters.append(
                f'drawtext=fontfile=font.ttf:textfile={filename}:expansion=none:'
                f'fontcolor={foreground}:fontsize={size}:x=(w-text_w)/2:y={first_y + index * 85}'
            )
        filters.append('fps=30')
        command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin',
                   '-ss', str(args.start), '-i', str(source), '-t', str(length),
                   '-map', f"0:{video['index']}", '-map', '0:a:0?',
                   '-vf', ','.join(filters), '-map_metadata', '-1', '-map_chapters', '-1',
                   '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                   '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                   '-movflags', '+faststart', 'render.mp4']
        run(command, cwd=work)
        rendered = work / 'render.mp4'
        result_duration = verify(rendered, length, has_audio)
        run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin',
             '-ss', str(min(5, result_duration / 2)), '-i', str(rendered),
             '-frames:v', '1', str(work / 'preview.jpg')])
        # Hard links publish complete files without replacing existing outputs, even in a race.
        os.link(rendered, output)
        try:
            os.link(work / 'preview.jpg', preview)
        except OSError:
            output.unlink()
            raise
    return {'video': str(output), 'preview': str(preview), 'duration_seconds': result_duration,
            'width': 1080, 'height': 1920, 'fps': 30, 'audio': has_audio,
            'font_size': size, 'caption_lines': lines}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, help='Local source video')
    parser.add_argument('--caption-file', required=True, help='UTF-8 caption with optional line breaks')
    parser.add_argument('--output', help='Unused .mp4 path; defaults to repository output/reels')
    parser.add_argument('--background', default='black')
    parser.add_argument('--text-color', default='white')
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--end', type=float)
    args = parser.parse_args()
    try:
        print(json.dumps(render(args), ensure_ascii=False, indent=2))
    except (ReelError, OSError, ValueError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
