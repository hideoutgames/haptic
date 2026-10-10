/**
 * What the GPU is, without loading three.js: whether WebGL2 exists and whether
 * it is a software renderer (SwiftShader, llvmpipe, WARP / Microsoft Basic
 * Render Driver, Apple Software Renderer …). A software renderer still gets the
 * 3D scene, in a cheaper configuration (see scene/index.ts), but must be told
 * apart from a real GPU before the context is created, since antialiasing is
 * decided at that point.
 */
export interface GpuProbe {
  webgl2: boolean;
  software: boolean;
  /** The unmasked renderer string, when the browser reveals it. */
  renderer: string;
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|microsoft basic|mesa offscreen|\bwarp\b/i;

export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE_RENDERER.test(name);
}

function context(failIfMajorPerformanceCaveat: boolean): WebGL2RenderingContext | null {
  try {
    return document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat });
  } catch {
    return null;
  }
}

/** Probed on throwaway canvases; the contexts are released at once. */
export function probeGPU(): GpuProbe {
  const gl = context(false);
  if (!gl) return { webgl2: false, software: false, renderer: '' };

  let renderer = '';
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch {
    // Some browsers refuse the query; the caveat probe below still works.
  }
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  // Browsers that hide the renderer name still refuse a context with the
  // "major performance caveat" flag when what they have is a software one.
  let software = isSoftwareRenderer(renderer);
  if (!software) {
    const real = context(true);
    if (real) real.getExtension('WEBGL_lose_context')?.loseContext();
    else software = true;
  }
  return { webgl2: true, software, renderer };
}
