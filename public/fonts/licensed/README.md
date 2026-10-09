# Licensed fonts

- `block-berthold.woff2`: Block Berthold (H. Berthold AG / Adobe). Licence confirmed by Hideout.

Recoleta (used in the mockup) was replaced by `../haptic-serif.woff2`, a free OFL instance of Fraunces.

Convert an OTF to WOFF2 with:

```sh
pip install fonttools brotli
python -c "from fontTools.ttLib import TTFont as T; f=T('font.otf'); f.flavor='woff2'; f.save('font.woff2')"
```
