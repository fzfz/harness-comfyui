---
文档用途: 定义 MOSS-Image Layout 草稿的字段和像素坐标约定。
读取时机: 编写或修改 Layout 草稿前。
---
# Pixel Layout draft

## Root fields and coordinates

1. `width` and `height` are positive integer multiples of 16 and specify the intended image dimensions. Set `bbox_coord_space` to `"abs"` and `bbox_format` to `"xyxy"`.
2. Each `bbox` contains `[x_min, y_min, x_max, y_max]` in pixels measured from the canvas top-left. Keep `0 ≤ x_min < x_max ≤ width` and `0 ≤ y_min < y_max ≤ height`. Fractional edges are accepted.
3. The root contains exactly `width`, `height`, `bbox_coord_space`, `bbox_format`, `summary` and `items`.

## Summary fields

1. `summary.caption` is a required nonempty description of the whole image.
2. `summary.meta` and `summary.palette` are optional arrays of nonempty strings for medium or genre tags and palette information.
3. `summary.canvas` optionally specifies `"single"`, `"multi_panel"` or `"collage"`.

## Item fields

1. `items` is a nonempty flat array. Each item requires `label`, `caption` and `bbox`. `label` is `"object"`, `"character"` or `"text"`; `caption` is a nonempty description of the item's visible appearance, including typography and surface treatment for text.
2. Items labelled `"text"` require a nonempty `text` string containing the exact visible wording. Represent intended line breaks with JSON `\n`. The `text` field is also accepted on other item labels when literal wording belongs to that item.
3. Each item optionally accepts `tags` and `palette` arrays of nonempty strings.
4. Use only the fields defined here. Several items may share or overlap a box.
