import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import * as THREE from 'three';
import { useAppState } from '../../app/AppState';
import { translate } from '../../i18n/messages';
import { usePageVisible } from '../../shared/usePageVisible';
import { configureWheelMaterials } from './wheelMaterials';
import {
  WHEEL_RENDER_SETTINGS,
  wheelCanvasDpr,
  wheelComposerDpr,
  type WheelRenderSettings,
} from './wheelRenderQuality';

const WHEEL_MODEL = '/models/wheel.fbx';
const WHEEL_TEXTURES = '/models/wheel/textures/';

export function preloadWheelModel(): void {
  useLoader.preload(FBXLoader, WHEEL_MODEL, (loader) => {
    loader.setResourcePath(WHEEL_TEXTURES);
  });
}

function prepareWheelMesh(fbx: THREE.Group): number {
  fbx.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    if (child.geometry instanceof THREE.BufferGeometry) {
      const merged = mergeVertices(child.geometry);
      merged.computeVertexNormals();
      merged.normalizeNormals();
      child.geometry.dispose();
      child.geometry = merged;
    }
  });

  const box = new THREE.Box3().setFromObject(fbx);
  const center = box.getCenter(new THREE.Vector3());
  fbx.position.sub(center);
  const size = box.getSize(new THREE.Vector3()).length();
  return size > 0 ? 1.6 / size : 1;
}

interface WheelViewerProps {
  positionDegRef: React.MutableRefObject<number | null>;
  connected: boolean;
  height?: number;
}

const BG = new THREE.Color(0x050508);

function WheelEnvironment({ settings }: { settings: WheelRenderSettings }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04, 0.1, 100, {
      size: settings.envMapResolution,
    }).texture;
    scene.environment = envMap;
    if ('environmentIntensity' in scene) {
      (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
        settings.environmentIntensity;
    }

    room.dispose();

    return () => {
      scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, settings.envMapResolution, settings.environmentIntensity]);

  return null;
}

function WheelRendererSetup({ settings }: { settings: WheelRenderSettings }) {
  const { gl } = useThree();

  useEffect(() => {
    gl.setPixelRatio(wheelCanvasDpr(settings));
    gl.toneMappingExposure = settings.toneMappingExposure;
  }, [gl, settings]);

  return null;
}

function WheelPostProcessing({ settings }: { settings: WheelRenderSettings }) {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    if (!settings.smaa) {
      return;
    }

    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
    composer.setPixelRatio(wheelComposerDpr(settings));
    composer.setSize(size.width, size.height);
    composerRef.current = composer;

    return () => {
      composer.dispose();
      composerRef.current = null;
    };
  }, [settings.smaa, gl, scene, camera, settings]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || !settings.smaa) {
      return;
    }

    composer.setPixelRatio(wheelComposerDpr(settings));
    composer.setSize(size.width, size.height);
  }, [settings, settings.smaa, size.width, size.height]);

  useFrame(() => {
    composerRef.current?.render();
  }, settings.smaa ? 1 : 0);

  return null;
}

function WheelMesh({
  positionDegRef,
  settings,
  onReady,
}: {
  positionDegRef: React.MutableRefObject<number | null>;
  settings: WheelRenderSettings;
  onReady: () => void;
}) {
  const { gl } = useThree();
  const fbx = useLoader(FBXLoader, WHEEL_MODEL, (loader) => {
    loader.setResourcePath(WHEEL_TEXTURES);
  });
  const groupRef = useRef<THREE.Group>(null);
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const nextScale = prepareWheelMesh(fbx);
      setScale(nextScale);
      onReady();
    };

    const idleId =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 120 })
        : window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleId as number);
      } else {
        window.clearTimeout(idleId as number);
      }
    };
  }, [fbx, onReady]);

  useEffect(() => {
    if (scale === null) return;
    configureWheelMaterials(fbx, settings, maxAnisotropy);
  }, [fbx, settings, maxAnisotropy, scale]);

  useFrame(() => {
    if (!groupRef.current) return;
    const deg = positionDegRef.current;
    if (deg === null) return;
    groupRef.current.rotation.z = (-deg * Math.PI) / 180;
  });

  if (scale === null) return null;

  return (
    <group ref={groupRef} scale={scale}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={fbx} />
      </group>
    </group>
  );
}

const WheelScene = memo(function WheelScene({
  positionDegRef,
  connected,
  settings,
  modelReady,
  onModelReady,
}: {
  positionDegRef: React.MutableRefObject<number | null>;
  connected: boolean;
  settings: WheelRenderSettings;
  modelReady: boolean;
  onModelReady: () => void;
}) {
  const bgSet = useRef(false);
  useFrame(({ scene }) => {
    if (!bgSet.current) {
      scene.background = BG;
      bgSet.current = true;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 2.65]} fov={36} />
      <WheelRendererSetup settings={settings} />
      <WheelPostProcessing settings={settings} />
      {modelReady && <WheelEnvironment settings={settings} />}

      <Suspense fallback={null}>
        <WheelMesh positionDegRef={positionDegRef} settings={settings} onReady={onModelReady} />
      </Suspense>

      {!connected && (
        <mesh>
          <planeGeometry args={[6, 6]} />
          <meshBasicMaterial color={BG} transparent opacity={0.6} />
        </mesh>
      )}
    </>
  );
});

export const WheelViewer = memo(function WheelViewer({
  positionDegRef,
  connected,
  height = 340,
}: WheelViewerProps) {
  const { state } = useAppState();
  const pageVisible = usePageVisible();
  const [modelReady, setModelReady] = useState(false);
  const renderActive = pageVisible;

  useEffect(() => {
    preloadWheelModel();
  }, []);

  const onModelReady = useCallback(() => {
    setModelReady(true);
  }, []);

  return (
    <div
      className="wheel-viewer"
      style={{ height, position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
    >
      <Canvas
        frameloop={renderActive ? 'always' : 'never'}
        dpr={wheelCanvasDpr(WHEEL_RENDER_SETTINGS)}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        gl={{
          antialias: WHEEL_RENDER_SETTINGS.antialias,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(wheelCanvasDpr(WHEEL_RENDER_SETTINGS));
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = WHEEL_RENDER_SETTINGS.toneMappingExposure;
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <WheelScene
          positionDegRef={positionDegRef}
          connected={connected}
          settings={WHEEL_RENDER_SETTINGS}
          modelReady={modelReady}
          onModelReady={onModelReady}
        />
      </Canvas>

      {!modelReady && (
        <div className="wheel-viewer-loading" aria-busy="true" aria-live="polite">
          <div className="wheel-viewer-spinner" />
          <span className="wheel-viewer-loading-label">
            {translate(state.locale, 'wheelModelLoading')}
          </span>
        </div>
      )}

      {modelReady && !connected && (
        <div className="wheel-viewer-overlay">
          <span className="wheel-viewer-overlay-label">
            {translate(state.locale, 'wheelNoConnection')}
          </span>
        </div>
      )}
    </div>
  );
});
