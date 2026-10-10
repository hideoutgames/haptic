/**
 * MacBook Pro keyboard: the key layout (rows of keys in key units), the
 * instanced keycaps and one merged quad mesh for the printed legends.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Color,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createLegendAtlas, type Legend } from './textures';

/** Key pitch in mm and the gap between caps. */
const PITCH = 19.3;
const GAP = 1.75;

interface KeySpec {
  /** Width in key units. */
  w: number;
  legend?: Legend;
  /** Half-height key (the up/down arrows). */
  half?: 'top' | 'bottom';
}

const k = (w: number, main?: string, extra: Partial<Legend> = {}): KeySpec => ({ w, legend: main === undefined ? undefined : { main, ...extra } });
const pair = (main: string, sub: string): KeySpec => ({ w: 1, legend: { main, sub, size: 0.9 } });
const letter = (c: string): KeySpec => ({ w: 1, legend: { main: c, size: 1.0 } });
const fn = (n: number): KeySpec => ({ w: 1, legend: { main: `F${n}`, size: 0.5, corner: 'bl' } });
const mod = (w: number, label: string, corner: 'bl' | 'br', size = 0.42): KeySpec => ({ w, legend: { main: label, corner, size } });

const ROWS: Array<{ h: number; keys: KeySpec[] }> = [
  {
    h: 0.78,
    keys: [mod(1.5, 'esc', 'bl', 0.42), ...Array.from({ length: 12 }, (_, i) => fn(i + 1)), { w: 1 }],
  },
  {
    h: 1,
    keys: [
      pair('`', '~'),
      pair('1', '!'),
      pair('2', '@'),
      pair('3', '#'),
      pair('4', '$'),
      pair('5', '%'),
      pair('6', '^'),
      pair('7', '&'),
      pair('8', '*'),
      pair('9', '('),
      pair('0', ')'),
      pair('-', '_'),
      pair('=', '+'),
      mod(1.5, 'delete', 'br'),
    ],
  },
  {
    h: 1,
    keys: [mod(1.5, 'tab', 'bl'), ...'QWERTYUIOP'.split('').map(letter), pair('[', '{'), pair(']', '}'), pair('\\', '|')],
  },
  {
    h: 1,
    keys: [mod(1.75, 'caps lock', 'bl', 0.36), ...'ASDFGHJKL'.split('').map(letter), pair(';', ':'), pair("'", '"'), mod(1.75, 'return', 'br')],
  },
  {
    h: 1,
    keys: [mod(2.25, 'shift', 'bl'), ...'ZXCVBNM'.split('').map(letter), pair(',', '<'), pair('.', '>'), pair('/', '?'), mod(2.25, 'shift', 'br')],
  },
  {
    h: 1,
    keys: [
      mod(1, 'fn', 'bl'),
      mod(1, 'control', 'bl', 0.36),
      mod(1, 'option', 'bl', 0.36),
      mod(1.25, 'command', 'bl', 0.36),
      { w: 5 },
      mod(1.25, 'command', 'br', 0.36),
      mod(1, 'option', 'br', 0.36),
    ],
  },
];

export interface KeyPlacement {
  x: number;
  z: number;
  w: number;
  d: number;
  legend?: number;
  corner?: 'bl' | 'br';
}

/** Lays the rows out; (0, 0) is the middle of the keyboard's back edge. */
export function layoutKeys(legends: Legend[]): { keys: KeyPlacement[]; width: number; depth: number } {
  const keys: KeyPlacement[] = [];
  const unitsWide = 14.5;
  const x0 = (-unitsWide * PITCH) / 2;
  let z = 0;
  const push = (spec: KeySpec, x: number, zTop: number, hUnits: number, wUnits = spec.w) => {
    let legend: number | undefined;
    if (spec.legend) legend = legends.push(spec.legend) - 1;
    keys.push({
      x: x + (wUnits * PITCH) / 2,
      z: zTop + (hUnits * PITCH) / 2,
      w: wUnits * PITCH - GAP,
      d: hUnits * PITCH - GAP,
      legend,
      corner: spec.legend?.corner,
    });
  };

  for (const row of ROWS) {
    let x = x0;
    for (const spec of row.keys) {
      push(spec, x, z, row.h);
      x += spec.w * PITCH;
    }
    // The bottom row ends with the arrow cluster: left, up/down, right.
    if (row === ROWS[ROWS.length - 1]) {
      const arrow = (glyph: string): KeySpec => ({ w: 1, legend: { main: glyph, size: 0.5 } });
      push(arrow('◀'), x, z, 1);
      push(arrow('▲'), x + PITCH, z, 0.5);
      push(arrow('▼'), x + PITCH, z + 0.5 * PITCH, 0.5);
      push(arrow('▶'), x + 2 * PITCH, z, 1);
    }
    z += row.h * PITCH;
  }
  return { keys, width: unitsWide * PITCH, depth: z };
}

export interface Keyboard {
  group: Group;
  width: number;
  depth: number;
}

/**
 * Builds the keycaps and legends for a keyboard whose back edge is at z = 0
 * (centred in x), standing on `y = 0`.
 */
export function createKeyboard(keycap: Material): Keyboard {
  const legends: Legend[] = [];
  const { keys, width, depth } = layoutKeys(legends);
  const group = new Group();

  // One instanced mesh per key size.
  const bySize = new Map<string, KeyPlacement[]>();
  for (const key of keys) {
    const id = `${key.w.toFixed(2)}x${key.d.toFixed(2)}`;
    (bySize.get(id) ?? bySize.set(id, []).get(id)!).push(key);
  }
  const KEY_H = 1.7;
  const m = new Matrix4();
  for (const list of bySize.values()) {
    const geo = new RoundedBoxGeometry(list[0].w, KEY_H, list[0].d, 3, 0.6);
    const mesh = new InstancedMesh(geo, keycap, list.length);
    list.forEach((key, i) => {
      m.makeTranslation(key.x, KEY_H / 2, key.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Legends: one quad each, merged. Quads keep a fixed size and are anchored
  // inside the key, so wide keys do not stretch their text.
  const atlas = createLegendAtlas(legends);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const y = KEY_H + 0.04;
  keys.forEach((key) => {
    if (key.legend === undefined) return;
    const size = Math.min(key.w, key.d, 15.2);
    let cx = key.x;
    if (key.corner === 'bl') cx = key.x - key.w / 2 + size / 2 + 0.2;
    if (key.corner === 'br') cx = key.x + key.w / 2 - size / 2 - 0.2;
    const x0 = cx - size / 2;
    const x1 = cx + size / 2;
    const z0 = key.z - size / 2;
    const z1 = key.z + size / 2;
    const [u0, v0, u1, v1] = atlas.uv(key.legend);
    const base = positions.length / 3;
    positions.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const legendGeo = new BufferGeometry();
  legendGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  legendGeo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  legendGeo.setIndex(index);
  const legendMat = new MeshBasicMaterial({
    map: atlas.texture,
    transparent: true,
    depthWrite: false,
    color: new Color('#a9adb6'),
    toneMapped: false,
  });
  const legend = new Mesh(legendGeo, legendMat);
  legend.renderOrder = 2;
  group.add(legend);

  return { group, width, depth };
}
