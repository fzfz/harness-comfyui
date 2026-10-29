#!/usr/bin/env python3
"""Compile a caption or absolute-pixel Layout draft into a MOSS-Image prompt."""

import argparse
import json
import math
import sys
import tempfile
from pathlib import Path


CAPTION_FIELDS = frozenset(("caption",))
LAYOUT_FIELDS = frozenset(("width", "height", "bbox_coord_space", "bbox_format", "summary", "items"))
SUMMARY_FIELDS = frozenset(("caption", "meta", "canvas", "palette"))
SUMMARY_REQUIRED = frozenset(("caption",))
ITEM_FIELDS = frozenset(("label", "caption", "bbox", "text", "tags", "palette"))
ITEM_REQUIRED = frozenset(("label", "caption", "bbox"))
CANVAS_TYPES = ("single", "multi_panel", "collage")
ITEM_LABELS = ("object", "character", "text")
DIMENSION_MULTIPLE = 16
INPUT_COORD_SPACE = "abs"
INPUT_BOX_FORMAT = "xyxy"
OUTPUT_COORD_SPACE = "abs_centralized"
OUTPUT_BOX_FORMAT = "yxyx"
BOX_FIELDS = ("x_min", "y_min", "x_max", "y_max")
BOX_PRECISION = 9


def compiler_help():
    return f"""Input JSON:
  Caption: exactly {sorted(CAPTION_FIELDS)}; caption is nonempty text.
  Layout: exactly {sorted(LAYOUT_FIELDS)}.
  width and height: required positive integers, multiples of {DIMENSION_MULTIPLE}.
  bbox_coord_space: {INPUT_COORD_SPACE!r}; bbox_format: {INPUT_BOX_FORMAT!r}.
  summary: object with allowed fields {sorted(SUMMARY_FIELDS)}.
    Required: {sorted(SUMMARY_REQUIRED)}. caption is nonempty text.
    meta and palette: optional arrays of nonempty strings; empty arrays are allowed.
    canvas: optional enum {list(CANVAS_TYPES)}.
  items: required nonempty flat array. Each item allows {sorted(ITEM_FIELDS)}.
    Required: {sorted(ITEM_REQUIRED)}. label is one of {list(ITEM_LABELS)}.
    caption is nonempty text. A text label also requires nonempty literal text.
    text is optional on other labels. tags and palette are optional string arrays.
    bbox: {list(BOX_FIELDS)}, four finite numbers measured from the top-left.
    0 <= x_min < x_max <= width; 0 <= y_min < y_max <= height.
    Fractional edges are accepted. JSON keys must be unique; NaN and Infinity fail.

Output and side effects:
  Success: exit 0; stderr is empty; stdout is the absolute result path plus newline.
  Relative paths resolve from the command's working directory.
  The UTF-8 result file contains Caption text, or one line of Layout JSON.
  Layout preserves summary and items, converts boxes to {OUTPUT_COORD_SPACE}/{OUTPUT_BOX_FORMAT},
  rounds edges to {BOX_PRECISION} decimals, encloses them with floor/ceil, then subtracts
  half the canvas dimensions rounded down. Width and height are omitted from output.
  Result files end with a newline. Existing --output files are replaced after validation.
  The output path must differ from the draft and contain no carriage return or newline.
  Parent directories are created. Omitting --output creates an independent temporary result.
  Concurrent calls must use distinct output paths or omit --output.

Retries and result reuse:
  Invalid arguments, JSON, fields or files: exit 2; stdout is empty; stderr reports
  the problem and help command. Correct the named field, path or permissions, then retry.
  A failed file write may leave a partial result. Use the output only after a successful run.
  After success, reuse the result until the draft changes.
  Repeating --output replaces that result; omitting it allocates another result file.

Examples (from the Skill directory):
  %(prog)s draft.json
  %(prog)s draft.json --output prompt.txt
  cat draft.json | %(prog)s -

Caption example:
  {{"caption":"An ivory cup marked \\"Tea\\"."}}
Layout example:
  {{"width":1024,"height":1024,"bbox_coord_space":"abs","bbox_format":"xyxy","summary":{{"caption":"A cup on a table."}},"items":[{{"label":"object","caption":"An ivory cup.","bbox":[256,256,768,768]}}]}}
"""


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fields(value, allowed, required, location):
    require(isinstance(value, dict), f"{location} must be an object")
    unknown = value.keys() - allowed
    missing = required - value.keys()
    require(not unknown, f"{location}: unknown fields; allowed fields: {sorted(allowed)}")
    require(not missing, f"{location}: missing fields {sorted(missing)}")


def text(value, location):
    require(isinstance(value, str) and bool(value.strip()), f"{location} must be nonempty text")


def strings(value, location):
    require(isinstance(value, list), f"{location} must be an array")
    for index, item in enumerate(value):
        text(item, f"{location}[{index}]")


def centered_box(box, width, height, location):
    require(isinstance(box, list) and len(box) == len(BOX_FIELDS), f"{location} must be [x1,y1,x2,y2]")
    require(
        all(type(v) in (int, float) and math.isfinite(v) for v in box),
        f"{location} must contain four finite numbers",
    )
    x1, y1, x2, y2 = box
    require(x1 < x2 and y1 < y2, f"{location} must have positive width and height")
    require(
        0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height,
        f"{location} exceeds the {width}x{height} canvas",
    )
    # Enclose in pixel edges before centering, as in Echidna generation export.
    result = [
        math.floor(round(y1, BOX_PRECISION)) - height // 2,
        math.floor(round(x1, BOX_PRECISION)) - width // 2,
        math.ceil(round(y2, BOX_PRECISION)) - height // 2,
        math.ceil(round(x2, BOX_PRECISION)) - width // 2,
    ]
    require(result[0] < result[2] and result[1] < result[3],
            f"{location} is too small at export precision")
    return result


def compile_prompt(draft):
    require(isinstance(draft, dict), "Draft must be a JSON object")
    if "caption" in draft:
        fields(draft, CAPTION_FIELDS, CAPTION_FIELDS, "Caption draft")
        text(draft["caption"], "caption")
        return draft["caption"]

    root_fields = LAYOUT_FIELDS
    fields(draft, root_fields, root_fields, "Layout draft")
    width, height = draft["width"], draft["height"]
    for name, value in (("width", width), ("height", height)):
        require(type(value) is int and value > 0 and value % DIMENSION_MULTIPLE == 0,
                f"{name} must be a positive integer multiple of 16")
    require(draft["bbox_coord_space"] == INPUT_COORD_SPACE, "Draft bbox_coord_space must be abs")
    require(draft["bbox_format"] == INPUT_BOX_FORMAT, "Draft bbox_format must be xyxy")

    summary = draft["summary"]
    fields(summary, SUMMARY_FIELDS, SUMMARY_REQUIRED, "summary")
    text(summary["caption"], "summary.caption")
    if "canvas" in summary:
        require(summary["canvas"] in CANVAS_TYPES,
                "summary.canvas must be single, multi_panel or collage")
    for key in ("meta", "palette"):
        if key in summary:
            strings(summary[key], f"summary.{key}")

    items = draft["items"]
    require(isinstance(items, list) and bool(items), "items must be a nonempty flat array")
    compiled_items = []
    for index, item in enumerate(items):
        location = f"items[{index}]"
        fields(item, ITEM_FIELDS, ITEM_REQUIRED, location)
        require(item["label"] in ITEM_LABELS,
                f"{location}.label must be object, character or text")
        text(item["caption"], f"{location}.caption")
        if item["label"] == "text":
            require("text" in item, f"{location}: text items require literal text")
        if "text" in item:
            text(item["text"], f"{location}.text")
        for key in ("tags", "palette"):
            if key in item:
                strings(item[key], f"{location}.{key}")
        compiled_items.append({
            key: centered_box(value, width, height, f"{location}.bbox") if key == "bbox" else value
            for key, value in item.items()
        })

    result = {"summary": summary, "items": compiled_items,
              "bbox_coord_space": OUTPUT_COORD_SPACE, "bbox_format": OUTPUT_BOX_FORMAT}
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key; keep each object key once")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError(f"Invalid JSON number: {value}")


class PromptArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        super().error(
            f"{message}\nNext: Correct the reported JSON field or file path, then retry.\n"
            f"Help and examples: {self.prog} --help"
        )


def main():
    parser = PromptArgumentParser(
        prog="python3 scripts/compile_prompt.py",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=compiler_help(),
    )
    parser.add_argument(
        "draft",
        help="Required string: UTF-8 Caption/Layout JSON file path, or '-' for UTF-8 JSON from stdin (no default)",
    )
    parser.add_argument(
        "--output", type=Path, metavar="PATH",
        help="Optional file path (default: prompt.txt in a new temporary directory for each call)",
    )
    args = parser.parse_args()
    try:
        source = Path(args.draft) if args.draft != "-" else None
        if args.output and source is not None:
            require(args.output.resolve() != source.resolve(),
                    "Output must be separate from the editable draft")
        raw = (source.read_text(encoding="utf-8") if source is not None
               else sys.stdin.buffer.read().decode("utf-8"))
        draft = json.loads(raw, object_pairs_hook=unique_object, parse_constant=reject_constant)
        prompt = compile_prompt(draft)
        output = args.output or Path(tempfile.mkdtemp(prefix="moss-prompt-")) / "prompt.txt"
        output = output.resolve()
        require("\r" not in str(output) and "\n" not in str(output),
                "Output path must fit on a single line; choose a different --output path or TMPDIR")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(prompt + "\n", encoding="utf-8")
        print(output)
    except UnicodeDecodeError as error:
        parser.error(f"Invalid UTF-8 at byte {error.start}: {error.reason}")
    except (OSError, ValueError, OverflowError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
