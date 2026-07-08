import { useEffect, useRef } from "react";
import * as THREE from "three";

const SpaceBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    // ── Scene + Camera ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010306);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.z = 5;

    // ── Lighting ──────────────────────────────────────────────────────────────
    const sunLight = new THREE.DirectionalLight(0xfff4d6, 2.2);
    sunLight.position.set(-15, 6, 10);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x060612, 0.5);
    scene.add(ambientLight);

    // Soft rim from opposite sun side (blue-cold)
    const rimLight = new THREE.DirectionalLight(0x1a3580, 0.35);
    rimLight.position.set(10, -4, -8);
    scene.add(rimLight);

    // ── Helper ────────────────────────────────────────────────────────────────
    const makeCanvasTex = (
      draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
      W = 512, H = 512
    ) => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      draw(c.getContext("2d")!, W, H);
      return new THREE.CanvasTexture(c);
    };

    // ══════════════════════════════════════════════════════════════════════════
    // STARS
    // ══════════════════════════════════════════════════════════════════════════

    // Spectral type colour palette (realistic proportions)
    const specColors = [
      new THREE.Color(0xb0c8ff), // O — blue-white     2%
      new THREE.Color(0xd0e0ff), // B — blue-white     8%
      new THREE.Color(0xeef0ff), // A — white         10%
      new THREE.Color(0xfffaee), // F — warm white    15%
      new THREE.Color(0xffeecc), // G — yellow        20%
      new THREE.Color(0xffddaa), // K — orange        25%
      new THREE.Color(0xffccaa), // M — red-orange    20%
    ];
    const specWeights = [0.02, 0.08, 0.10, 0.15, 0.20, 0.25, 0.20];
    const pickColor = () => {
      let r = Math.random(), acc = 0;
      for (let i = 0; i < specWeights.length; i++) {
        acc += specWeights[i];
        if (r < acc) return specColors[i];
      }
      return specColors[specColors.length - 1];
    };

    // ── Layer A: deep background stars (very small, dense) ────────────────────
    const BG_COUNT = 12000;
    const bgPos = new Float32Array(BG_COUNT * 3);
    const bgCol = new Float32Array(BG_COUNT * 3);
    for (let i = 0; i < BG_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 900 + Math.random() * 800;
      bgPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      bgPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      bgPos[i*3+2] = r * Math.cos(phi);
      const col = pickColor();
      bgCol[i*3] = col.r; bgCol[i*3+1] = col.g; bgCol[i*3+2] = col.b;
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.BufferAttribute(bgPos, 3));
    bgGeo.setAttribute("color",    new THREE.BufferAttribute(bgCol, 3));
    const bgMat = new THREE.PointsMaterial({
      size: 0.9, vertexColors: true, transparent: true, opacity: 0.75,
      sizeAttenuation: true,
    });
    const bgStars = new THREE.Points(bgGeo, bgMat);
    scene.add(bgStars);

    // ── Layer B: mid-field stars (medium) ─────────────────────────────────────
    const MID_COUNT = 4000;
    const midPos = new Float32Array(MID_COUNT * 3);
    const midCol = new Float32Array(MID_COUNT * 3);
    for (let i = 0; i < MID_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 500 + Math.random() * 400;
      midPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      midPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      midPos[i*3+2] = r * Math.cos(phi);
      const col = pickColor();
      midCol[i*3] = col.r; midCol[i*3+1] = col.g; midCol[i*3+2] = col.b;
    }
    const midGeo = new THREE.BufferGeometry();
    midGeo.setAttribute("position", new THREE.BufferAttribute(midPos, 3));
    midGeo.setAttribute("color",    new THREE.BufferAttribute(midCol, 3));
    const midMat = new THREE.PointsMaterial({
      size: 1.6, vertexColors: true, transparent: true, opacity: 0.85,
      sizeAttenuation: true,
    });
    const midStars = new THREE.Points(midGeo, midMat);
    scene.add(midStars);

    // ── Layer C: Milky Way band — dense star cloud ─────────────────────────────
    // Stars concentrated in a tilted galactic-plane disk
    const MW_COUNT = 6000;
    const mwPos = new Float32Array(MW_COUNT * 3);
    const mwCol = new Float32Array(MW_COUNT * 3);
    const TILT = Math.PI * 0.18; // galactic plane tilt
    for (let i = 0; i < MW_COUNT; i++) {
      const angle    = Math.random() * Math.PI * 2;
      const spread   = (Math.random() - 0.5) * 280; // width of the band
      const r        = 750 + Math.random() * 600;
      // Base position on the tilted band
      const bx = r * Math.cos(angle);
      const by = spread;
      const bz = r * Math.sin(angle);
      // Rotate around Z to tilt the band
      mwPos[i*3]   = bx;
      mwPos[i*3+1] = by * Math.cos(TILT) - bz * Math.sin(TILT);
      mwPos[i*3+2] = by * Math.sin(TILT) + bz * Math.cos(TILT);

      // Milky Way stars tend to be whiter/bluer (hot young stars)
      const t = Math.random();
      const col = t < 0.4
        ? new THREE.Color(0xeef2ff)
        : t < 0.7
          ? new THREE.Color(0xfffdf5)
          : pickColor();
      // Slight brightness randomisation
      const br = 0.5 + Math.random() * 0.5;
      mwCol[i*3] = col.r * br; mwCol[i*3+1] = col.g * br; mwCol[i*3+2] = col.b * br;
    }
    const mwGeo = new THREE.BufferGeometry();
    mwGeo.setAttribute("position", new THREE.BufferAttribute(mwPos, 3));
    mwGeo.setAttribute("color",    new THREE.BufferAttribute(mwCol, 3));
    const mwMat = new THREE.PointsMaterial({
      size: 0.7, vertexColors: true, transparent: true, opacity: 0.55,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mwBand = new THREE.Points(mwGeo, mwMat);
    scene.add(mwBand);

    // ── Layer D: a handful of bright foreground stars with glow ───────────────
    const BRIGHT_DATA = [
      { pos: [-280,  190, -700], r: 5.0, color: 0xffe8cc },
      { pos: [ 380, -130, -650], r: 4.2, color: 0xc8d8ff },
      { pos: [-120, -280, -600], r: 3.5, color: 0xfff4e8 },
      { pos: [ 220,  320, -900], r: 4.8, color: 0xffddc8 },
      { pos: [-400,  -80, -850], r: 3.8, color: 0xd0e4ff },
      { pos: [ 100, -400, -750], r: 4.0, color: 0xffe0b0 },
    ];
    const brightGeos: THREE.SphereGeometry[] = [];
    const brightMats: THREE.MeshBasicMaterial[] = [];
    const glowMats: THREE.MeshBasicMaterial[]   = [];
    BRIGHT_DATA.forEach(({ pos, r, color }) => {
      // Core dot
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos as [number,number,number]);
      scene.add(mesh);
      brightGeos.push(geo);
      brightMats.push(mat);

      // Glow halo (additive, larger sphere)
      const glowGeo = new THREE.SphereGeometry(r * 3.5, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.08,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.copy(mesh.position);
      scene.add(glowMesh);
      brightGeos.push(glowGeo);
      glowMats.push(glowMat);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // GAS GIANT (Saturn-like) — large, prominent, bottom-right
    // ══════════════════════════════════════════════════════════════════════════
    const gasTex = makeCanvasTex((ctx, W, H) => {
      // Rich golden-amber base with deep variation
      const base = ctx.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0.00, "#b08030");
      base.addColorStop(0.08, "#e8c060");
      base.addColorStop(0.18, "#d0a848");
      base.addColorStop(0.28, "#f0d080");
      base.addColorStop(0.38, "#c89040");
      base.addColorStop(0.48, "#dab858");
      base.addColorStop(0.55, "#b87828");
      base.addColorStop(0.62, "#d8a848");
      base.addColorStop(0.72, "#c09038");
      base.addColorStop(0.82, "#e0bc60");
      base.addColorStop(0.90, "#c08830");
      base.addColorStop(1.00, "#985820");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);

      // Horizontal cloud bands — varying width and opacity
      const bands = [
        { y: 0.05*H, h: 0.04*H, col: "rgba(255,248,220,0.30)" },
        { y: 0.12*H, h: 0.03*H, col: "rgba(120, 70, 10,0.25)" },
        { y: 0.20*H, h: 0.06*H, col: "rgba(255,230,160,0.22)" },
        { y: 0.30*H, h: 0.025*H,col: "rgba( 90, 50,  5,0.30)" },
        { y: 0.38*H, h: 0.05*H, col: "rgba(255,220,140,0.18)" },
        { y: 0.46*H, h: 0.04*H, col: "rgba(100, 55, 10,0.28)" },
        { y: 0.54*H, h: 0.03*H, col: "rgba(255,235,170,0.20)" },
        { y: 0.60*H, h: 0.055*H,col: "rgba( 80, 45,  5,0.25)" },
        { y: 0.70*H, h: 0.03*H, col: "rgba(255,215,130,0.18)" },
        { y: 0.78*H, h: 0.025*H,col: "rgba( 90, 50,  8,0.22)" },
        { y: 0.86*H, h: 0.04*H, col: "rgba(255,225,150,0.16)" },
        { y: 0.93*H, h: 0.035*H,col: "rgba(100, 60, 10,0.20)" },
      ];
      bands.forEach(({ y, h, col }) => {
        ctx.fillStyle = col;
        ctx.fillRect(0, y, W, h);
      });

      // Wavy band edges (turbulence)
      for (let band of bands.slice(0, 6)) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = "rgba(255,200,80,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const yy = band.y + Math.sin(x * 0.03) * 4;
          x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Great storm oval (like Jupiter's red spot)
      ctx.save();
      ctx.fillStyle = "rgba(160,45,15,0.65)";
      ctx.beginPath();
      ctx.ellipse(W*0.62, H*0.54, W*0.07, H*0.07, 0, 0, Math.PI*2);
      ctx.fill();
      // Swirl ring around it
      ctx.strokeStyle = "rgba(120,30,10,0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(W*0.62, H*0.54, W*0.10, H*0.10, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();

      // Polar regions — slightly desaturated/brightened
      const northPolar = ctx.createLinearGradient(0,0,0,H*0.12);
      northPolar.addColorStop(0, "rgba(240,220,180,0.4)");
      northPolar.addColorStop(1, "rgba(240,220,180,0)");
      ctx.fillStyle = northPolar;
      ctx.fillRect(0,0,W,H*0.12);

      const southPolar = ctx.createLinearGradient(0,H*0.88,0,H);
      southPolar.addColorStop(0, "rgba(200,180,140,0)");
      southPolar.addColorStop(1, "rgba(200,180,140,0.35)");
      ctx.fillStyle = southPolar;
      ctx.fillRect(0,H*0.88,W,H*0.12);
    }, 512, 256);

    const gasGeo  = new THREE.SphereGeometry(3.6, 64, 64);
    const gasMat  = new THREE.MeshStandardMaterial({
      map: gasTex, roughness: 0.65, metalness: 0.0,
    });
    const gasPlanet = new THREE.Mesh(gasGeo, gasMat);
    // Bottom-right, partially cropped — feels massive
    gasPlanet.position.set(6.0, -4.5, -12);
    gasPlanet.rotation.z = 0.08;
    scene.add(gasPlanet);

    // ── Atmospheric glow — 3 layers ───────────────────────────────────────────
    const atmLayers = [
      { dr: 0.18, color: 0xd4a040, opacity: 0.10 },
      { dr: 0.40, color: 0xc88820, opacity: 0.05 },
      { dr: 0.75, color: 0xaa6610, opacity: 0.025 },
    ];
    const atmGeos: THREE.SphereGeometry[]      = [];
    const atmMats: THREE.MeshStandardMaterial[] = [];
    atmLayers.forEach(({ dr, color, opacity }) => {
      const g = new THREE.SphereGeometry(3.6 + dr, 64, 64);
      const m = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity,
        side: THREE.FrontSide, depthWrite: false, roughness: 1, metalness: 0,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(gasPlanet.position);
      scene.add(mesh);
      atmGeos.push(g); atmMats.push(m);
    });

    // ── Ring system — 3 concentric rings ─────────────────────────────────────
    const rings: THREE.Mesh[] = [];
    const ringGeos: THREE.RingGeometry[] = [];
    const ringMats: THREE.MeshBasicMaterial[] = [];
    const ringTextures: THREE.Texture[] = [];

    const ringDefs: Array<{ inner:number; outer:number; opacity:number }> = [
      { inner: 4.5, outer: 5.5, opacity: 0.75 }, // bright B ring
      { inner: 5.6, outer: 6.6, opacity: 0.50 }, // A ring
      { inner: 6.8, outer: 7.5, opacity: 0.25 }, // faint outer ring
    ];

    ringDefs.forEach(({ inner, outer, opacity }) => {
      const rGeo = new THREE.RingGeometry(inner, outer, 120, 4);
      // Remap UV so gradient goes inner→outer
      const pos = rGeo.attributes.position;
      const uv  = rGeo.attributes.uv;
      const center = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        center.fromBufferAttribute(pos, i);
        const len = center.length();
        uv.setXY(i, (len - inner) / (outer - inner), 0.5);
      }

      const rTex = makeCanvasTex((ctx, W) => {
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0.00, "rgba(200,165,80, 0)");
        grad.addColorStop(0.05, "rgba(220,185,100,0.9)");
        grad.addColorStop(0.25, "rgba(200,165,80, 0.7)");
        grad.addColorStop(0.45, "rgba(230,195,110,0.85)");
        grad.addColorStop(0.60, "rgba(180,145,60, 0.6)");
        grad.addColorStop(0.80, "rgba(210,175,90, 0.75)");
        grad.addColorStop(0.95, "rgba(200,165,80, 0.5)");
        grad.addColorStop(1.00, "rgba(200,165,80, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, W);
      }, 256, 256);

      const rMat = new THREE.MeshBasicMaterial({
        map: rTex, transparent: true, opacity,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.position.copy(gasPlanet.position);
      // PI/2 → ring lies in XZ plane (equatorial for Y-rotating planet).
      // Then z-tilt mimics Saturn's 26.7° axial tilt so rings aren't edge-on.
      rMesh.rotation.x = Math.PI / 2;
      rMesh.rotation.z = 0.45;
      scene.add(rMesh);
      rings.push(rMesh);
      ringGeos.push(rGeo); ringMats.push(rMat); ringTextures.push(rTex);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // NEBULA particle cloud (background colour wash)
    // ══════════════════════════════════════════════════════════════════════════
    const NEB_COUNT = 800;
    const nebPos = new Float32Array(NEB_COUNT * 3);
    const nebCol = new Float32Array(NEB_COUNT * 3);
    const nebPalette = [
      new THREE.Color(0x0f1a66),
      new THREE.Color(0x1a0055),
      new THREE.Color(0x220044),
      new THREE.Color(0x080830),
      new THREE.Color(0x050520),
    ];
    for (let i = 0; i < NEB_COUNT; i++) {
      nebPos[i*3]   = -100 + (Math.random()-0.5)*600;
      nebPos[i*3+1] =   50 + (Math.random()-0.5)*350;
      nebPos[i*3+2] = -500 + (Math.random()-0.5)*500;
      const c = nebPalette[Math.floor(Math.random()*nebPalette.length)];
      nebCol[i*3] = c.r; nebCol[i*3+1] = c.g; nebCol[i*3+2] = c.b;
    }
    const nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute("position", new THREE.BufferAttribute(nebPos, 3));
    nebGeo.setAttribute("color",    new THREE.BufferAttribute(nebCol, 3));
    const nebMat = new THREE.PointsMaterial({
      size: 18, vertexColors: true, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const nebula = new THREE.Points(nebGeo, nebMat);
    scene.add(nebula);

    // ══════════════════════════════════════════════════════════════════════════
    // MOUSE PARALLAX + RESIZE
    // ══════════════════════════════════════════════════════════════════════════
    let mouseX = 0, mouseY = 0, smoothX = 0, smoothY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth  - 0.5) * 0.5;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
    };
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener("resize", onResize);

    // ══════════════════════════════════════════════════════════════════════════
    // ANIMATION LOOP
    // ══════════════════════════════════════════════════════════════════════════
    let rafId: number;
    let lastTime = 0;

    const animate = (time: number) => {
      if (document.hidden) { rafId = requestAnimationFrame(animate); return; }
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      smoothX += (mouseX - smoothX) * 0.035;
      smoothY += (mouseY - smoothY) * 0.035;
      camera.rotation.x = -smoothY * 0.10;
      camera.rotation.y = -smoothX * 0.10;

      // Star layers rotate at different speeds (depth parallax)
      bgStars.rotation.y  += dt * 0.0030;
      bgStars.rotation.x  += dt * 0.0010;
      midStars.rotation.y += dt * 0.0045;
      midStars.rotation.x += dt * 0.0015;
      mwBand.rotation.y   += dt * 0.0025;

      // Planet + rings
      gasPlanet.rotation.y += dt * 0.014;
      // rings don't self-rotate — they stay fixed at the planet's equatorial plane

      // Nebula drift
      nebula.rotation.y += dt * 0.001;
      nebula.rotation.x += dt * 0.0005;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    // ══════════════════════════════════════════════════════════════════════════
    // CLEANUP
    // ══════════════════════════════════════════════════════════════════════════
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

      [bgGeo, midGeo, mwGeo, gasGeo, nebGeo, ...ringGeos, ...atmGeos, ...brightGeos]
        .forEach(g => g.dispose());
      [bgMat, midMat, mwMat, gasMat, nebMat, ...ringMats, ...atmMats, ...brightMats, ...glowMats]
        .forEach(m => m.dispose());
      [gasTex, ...ringTextures].forEach(t => t.dispose());

      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}
    />
  );
};

export default SpaceBackground;
