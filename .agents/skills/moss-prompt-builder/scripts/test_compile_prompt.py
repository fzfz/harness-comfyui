import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("compile_prompt.py")
SPEC = importlib.util.spec_from_file_location("compile_prompt", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PromptEnhancerTests(unittest.TestCase):
    def setUp(self):
        self.draft = {
            "width": 1536,
            "height": 1024,
            "bbox_coord_space": "abs",
            "bbox_format": "xyxy",
            "summary": {"meta": ["poster"], "canvas": "single", "caption": "A ceramic campaign."},
            "items": [{"label": "text", "caption": "Dark-green lettering.",
                       "text": '把日常，过成诗。\n"MOSS" 🪴', "bbox": [928, 272, 1408, 448]}],
        }

    def test_landscape_conversion_preserves_content_and_source(self):
        before = copy.deepcopy(self.draft)
        serialized = MODULE.compile_prompt(self.draft)
        result = json.loads(serialized)
        self.assertEqual(result["items"][0]["bbox"], [-240, 160, -64, 640])
        self.assertEqual(result["items"][0]["text"], self.draft["items"][0]["text"])
        self.assertEqual(result["summary"], self.draft["summary"])
        self.assertEqual(result["bbox_coord_space"], "abs_centralized")
        self.assertEqual(result["bbox_format"], "yxyx")
        self.assertNotIn("width", result)
        self.assertNotIn("height", result)
        self.assertNotIn("\n", serialized)
        self.assertEqual(self.draft, before)

    def test_portrait_edges_and_fractional_enclosure(self):
        self.assertEqual(MODULE.centered_box([0, 0, 768, 1344], 768, 1344, "box"),
                         [-672, -384, 672, 384])
        self.assertEqual(MODULE.centered_box([10.9, 20.1, 100.01, 200.99], 768, 1344, "box"),
                         [-652, -374, -471, -283])
        self.assertEqual(MODULE.centered_box([1.00000000001, 2, 100, 200], 768, 1344, "box"),
                         [-670, -383, -472, -284])

    def test_invalid_geometry_is_rejected(self):
        cases = [
            [-1, 0, 100, 100], [0, 0, 1537, 100], [0, 0, 100, 1025],
            [100, 0, 50, 100], [0, 0, 0, 100], [0, 0, 100],
            [True, 0, 100, 100], [0, 0, float("nan"), 100],
            [0, 0, float("inf"), 100], [0, 0, "100", 100],
            [0, 0, 0.00000000001, 100],
        ]
        for box in cases:
            with self.subTest(box=box), self.assertRaises(ValueError):
                MODULE.centered_box(box, 1536, 1024, "box")

    def test_invalid_dimensions_and_conventions_are_rejected(self):
        for field, value in (("width", 1023), ("height", 0), ("width", True),
                             ("height", 1024.0), ("bbox_coord_space", "abs_centralized"),
                             ("bbox_coord_space", "normalized_1000"), ("bbox_format", "yxyx")):
            draft = copy.deepcopy(self.draft)
            draft[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                MODULE.compile_prompt(draft)

    def test_unrepresentable_content_is_not_silently_dropped(self):
        for field, value in (("children", [{"bbox": [0, 0, 20, 20]}]),
                             ("font_size", 32), ("parent", "cup")):
            draft = copy.deepcopy(self.draft)
            draft["items"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                MODULE.compile_prompt(draft)
        del self.draft["items"][0]["text"]
        with self.assertRaisesRegex(ValueError, "literal text"):
            MODULE.compile_prompt(self.draft)

    def test_caption_is_plain_text_and_keeps_exact_wording(self):
        caption = 'An ivory cup marked "茶".\nPreserve this second line.'
        self.assertEqual(MODULE.compile_prompt({"caption": caption}), caption)
        for draft in ({"caption": ""}, {"caption": caption, "items": []}):
            with self.assertRaises(ValueError):
                MODULE.compile_prompt(draft)

    def test_cli_writes_output_without_overwriting_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "draft.json"
            target = Path(directory) / "prompt.txt"
            original = json.dumps(self.draft, ensure_ascii=False, indent=2)
            source.write_text(original, encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), str(source), "--output", str(target)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, str(target.resolve()) + "\n")
            self.assertEqual(result.stderr, "")
            self.assertEqual(json.loads(target.read_text())["items"][0]["text"],
                             self.draft["items"][0]["text"])
            self.assertEqual(source.read_text(encoding="utf-8"), original)
            result = subprocess.run([sys.executable, str(SCRIPT), str(source), "--output", str(source)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(source.read_text(encoding="utf-8"), original)

    def test_cli_rejects_duplicate_keys_and_nonfinite_constants(self):
        cases = ['{"caption":"one","caption":"two"}', '{"caption":NaN}', '{"caption":Infinity}']
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "draft.json"
            target = Path(directory) / "prompt.txt"
            target.write_text("existing result", encoding="utf-8")
            for value in cases:
                source.write_text(value, encoding="utf-8")
                result = subprocess.run([sys.executable, str(SCRIPT), str(source), "--output", str(target)],
                                        capture_output=True, text=True)
                with self.subTest(value=value):
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(target.read_text(), "existing result")

    def test_cli_reads_utf8_json_from_stdin(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "结果 prompt.txt"
            caption = 'An ivory cup marked "茶".\nKeep this line.'
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "-", "--output", target.name],
                input=json.dumps({"caption": caption}, ensure_ascii=False),
                capture_output=True, encoding="utf-8", cwd=directory,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, str(target.resolve()) + "\n")
            self.assertEqual(result.stderr, "")
            self.assertEqual(target.read_text(encoding="utf-8"), caption + "\n")

    def test_cli_allocates_independent_temporary_results_for_concurrent_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "draft.json"
            source.write_text('{"caption":"A cup."}', encoding="utf-8")
            processes = [
                subprocess.Popen(
                    [sys.executable, str(SCRIPT), str(source)],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    encoding="utf-8", env={**os.environ, "TMPDIR": directory},
                )
                for _ in range(3)
            ]
            results = [process.communicate(timeout=10) for process in processes]
            paths = []
            for process, (stdout, stderr) in zip(processes, results):
                self.assertEqual(process.returncode, 0, stderr)
                self.assertEqual(stderr, "")
                path = Path(stdout.rstrip("\n"))
                self.assertTrue(path.is_absolute(), stdout)
                self.assertEqual(stdout, str(path) + "\n")
                self.assertEqual(path.name, "prompt.txt")
                self.assertEqual(path.parent.parent, Path(directory).resolve())
                self.assertEqual(path.read_text(encoding="utf-8"), "A cup.\n")
                paths.append(path)
            self.assertEqual(len(set(paths)), 3)

    def test_cli_reports_input_errors_without_echoing_draft_content(self):
        private_text = "private-draft-content"
        cases = [
            (f'{{"caption":"{private_text}"}} trailing'.encode(), "Extra data"),
            (f'{{"caption":"ok","{private_text}":1}}'.encode(), "unknown fields"),
            (f'{{"{private_text}":1,"{private_text}":2}}'.encode(), "Duplicate JSON key"),
            (b"\xff", "Invalid UTF-8 at byte 0"),
            (b"[]", "Draft must be a JSON object"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "prompt.txt"
            for raw, reason in cases:
                with self.subTest(reason=reason):
                    target.write_text("existing result", encoding="utf-8")
                    result = subprocess.run(
                        [sys.executable, str(SCRIPT), "-", "--output", str(target)],
                        input=raw, capture_output=True,
                    )
                    stderr = result.stderr.decode("utf-8")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, b"")
                    self.assertIn(reason, stderr)
                    self.assertIn("python3 scripts/compile_prompt.py --help", stderr)
                    self.assertNotIn(private_text, stderr)
                    self.assertNotIn("0xff", stderr)
                    self.assertEqual(target.read_text(encoding="utf-8"), "existing result")

    def test_cli_file_and_argument_errors_preserve_the_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "draft.json"
            original = '{"caption":"A cup."}'
            source.write_text(original, encoding="utf-8")
            cases = [
                ([], "draft"),
                (["draft.json", "--unknown"], "--unknown"),
                (["missing.json"], "missing.json"),
                (["."], "directory"),
                (["draft.json", "--output", "."], "directory"),
                (["draft.json", "--output", "draft.json/prompt.txt"], "draft.json"),
                (["draft.json", "--output", "./draft.json"], "editable draft"),
            ]
            for arguments, reason in cases:
                with self.subTest(arguments=arguments):
                    result = subprocess.run(
                        [sys.executable, str(SCRIPT), *arguments],
                        capture_output=True, encoding="utf-8", cwd=directory,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, "")
                    self.assertIn(reason, result.stderr)
                    self.assertIn("python3 scripts/compile_prompt.py --help", result.stderr)
                    self.assertNotIn("Traceback", result.stderr)
                    self.assertEqual(source.read_text(encoding="utf-8"), original)

    def test_cli_rejects_output_paths_that_break_the_single_line_transport(self):
        with tempfile.TemporaryDirectory() as directory:
            for separator in ("\r", "\n"):
                target = Path(directory) / f"prompt{separator}.txt"
                target.write_text("existing result", encoding="utf-8")
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), "-", "--output", str(target)],
                    input='{"caption":"A cup."}', capture_output=True, encoding="utf-8",
                )
                with self.subTest(separator=separator):
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, "")
                    self.assertIn("single line", result.stderr)
                    self.assertIn("--output", result.stderr)
                    self.assertEqual(target.read_text(encoding="utf-8"), "existing result")


if __name__ == "__main__":
    unittest.main()
