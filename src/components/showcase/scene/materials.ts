/**
 * Shared materials. One instance of each is used by every device, so the
 * scene needs a handful of shader programs and they are compiled once.
 */
import {
  AdditiveBlending,
  AlwaysDepth,
  Color,
  FrontSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderChunk,
} from 'three';

/**
 * `lite` is for software rendering, where every pixel is shaded on the CPU:
 * only the metal reflects the environment (looking up the prefiltered cube map
 * is the most expensive part of a pixel), the clear-coated glass becomes plain
 * standard material or black, and the reflection layers over the screens are
 * switched off.
 */
export function createMaterials(lite = false) {
  const glossy = (params: ConstructorParameters<typeof MeshPhysicalMaterial>[0] & { clearcoat?: number; clearcoatRoughness?: number }): MeshStandardMaterial => {
    if (!lite) return new MeshPhysicalMaterial(params);
    const { clearcoat, clearcoatRoughness, ...rest } = params as Record<string, unknown>;
    void clearcoat;
    void clearcoatRoughness;
    return new MeshStandardMaterial(rest as ConstructorParameters<typeof MeshStandardMaterial>[0]);
  };

  /** Space Black anodised aluminium: very dark, warm-neutral grey, satin. */
  const aluminium = new MeshStandardMaterial({
    color: new Color('#4e5156'),
    metalness: 0.8,
    roughness: 0.38,
    envMapIntensity: 1,
  });

  /** Underside and other parts that sit in shade. */
  const aluminiumDark = new MeshStandardMaterial({
    color: new Color('#3a3b3f'),
    metalness: 0.85,
    roughness: 0.45,
  });

  /** Polished titanium frame of the iPhone (Space Black). */
  const titanium = new MeshStandardMaterial({
    color: new Color('#4b4c51'),
    metalness: 1,
    roughness: 0.3,
    envMapIntensity: 0.7,
  });

  /** Black display glass: bezels, notch, the dark parts of the glass. */
  const glassBlack = lite
    ? new MeshBasicMaterial({ color: new Color('#010102') })
    : glossy({
        color: new Color('#010102'),
        metalness: 0,
        roughness: 0.07,
        clearcoat: 0.6,
        clearcoatRoughness: 0.03,
        envMapIntensity: 0.35,
      });

  /** Frosted back glass of the iPhone Air and its camera plateau. */
  const backGlass = glossy({
    color: new Color('#202127'),
    metalness: 0.15,
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.8,
  });

  /** Glossy glass of the camera plateau and the lens cover (clearer than the frosted back). */
  const plateauGlass = glossy({
    color: new Color('#15161b'),
    metalness: 0.05,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1,
  });

  /** Camera lens glass (very dark blue-black, mirror-like). */
  const lens = glossy({
    color: new Color('#020409'),
    metalness: 0.2,
    roughness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });

  const lensCoat = glossy({
    color: new Color('#0a1226'),
    metalness: 0.6,
    roughness: 0.12,
    clearcoat: 1,
  });

  const flash = new MeshStandardMaterial({ color: new Color('#6d6a66'), roughness: 0.35, metalness: 0.3 });

  /** Matte black plastics (the iPhone's microphone; the MacBook deck has its own, below). */
  const blackMatte = new MeshStandardMaterial({ color: new Color('#050506'), metalness: 0, roughness: 0.75 });

  // The MacBook deck's inlays are drawn in a fixed order right after the base,
  // each over the last, without a depth test (see DECK_ORDER in macbook.ts):
  // they are flat layers too close together for any depth buffer.

  /** The keyboard well, hinge vent and trackpad surround: matte black. */
  const deckBlack = new MeshStandardMaterial({ color: new Color('#050506'), metalness: 0, roughness: 0.75, depthFunc: AlwaysDepth });

  /**
   * The speaker grilles: the deck's own aluminium, with the holes in its
   * texture (macbook.ts assigns it; see createGrilleTexture), so the inlay
   * cannot be told from the deck around it.
   */
  const grille = aluminium.clone();
  grille.depthFunc = AlwaysDepth;

  /** Hinge barrel. */
  const hinge = new MeshStandardMaterial({ color: new Color('#0b0b0d'), metalness: 0.7, roughness: 0.38 });

  const rubber = new MeshStandardMaterial({ color: new Color('#09090a'), metalness: 0, roughness: 0.85 });

  /** Keycaps: dark satin plastic, with steady edges (see steadyEdges). */
  const keycap = new MeshStandardMaterial({ color: new Color('#0c0c0e'), metalness: 0, roughness: 0.52 });
  if (!lite) steadyEdges(keycap);

  /** Trackpad glass: slightly lighter than the deck, glossier. A deck inlay (no depth test, see above). */
  const trackpad = new MeshStandardMaterial({
    color: new Color('#3a3a3d'),
    metalness: 0.6,
    roughness: 0.2,
    depthFunc: AlwaysDepth,
  });

  /**
   * Over a display: adds only the mirror reflection of the environment (black
   * base, additive), so screens keep their colour and read as glass.
   *
   * The broad, dim part of the reflection is dropped and the rest is capped:
   * added to black it would lift the screens into a grey haze, and a glass that
   * faces a bright patch of the environment (the warm horizon, the key light)
   * would turn cream. Only the highlights show, and never above the cap. The
   * MacBook lid, and the iPad leaning back on its stand, face the horizon band
   * at an angle that mirrors it much more than the upright iPhone does, so they
   * get a weaker layer of their own.
   */
  const glare = (opacity: number) => {
    const material = new MeshStandardMaterial({
      color: new Color('#000000'),
      metalness: 0,
      roughness: 0.05,
      envMapIntensity: 1,
      opacity,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'outgoingLight = min(max(outgoingLight - vec3(0.04), vec3(0.0)), vec3(0.1));\n#include <opaque_fragment>',
      );
    };
    return material;
  };
  const glassReflection = glare(0.5);
  const glassReflectionMac = glare(0.2);
  if (lite) glassReflection.visible = glassReflectionMac.visible = false;

  const unlit = (color = '#ffffff') =>
    new MeshBasicMaterial({ color: new Color(color), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  return {
    aluminium,
    aluminiumDark,
    titanium,
    glassBlack,
    backGlass,
    plateauGlass,
    lens,
    lensCoat,
    flash,
    blackMatte,
    deckBlack,
    grille,
    hinge,
    rubber,
    keycap,
    trackpad,
    glassReflection,
    glassReflectionMac,
    unlit,
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/** The environment fades by `depth` as the normal's change per pixel goes from `from` to `to`. */
const EDGE_FADE = { from: 0.45, to: 0.9, depth: 0.75 } as const;

const STEADY_NORMALS = `#ifndef FLAT_SHADED
	centroid varying vec3 vNormal;
#endif
varying vec3 vSteadyNormal;`;

const STEADY_EDGES: { vertex: Array<[string, string]>; fragment: Array<[string, string]> } = {
  vertex: [
    ['#include <normal_pars_vertex>', STEADY_NORMALS],
    ['#include <normal_vertex>', '#include <normal_vertex>\n\tvSteadyNormal = normalize( transformedNormal );'],
    ['varying vec3 vViewPosition;', 'centroid varying vec3 vViewPosition;'],
  ],
  fragment: [
    ['#include <normal_pars_fragment>', STEADY_NORMALS],
    ['varying vec3 vViewPosition;', 'centroid varying vec3 vViewPosition;'],
    [
      '#include <lights_physical_fragment>',
      ShaderChunk.lights_physical_fragment.replace(
        'vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );',
        'vec3 dxy = max( abs( dFdx( vSteadyNormal ) ), abs( dFdy( vSteadyNormal ) ) );',
      ),
    ],
    [
      '#include <lights_fragment_maps>',
      `#include <lights_fragment_maps>\n\tradiance *= 1.0 - ${EDGE_FADE.depth.toFixed(2)} * smoothstep( ${EDGE_FADE.from.toFixed(2)}, ${EDGE_FADE.to.toFixed(2)}, geometryRoughness );`,
    ],
  ],
};

/**
 * Keeps the keycaps' rounded edges steady while they move.
 *
 * The edges are strips a pixel or two across (a 0.6 mm radius; less than a
 * pixel on a phone), and their normal turns through 90 degrees across them.
 * Two things made whole rows of key edges flicker as the scroll moved the
 * keyboard by fractions of a pixel:
 *
 *  - With multisampling, a GPU shades a triangle once per pixel with its
 *    varyings interpolated at the pixel's centre, even where the triangle
 *    covers some of the pixel's samples but not the centre: the normal is then
 *    extrapolated far past the edge's own range. `centroid` interpolates the
 *    normal and the view position inside the covered part of the pixel.
 *  - Even so, the one shading point per pixel lands on a different part of the
 *    curve from frame to frame, and the curve mirrors the whole environment,
 *    from the dark sky to the bright horizon and soft boxes, so the edge pixels
 *    jumped between bright and dark. Where the normal turns that much within a
 *    pixel, the mirrored environment fades to a quarter (see `EDGE_FADE`), so
 *    those pixels are lit mostly by the steady diffuse and key-light shading.
 *    The flat tops, and edges a few pixels across (a laptop's Retina screen),
 *    keep their reflection. (Fading it out completely draws a dark line along
 *    the edges, which flickers in its own way.)
 *
 * The turn per pixel is three's `geometryRoughness` (which also roughens such
 * pixels), but taken from a copy of the normal interpolated at the pixel
 * centres: derivatives of a centroid value jump with the sample coverage.
 *
 * Only for multisampled rendering: the lite tier has neither multisampling nor
 * an environment on the keycaps.
 */
function steadyEdges(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    for (const [from, to] of STEADY_EDGES.vertex) shader.vertexShader = shader.vertexShader.replace(from, to);
    for (const [from, to] of STEADY_EDGES.fragment) shader.fragmentShader = shader.fragmentShader.replace(from, to);
  };
  material.customProgramCacheKey = () => 'steady-edges';
}

/** The materials that get the environment map (see createEnvironment). */
export function reflectiveMaterials(m: Materials, lite: boolean): MeshStandardMaterial[] {
  if (lite) return [m.aluminium, m.aluminiumDark, m.titanium];
  return Object.values(m).filter((v): v is MeshStandardMaterial => typeof v !== 'function' && 'envMapIntensity' in v);
}
