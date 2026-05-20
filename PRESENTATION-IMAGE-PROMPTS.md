# Image prompts for the 5-minute presentation

Four image prompts written for **OpenAI `gpt-image-1`** (also work with DALL-E 3). Each is paired with the moment in the presentation it supports.

**Common style guidance** to append if you want a consistent set:
> *Editorial-clean fintech illustration style, restrained palette of deep navy (#0c1f2f), soft blue (#0875b7), warm cream and amber accents. No text or letters anywhere in the image. Suitable for a 16:9 presentation slide, slight grain, professional, calm, not glossy or "tech-bro".*

Aspect ratio for slides: pass `size: "1792x1024"` (widescreen) to the API.

---

## Image 1 — Opening hook: the compliance problem

**Used at:** 0:00 — "EU's new AMLR takes effect in 2027 … doing this by hand is the problem we automated."

**Prompt:**
> A wide editorial illustration of a single compliance officer standing in a vast, dimly lit European bank archive at night. Walls of grey filing cabinets stretch into perspective on both sides, each drawer half-open and overflowing with paper forms in different European languages. Above the officer, glowing blue and amber regulatory paragraphs float in the air like ghostly text fragments arranged in flowing streams — abstract glyphs, not real letters. A small desk lamp casts a warm pool of light on a single open binder labelled with a stylised European Union star pattern. The mood is overwhelmed but not despairing — a single human against an architectural-scale paperwork problem. Cinematic depth of field, deep navy walls, soft amber lamp glow, painted texture, slight grain. No legible text or numbers.

**Why it works:** sets the human scale of the problem, hints at multiple jurisdictions and languages without literally showing flags, sells the "this is too much by hand" angle.

---

## Image 2 — The two-layer architecture: EU core + national overlays

**Used at:** 0:45 — "We layer that country's national law on top of the EU core."

**Prompt:**
> A clean isometric infographic illustration of a layered glass-and-light architecture, viewed from a low three-quarter angle. At the base, a large translucent navy-blue platform shaped like a circle of twelve glowing stars, representing a shared European core. Stacked above it are three smaller, semi-transparent platforms levitating at slightly different heights: one tinted with a blue-and-yellow gradient, one with a red-and-gold gradient, and one with a black-red-gold gradient. Thin geometric light beams rise from the navy base through each upper platform, showing dependency. Each upper platform carries a small, abstract floating icon — a magnifying glass for review, a document stack for paperwork, a shield for safety — rendered as pure geometric shapes, not literal pictograms. Background is a soft cream gradient. Editorial-clean fintech style, restrained palette, calm, professional. No text or letters anywhere.

**Why it works:** literal visual of the two-layer model in the presentation; shows three countries without naming them; the navy base + three coloured layers is exactly the architecture you describe verbally.

---

## Image 3 — The instant country swap

**Used at:** 2:15 — "Same role, same EU regulation — but I'm going to switch the jurisdiction. Instant."

**Prompt:**
> A wide horizontal triptych illustration in editorial fintech style. Three identical clean office interiors are arranged side by side, separated only by thin vertical lines of light. In each interior, the same abstract human silhouette sits at the same desk in the same posture, reviewing the same translucent document. What changes between the three panels is the colour temperature and ambient detail: the leftmost panel bathed in cool Scandinavian blue light with soft yellow accents and minimalist Nordic furniture cues; the middle panel warm with red and golden Mediterranean afternoon light and arched window shapes; the right panel cooler with grey-black and red architectural elements suggesting Central European precision. Each panel has a single glowing icon floating above the desk — an abstract geometric shape suggesting a national seal, not a literal flag. Crisp three-panel composition, restrained palette, calm, professional. No flags, no text, no letters.

**Why it works:** visualises "same role, three jurisdictions" without using literal flag clichés; the colour palette nods to SE/ES/DE flag colours subtly; communicates that the work is the same but the context shifts.

---

## Image 4 — Audit-ready close

**Used at:** 4:25 — "audit-ready evidence at every step … meet the 2027 deadline without a hundred new compliance hires."

**Prompt:**
> A close-up editorial photograph-style illustration of a single elegant matte-finish folder labelled with a stylised circle of twelve gold stars. The folder sits on a clean walnut desk under soft daylight from a tall window on the left. Beside the folder, three small numbered tabs in different colour accents — cool blue, warm red, deep gold-on-black — protrude slightly, suggesting tabbed sections without spelling anything out. A fountain pen rests across the folder, mid-signature pose. In the soft background, a faint architectural hint of a regulator's hearing room: tall ceilings, leather chairs, slightly out of focus. Restrained palette of deep navy, walnut brown, soft daylight cream, with the three colour accents. Calm, authoritative, slightly cinematic. No text, no letters, no numbers visible.

**Why it works:** closes the presentation on the "audit-ready / regulator-facing" emotional beat; the three tabs subtly echo the three countries from earlier; conveys finality and authority without being heavy-handed.

---

## Notes on generation

- Generate at `size: "1792x1024"` for a slide-ready widescreen output.
- If a model insists on adding garbled text (`gpt-image-1` is much better than DALL-E 3 but can still slip), regenerate with **"no text, no letters, no numbers, no flags"** explicitly added as the final sentence.
- For Image 3, if you want the country colours **more** literal, swap the line *"abstract geometric shape suggesting a national seal"* for *"a vertical tricolour bar in muted Scandinavian blue and yellow / Spanish red and gold / German black, red and gold"*. Trade-off: a bit more cliché but more demo-legible.
- All four are designed to work as a coherent set — generate them in one session so the model anchors to the same style.
