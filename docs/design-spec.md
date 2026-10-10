# Haptic landing page: design spec

Measured from the Affinity mockup (`LandingPageDesign`, exported at 2560 × 4769 px = **1280 CSS px @2x**).
All numbers below are **CSS px at a 1280 px viewport**. In code, write them as `calc(N * var(--u))`
(`--u` = 1px at 1280, scales with viewport, capped at 1.25px). Mobile layouts (≤ 820px) use their own values.

Fonts (confirmed from the .afphoto file):

| Role | Font | Notes |
|---|---|---|
| Display: HAPTIC title, logo, giant footer word | **Block Berthold** (`--font-display`) | rough-edged heavy grotesque |
| Serif: "Hideout Presents", "the … game engine" | **Haptic Serif** (`--font-serif`) | mockup uses Recoleta Regular; replaced by a free Fraunces instance matched to Recoleta's width/weight (approved) |
| UI / body | **Onest** (`--font-sans`, variable) | Medium 500 for body/UI, Black 900 for "portable" |

## Global

- Page background `#0b0a08` (near-black, slightly warm).
- **Grain**: monochrome additive noise across backgrounds *and* the HAPTIC title / text (σ ≈ 12–20 levels, 1 device pixel per grain).
  Editor screenshots and device frames have **no** grain. Use `<Grain />` / `.grain-layer` (texture generated at runtime; nothing is an image asset).
  Stacking inside a section: `--z-bg` (0) < `--z-content` (1) < `--z-grain` (2) < `--z-media` (3).
- Text is white `#fff` unless noted.

## Chromatic-aberration (CA) look

Measured on the clean title export:

- **HAPTIC title**: white glyphs over two colour copies that are **scaled horizontally about the word's centre**
  (lens-style CA, so fringes grow toward the ends: ~23 px at the H/C ends, ~13 px at A, ~0 at the centre).
  - amber `#ffb300` copy: `scaleX ≈ 1.045`
  - red `#ff4400` copy: `scaleX ≈ 1.08` (beneath the amber)
  - the **white glyphs are crisp live text** (the designer's SVG export is white Block Berthold text, 343.9px @2x = 172px, over a
    soft raster fringe layer); only the colour copies are soft (edge feather ≈ 2–3 px, `filter: blur(~1.5px)`)
  - **No vertical fringes.**
- **Logo "H"** (top centre): the title's H scaled to ≈ 0.2466 (≈ 42.4px Block Berthold) with the same fringe layer, so fringes appear on both sides (amber inner ~2.5px, red outer ~2.5px).
- **"portable"**: Onest Black, white, with **vertical** red/amber fringes above and below (~4–5 px, mostly `#ff4400`, faint amber at the inner edge).
- **Menu-open icon**: the H becomes a white rounded bar (30 × 10) with fringes **above and below** (rotated CA). See header section.

## 1. Header / logo (fixed or absolute at top, centred)

- Logo "H": white ink box 25 × 30, top = 17, centred at x = 640. With CA fringes the visual is ~37 px wide.
  Block Berthold "H" at ≈ 42px font-size, or an equivalent drawn shape.
- It is the **menu button**. On open it morphs into the bar icon: white rounded rect, ink 30 × 10, centred x = 640, y ≈ 37–47 (centre ≈ 42), with amber then red fringes above and below (each ≈ 4–5 px).

### Menu popover (open state; reference `mockup-menu-closeup-2560.png`)

- Panel: x 391.5 → 888.5 (w ≈ 497, centred), top ≈ 77, bottom ≈ 470 (h ≈ 393). Radius ≈ 16.
- A small rounded **notch/arrow** on the top edge at the centre pointing at the icon. Exact outline from the designer's SVG
  (`menu-popover-shape.svg`, 995 × 828 @2x): body 497.5 × 393.5 CSS with 16px corner radius; the notch rises 17.7px above the
  body's top edge, ≈ 85px wide at the base including the concave fillets, ≈ 17px wide rounded tip, centred.
- Fill: dark, translucent with backdrop blur. Measured colour goes from `#1b1b1b` (over the dark sky) to `#38302b` / `#36221f`
  (over the glow), i.e. roughly `rgb(24 24 24 / 0.86)` + `backdrop-filter: blur(24px) saturate(1.2)`. No visible border; soft shadow.
- Padding ≈ 24.5 left/right. Two columns: left at x = 416, right column at x ≈ 639.
- Type: Onest 500, ≈ 18px, white, line pitch 33px.
- Content (newest closeup version):
  - Left column: **Haptic Engine** (y ≈ 109.5) · (gap) · **Pages:** (y ≈ 170) · Home (203) · Pricing & Download (236) · Support (269) · About (302)
  - Right column: **Learning Center** (y ≈ 109.5) · Coming soon.... (y ≈ 170)
  - Footer row (y ≈ 431): **Hideout** (left) · **🇳🇴 Norway** (right-aligned; mockup literally says "(NorwegianFlag) Norway", render a Norwegian flag, emoji or inline SVG)
- Page content behind is **not** dimmed.

## 2. Hero (0 → ~1263)

Background, bottom to top:
1. Night-sky photo (`src/assets/bg/night-sky.jpg`, 2560 × 1696): displayed ≈ full width (1280 wide → ≈ 848 tall) from the top of the page.
   The dark mountain slope is visible on the right from y ≈ 390; the snowy peak is mostly hidden behind the glow/editor.
   Below the photo the page is near-black (`#090909`–`#0f0e0a`).
2. **Glow**: a big soft, bell-shaped gradient blob (shape reference `glow-blob-shape.png`, heavily blurred), centred at x = 640:
   - top cap (y ≈ 80–150) **blue/teal**: `#18303f` → `#3a555d` (centre), fading to the sky at the sides
   - y ≈ 200: sandy orange `#937947` (centre)
   - y ≈ 260–330: orange `#c25b21` → `#d9641e` (centre), edges at x ≈ 200 / 1050
   - y ≈ 380: red-orange `#dd5329`; sides pinkish purple (`#422a48` at x 150, `#6b3a55` at x 1050)
   - y ≈ 440: red `#d1413b` centre; purple edges (`#5a3079` at x 200, `#7a3886` at x 1050)
   - y ≈ 500: crimson `#b02f57` centre; purple `#9c30a2` at x 250 / 1050
   - y ≈ 540: magenta `#b72771` centre; violet `#a729ac` at x 250 / 1050
   - y ≈ 570: `#952360` (meets the top of the editor window)
   - Horizontal extent ≈ x 120 → 1160 at its widest (y ≈ 440–560), ≈ x 350 → 900 at the top cap.
3. Grain over everything except the editor window.

Content (all centred on x = 640):

| Element | Spec | Ink box (CSS px) |
|---|---|---|
| "Hideout Presents" | serif (Haptic Serif) **32px** | y 149.5 → 173 (cap top → baseline), w 240 |
| "HAPTIC" | Block Berthold, **172px**, tracking 0, CA (above) | white ink y 253.5 → 375.5, x 383 → 896 |
| "the **portable** game engine" | serif 32px + Onest 900 32px for "portable" | y 407.5 → 437.5, x 448.5 → 820.5 |
| "Scroll to find out more" | Onest 500, **24px** | y 528 → 545.5, w 252 |
| Chevron (down) | thin stroke chevron ≈ 14 × 7.5, ~1.5px stroke | y 554 → 561 |
| Editor window | iPad screenshot `editor-tablet.jpg` with its iPad status bar cropped off (top ≈ 61 of 1640 source px), radius ≈ 12, 1px dark border | x 128 → 1152 (w 1024), y 577.5 → ~1262.5 |

The editor window sits above the grain (no noise on the screenshot).

## 3. "Anywhere" section (≈ 1263 → 2100)

Background: horizontal bands, full-bleed (sampled at the left edge, y = absolute page px at 1280):

| y | colour |
|---|---|
| 1260 | `#0a1622` |
| 1350 | `#0b1d2f` |
| 1440 | `#0c2a46` |
| 1500 | `#0c3659` |
| 1560 | `#0d436f` (peak blue) |
| 1590 | `#1c466c` |
| 1620 | `#3a465d` |
| 1650 | `#5a464f` |
| 1680 | `#7a4640` |
| 1710 | `#984530` |
| 1740 | `#b84522` |
| 1770 | `#d74415` |
| 1800 | `#f1440b` (peak orange-red) |
| 1830 | `#d53908` |
| 1860 | `#a52c08` |
| 1890 | `#7f2309` |
| 1920 | `#5f1b09` |
| 1950 | `#461509` |
| 1980 | `#321109` |
| 2010 | `#240e09` |
| 2040 | `#1a0c09` |
| 2070 | `#130b08` |
| 2100 | `#0e0908` |
| 2160+ | `#0a0908` |

Plus grain.

Text (left column at x = 129.5 ≈ `--gutter`):
- "The engine you can bring anywhere": Onest 500 **32px**, ascender top y = 1422
- "PLACEHOLDER TEXT": Onest 500 **32px**, cap top y = 1486 (so ~64px line pitch)

Devices (mockup composition, the final state of the scroll animation):
- MacBook Pro 16 (Space Black frame `macbook-pro-16-space-black.png`, 4256 × 2834, screen rect x 400 y 300 w 3456 h 2234, top radius ≈ 55 source px)
  on the right, left edge at x ≈ 751, top ≈ 1380, running off the right edge of the viewport. The screen shows the editor screenshot top-aligned (with the iPad status bar visible).
- iPhone Air (Space Black frame `iphone-air-space-black.png`, 1490 × 2996, screen x 100 y 100 w 1290 h 2796, radius ≈ 240 source px)
  in front of the MacBook's left edge: x ≈ 676 → 849, y ≈ 1510 → 1872. Shows `projects-phone.jpg` (Haptic's Projects screen).
- NEW: iPad Pro 11 (Space Black frame `ipad-pro-11-landscape-space-black.png`, 2620 × 1868, screen x 100 y 100 w 2420 h 1668, radius ≈ 69 source px). Shows `editor-tablet.jpg`.

## 4. Download section (new, not in mockup)

"Get Haptic" (Onest 700, white, 72px at 1280, no colour fringes), serif lead "Build from anywhere, anytime.",
OS-aware primary button (official App Store / Google Play badges for mobile, custom desktop buttons),
the Haptic Pro note and "View Pricing for more details.", then an "Other platforms" row.

## 5. Footer (≈ 2100 → 2384.5 page end)

- Dark (`#0a0908`) with grain.
- Mockup placeholder footer line is replaced by one row of small muted text (≈15px at 1280, `--c-text-muted`) centred on the
  mockup's footer line: legal notice on the left — "© {year} Bru Development ENK.  Haptic™ is a trademark of Bru Development ENK."
  (™ = unregistered trademark) — and the nav (Home · Pricing · Signup · About, same size/colour, white on hover) on the right.
- **Giant "HAPTIC"**: Block Berthold, colour `#676767`, **≈ 428px** (≈ 33.4vw at 1280), starts at x ≈ −14.8 (so the H's ink starts at x ≈ 1.5),
  cap top at y ≈ 2234 and baseline ≈ 150px **below** the page bottom, so only the top ~half of the letters shows and the word runs off the right edge (the C is cut).
- The page ends at 2384.5 (mockup height).

## Extra placeholder screenshots

- `src/assets/editor/projects-phone.jpg` (1179 × 2556): iPhone Projects/home screen of the app, the iPhone's screen in the device showcase.
