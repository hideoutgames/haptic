# Licensed fonts

- `block-berthold.woff2`: Block Berthold (H. Berthold AG / Adobe). Licence confirmed by Hideout; committed.
- `recoleta-regular.woff2`: Recoleta Regular **DEMO** cut (Latinotype). **Not committed**: the demo is not licensed for publishing.
  Without it the site falls back to `Haptic Serif` (`/fonts/haptic-serif.woff2`, a free OFL instance of Fraunces).
  To use real Recoleta, buy a web licence and drop the woff2 here (and un-ignore it in `.gitignore`).

Convert an OTF to WOFF2 with:

```sh
pip install fonttools brotli
python -c "from fontTools.ttLib import TTFont as T; f=T('font.otf'); f.flavor='woff2'; f.save('font.woff2')"
```
