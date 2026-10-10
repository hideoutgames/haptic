/**
 * The 3D device scene for the "bring it anywhere" section.
 *
 * `createShowcaseScene` builds the renderer, the lighting and the three devices
 * (MacBook Pro, iPad Pro, iPhone Air, all modelled in code) and returns a small
 * controller. The scroll timeline in scripts/showcase.ts scrubs `state` and
 * calls `invalidate()`; the scene renders on demand, only while it is active.
 *
 * Nothing here knows about GSAP or the DOM beyond the canvas and the size/area
 * callbacks it is given, so the module can be loaded lazily as one chunk.
 */
import {
  ACESFilmicToneMapping,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
  type Texture,
} from 'three';
import { applyState, finalState, initialState, LAYOUTS, worldShift, type Layout, type SceneState, type ShadowSpec } from './choreography';
import { createEnvironment, createLights } from './environment';
import { frameCamera, pointsOf } from './framing';
import { createIPad, IPAD } from './ipad';
import { createIPhone, IPHONE } from './iphone';
import { createMacBook, MAC } from './macbook';
import { createMaterials } from './materials';
import { createShadowTexture, loadScreens } from './textures';
import type { SceneOptions, ShowcaseScene } from './types';

export type { SceneOptions, SceneState, ShowcaseScene } from './types';

/**
 * Drawing-buffer budget (pixels): the device pixel ratio is capped at 2 and
 * lowered only when the canvas is so large that a 2x buffer would exceed it.
 * Small, touch-sized canvases get the smaller budget (their GPUs are the
 * weakest); a phone or a portrait tablet still renders at 2x.
 */
const PIXEL_BUDGET = { compact: 3.4e6, large: 8e6 };

function pixelRatioFor(width: number, height: number): number {
  const budget = width <= 1100 ? PIXEL_BUDGET.compact : PIXEL_BUDGET.large;
  const fit = Math.sqrt(budget / (width * height));
  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2, fit));
}

const SCREEN_SIZES = { tablet: { w: 2360, h: 1640 }, phone: { w: 750, h: 1640 }, projects: { w: 1179, h: 2556 } };

export async function createShowcaseScene(opts: SceneOptions): Promise<ShowcaseScene> {
  const { canvas, report = () => {} } = opts;

  // A software renderer (blocklisted GPU, VM, remote desktop) would stall the
  // page for seconds: refuse it, so the caller keeps the 2D rig. `allowSoftware`
  // is for debugging and screenshot tooling only.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    failIfMajorPerformanceCaveat: !opts.allowSoftware,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  report(0.12);

  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 300, 9000);

  const textures = await loadScreens(opts.urls, renderer, (p) => report(0.12 + p * 0.5));
  const materials = createMaterials();
  // Each PBR material gets the environment explicitly, so its own
  // envMapIntensity can balance the metal against the glass.
  const makeEnvironment = () => {
    const env = createEnvironment(renderer);
    for (const m of Object.values(materials)) {
      if (typeof m === 'function') continue;
      const pbr = m as MeshStandardMaterial;
      if ('envMapIntensity' in pbr) {
        pbr.envMap = env;
        pbr.needsUpdate = true;
      }
    }
    return env;
  };
  let environment = makeEnvironment();
  report(0.68);

  const mac = createMacBook(materials, textures.tablet, SCREEN_SIZES.tablet);
  const ipad = createIPad(materials, textures.tablet, SCREEN_SIZES.tablet);
  const phone = createIPhone(materials, textures.phone, textures.projects, {
    editor: SCREEN_SIZES.phone,
    projects: SCREEN_SIZES.projects,
  });
  // Devices and their shadows share one group, so the whole set can be shifted.
  const world = new Group();
  const devices = new Group();
  devices.add(mac.group, ipad.group, phone.group);
  world.add(devices);
  scene.add(world);
  createLights(scene);

  // Soft contact shadows: one blurred quad under each device.
  const shadowTexture = createShadowTexture();
  const shadowGeometry = new PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const makeShadow = () => {
    const material = new MeshBasicMaterial({
      map: shadowTexture,
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    });
    const mesh = new Mesh(shadowGeometry, material);
    mesh.position.y = 0.2;
    mesh.renderOrder = -1;
    world.add(mesh);
    return mesh;
  };
  const shadows = { mac: makeShadow(), ipad: makeShadow(), phone: makeShadow() };

  const setShadow = (
    mesh: Mesh,
    s: ShadowSpec,
    footprint: { w: number; d: number; dz: number; opacity: number },
  ) => {
    const grow = 1 + Math.min(1.2, s.lift / 260);
    mesh.visible = s.strength > 0.01;
    (mesh.material as MeshBasicMaterial).opacity = footprint.opacity * s.strength / grow;
    mesh.position.set(s.x, 0.2, s.z);
    mesh.rotation.y = s.yaw;
    // The texture's solid core is 0.44 of the quad (see createShadowTexture).
    mesh.scale.set(footprint.w * 2.3 * grow, 1, footprint.d * 2.3 * grow);
    // Offset along the device's own depth axis.
    mesh.position.x += Math.sin(s.yaw) * footprint.dz;
    mesh.position.z += Math.cos(s.yaw) * footprint.dz;
  };

  const state = opts.state ?? initialState();
  let layout: Layout = LAYOUTS.wide;
  let active = false;
  let dirty = true;
  let disposed = false;
  let contextLost = false;

  let override: Partial<SceneState> | null = null;
  const pose = (ignoreOverride = false) => {
    const eff = override && !ignoreOverride ? { ...state, ...override } : state;
    const placement = applyState({ mac, ipad, phone }, eff, layout);
    world.position.z = ignoreOverride ? 0 : worldShift(eff, layout);
    setShadow(shadows.mac, placement.mac, { w: MAC.width * 0.94, d: MAC.depth * 0.9, dz: 0, opacity: 0.72 });
    const ks = layout.ipad.scale ?? 1;
    setShadow(shadows.ipad, placement.ipad, { w: IPAD.width * 0.9 * ks, d: 34 * ks, dz: -16 * ks, opacity: 0.72 });
    setShadow(shadows.phone, placement.phone, { w: IPHONE.width * 0.95, d: 28, dz: -10, opacity: 0.72 });
  };

  let cssWidth = 0;
  let cssHeight = 0;
  let pixelRatio = 0;
  const resize = () => {
    if (disposed) return;
    const m = opts.measure();
    if (m.width < 2 || m.height < 2) return;
    layout = m.stacked ? LAYOUTS.stacked : LAYOUTS.wide;
    const dpr = pixelRatioFor(m.width, m.height);
    // Resizing the drawing buffer clears it, so only do it when the size
    // really changed (the page re-measures on every ScrollTrigger refresh).
    const resized = m.width !== cssWidth || m.height !== cssHeight || dpr !== pixelRatio;
    if (resized) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(m.width, m.height, false);
      pixelRatio = dpr;
    }
    cssWidth = m.width;
    cssHeight = m.height;

    // Fit the camera to the finished composition, then restore the real state.
    const saved = { ...state };
    Object.assign(state, finalState());
    pose(true);
    const finalMac = mac.group;
    frameCamera(camera, { width: m.width, height: m.height }, {
      fov: layout.fov,
      elevation: layout.elevation,
      azimuth: layout.azimuth,
      points: pointsOf([finalMac, ipad.group, phone.group] as Object3D[]),
      // Desktop: the MacBook's width sets the scale; the others hang off its left.
      widthPoints: m.stacked ? undefined : pointsOf([finalMac] as Object3D[]),
      ground: new Vector3(layout.mac.x, 0, layout.mac.z + MAC.depth / 2),
      area: m.area,
    });
    Object.assign(state, saved);
    pose();
    dirty = true;
    // A cleared buffer must not reach the screen: draw straight away.
    if (resized && active && !contextLost) {
      dirty = false;
      renderer.render(scene, camera);
    }
  };

  resize();
  report(0.78);

  // Compile every shader before the first frame, without blocking the main thread.
  pose();
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // compileAsync is an optimisation; the first render compiles synchronously.
  }
  report(0.94);
  renderer.render(scene, camera);
  report(1);

  const onLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    opts.onContextLost?.();
  };
  const onRestored = () => {
    environment.dispose();
    environment = makeEnvironment();
    contextLost = false;
    dirty = true;
    opts.onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // Debugging: screen-space box (CSS px) of each device in the current pose.
  const screenBounds = () => {
    const out: Record<string, { left: number; top: number; right: number; bottom: number }> = {};
    const v = new Vector3();
    for (const [name, group] of [['mac', mac.group], ['ipad', ipad.group], ['phone', phone.group]] as const) {
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      group.updateWorldMatrix(true, true);
      group.traverse((obj) => {
        const mesh = obj as Mesh;
        const pos = mesh.geometry?.getAttribute?.('position');
        if (!pos || (mesh as { isInstancedMesh?: boolean }).isInstancedMesh) return;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
          const x = ((v.x + 1) / 2) * cssWidth;
          const y = ((1 - v.y) / 2) * cssHeight;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      });
      out[name] = { left, top, right, bottom };
    }
    return out;
  };

  const api: ShowcaseScene = {
    state,
    internals: { renderer, camera, scene, mac, ipad, phone, materials, shadows, screenBounds, flags: () => ({ active, dirty, disposed, contextLost }) },
    invalidate() {
      dirty = true;
    },
    setActive(value) {
      active = value;
    },
    renderIfDirty() {
      if (!dirty || !active || disposed || contextLost) return false;
      dirty = false;
      pose();
      renderer.render(scene, camera);
      return true;
    },
    setOverride(values) {
      override = values;
      dirty = true;
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        mesh.geometry?.dispose?.();
        (obj as InstancedMesh).dispose?.();
      });
      Object.values(materials).forEach((m) => (typeof m === 'function' ? undefined : m.dispose()));
      scene.traverse((obj) => {
        const mat = (obj as Mesh).material;
        const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of list) {
          const mm = m as unknown as { map?: Texture | null; dispose(): void };
          mm.map?.dispose?.();
          mm.dispose();
        }
      });
      Object.values(textures).forEach((t) => t.dispose());
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return api;
}
