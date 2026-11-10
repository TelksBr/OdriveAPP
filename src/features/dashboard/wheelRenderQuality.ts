export interface WheelRenderSettings {
  /** Device pixel ratio cap for the canvas backing store. */
  maxDpr: number;
  /** Extra internal resolution multiplier for the post-processing chain. */
  supersample: number;
  antialias: boolean;
  /** Subpixel morphological anti-aliasing — best for curved mechanical silhouettes. */
  smaa: boolean;
  toneMappingExposure: number;
  environmentIntensity: number;
  maxAnisotropy: number;
  normalScale: number;
  /** PMREM cube size — higher = sharper reflections, more GPU cost. */
  envMapResolution: 256 | 512 | 1024;
}

function effectiveDpr(maxDpr: number): number {
  return Math.min(window.devicePixelRatio || 1, maxDpr);
}

export function wheelCanvasDpr(settings: WheelRenderSettings): number {
  return effectiveDpr(settings.maxDpr);
}

export function wheelComposerDpr(settings: WheelRenderSettings): number {
  return effectiveDpr(settings.maxDpr) * settings.supersample;
}

/** High-quality preset for the dashboard wheel preview. */
export const WHEEL_RENDER_SETTINGS: WheelRenderSettings = {
  maxDpr: 1.5,
  supersample: 1,
  antialias: false,
  smaa: true,
  toneMappingExposure: 1,
  environmentIntensity: 1,
  maxAnisotropy: 8,
  normalScale: 1,
  envMapResolution: 512,
};
