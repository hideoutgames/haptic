/**
 * Shared materials. One instance of each is used by every device, so the
 * scene needs a handful of shader programs and they are compiled once.
 */
import {
  AdditiveBlending,
  Color,
  FrontSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from 'three';

export function createMaterials() {
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
  const glassBlack = new MeshPhysicalMaterial({
    color: new Color('#010102'),
    metalness: 0,
    roughness: 0.07,
    clearcoat: 0.6,
    clearcoatRoughness: 0.03,
    envMapIntensity: 0.35,
  });

  /** Frosted back glass of the iPhone Air and its camera plateau. */
  const backGlass = new MeshPhysicalMaterial({
    color: new Color('#202127'),
    metalness: 0.15,
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.8,
  });

  /** Glossy glass of the camera plateau and the lens cover (clearer than the frosted back). */
  const plateauGlass = new MeshPhysicalMaterial({
    color: new Color('#15161b'),
    metalness: 0.05,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1,
  });

  /** Camera lens glass (very dark blue-black, mirror-like). */
  const lens = new MeshPhysicalMaterial({
    color: new Color('#020409'),
    metalness: 0.2,
    roughness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });

  const lensCoat = new MeshPhysicalMaterial({
    color: new Color('#0a1226'),
    metalness: 0.6,
    roughness: 0.12,
    clearcoat: 1,
  });

  const flash = new MeshStandardMaterial({ color: new Color('#6d6a66'), roughness: 0.35, metalness: 0.3 });

  /** Matte black plastics: the keyboard well, hinge vent, speaker holes. */
  const blackMatte = new MeshStandardMaterial({ color: new Color('#050506'), metalness: 0, roughness: 0.75 });

  /** Hinge barrel. */
  const hinge = new MeshStandardMaterial({ color: new Color('#0b0b0d'), metalness: 0.7, roughness: 0.38 });

  const rubber = new MeshStandardMaterial({ color: new Color('#09090a'), metalness: 0, roughness: 0.85 });

  const keycap = new MeshStandardMaterial({ color: new Color('#0c0c0e'), metalness: 0, roughness: 0.52 });

  /** Trackpad glass: slightly lighter than the deck, glossier. */
  const trackpad = new MeshStandardMaterial({
    color: new Color('#3a3a3d'),
    metalness: 0.6,
    roughness: 0.2,
  });

  /**
   * Over a display: adds only the mirror reflection of the environment (black
   * base, additive), so screens keep their colour and read as glass.
   *
   * The broad, dim part of the reflection is dropped and the rest is capped:
   * added to black it would lift the screens into a grey haze, and a glass that
   * faces a bright patch of the environment (the warm horizon, the key light)
   * would turn cream. Only the highlights show, and never above the cap. The
   * MacBook lid faces the horizon band at an angle that mirrors it much more
   * than the iPad and iPhone do, so it gets a weaker layer of its own.
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
