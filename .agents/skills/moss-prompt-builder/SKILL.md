---
name: moss-prompt-builder
description: Expand an image-generation request into a detailed MOSS-Image caption or spatial layout, and compile a local JSON draft into a ready-to-paste prompt. Use for prompt enhancement, image composition and text placement; this skill does not generate images.
---

# MOSS-Image Prompt Builder

## Choose the deliverable

1. Honor an explicit request for a caption or Layout. Otherwise, use a caption for ordinary scenes, photographs and illustrations. Use Layout when text placement, posters, multiple panels or controlled object relationships require bounding boxes.
2. Preserve the user's subjects, counts, relationships, medium, style and exclusions. Resolve ordinary creative gaps; ask when a missing decision would materially change the image. Do not invent factual event logistics or specifications.
3. Default to English descriptive prose unless the user requests another language. Identify the wording the user intends to render and preserve it verbatim, including punctuation, capitalization and line breaks.

## Develop the image

1. Describe the subject and action, appearance, setting, framing, medium, lighting, materials, palette and mood as needed for the requested image. Keep minimalist briefs minimalist and develop rich briefs with specific visible details.
2. For designed images, establish reading order, relative prominence, coherent groups and readable text at the chosen resolution. Write the intended copy. Use supplied references when useful; research facts when accuracy requires it or the user requests it.
3. Keep JSON instructions, bounding-box annotations and conversion steps out of image-description fields.

## Caption

1. Write a UTF-8 JSON draft containing exactly `{"caption":"..."}`. Use cohesive prose with spatial relationships in words and quote the intended visible wording. The caption may contain paragraphs. Do not include coordinates or Layout fields.

## Layout

1. Before writing a Layout draft, read [references/layout.md](references/layout.md) for the input fields and coordinate convention.
2. Honor supplied dimensions. With only an aspect ratio, choose compatible pixel dimensions; otherwise use 1024×1024 unless the medium suggests another shape. If explicit dimensions violate the reference's dimension constraints, report the conflict and ask for compatible dimensions.
3. Use boxes for coherent visible units and split items when independent placement matters. Preserve each unit's content and relationships; allow natural overlap and occlusion. Describe borders, panels or stickers in captions when requested.
4. Describe global treatment in `summary.caption` and each item's appearance in its `caption`. Keep boxes consistent with the spatial description and keep exact visible strings in text items' `text` fields.
5. Check that text length, line breaks and glyph scale fit each box. Enlarge or recompose unreadable layouts while preserving the copy. For knowledge graphics, develop explanations and supporting imagery; for posters, preserve the intended visual identity and information hierarchy.
6. When revising a draft, preserve content outside the requested changes. Recompile after editing geometry or canvas dimensions.

## Compile and deliver

1. Save the draft in the user's working directory. Before the first compilation, read [references/compiler.md](references/compiler.md) in full and follow its invocation instructions.
2. Compile the draft and locate the output file using the path returned on stdout.
3. Read the compiled file and check the subject, exact text, geometry and canvas against the request. If validation fails, correct the draft and rerun the compiler. Do not manually convert the coordinates.
4. Return the ready-to-paste prompt or a link to its file, retaining the editable draft. A Caption output is plain text. A Layout output is one physical line of JSON with `abs_centralized` / `yxyx` boxes; present it without reformatting and state the required width×height outside the prompt.
5. Use only the compiled content as MOSS-Image's positive prompt.
