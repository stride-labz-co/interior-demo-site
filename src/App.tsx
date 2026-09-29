import { Center, ContactShadows, Float, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./App.css";

// Preload the 3D model
useGLTF.preload("/tiny_isometric_room.glb");

// Time of Day Lighting Types
type AtmosphereKey = "morning" | "midday" | "sunset";

interface AtmosphereConfig {
  label: string;
  sub: string;
  icon: string;
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  skyColor: string;
  skyIntensity: number;
  roomEmissive: string;
  equipmentEmissive: string;
  rayColor: string;
  rayOpacity: number;
}

const ATMOSPHERES: Record<AtmosphereKey, AtmosphereConfig> = {
  morning: {
    label: "Morning Sun",
    sub: "07:30 • Low Eastern Dawn",
    icon: "☀️",
    sunPos: [-7, 5.0, -2.5],
    sunColor: "#ffe4b5",
    sunIntensity: 2.6,
    ambientColor: "#fff6ec",
    ambientIntensity: 1.2,
    skyColor: "#fae9d7",
    skyIntensity: 0.5,
    roomEmissive: "#fff2dc",
    equipmentEmissive: "#fff4e2",
    rayColor: "#ffeed0",
    rayOpacity: 0.38,
  },
  midday: {
    label: "Midday Studio",
    sub: "12:00 • High-Noon Daylight",
    icon: "🌤️",
    sunPos: [-3.0, 8.5, -2.0],
    sunColor: "#ffffff",
    sunIntensity: 2.9,
    ambientColor: "#ffffff",
    ambientIntensity: 1.35,
    skyColor: "#e0ecf8",
    skyIntensity: 0.6,
    roomEmissive: "#ffffff",
    equipmentEmissive: "#ffffff",
    rayColor: "#ffffff",
    rayOpacity: 0.52,
  },
  sunset: {
    label: "Sunset Glow",
    sub: "18:45 • Golden Hour Dusk",
    icon: "🌅",
    sunPos: [-8.5, 2.0, -4.0],
    sunColor: "#ea580c",
    sunIntensity: 3.5,
    ambientColor: "#fed7aa",
    ambientIntensity: 1.05,
    skyColor: "#fb923c",
    skyIntensity: 0.7,
    roomEmissive: "#fba26e",
    equipmentEmissive: "#fca574",
    rayColor: "#ff6600",
    rayOpacity: 0.78,
  },
};

// Spatial Hotspot Definitions
interface Hotspot {
  id: string;
  num: string;
  label: string;
  title: string;
  desc: string;
  position: [number, number, number];
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
}

const HOTSPOTS: Hotspot[] = [
  {
    id: "louver",
    num: "01",
    label: "Solar Louver",
    title: "Angled Cedar Louver Aperture",
    desc: "Precision-milled timber baffles that calibrate direct morning sun into gentle, painterly gradients across the floor.",
    position: [-1.12, 0.56, -0.12],
    cameraPos: [1.8, 0.25, 1.2],
    cameraTarget: [-1.0, 0.45, -0.1],
  },
  {
    id: "desk",
    num: "02",
    label: "Ash Workstation",
    title: "Cantilevered Ash Workspace",
    desc: "Soap-finished solid northern ash with recessed wire channels, articulated monitor arm, and woven sitting pouf.",
    position: [-0.49, -0.7, -1.38],
    cameraPos: [0.7, -0.15, 0.3],
    cameraTarget: [-0.5, -0.55, -1.3],
  },
  {
    id: "daybed",
    num: "03",
    label: "Rest Nook",
    title: "Acoustic Sleeping Mezzanine",
    desc: "Natural memory mattress nestled within acoustic felt-slat wall panels with concealed storage drawer bases below.",
    position: [-1.18, -1.54, 0.93],
    cameraPos: [1.5, -0.1, 1.9],
    cameraTarget: [-1.1, -1.0, 0.8],
  },
  {
    id: "joinery",
    num: "04",
    label: "Concealed Storage",
    title: "Flush High-Density Joinery",
    desc: "Floor-to-ceiling cabinetry with seamless touch-latches concealing utility equipment and wardrobe storage.",
    position: [1.6, -0.07, -1.33],
    cameraPos: [1.2, 0.2, 0.5],
    cameraTarget: [1.4, -0.1, -1.2],
  },
];

const OVERVIEW_CAMERA: [number, number, number] = [3.2, 0.2, 3.2];
const OVERVIEW_TARGET: [number, number, number] = [0, -0.35, 0];
const MOBILE_OVERVIEW_CAMERA: [number, number, number] = [3.65, 0.25, 3.65];

// 3D Room Diorama with Material Depth & Diurnal Lighting Fix
function RoomDiorama({ atmosphere }: { atmosphere: AtmosphereKey }) {
  const { scene } = useGLTF("/tiny_isometric_room.glb");

  const roomMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const equipmentMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const rayMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Fix transparency sorting and depthWrite to eliminate object flickering
  useEffect(() => {
    roomMatsRef.current = [];
    equipmentMatsRef.current = [];
    rayMatsRef.current = [];

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        materials.forEach((mat) => {
          if (mat.name === "ray_material" || mesh.name.includes("ray")) {
            // Sunbeams: semi-transparent, do not write depth, render after opaque geometry
            mat.transparent = true;
            mat.depthWrite = false;
            mat.depthTest = true;
            mesh.renderOrder = 10;
            if (!rayMatsRef.current.includes(mat as THREE.MeshStandardMaterial)) {
              rayMatsRef.current.push(mat as THREE.MeshStandardMaterial);
            }
          } else if (mat.name === "room_material" || mesh.name.includes("room")) {
            // Room walls & plinth: Opaque, write depth buffer
            mat.transparent = false;
            mat.depthWrite = true;
            mat.depthTest = true;
            mesh.renderOrder = 0;
            if (!roomMatsRef.current.includes(mat as THREE.MeshStandardMaterial)) {
              roomMatsRef.current.push(mat as THREE.MeshStandardMaterial);
            }
          } else {
            // Furniture & Equipment: Opaque, write depth buffer
            mat.transparent = false;
            mat.depthWrite = true;
            mat.depthTest = true;
            mesh.renderOrder = 0;
            if (!equipmentMatsRef.current.includes(mat as THREE.MeshStandardMaterial)) {
              equipmentMatsRef.current.push(mat as THREE.MeshStandardMaterial);
            }
          }
          mat.needsUpdate = true;
        });
      }
    });
  }, [scene]);

  // Target colors for smooth diurnal transitions
  const targetRoomEmissive = useMemo(
    () => new THREE.Color(ATMOSPHERES[atmosphere].roomEmissive),
    [atmosphere]
  );
  const targetEquipEmissive = useMemo(
    () => new THREE.Color(ATMOSPHERES[atmosphere].equipmentEmissive),
    [atmosphere]
  );
  const targetRayColor = useMemo(
    () => new THREE.Color(ATMOSPHERES[atmosphere].rayColor),
    [atmosphere]
  );

  // Smoothly lerp material emissive and ray beam properties every frame
  useFrame((_, delta) => {
    const lerpSpeed = Math.min(delta * 4.5, 0.12);

    for (let i = 0; i < roomMatsRef.current.length; i++) {
      roomMatsRef.current[i].emissive.lerp(targetRoomEmissive, lerpSpeed);
    }
    for (let i = 0; i < equipmentMatsRef.current.length; i++) {
      equipmentMatsRef.current[i].emissive.lerp(targetEquipEmissive, lerpSpeed);
    }
    for (let i = 0; i < rayMatsRef.current.length; i++) {
      rayMatsRef.current[i].emissive.lerp(targetRayColor, lerpSpeed);
      rayMatsRef.current[i].opacity = THREE.MathUtils.lerp(
        rayMatsRef.current[i].opacity,
        ATMOSPHERES[atmosphere].rayOpacity,
        lerpSpeed
      );
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.03} floatIntensity={0.08}>
      <Center>
        <primitive object={scene} scale={0.007} />
      </Center>
    </Float>
  );
}

// Architectural Natural Sunlight with Diurnal Transitions
function StudioLighting({ atmosphere }: { atmosphere: AtmosphereKey }) {
  const atmo = ATMOSPHERES[atmosphere];

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const skyFillRef = useRef<THREE.DirectionalLight>(null);

  const targetSunColor = useMemo(() => new THREE.Color(atmo.sunColor), [atmo.sunColor]);
  const targetAmbientColor = useMemo(() => new THREE.Color(atmo.ambientColor), [atmo.ambientColor]);
  const targetSkyColor = useMemo(() => new THREE.Color(atmo.skyColor), [atmo.skyColor]);
  const targetSunPos = useMemo(() => new THREE.Vector3(...atmo.sunPos), [atmo.sunPos]);

  useFrame((_, delta) => {
    const lerpSpeed = Math.min(delta * 4.5, 0.12);

    if (sunLightRef.current) {
      sunLightRef.current.color.lerp(targetSunColor, lerpSpeed);
      sunLightRef.current.intensity = THREE.MathUtils.lerp(
        sunLightRef.current.intensity,
        atmo.sunIntensity,
        lerpSpeed
      );
      sunLightRef.current.position.lerp(targetSunPos, lerpSpeed);
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.color.lerp(targetAmbientColor, lerpSpeed);
      ambientLightRef.current.intensity = THREE.MathUtils.lerp(
        ambientLightRef.current.intensity,
        atmo.ambientIntensity,
        lerpSpeed
      );
    }

    if (skyFillRef.current) {
      skyFillRef.current.color.lerp(targetSkyColor, lerpSpeed);
      skyFillRef.current.intensity = THREE.MathUtils.lerp(
        skyFillRef.current.intensity,
        atmo.skyIntensity,
        lerpSpeed
      );
    }
  });

  return (
    <>
      <ambientLight ref={ambientLightRef} intensity={atmo.ambientIntensity} color={atmo.ambientColor} />

      <directionalLight
        ref={sunLightRef}
        position={atmo.sunPos}
        intensity={atmo.sunIntensity}
        color={atmo.sunColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />

      {/* Exterior sky fill */}
      <directionalLight
        ref={skyFillRef}
        position={[6, 4, 6]}
        intensity={atmo.skyIntensity}
        color={atmo.skyColor}
      />

      {/* Floor reflection bounce */}
      <directionalLight position={[0, -3, 0]} intensity={0.35} color="#f0e6d8" />
    </>
  );
}

// Camera LERP Rig
function CameraRig({
  targetPos,
  targetLook,
  isUserInteracting,
  controlsRef,
}: {
  targetPos: [number, number, number];
  targetLook: [number, number, number];
  isUserInteracting: React.MutableRefObject<boolean>;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const vTargetPos = useMemo(() => new THREE.Vector3(...targetPos), [targetPos]);
  const vTargetLook = useMemo(() => new THREE.Vector3(...targetLook), [targetLook]);

  useFrame((_, delta) => {
    if (!isUserInteracting.current && controlsRef.current) {
      camera.position.lerp(vTargetPos, Math.min(delta * 2.4, 0.08));
      controlsRef.current.target.lerp(vTargetLook, Math.min(delta * 2.4, 0.08));
      controlsRef.current.update();
    }
  });

  return null;
}

// Subtle Plinth Asset Loader
function PlinthLoader() {
  const { active, progress } = useProgress();
  const [fadedOut, setFadedOut] = useState(false);

  useEffect(() => {
    if (!active && progress === 100) {
      const timer = setTimeout(() => setFadedOut(true), 600);
      return () => clearTimeout(timer);
    }
  }, [active, progress]);

  if (fadedOut && !active) return null;

  return (
    <div className="plinth-loader">
      <div className="loader-line">
        <div className="loader-line-inner" style={{ width: `${progress}%` }} />
      </div>
      <span className="loader-caption">Rendering Spatial Diorama...</span>
    </div>
  );
}

export default function App() {
  const [atmosphere, setAtmosphere] = useState<AtmosphereKey>("morning");
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);

  const controlsRef = useRef<any>(null);
  const isUserInteracting = useRef<boolean>(false);

  // Responsive device detection for optimal camera framing
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth <= 1024;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const overviewCam = useMemo<[number, number, number]>(() => {
    return isMobile ? MOBILE_OVERVIEW_CAMERA : OVERVIEW_CAMERA;
  }, [isMobile]);

  // Compute camera target based on active hotspot or overview
  const [cameraPos, cameraTarget] = useMemo<[[number, number, number], [number, number, number]]>(() => {
    if (!activeHotspot) {
      return [overviewCam, OVERVIEW_TARGET];
    }
    const found = HOTSPOTS.find((h) => h.id === activeHotspot);
    if (found) {
      return [found.cameraPos, found.cameraTarget];
    }
    return [overviewCam, OVERVIEW_TARGET];
  }, [activeHotspot, overviewCam]);

  const handleSelectHotspot = (id: string) => {
    setActiveHotspot(id === activeHotspot ? null : id);
    isUserInteracting.current = false;
  };

  const handleResetOverview = () => {
    setActiveHotspot(null);
    isUserInteracting.current = false;
  };

  const activeSpotData = useMemo(() => {
    return HOTSPOTS.find((h) => h.id === activeHotspot);
  }, [activeHotspot]);

  return (
    <div className="page-container">
      {/* ================= ATELIER NAVIGATION ================= */}
      <header className="atelier-nav">
        <div className="nav-inner">
          <a href="#" className="studio-brand">
            <span className="brand-mark">ATELIER ISOMA</span>
            <span className="brand-sub">Spatial Architecture & Interiors</span>
          </a>

          <nav className="nav-menu">
            <a href="#philosophy" className="nav-link">Philosophy</a>
            <a href="#works" className="nav-link">Selected Works</a>
            <a href="#materials" className="nav-link">Materiality</a>
            <a href="#inquiries" className="nav-link">Contact</a>
          </nav>

          <a href="#inquiries" className="btn-inquire">
            <span>Commission a Space</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </a>
        </div>
      </header>

      {/* ================= HERO: FULL-BLEED RIGHT SIDE WITH FADING BOUNDARY MASK ================= */}
      <section className="hero-fullscreen">
        <div className="hero-split-layout">
          {/* LEFT COLUMN: Editorial & Spatial Story */}
          <div className="editorial-full-col">
            {/* Editorial Intro Narrative */}
            <div className="editorial-intro-block">
              <div className="edition-badge">
                <span className="edition-line" />
                <span>Kyoto Study • Monograph IV • Residential Studio</span>
              </div>

              <h1 className="editorial-title">
                Quiet proportions. <br />
                Natural timber. <br />
                <em>Spaces crafted to exhale.</em>
              </h1>

              <p className="editorial-lead">
                Atelier Isoma conceives contemplative interior architecture shaped by Scandinavian
                restraint and Japanese joinery. Every surface is an invitation to stillness, natural daylight,
                and enduring materiality.
              </p>
            </div>

            {/* Diorama Interactive Scene Controls */}
            <div className="scene-controls-block">
              {/* Atmosphere / Time of Day Selector */}
              <div className="atmosphere-bar">
                <div className="atmosphere-header">
                  <span>Diurnal Light Study</span>
                  <span>{ATMOSPHERES[atmosphere].sub}</span>
                </div>
                <div className="atmosphere-tabs">
                  {(Object.keys(ATMOSPHERES) as AtmosphereKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`atmo-tab ${atmosphere === key ? "active" : ""}`}
                      onClick={() => setAtmosphere(key)}
                    >
                      <span>{ATMOSPHERES[key].icon}</span>
                      <span>{ATMOSPHERES[key].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hotspot Quick Focus Navigation */}
              <div className="hotspot-shortcuts">
                <button
                  type="button"
                  className={`hotspot-pill-btn ${activeHotspot === null ? "active" : ""}`}
                  onClick={handleResetOverview}
                >
                  <span>360° Overview</span>
                </button>
                {HOTSPOTS.map((spot) => (
                  <button
                    key={spot.id}
                    type="button"
                    className={`hotspot-pill-btn ${activeHotspot === spot.id ? "active" : ""}`}
                    onClick={() => handleSelectHotspot(spot.id)}
                  >
                    <span>{spot.num}</span>
                    <span>{spot.label}</span>
                  </button>
                ))}
              </div>

              {/* Active Hotspot Detail Callout */}
              {activeSpotData ? (
                <div className="active-hotspot-callout">
                  <span className="callout-title">
                    {activeSpotData.num} / {activeSpotData.title}
                  </span>
                  <span className="callout-desc">{activeSpotData.desc}</span>
                </div>
              ) : (
                <div className="active-hotspot-callout">
                  <span className="callout-title">Plate IV / The Kyoto Mezzanine</span>
                  <span className="callout-desc">
                    14.5 m² compact architectural study in white soap ash, travertine floor plinth, and sound-dampened slat walls.
                  </span>
                </div>
              )}
            </div>

            {/* Editorial CTAs */}
            <div className="editorial-cta-group">
              <a href="#works" className="btn-primary-atelier">
                <span>Explore Spatial Portfolio</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
              <a href="#philosophy" className="link-monograph">
                <span>Read the Studio Philosophy</span>
                <span>→</span>
              </a>
            </div>
          </div>

          {/* RIGHT COLUMN: Full-Height Edge-To-Edge 3D Diorama with Fading Opacity Mask */}
          <div className="diorama-fullscreen-col" data-atmo={atmosphere}>
            {/* Ambient Backlight Diffusion */}
            <div className="canvas-ambient-glow" />

            {/* Bottom Controls & Interaction Cue */}
            <div className="plinth-bottom-bar">
              <button
                type="button"
                className="pin-toggle-btn"
                onClick={handleResetOverview}
              >
                <span>Reset Overview</span>
              </button>

              <span className="plinth-orbit-hint">Drag to explore</span>
            </div>

            {/* Subtle Progress Loader */}
            <PlinthLoader />

            {/* Masked 3D Canvas (Edge boundaries fade into opacity) */}
            <div className="canvas-fade-mask">
              <Canvas
                camera={{ position: overviewCam, fov: 40, near: 0.1, far: 35 }}
                gl={{
                  antialias: true,
                  alpha: true,
                  powerPreference: "high-performance",
                  logarithmicDepthBuffer: true,
                }}
                dpr={[1, 2]}
              >
                <StudioLighting atmosphere={atmosphere} />

                <Suspense fallback={null}>
                  <RoomDiorama atmosphere={atmosphere} />
                  <ContactShadows
                    position={[0, -2.33, 0]}
                    opacity={0.35}
                    scale={11}
                    blur={2.8}
                    far={4.5}
                    color="#453b30"
                  />
                </Suspense>

                <CameraRig
                  targetPos={cameraPos}
                  targetLook={cameraTarget}
                  isUserInteracting={isUserInteracting}
                  controlsRef={controlsRef}
                />

                <OrbitControls
                  ref={controlsRef}
                  makeDefault
                  enableDamping
                  dampingFactor={0.06}
                  minDistance={2.4}
                  maxDistance={5.8}
                  minAzimuthAngle={-0.12}
                  maxAzimuthAngle={Math.PI / 2 + 0.12}
                  minPolarAngle={Math.PI / 3.4}
                  maxPolarAngle={Math.PI / 1.98}
                  autoRotate={false}
                  onStart={() => {
                    isUserInteracting.current = true;
                  }}
                />
              </Canvas>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHAPTER 2: STUDIO PHILOSOPHY ================= */}
      <section id="philosophy" className="philosophy-section">
        <div className="section-container">
          <div className="section-preface">
            <span className="kicker">Core Principles</span>
            <h2>
              A spatial philosophy rooted in natural illumination, silence, and genuine material honesty.
            </h2>
          </div>

          <div className="philosophy-grid">
            <div className="philosophy-card">
              <span className="card-num">01 /</span>
              <h3 className="card-title">Sculpted Daylight</h3>
              <p className="card-body">
                We calibrate volumes around the diurnal arc of the sun. Deep window reveals and hand-milled
                timber louvers diffuse harsh direct rays into gentle, painterly gradients that evolve
                throughout the day.
              </p>
            </div>

            <div className="philosophy-card">
              <span className="card-num">02 /</span>
              <h3 className="card-title">Tactile Honesty</h3>
              <p className="card-body">
                We reject faux finishes and synthetic laminates. Our commissions pair solid soap-finished
                ash, unsealed travertine, hand-rubbed wax bronze, and raw Belgian linens that patina
                beautifully over decades.
              </p>
            </div>

            <div className="philosophy-card">
              <span className="card-num">03 /</span>
              <h3 className="card-title">Micro-Spaciousness</h3>
              <p className="card-body">
                In compact architectural footprints, exactitude is an act of dignity. Concealed storage,
                flush timber reveals, and balanced sightlines grant the inhabitant true mental breathing room.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHAPTER 3: SELECTED COMMISSIONS ================= */}
      <section id="works" className="works-section">
        <div className="section-container">
          <div className="works-header">
            <div>
              <span className="edition-badge" style={{ marginBottom: "12px", display: "inline-block" }}>
                Spatial Portfolio
              </span>
              <h2 className="works-title">Selected Commissions</h2>
            </div>
            <span className="works-subtitle">Residential & Hospitality • 2024–2026</span>
          </div>

          <div className="works-grid">
            {/* Project 01 */}
            <div className="work-item" onClick={handleResetOverview}>
              <div className="work-preview-box">
                <img
                  className="work-image"
                  src="https://images.unsplash.com/photo-1760624492217-6e4ff7813e59?auto=format&fit=crop&w=1200&q=80"
                  alt="The Kyoto Mezzanine — Sunlit wooden micro-living studio in Kyoto"
                  loading="lazy"
                  decoding="async"
                />
                <span className="work-pill">Featured Study</span>
              </div>
              <div className="work-info">
                <div className="work-title-row">
                  <h3 className="work-name">The Kyoto Mezzanine</h3>
                  <span className="work-year">2026</span>
                </div>
                <p className="work-detail">14.5 m² Micro-Living Studio • Kyoto, Japan</p>
              </div>
            </div>

            {/* Project 02 */}
            <div className="work-item">
              <div className="work-preview-box">
                <img
                  className="work-image"
                  src="https://images.unsplash.com/photo-1723748972084-4124765e0a55?auto=format&fit=crop&w=1200&q=80"
                  alt="The Coastal Pavilion — Timber holiday residence in North Zealand, Denmark"
                  loading="lazy"
                  decoding="async"
                />
                <span className="work-pill">Residential</span>
              </div>
              <div className="work-info">
                <div className="work-title-row">
                  <h3 className="work-name">The Coastal Pavilion</h3>
                  <span className="work-year">2025</span>
                </div>
                <p className="work-detail">Timber Holiday Residence • North Zealand, Denmark</p>
              </div>
            </div>

            {/* Project 03 */}
            <div className="work-item">
              <div className="work-preview-box">
                <img
                  className="work-image"
                  src="https://images.unsplash.com/photo-1650187783483-79f3d7ccdfde?auto=format&fit=crop&w=1200&q=80"
                  alt="The Sculptor’s Loft — Industrial conversion and artist workspace in Stockholm, Sweden"
                  loading="lazy"
                  decoding="async"
                />
                <span className="work-pill">Atelier</span>
              </div>
              <div className="work-info">
                <div className="work-title-row">
                  <h3 className="work-name">The Sculptor’s Loft</h3>
                  <span className="work-year">2025</span>
                </div>
                <p className="work-detail">Industrial Conversion & Workspace • Stockholm, Sweden</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHAPTER 4: MATERIALITY ARCHIVE ================= */}
      <section id="materials" className="materials-section">
        <div className="section-container">
          <div className="section-preface">
            <span className="kicker">Material Library</span>
            <h2>An archive of honest, tactile substances that mature with light and touch.</h2>
          </div>

          <div className="materials-grid">
            <div className="material-card">
              <div className="material-swatch">
                <img
                  className="material-swatch-img"
                  src="https://images.unsplash.com/photo-1762978902169-e5789f7b56b8?auto=format&fit=crop&w=800&q=80"
                  alt="White Soap Ash texture — Pale open-pore northern ash timber"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="material-origin">Scandinavia</span>
              <h3 className="material-name">White Soap Ash</h3>
              <p className="material-desc">
                Sustainably harvested northern ash treated with pure vegetable soap flakes for a pale,
                silky, open-pore finish.
              </p>
            </div>

            <div className="material-card">
              <div className="material-swatch">
                <img
                  className="material-swatch-img"
                  src="https://images.unsplash.com/photo-1770065805058-3bfed55e23ee?auto=format&fit=crop&w=800&q=80"
                  alt="Honed Travertine texture — Roman matte-honed natural beige stone"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="material-origin">Italy</span>
              <h3 className="material-name">Honed Travertine</h3>
              <p className="material-desc">
                Cross-cut Roman travertine left unfilled and matte-honed to preserve organic geological
                cavities and tactile depth.
              </p>
            </div>

            <div className="material-card">
              <div className="material-swatch">
                <img
                  className="material-swatch-img"
                  src="https://images.unsplash.com/photo-1528458909336-e7a0adfed0a5?auto=format&fit=crop&w=800&q=80"
                  alt="Unbleached Raw Linen texture — Belgian heavyweight natural flax weave"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="material-origin">Belgium</span>
              <h3 className="material-name">Unbleached Raw Linen</h3>
              <p className="material-desc">
                Heavyweight flax weave with irregular natural slubs, providing sound dampening and soft
                tactile warmth.
              </p>
            </div>

            <div className="material-card">
              <div className="material-swatch">
                <img
                  className="material-swatch-img"
                  src="https://images.unsplash.com/photo-1756758932992-3cac25c395f7?auto=format&fit=crop&w=800&q=80"
                  alt="Waxed Smoked Bronze texture — Patinated microcrystalline beeswax finish"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="material-origin">Japan</span>
              <h3 className="material-name">Waxed Smoked Bronze</h3>
              <p className="material-desc">
                Hand-patinated hardware with microcrystalline beeswax coating that subtly burnishes at points
                of human contact.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CHAPTER 5: COMMISSIONS & INQUIRIES ================= */}
      <section id="inquiries" className="commission-section">
        <div className="commission-box">
          <span className="edition-badge">Begin a Dialogue</span>
          <h2 className="commission-title">Commission a Space of Contemplation</h2>
          <p className="commission-desc">
            We accept a limited number of private residential and spatial commissions each season to ensure
            uncompromising dedication to material sourcing, bespoke joinery, and execution.
          </p>

          <div className="commission-actions">
            <a href="mailto:inquiries@atelier-isoma.com" className="btn-commission">
              <span>Initiate Project Consultation</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
            <a href="mailto:inquiries@atelier-isoma.com" className="direct-email">
              inquiries@atelier-isoma.com
            </a>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="atelier-footer">
        <div className="footer-inner">
          <div className="footer-atelier-mark">
            <span className="footer-name">ATELIER ISOMA</span>
            <span className="footer-locs">Kyoto • Copenhagen • Zurich</span>
          </div>

          <div className="footer-copyright">
            <span>© {new Date().getFullYear()} Atelier Isoma Architecture & Interiors. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
