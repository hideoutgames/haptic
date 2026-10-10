/**
 * Textures: the editor screenshots (loaded from the optimised URLs the page
 * hands over) and the few that are drawn in code: the key legends and the
 * soft contact shadow.
 */
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Texture, TextureLoader, type WebGLRenderer } from 'three';

import type { ScreenUrls } from './textures-types';

export type { ScreenUrls };

export interface ScreenTextures {
  tablet: Texture;
  phone: Texture;
  projects: Texture;
}

/** Loads the three screenshots, reporting progress (0–1) as each one arrives. */
export async function loadScreens(urls: ScreenUrls, renderer: WebGLRenderer, report: (p: number) => void): Promise<ScreenTextures> {
  const loader = new TextureLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  let done = 0;
  const load = (url: string) =>
    loader.loadAsync(url).then((tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = anisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = LinearMipmapLinearFilter;
      tex.magFilter = LinearFilter;
      tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
      report(++done / 3);
      return tex;
    });
  const [tablet, phone, projects] = await Promise.all([load(urls.tablet), load(urls.phone), load(urls.projects)]);
  return { tablet, phone, projects };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function finish(tex: CanvasTexture, anisotropy = 4): CanvasTexture {
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft shadow: a blurred rounded box, drawn per pixel from its distance field,
 * so it does not depend on canvas filters (not supported everywhere).
 * Alpha only; the material colours it.
 *
 * The alpha is windowed to reach exactly 0 well inside the texture border: a
 * Gaussian alone is still a few per cent there, which shows as a faint
 * straight edge of the quad against the backdrop.
 */
export function createShadowTexture(size = 256): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  const box = size * 0.22; // half extent of the solid core
  const radius = size * 0.16;
  const sigma = size * 0.105;
  // Fully transparent from this distance outside the core (the border is at 0.28).
  const fadeStart = size * 0.1;
  const fadeEnd = size * 0.265;
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.abs(x + 0.5 - half) - (box - radius);
      const py = Math.abs(y + 0.5 - half) - (box - radius);
      const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - radius;
      // Gaussian falloff outside the core, solid inside, faded out before the border.
      const a = outside <= 0 ? 1 : Math.exp(-(outside * outside) / (2 * sigma * sigma)) * (1 - smooth(fadeStart, fadeEnd, outside));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export interface Legend {
  /** Main glyph (bottom or centre). */
  main: string;
  /** Shifted glyph printed above `main`. */
  sub?: string;
  /** Small text keys (modifiers) sit in a corner. */
  corner?: 'bl' | 'br';
  /** Font scale (1 = full size). */
  size?: number;
}

export interface LegendAtlas {
  texture: CanvasTexture;
  cols: number;
  rows: number;
  /** UV rectangle [u0, v0, u1, v1] of a legend. */
  uv(index: number): [number, number, number, number];
}

/** One white-on-transparent atlas holding every key legend. */
export function createLegendAtlas(legends: Legend[]): LegendAtlas {
  const cell = 128;
  const cols = 8;
  const rows = Math.ceil(legends.length / cols);
  const [c, ctx] = canvas(cols * cell, rows * cell);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  const family = '"SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
  legends.forEach((l, i) => {
    const ox = (i % cols) * cell;
    const oy = Math.floor(i / cols) * cell;
    const size = (l.size ?? 1) * 54;
    ctx.font = `500 ${size}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    if (l.corner) {
      ctx.textAlign = l.corner === 'bl' ? 'left' : 'right';
      const x = l.corner === 'bl' ? ox + 10 : ox + cell - 10;
      ctx.fillText(l.main, x, oy + cell - 14);
    } else if (l.sub) {
      ctx.textAlign = 'center';
      ctx.font = `500 ${size * 0.82}px ${family}`;
      ctx.fillText(l.sub, ox + cell / 2, oy + cell * 0.48);
      ctx.font = `500 ${size * 0.82}px ${family}`;
      ctx.fillText(l.main, ox + cell / 2, oy + cell * 0.86);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(l.main, ox + cell / 2, oy + cell * 0.5 + size * 0.36);
    }
  });
  const texture = new CanvasTexture(c);
  texture.minFilter = LinearMipmapLinearFilter;
  finish(texture, 8);
  const w = cols * cell;
  const h = rows * cell;
  return {
    texture,
    cols,
    rows,
    uv(index: number) {
      const ox = (index % cols) * cell;
      const oy = Math.floor(index / cols) * cell;
      return [ox / w, 1 - (oy + cell) / h, (ox + cell) / w, 1 - oy / h];
    },
  };
}
