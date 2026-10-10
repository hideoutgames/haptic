/**
 * The 3D device scene for the "bring it anywhere" section.
 *
 * `createShowcaseScene` builds the renderer, the lighting and the three devices
 * (MacBook Pro, iPad Pro, iPhone Air, all modelled in code) and returns a small
 * controller. The scroll timeline in scripts/showcase.ts scrubs `state`; the
 * scene draws on demand, only while it is active, and draws every frame in
 * which the scrubbed state still moves (so the scrub catching up is never
 * choppy).
 *
 * Nothing may be compiled, uploaded or allocated while the page scrolls: all
 * programs are compiled and all textures and buffers uploaded during start-up
 * (`warmUp`, which the page's preloader waits for), and a frame-time governor
 * (governor.ts) trades resolution for smoothness on weak GPUs. A software
 * renderer (no GPU) gets a cheaper configuration of the same scene, and the
 * governor's safety net hands the page back to its 2D rig if even that is too
 * slow to be usable.
 *
 * Nothing here knows about GSAP or the DOM beyond the canvas and the size/area
 * callbacks it is given, so the module can be loaded lazily as one chunk.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import {
  applyState,
  DOLLY,
  dollyFactor,
  finalState,
  initialState,
  LAYOUTS,
  worldShift,
  type Layout,
  type SceneState,
  type ShadowSpec,
} from './choreography';
import { createEnvironment, createLights } from './environment';
import { frameCamera, pointsOf } from './framing';
import { FrameGovernor, GPU_CONFIG, SOFTWARE_CONFIG } from './governor';
import { createIPad, IPAD, STAND } from './ipad';
import { createIPhone, IPHONE } from './iphone';
import { createMacBook, MAC } from './macbook';
import { createMaterials, reflectiveMaterials } from './materials';
import { createShadowTexture, loadScreens } from './textures';
import { STATE_KEYS, type SceneOptions, type ShowcaseScene } from './types';

export type { SceneOptions, SceneState, ShowcaseScene } from './types';

/**
 * Drawing-buffer budget (pixels): the device pixel ratio is capped at 2 and
 * lowered only when the canvas is so large that a 2x buffer would exceed it.
 * Small, touch-sized canvases get the smaller budget (their GPUs are the
 * weakest); a phone or a portrait tablet still renders at 2x.
 */
const PIXEL_BUDGET = { compact: 3.4e6, large: 8e6, software: 0.8e6 };

/** Pixel ratios the governor steps through, largest first (capped by what the screen offers). */
const RATIOS = [2, 1.5, 1.25, 1];
/** A software renderer steps down from its budget ratio by these factors. */
const SOFTWARE_STEPS = [1, 0.85, 0.72];

const SCREEN_SIZES = { tablet: { w: 2360, h: 1640 }, projects: { w: 1179, h: 2556 } };

/** How far past the canvas's left edge the iPad is when its slide starts (CSS px). */
const ARRIVAL_MARGIN = 2;

/** Ratios from largest to smallest for a canvas of this size. */
function ladderFor(width: number, height: number, lite: boolean): number[] {
  if (lite) {
    const base = Math.min(1, Math.sqrt(PIXEL_BUDGET.software / (width * height)));
    return SOFTWARE_STEPS.map((k) => Math.max(0.5, base * k));
  }
  const budget = width <= 1100 ? PIXEL_BUDGET.compact : PIXEL_BUDGET.large;
  const fit = Math.sqrt(budget / (width * height));
  const base = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, fit));
  const ladder = [base, ...RATIOS.filter((r) => r < base - 0.01)];
  return ladder;
}

export async function createShowcaseScene(opts: SceneOptions): Promise<ShowcaseScene> {
  const { canvas, report = () => {} } = opts;
  const lite = opts.quality === 'lite' || (opts.quality !== 'high' && !!opts.software);

  // Antialiasing is decided when the context is created: a software renderer
  // gets none (it multiplies the cost of every pixel).
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !lite,
    alpha: true,
    stencil: false,
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  report(0.12);

  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 300, 9000);

  const textures = await loadScreens(opts.urls, renderer, (p) => report(0.12 + p * 0.4));
  const materials = createMaterials(lite);
  const reflective = reflectiveMaterials(materials, lite);
  // Each PBR material gets the environment explicitly, so its own
  // envMapIntensity can balance the metal against the glass.
  const makeEnvironment = () => {
    const env = createEnvironment(renderer);
    for (const pbr of reflective) {
      pbr.envMap = env;
      pbr.needsUpdate = true;
    }
    return env;
  };
  let environment = makeEnvironment();
  report(0.58);

  const mac = createMacBook(materials, textures.tablet, SCREEN_SIZES.tablet, lite);
  const ipad = createIPad(materials, textures.tablet, SCREEN_SIZES.tablet);
  const phone = createIPhone(materials, textures.projects, SCREEN_SIZES.projects);
  // Devices and their shadows share one group, so the whole set can be shifted.
  const world = new Group();
  const devices = new Group();
  devices.add(mac.group, ipad.group, phone.group);
  world.add(devices);
  scene.add(world);
  createLights(scene);

  // Soft contact shadows: one blurred quad under each device, and two under the
  // iPad: a broad, faint one where it leans over the ground and a tight, dark
  // one along the rail of its stand, the line where it touches the ground.
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
  const shadows = { mac: makeShadow(), ipad: makeShadow(), ipadRail: makeShadow(), phone: makeShadow() };

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
  // Footprints of the shadows (constant per layout), kept out of the frame loop.
  const MAC_SHADOW = { w: MAC.width * 0.94, d: MAC.depth * 0.9, dz: 0, opacity: 0.72 };
  const PHONE_SHADOW = { w: IPHONE.width * 0.95, d: 28, dz: -10, opacity: 0.72 };
  // Under the leaning iPad, from the rail back to below its top edge (its depth depends on the lean: see
  // resize), and along the rail. The blur grows with a footprint, so both are narrower than what casts
  // them: their soft ends then stop at the iPad's sides instead of running on along the ground.
  const ipadShadow = { w: IPAD.width * 0.75, d: 0, dz: 0, opacity: 0.45 };
  const RAIL_SHADOW = { w: STAND.rail.w * 0.7, d: STAND.rail.depth + 4, dz: STAND.rail.lipThickness - STAND.rail.depth / 2, opacity: 0.9 };

  const state = opts.state ?? initialState();
  const models = { mac, ipad, phone };
  let layout: Layout = LAYOUTS.wide;
  /** How far left of its resting place the iPad starts its slide (mm): found for each canvas by `fitArrival`. */
  let arrivalDx = layout.arrival.dx;
  let active = false;
  let dirty = true;
  let disposed = false;
  let contextLost = false;
  let unusable = false;

  // The camera is placed once per layout (framing); the dolly then only moves it along its view axis.
  const camCentre = new Vector3();
  const camDir = new Vector3();
  let camDistance = 1;
  const placeCamera = () => {
    camera.position.copy(camCentre).addScaledVector(camDir, camDistance * dollyFactor(eff));
    camera.updateMatrixWorld();
  };

  let override: Partial<SceneState> | null = null;
  /** The state actually drawn: the scrubbed one, with any debug override on top. */
  const eff: SceneState = { ...state };
  /** Poses everything for `src` (the scrubbed state unless given another, e.g. the finished one for framing). */
  const pose = (src: SceneState = state) => {
    for (let i = 0; i < STATE_KEYS.length; i++) {
      const k = STATE_KEYS[i];
      eff[k] = override && src === state && override[k] !== undefined ? (override[k] as number) : src[k];
    }
    const placement = applyState(models, eff, layout, arrivalDx);
    world.position.z = worldShift(eff, layout);
    setShadow(shadows.mac, placement.mac, MAC_SHADOW);
    setShadow(shadows.ipad, placement.ipad, ipadShadow);
    setShadow(shadows.ipadRail, placement.ipad, RAIL_SHADOW);
    setShadow(shadows.phone, placement.phone, PHONE_SHADOW);
    placeCamera();
  };

  /**
   * Everything the choreography can show: the world-space box
   * around the devices and their shadows in sampled poses (each state value
   * swept on its own, from the start and from the finished state, which covers
   * every device whose pose follows its own values). The poses themselves
   * live in choreography.ts; this only measures them, so it follows changes
   * there. Measured again whenever the layout or the canvas size changes (a
   * few milliseconds), since poses may depend on the viewport.
   */
  const reach = new Box3();
  let reachKey = '';
  const sceneReach = (): Box3 => {
    const id = `${layout.id} ${cssWidth}x${cssHeight}`;
    if (id === reachKey) return reach;
    const box = reach.makeEmpty();
    const sample = initialState();
    const STEPS = 8;
    for (const from of [initialState, finalState]) {
      for (const key of STATE_KEYS) {
        for (let i = 0; i <= STEPS; i++) {
          Object.assign(sample, from());
          sample[key] = i / STEPS;
          pose(sample);
          box.expandByObject(world);
        }
      }
    }
    reachKey = id;
    return box;
  };

  /**
   * The depth range hugs the scene. Depth precision is spread over near…far
   * (most of it just past `near`), and the models have layers a fraction of a
   * millimetre apart (key legends on the caps, the keys on their well,
   * screens behind their glass), some seen at a grazing angle. A loose range
   * (0.3 m to 9 m, with the scene about a metre away) wastes most of the
   * precision, which a 16-bit depth buffer cannot spare. The range covers the
   * box above from every camera position of the dolly, with a margin.
   */
  const corner = new Vector3();
  const fitDepthRange = () => {
    const { min, max } = sceneReach();
    let nearest = Infinity;
    let farthest = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      // How far the corner lies in front of the composition's centre, towards the camera.
      const towards = corner.sub(camCentre).dot(camDir);
      // The dolly ends at camDistance and starts DOLLY farther out.
      nearest = Math.min(nearest, camDistance - towards);
      farthest = Math.max(farthest, camDistance * (1 + DOLLY) - towards);
    }
    camera.near = Math.max(camDistance * 0.05, nearest * 0.85);
    camera.far = farthest * 1.15;
    camera.updateProjectionMatrix();
  };

  // ---- Resolution ----
  const base = lite ? SOFTWARE_CONFIG : GPU_CONFIG;
  // `safetyNet: false` (debugging) never gives up on the 3D scene.
  const governor = new FrameGovernor(opts.safetyNet === false ? { ...base, netFrames: 0 } : base);
  let ladder: number[] = [1];
  let cssWidth = 0;
  let cssHeight = 0;
  let pixelRatio = 0;

  /** Sets the drawing buffer for the governor's current level. Clears it. */
  const applyRatio = () => {
    const r = ladder[Math.min(governor.level, ladder.length - 1)];
    if (r === pixelRatio) return false;
    renderer.setPixelRatio(r);
    renderer.setSize(cssWidth, cssHeight, false);
    pixelRatio = r;
    return true;
  };

  /**
   * Finds where the iPad starts its slide on this canvas: the distance left of
   * its resting place at which it and its stand, turned as they start and seen
   * from where the dolly starts (the farthest the camera gets), are just past
   * the left edge. Whatever the screen's shape, it then comes into view at the
   * start of its beat, neither popping in partly on screen (too short a slide)
   * nor spending the first part of the beat out of sight (too long a one).
   */
  const fitArrival = () => {
    const start = finalState();
    start.ipad = 0;
    start.dolly = 0;
    const v = new Vector3();
    /** Right-most point (CSS px) of the iPad and its stand with the iPad `dx` left of its place. */
    const rightEdge = (dx: number) => {
      arrivalDx = dx;
      pose(start);
      ipad.group.updateWorldMatrix(true, true);
      let right = -Infinity;
      ipad.group.traverse((obj) => {
        const position = (obj as Mesh).geometry?.getAttribute('position');
        if (!position) return;
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld).project(camera);
          right = Math.max(right, ((v.x + 1) / 2) * cssWidth);
        }
      });
      return right;
    };
    // Secant steps: the position on screen is close to linear in the distance.
    let dx0 = layout.arrival.dx;
    let x0 = rightEdge(dx0);
    let dx1 = dx0 + 40;
    let x1 = rightEdge(dx1);
    for (let i = 0; i < 8 && Math.abs(x1 + ARRIVAL_MARGIN) > 0.5 && x1 !== x0; i++) {
      const next = Math.max(0, dx1 + ((-ARRIVAL_MARGIN - x1) * (dx1 - dx0)) / (x1 - x0));
      dx0 = dx1;
      x0 = x1;
      dx1 = next;
      x1 = rightEdge(dx1);
    }
    arrivalDx = dx1;
    pose();
  };

  const resize = () => {
    if (disposed) return;
    const m = opts.measure();
    if (m.width < 2 || m.height < 2) return;
    layout = m.stacked ? LAYOUTS.stacked : LAYOUTS.wide;
    // The iPad's broad shadow reaches back over the ground as far as its top edge.
    const reach = IPAD.height * Math.sin(layout.ipad.pitch) * 0.85;
    ipadShadow.d = reach + STAND.rail.lipThickness;
    ipadShadow.dz = (STAND.rail.lipThickness - reach) / 2;
    ladder = ladderFor(m.width, m.height, lite);
    governor.setSteps(ladder.length - 1);
    // Resizing the drawing buffer clears it, so only do it when the size
    // really changed (the page re-measures on every ScrollTrigger refresh).
    const sizeChanged = m.width !== cssWidth || m.height !== cssHeight;
    cssWidth = m.width;
    cssHeight = m.height;
    let resized = false;
    if (sizeChanged) {
      const r = ladder[Math.min(governor.level, ladder.length - 1)];
      renderer.setPixelRatio(r);
      renderer.setSize(cssWidth, cssHeight, false);
      pixelRatio = r;
      resized = true;
    } else {
      resized = applyRatio();
    }
    if (resized) governor.reset();

    // Fit the camera to the finished composition (posed from a state of its own).
    pose(finalState());
    const framed = frameCamera(camera, { width: m.width, height: m.height }, {
      fov: layout.fov,
      elevation: layout.elevation,
      azimuth: layout.azimuth,
      points: pointsOf([mac.group, ipad.group, phone.group] as Object3D[]),
      // Desktop: the MacBook's width sets the scale; the others hang off its left.
      widthPoints: m.stacked ? undefined : pointsOf([mac.group] as Object3D[]),
      focus: layout.focus ? new Vector3(layout.focus.x, layout.focus.y, layout.focus.z) : undefined,
      ground: new Vector3(layout.mac.x, 0, layout.mac.z + MAC.depth / 2),
      area: m.area,
    });
    // The framed camera is where the dolly ends: remember it and its view axis.
    camCentre.copy(framed.centre);
    camDir.copy(framed.dir);
    camDistance = framed.distance;
    // The iPad's start depends on the canvas, and the depth range must cover it.
    fitArrival();
    fitDepthRange();
    pose();
    dirty = true;
    // A cleared buffer must not reach the screen: draw straight away.
    if (resized && active && !contextLost) {
      dirty = false;
      remember();
      renderer.render(scene, camera);
    }
  };

  // ---- Change detection: the scene draws whenever the scrubbed state moved ----
  const lastDrawn = new Float32Array(STATE_KEYS.length).fill(NaN);
  let lastOverrideKey = 0;
  let overrideKey = 0;
  const remember = () => {
    for (let i = 0; i < STATE_KEYS.length; i++) lastDrawn[i] = state[STATE_KEYS[i]];
    lastOverrideKey = overrideKey;
  };
  const stateMoved = () => {
    if (overrideKey !== lastOverrideKey) return true;
    for (let i = 0; i < STATE_KEYS.length; i++) if (state[STATE_KEYS[i]] !== lastDrawn[i]) return true;
    return false;
  };

  resize();
  report(0.64);

  // ---- Warm-up: every program, texture and buffer is on the GPU before the first scrolled frame ----
  const warmUp = async () => {
    // Everything is posed from states of its own: the scrubbed one belongs to
    // the timeline, which keeps running while this awaits.
    const warm = finalState();

    // Textures first (uploads and mipmaps), so no first use during scrolling.
    const seen = new Set<Texture>();
    const upload = (t: Texture | null | undefined) => {
      if (t && !seen.has(t)) {
        seen.add(t);
        renderer.initTexture(t);
      }
    };
    scene.traverse((obj) => {
      const mat = (obj as Mesh).material as Material | Material[] | undefined;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const m of list) upload((m as MeshBasicMaterial).map);
    });
    Object.values(textures).forEach(upload);
    report(0.7);

    // Compile with all three devices visible (three skips invisible objects).
    pose(warm);
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // compileAsync is an optimisation; the first render compiles synchronously.
    }
    report(0.84);

    // One hidden render per device state, with culling off so that even the
    // parts outside the frame get their buffers uploaded. The canvas is not
    // shown yet. A software renderer needs only the full one: the others
    // would repeat it at a cost of seconds.
    const cull: Array<[Object3D, boolean]> = [];
    scene.traverse((obj) => {
      cull.push([obj, obj.frustumCulled]);
      obj.frustumCulled = false;
    });
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const states: Array<Partial<SceneState>> = lite ? [{}] : [{ ipad: 0, phone: 0 }, { phone: 0 }, { flip: 0 }, {}];
    for (const patch of states) {
      Object.assign(warm, finalState(), patch);
      pose(warm);
      renderer.render(scene, camera);
      // Wait for the GPU: drivers finish their lazy work at the first draw.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (const [obj, value] of cull) obj.frustumCulled = value;

    // The last warm-up frame is the whole composition: do not leave it on the
    // canvas for the moment before the first real frame.
    renderer.clear();
    pose();
    report(0.97);
  };
  await warmUp();
  dirty = true;
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
    governor.reset();
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

  let lastRenderAt = 0;
  let drawn = 0;
  const api: ShowcaseScene = {
    state,
    internals: {
      renderer,
      camera,
      scene,
      mac,
      ipad,
      phone,
      materials,
      shadows,
      screenBounds,
      governor,
      lite,
      flags: () => ({ active, dirty, disposed, contextLost, unusable }),
      stats: () => ({ pixelRatio, level: governor.level, ceiling: governor.ceiling, median: governor.lastMedian, netMedian: governor.netMedian, drawn, lastRenderAt }),
      pose: () => ({ ...eff }),
    },
    invalidate() {
      dirty = true;
    },
    setActive(value) {
      if (!value) governor.rest();
      active = value;
    },
    renderIfDirty(now = performance.now()) {
      if (disposed || contextLost || unusable) return false;
      if (!active) return false;
      let drew = false;
      if (dirty || stateMoved()) {
        dirty = false;
        remember();
        pose();
        renderer.render(scene, camera);
        drew = true;
        drawn++;
        lastRenderAt = now;
      }
      const verdict = governor.frame(now, drew);
      if (verdict === 'lower' || verdict === 'raise') {
        if (applyRatio()) {
          pose();
          renderer.render(scene, camera);
        }
      } else if (verdict === 'unusable') {
        unusable = true;
        opts.onUnusable?.(`median frame time ${Math.round(governor.netMedian)} ms`);
      }
      return drew;
    },
    setOverride(values) {
      override = values;
      overrideKey++;
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
