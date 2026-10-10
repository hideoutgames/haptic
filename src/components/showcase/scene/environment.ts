/**
 * Lighting.
 *
 * Reflections come from an environment rendered through PMREMGenerator: three's
 * RoomEnvironment (its soft boxes and blocks, with the walls taken away and
 * dimmed) inside a dusk dome whose gradient is the page backdrop: deep blue
 * overhead, an orange glow on the horizon. Soft boxes added on top give the
 * glass and the polished edges something to mirror. On top of that sit a key
 * light and two coloured rim/bounce lights.
 */
import {
  BackSide,
  BufferAttribute,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  type Light,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Colour of the dusk dome by elevation (-1 floor … +1 zenith): [elevation, colour, HDR gain]. */
const DOME: Array<[number, string, number]> = [
  [-1, '#0e0604', 1],
  [-0.35, '#2c1106', 1],
  [-0.08, '#8a3812', 1],
  [0.015, '#ff7a30', 2],
  [0.07, '#4a3d45', 0.5],
  [0.2, '#25364f', 0.55],
  [0.55, '#101b2e', 0.9],
  [1, '#06090f', 1],
];

function domeColor(y: number, out: Color): Color {
  for (let i = 1; i < DOME.length; i++) {
    const [y1, c1, k1] = DOME[i];
    const [y0, c0, k0] = DOME[i - 1];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const a = new Color(c0).multiplyScalar(k0);
      const b = new Color(c1).multiplyScalar(k1);
      return out.copy(a).lerp(b, t);
    }
  }
  return out.set(DOME[DOME.length - 1][1]);
}

function softBox(color: string, intensity: number, direction: [number, number, number], size: [number, number], distance = 38): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(size[0], size[1]),
    new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), side: DoubleSide }),
  );
  const [x, y, z] = direction;
  const len = Math.hypot(x, y, z);
  mesh.position.set((x / len) * distance, (y / len) * distance, (z / len) * distance);
  mesh.lookAt(0, 0, 0);
  return mesh;
}

/** Renders the environment into a PMREM texture. The caller owns (and disposes) it. */
export function createEnvironment(renderer: WebGLRenderer): Texture {
  const env = new Scene();

  // Dusk dome.
  const dome = new SphereGeometry(70, 48, 28);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    domeColor(pos.getY(i) / 70, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  env.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  // RoomEnvironment's blocks and soft boxes, without its walls, much dimmer.
  const room = new RoomEnvironment();
  const walls: Object3D[] = [];
  room.traverse((obj) => {
    // The point light that lights the blocks: much dimmer, so they are not bright patches.
    if ((obj as PointLight).isPointLight) (obj as PointLight).intensity *= 0.12;
    const mesh = obj as Mesh;
    const mat = mesh.material as MeshLambertMaterial | MeshStandardMaterial | undefined;
    if (!mat || Array.isArray(mat)) return;
    if (mat.side === BackSide) walls.push(obj);
    else if (mat.type === 'MeshLambertMaterial') {
      // The soft box straight behind the viewer is what a glossy screen mirrors: keep it faint.
      const behind = obj.position.z > 12 && Math.abs(obj.position.x) < 2;
      (mat as MeshLambertMaterial).emissiveIntensity *= behind ? 0.04 : 0.22;
    }
  });
  walls.forEach((w) => w.parent?.remove(w));
  room.scale.setScalar(1.35);
  env.add(room);

  // Soft boxes: key (warm, upper left in front), cool rim strip behind on the
  // right, a broad overhead strip, a low orange kicker and a faint front fill
  // so glass facing the viewer mirrors a dim room rather than nothing.
  env.add(softBox('#fff1e0', 6, [-0.55, 0.62, 0.55], [34, 22]));
  env.add(softBox('#7fb2ff', 7, [0.85, 0.32, -0.45], [7, 34]));
  env.add(softBox('#e8f0ff', 3.5, [0.1, 0.98, 0.1], [10, 40]));
  env.add(softBox('#ff7a2a', 2.6, [0.55, -0.12, 0.82], [28, 6]));
  env.add(softBox('#b9c2d6', 0.1, [0.0, 0.22, 1], [60, 28], 45));

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();

  env.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as { dispose?: () => void } | undefined;
    if (mat && !Array.isArray(mat)) mat.dispose?.();
  });
  return target.texture;
}

export function createLights(scene: Scene): Light[] {
  // Key: warm white from the upper left, in front.
  const key = new DirectionalLight('#fff0dc', 1.5);
  key.position.set(-700, 900, 800);
  // Rim: cool blue from behind and above, picking out the top and right edges.
  const rim = new DirectionalLight('#6aa0ff', 1.3);
  rim.position.set(800, 650, -900);
  // Bounce: orange from below and in front, like light off the glowing horizon.
  const bounce = new DirectionalLight('#ff6a24', 0.7);
  bounce.position.set(250, -400, 700);
  const fill = new HemisphereLight('#8a8f9a', '#8a3d1c', 0.1);

  const lights = [key, rim, bounce, fill];
  lights.forEach((l) => scene.add(l));
  return lights;
}
