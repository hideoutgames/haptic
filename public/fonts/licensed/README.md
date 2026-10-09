# Licensed fonts (not committed)

Place the web font files here before building:

- `block-berthold.woff2` – Block Berthold (H. Berthold AG / Adobe). Web-embedding licence required.
- `recoleta-regular.woff2` – Recoleta Regular (Latinotype). The supplied file is the **DEMO** build; a commercial web licence is required for production.

They are git-ignored because this repository is public. Convert from OTF with:

```sh
pip install fonttools brotli
python -c "from fontTools.ttLib import TTFont as T; f=T('blockberthold.otf'); f.flavor='woff2'; f.save('block-berthold.woff2')"
```
