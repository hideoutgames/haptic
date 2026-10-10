/**
 * Textures: the editor screenshots (loaded from the optimised URLs the page
 * hands over) and the few that are drawn in code: the key legends, the macOS
 * menu bar and the soft contact shadow.
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
 */
export function createShadowTexture(size = 128): CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  const box = size * 0.26; // half extent of the solid core
  const radius = size * 0.2;
  const sigma = size * 0.13;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.abs(x + 0.5 - half) - (box - radius);
      const py = Math.abs(y + 0.5 - half) - (box - radius);
      const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - radius;
      // Gaussian falloff outside the core, solid inside.
      const a = outside <= 0 ? 1 : Math.exp(-(outside * outside) / (2 * sigma * sigma));
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

/** A dark macOS-style menu bar (the strip the notch sits in). */
export function createMenuBarTexture(): CanvasTexture {
  const w = 2048;
  const h = 40;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#121214';
  ctx.fillRect(0, 0, w, h);
  const font = (weight: number, size: number) => `${weight} ${size}px "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  // Left: app menu.
  ctx.font = font(700, 21);
  let x = 56;
  ctx.fillText('Haptic', x, h / 2 + 1);
  x += ctx.measureText('Haptic').width + 34;
  ctx.font = font(500, 21);
  for (const item of ['File', 'Edit', 'View', 'Project', 'Window', 'Help']) {
    ctx.fillText(item, x, h / 2 + 1);
    x += ctx.measureText(item).width + 34;
  }
  // Right: status items and the clock.
  ctx.textAlign = 'right';
  ctx.fillText('Thu 8 Oct   19:04', w - 56, h / 2 + 1);
  ctx.textAlign = 'left';
  const clockLeft = w - 56 - ctx.measureText('Thu 8 Oct   19:04').width - 0;
  // Battery
  const bx = clockLeft - 150;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, h / 2 - 8, 32, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(bx + 33, h / 2 - 3, 3, 6);
  ctx.fillRect(bx + 3, h / 2 - 5, 20, 10);
  // Wi-Fi
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2.4;
  const wx = bx - 56;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(wx, h / 2 + 9, i * 6.5, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(wx, h / 2 + 9, 1.8, 0, Math.PI * 2);
  ctx.fill();
  const tex = new CanvasTexture(c);
  tex.minFilter = LinearMipmapLinearFilter;
  return finish(tex, 8);
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
