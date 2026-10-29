---
name: moss-prompt-builder
description: 用户要求构建、改写或编译 MOSS-Image 的 Caption 或 Layout Prompt 时使用。
---

# MOSS-Image Prompt Builder

## Choose the deliverable

1. Honor an explicit request for a caption or Layout. Otherwise, use a caption for ordinary scenes, photographs and illustrations. Use Layout when text placement, posters, multiple panels or controlled object relationships require bounding boxes.
2. Preserve the user's subjects, counts, relationships, medium, style and exclusions. Resolve ordinary creative gaps; ask when a missing decision would materially change the image. Do not invent factual event logistics or specifications.
3. Default to English descriptive prose unless the user requests another language. Identify the wording the user intends to render and preserve it verbatim, including punctuation, capitalization and line breaks.

## Develop the image

1. When the user supplies novel text, character profiles or evidence packets, use `character-portrait-prompt-designer` to develop the character and scene. If a design is already handed over, read its appearance baseline, story stage, scene description and source notes. Preserve the distinction between source facts and creative additions.
2. Describe the subject and action, appearance, setting, framing, medium, lighting, materials, palette and mood as needed for the requested image. Keep minimalist briefs minimalist and develop rich briefs with specific visible details.
3. For designed images, establish reading order, relative prominence, coherent groups and readable text at the chosen resolution. Write the intended copy. Use supplied references when useful; research facts when accuracy requires it or the user requests it.
4. Keep JSON instructions, bounding-box annotations, source notes and conversion steps out of image-description fields. Turn the visible design into the selected Caption or Layout draft, then follow “Compile and deliver”.

## Caption

1. Use cohesive prose with spatial relationships in words and quote the intended visible wording. The caption may contain paragraphs. Prepare the draft using the compiler help; keep coordinates and Layout fields outside the caption.

## Layout

1. Before writing a Layout draft, read the compiler help using the entry in “Compile and deliver” for input fields and the coordinate convention.
2. Honor supplied dimensions. With only an aspect ratio, choose compatible pixel dimensions; otherwise use 1024×1024 unless the medium suggests another shape. If explicit dimensions violate the compiler help's constraints, report the conflict and ask for compatible dimensions.
3. Use boxes for coherent visible units and split items when independent placement matters. Preserve each unit's content and relationships; allow natural overlap and occlusion. Describe borders, panels or stickers in captions when requested.
4. Describe global treatment in `summary.caption` and each item's appearance in its `caption`. Keep boxes consistent with the spatial description and keep exact visible strings in text items' `text` fields.
5. Check that text length, line breaks and glyph scale fit each box. Enlarge or recompose unreadable layouts while preserving the copy. For knowledge graphics, develop explanations and supporting imagery; for posters, preserve the intended visual identity and information hierarchy.
6. When revising a draft, preserve content outside the requested changes. Recompile after editing geometry or canvas dimensions.

## Compile and deliver

1. Before preparing compiler input, run `python3 scripts/compile_prompt.py --help` from this Skill's directory. Reuse help still in context during the same session; reread it after context compression removes the invocation contract. Save the editable draft in the user's working directory.
2. Compile the draft and read the output file at the path returned on stdout. End the tool call by returning the compiled text.
3. After receiving the compiled text, check the subject, exact text, geometry and canvas against the request. If validation fails, correct the draft and repeat from step 2. Do not manually convert the coordinates.
4. After the check passes, return the compiled prompt without reformatting, or link to its file, and retain the editable draft. For Layout, state the required width×height outside the prompt.
5. When generation is requested, submit only the checked compiled content as MOSS-Image's positive prompt in a later tool call.
