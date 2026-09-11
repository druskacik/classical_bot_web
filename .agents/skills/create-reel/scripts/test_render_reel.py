import math
from pathlib import Path
import tempfile
import unittest

from PIL import ImageFont

from render_reel import (ReelError, caption_layout, dependencies, output_paths,
                         trim_range, wrap_caption)


class ReelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _, _, cls.font_path = dependencies()

    def test_caption_preserves_literal_punctuation_and_newlines(self):
        text = "Her: He's probably out cheating.\nMe and the boys:"
        size, lines = caption_layout(text, self.font_path, ImageFont)
        self.assertEqual(size, 54)
        self.assertEqual(lines, text.splitlines())
        punctuation = "100%: 'quoted' \\ %{text} $HOME `echo`"
        _, lines = caption_layout(punctuation, self.font_path, ImageFont)
        self.assertEqual(' '.join(lines), punctuation)

    def test_wrapping_stays_inside_caption_width(self):
        text = 'A longer caption that needs to wrap while keeping every word in its original order.'
        size, lines = caption_layout(text, self.font_path, ImageFont)
        font = ImageFont.truetype(str(self.font_path), size)
        self.assertEqual(' '.join(lines), text)
        self.assertTrue(all(font.getlength(line) <= 936 for line in lines))
        self.assertLessEqual(len(lines), 4)
        with self.assertRaises(ReelError):
            caption_layout('long ' * 300, self.font_path, ImageFont)
        with self.assertRaises(ReelError):
            caption_layout('X' * 300, self.font_path, ImageFont)

    def test_trim_boundaries_and_nonfinite_values(self):
        self.assertEqual(trim_range(0, None, 32), 32)
        self.assertEqual(trim_range(5, 25, 32), 20)
        for start, end in [(-1, 2), (3, 2), (2, 2), (0, 33), (math.nan, 2), (0, math.inf)]:
            with self.subTest(start=start, end=end), self.assertRaises(ReelError):
                trim_range(start, end, 32)

    def test_existing_outputs_and_preview_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = directory / "A friend's video.mp4"
            source.write_bytes(b'source')
            output, preview = output_paths(source, None, directory)
            preview.write_bytes(b'keep')
            numbered, _ = output_paths(source, None, directory)
            self.assertNotEqual(output, numbered)
            with self.assertRaises(ReelError):
                output_paths(source, str(output))
            with self.assertRaises(ReelError):
                output_paths(source, str(source))
            self.assertEqual(preview.read_bytes(), b'keep')
            self.assertEqual(source.read_bytes(), b'source')


if __name__ == '__main__':
    unittest.main()
