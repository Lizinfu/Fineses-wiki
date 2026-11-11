import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

type SignalModel = "orbit" | "crest" | "terrain";
type SignalState = "forming" | "stable" | "interacting" | "paused" | "unavailable";
type FieldRenderer = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  group: Group;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  ambientGeometry: BufferGeometry;
  ambientMaterial: ShaderMaterial;
};

const MODELS: Record<SignalModel, string> = {
  orbit: "环轨观测",
  crest: "档案印记",
  terrain: "地形测绘",
};
const TAU = Math.PI * 2;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// All three targets are original display graphics. They do not consume or
// mutate the atlas geometry, content index, or any worldbuilding data.
function createTarget(model: SignalModel, count: number): Float32Array {
  const target = new Float32Array(count * 3);
  const random = seededRandom(1709);
  for (let i = 0; i < count; i++) {
    const t = random();
    const a = random() * TAU;
    let x = 0, y = 0, z = 0;
    if (model === "orbit") {
      if (t < 0.72) {
        // A legible wire globe: eight parallels and twelve meridians.
        if (i % 2) {
          const latitude = (Math.floor(random() * 8) - 3.5) * 0.32;
          x = Math.cos(a) * Math.cos(latitude) * 1.02;
          y = Math.sin(latitude) * 1.02;
          z = Math.sin(a) * Math.cos(latitude) * 1.02;
        } else {
          const longitude = Math.floor(random() * 12) * TAU / 12;
          x = Math.cos(a) * Math.cos(longitude) * 1.02;
          y = Math.sin(a) * 1.02;
          z = Math.cos(a) * Math.sin(longitude) * 1.02;
        }
      } else if (t < 0.94) {
        x = Math.cos(a) * 1.49;
        y = Math.sin(a) * 0.52;
        z = Math.sin(a) * 0.82;
        const rotatedX = x * 0.94 - y * 0.342;
        y = x * 0.342 + y * 0.94;
        x = rotatedX;
      } else {
        const side = i % 2 ? -1 : 1;
        x = side * (1.2 + random() * 0.38);
        y = side * 0.94;
        z = 0;
      }
    } else if (model === "crest") {
      if (t < 0.47) {
        const edge = Math.floor(random() * 6);
        const p = random();
        const a0 = edge * TAU / 6 + Math.PI / 6;
        const a1 = (edge + 1) * TAU / 6 + Math.PI / 6;
        const radius = t < 0.28 ? 1.23 : 1.09;
        x = (Math.cos(a0) * (1 - p) + Math.cos(a1) * p) * radius;
        y = (Math.sin(a0) * (1 - p) + Math.sin(a1) * p) * radius;
        z = Math.sin(a0) * 0.08;
      } else if (t < 0.8) {
        // A narrow faceted archive beacon inside the open frame.
        const edge = Math.floor(random() * 4);
        const diamond = [[0, 0.84], [0.49, -0.16], [0, -0.82], [-0.49, -0.16]];
        const p = random();
        const start = diamond[edge], end = diamond[(edge + 1) % 4];
        x = start[0] * (1 - p) + end[0] * p;
        y = start[1] * (1 - p) + end[1] * p;
        z = Math.abs(x) * 0.32;
        if (i % 4 === 0) {
          x = 0;
          y = random() * 1.66 - 0.82;
          z = 0.17;
        }
      } else {
        const side = i % 2 ? -1 : 1;
        const line = Math.floor(random() * 4);
        x = side * (0.54 + random() * (0.77 - line * 0.12));
        y = 0.48 - line * 0.28;
        z = -0.08;
      }
    } else {
      // Isometric contour ribbons: an abstract relief, not a geographic claim.
      const strip = Math.floor(random() * 26);
      const u = random() * 2 - 1;
      const v = strip / 25 * 2 - 1;
      const relief = Math.exp(-((u + 0.22) ** 2 * 3.6 + (v - 0.1) ** 2 * 4.2)) * 0.69
        + Math.exp(-((u - 0.61) ** 2 * 9 + (v + 0.35) ** 2 * 7)) * 0.31;
      x = u * 1.31 + v * 0.19;
      y = v * 0.65 + relief - 0.28;
      z = -v * 0.76 + relief * 0.28;
      if (t > 0.94) {
        x = u * 1.48;
        y = -0.99;
        z = strip % 2 ? -0.9 : 0.9;
      }
    }
    const grain = 0.006;
    target[i * 3] = x + (random() - 0.5) * grain;
    target[i * 3 + 1] = y + (random() - 0.5) * grain;
    target[i * 3 + 2] = z + (random() - 0.5) * grain;
  }
  return target;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const vertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aAccent;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uAmbient;
  varying float vAlpha;
  varying float vAccent;
  void main() {
    vec3 p = position;
    float fade = 1.0;
    if (uAmbient > 0.5) {
      p.y = mod(p.y + uTime * (0.025 + aSize * 0.009), 3.5) - 1.75;
      p.x += sin(uTime * 0.16 + aSize * 4.0) * 0.06;
      fade = smoothstep(0.0, 0.4, p.y + 1.75) * smoothstep(0.0, 0.4, 1.75 - p.y);
    }
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * (5.2 / -viewPosition.z), 1.0, 5.0);
    vAlpha = aAlpha * fade;
    vAccent = aAccent;
  }
`;

const fragmentShader = `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vAccent;
  void main() {
    vec2 q = abs(gl_PointCoord - 0.5);
    float edge = 1.0 - smoothstep(0.26, 0.5, max(q.x, q.y));
    float alpha = edge * vAlpha * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uInk, uAccent, vAccent), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class SignalField {
  private readonly root = document.documentElement;
  private readonly reduced = window.matchMedia(REDUCED_MOTION);
  private readonly viewport: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly fallback: Element[];
  private readonly targets: Record<SignalModel, Float32Array>;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly seeds: Float32Array;
  private readonly count: number;
  private readonly cleanup: (() => void)[] = [];
  private graphics: FieldRenderer | null = null;
  private model: SignalModel = "orbit";
  private state: SignalState = "paused";
  private frame = 0;
  private previousTime = 0;
  private elapsed = 0;
  private transitionUntil = 1.6;
  private width = 1;
  private height = 1;
  private visible = true;
  private pageActive = true;
  private unavailable = false;
  private disposed = false;
  private pointer = { x: 0, y: 0, strength: 0, active: false };

  constructor(private readonly host: HTMLElement) {
    this.viewport = host.querySelector<HTMLElement>(".home-signal__viewport") ?? host;
    this.buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("[data-signal-model]"));
    this.fallback = Array.from(host.querySelectorAll("[data-signal-static]"));
    this.count = window.matchMedia("(max-width: 640px)").matches ? 2400 : 6400;
    this.targets = {
      orbit: createTarget("orbit", this.count),
      crest: createTarget("crest", this.count),
      terrain: createTarget("terrain", this.count),
    };
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count);
    const random = seededRandom(4106);
    for (let i = 0; i < this.count; i++) {
      this.seeds[i] = random() * TAU;
      for (let axis = 0; axis < 3; axis++) {
        this.positions[i * 3 + axis] = (random() - 0.5) * (axis === 2 ? 2.8 : 5.3);
      }
    }

    for (const button of this.buttons) {
      this.listen(button, "click", () => {
        const model = button.dataset.signalModel as SignalModel;
        if (Object.hasOwn(MODELS, model)) this.select(model);
      });
    }
    const controls = host.querySelector<HTMLElement>("[data-signal-controls], .home-signal__controls");
    if (controls) controls.hidden = false;
    this.select("orbit");
    this.listen(this.viewport, "pointermove", (event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === "touch") return;
      const bounds = this.viewport.getBoundingClientRect();
      this.pointer.x = (pointer.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1;
      this.pointer.y = 1 - (pointer.clientY - bounds.top) / Math.max(1, bounds.height) * 2;
      this.pointer.active = true;
    }, { passive: true });
    this.listen(this.viewport, "pointerleave", () => { this.pointer.active = false; });
    this.listen(document, "visibilitychange", () => this.sync());
    this.listen(this.reduced, "change", () => this.sync());
    this.listen(window, "pagehide", (event) => {
      this.pageActive = false;
      this.pause();
      if (!(event as PageTransitionEvent).persisted) this.dispose();
    });
    this.listen(window, "pageshow", () => {
      this.pageActive = true;
      this.measure();
      this.sync();
    });
    const rootObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "data-theme")) this.updatePalette();
      this.sync();
    });
    rootObserver.observe(this.root, { attributes: true, attributeFilter: ["data-motion", "data-theme"] });
    this.cleanup.push(() => rootObserver.disconnect());
    if ("IntersectionObserver" in window) {
      const intersection = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        this.sync();
      }, { rootMargin: "100px" });
      intersection.observe(this.viewport);
      this.cleanup.push(() => intersection.disconnect());
    }
    if ("ResizeObserver" in window) {
      const resize = new ResizeObserver(() => this.measure());
      resize.observe(this.viewport);
      this.cleanup.push(() => resize.disconnect());
    } else {
      this.listen(window, "resize", () => this.measure(), { passive: true });
    }
    this.measure();
    this.sync();
  }

  private listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, listener, options);
    this.cleanup.push(() => target.removeEventListener(type, listener, options));
  }

  private select(model: SignalModel): void {
    const changed = this.model !== model;
    this.model = model;
    this.host.dataset.signalModel = model;
    for (const button of this.buttons) button.setAttribute("aria-pressed", String(button.dataset.signalModel === model));
    for (const graphic of this.fallback) graphic.toggleAttribute("hidden", graphic.getAttribute("data-signal-static") !== model);
    const label = this.host.querySelector<HTMLElement>("[data-signal-label]");
    if (label) label.textContent = MODELS[model];
    if (!changed) return;
    this.transitionUntil = this.elapsed + 1.6;
    // A brief outward impulse makes the old diagram release before it reforms.
    for (let i = 0; i < this.count; i++) {
      this.velocities[i * 3] += Math.cos(this.seeds[i]) * 0.9;
      this.velocities[i * 3 + 1] += Math.sin(this.seeds[i]) * 0.9;
      this.velocities[i * 3 + 2] += Math.sin(this.seeds[i] * 1.7) * 0.6;
    }
    this.sync();
  }

  private motionAllowed(): boolean {
    return !this.reduced.matches && this.root.dataset.motion !== "off" && this.root.dataset.motion !== "reduced";
  }

  private setState(state: SignalState): void {
    if (this.state === state && this.host.dataset.signalState === state) return;
    this.state = state;
    this.host.dataset.signalState = state;
  }

  private sync(): void {
    if (this.disposed) return;
    if (!this.motionAllowed() || this.unavailable) {
      this.pause();
      this.host.dataset.signalReady = "false";
      this.setState(this.unavailable ? "unavailable" : "paused");
      if (this.graphics) this.graphics.renderer.domElement.hidden = true;
      return;
    }
    if (!this.visible || document.hidden || !this.pageActive || this.width < 2 || this.height < 2) {
      this.pause();
      return;
    }
    if (!this.graphics && !this.createRenderer()) return;
    if (this.graphics) this.graphics.renderer.domElement.hidden = false;
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  private createRenderer(): boolean {
    const canvas = document.createElement("canvas");
    canvas.className = "home-signal__canvas";
    canvas.setAttribute("aria-hidden", "true");
    let renderer: WebGLRenderer | undefined;
    let geometry: BufferGeometry | undefined;
    let ambientGeometry: BufferGeometry | undefined;
    let material: ShaderMaterial | undefined;
    let ambientMaterial: ShaderMaterial | undefined;
    try {
      // Probe first, so unavailable WebGL produces a quiet, complete SVG fallback.
      const context = canvas.getContext("webgl2", { alpha: true, antialias: false, powerPreference: "low-power" });
      if (!context) throw new Error("WebGL2 is unavailable");
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.debug.checkShaderErrors = true;
      renderer.debug.onShaderError = () => {
        // A shader/link failure normally only logs inside Three. Escalate it to
        // our render guard so a blank canvas never replaces the complete SVG.
        throw new Error("Signal field shader is unavailable");
      };
      renderer.setClearColor(0x000000, 0);
      const scene = new Scene();
      const camera = new PerspectiveCamera(38, this.width / this.height, 0.1, 30);
      camera.position.z = 5.6;
      const group = new Group();
      group.rotation.x = -0.09;
      scene.add(group);
      geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
      const random = seededRandom(227);
      const sizes = new Float32Array(this.count);
      const alphas = new Float32Array(this.count);
      const accents = new Float32Array(this.count);
      for (let i = 0; i < this.count; i++) {
        sizes[i] = 0.9 + random() * 0.85;
        alphas[i] = 0.28 + random() * 0.62;
        accents[i] = i % 11 === 0 ? 0.9 : random() * 0.12;
      }
      geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
      geometry.setAttribute("aAlpha", new BufferAttribute(alphas, 1));
      geometry.setAttribute("aAccent", new BufferAttribute(accents, 1));
      material = this.createMaterial(false);
      const field = new Points(geometry, material);
      // Position buffers change continuously; a stale bounding sphere must not
      // hide the forming cloud as it moves into the final diagram.
      field.frustumCulled = false;
      group.add(field);

      const ambientCount = this.count < 3000 ? 32 : 64;
      ambientGeometry = new BufferGeometry();
      const dust = new Float32Array(ambientCount * 3);
      const dustSizes = new Float32Array(ambientCount);
      const dustAlphas = new Float32Array(ambientCount);
      const dustAccents = new Float32Array(ambientCount);
      for (let i = 0; i < ambientCount; i++) {
        dust[i * 3] = (random() - 0.5) * 4.3;
        dust[i * 3 + 1] = random() * 3.5;
        dust[i * 3 + 2] = (random() - 0.5) * 2;
        dustSizes[i] = 1 + random() * 1.7;
        dustAlphas[i] = 0.12 + random() * 0.3;
        dustAccents[i] = i % 3 ? 0.2 : 1;
      }
      ambientGeometry.setAttribute("position", new BufferAttribute(dust, 3));
      ambientGeometry.setAttribute("aSize", new BufferAttribute(dustSizes, 1));
      ambientGeometry.setAttribute("aAlpha", new BufferAttribute(dustAlphas, 1));
      ambientGeometry.setAttribute("aAccent", new BufferAttribute(dustAccents, 1));
      ambientMaterial = this.createMaterial(true);
      const atmosphere = new Points(ambientGeometry, ambientMaterial);
      atmosphere.frustumCulled = false;
      scene.add(atmosphere);
      this.graphics = { renderer, scene, camera, group, geometry, material, ambientGeometry, ambientMaterial };
      this.listen(canvas, "webglcontextlost", (event) => {
        event.preventDefault();
        this.unavailable = true;
        this.sync();
      });
      this.listen(canvas, "webglcontextrestored", () => {
        this.unavailable = false;
        this.measure();
        this.sync();
      });
      this.viewport.append(canvas);
      this.measure();
      this.updatePalette();
      return true;
    } catch {
      renderer?.dispose();
      geometry?.dispose();
      ambientGeometry?.dispose();
      material?.dispose();
      ambientMaterial?.dispose();
      canvas.remove();
      this.graphics = null;
      this.unavailable = true;
      this.host.dataset.signalReady = "false";
      this.setState("unavailable");
      return false;
    }
  }

  private createMaterial(ambient: boolean): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
        uTime: { value: 0 },
        uAmbient: { value: ambient ? 1 : 0 },
        uInk: { value: new Color("#dce8ee") },
        uAccent: { value: new Color("#65d9ef") },
        uOpacity: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
  }

  private updatePalette(): void {
    if (!this.graphics) return;
    const style = getComputedStyle(this.root);
    const light = this.root.dataset.theme === "light";
    const accent = style.getPropertyValue("--accent").trim() || "#65d9ef";
    for (const material of [this.graphics.material, this.graphics.ambientMaterial]) {
      material.uniforms.uInk.value.set(light ? "#324e5b" : "#dce8ee");
      material.uniforms.uAccent.value.set(accent);
      material.uniforms.uOpacity.value = light ? 0.84 : 1;
    }
  }

  private measure(): void {
    this.width = this.viewport.clientWidth;
    this.height = this.viewport.clientHeight;
    if (this.graphics && this.width > 1 && this.height > 1) {
      const ratio = Math.min(window.devicePixelRatio || 1, this.count < 3000 ? 1.25 : 1.5);
      this.graphics.renderer.setPixelRatio(ratio);
      this.graphics.renderer.setSize(this.width, this.height, false);
      this.graphics.camera.aspect = this.width / this.height;
      // Preserve the diagram at both wide and narrow viewport proportions.
      this.graphics.camera.position.z = Math.max(5.6, 4.6 / this.graphics.camera.aspect);
      this.graphics.camera.updateProjectionMatrix();
      this.graphics.material.uniforms.uPixelRatio.value = ratio;
      this.graphics.ambientMaterial.uniforms.uPixelRatio.value = ratio;
    }
    this.sync();
  }

  private readonly draw = (time: number): void => {
    this.frame = 0;
    if (!this.graphics || this.disposed || !this.motionAllowed() || !this.visible || document.hidden || !this.pageActive) {
      this.sync();
      return;
    }
    // Thirty frames per second is ample for the slow point-cloud motion.
    if (this.previousTime && time - this.previousTime < 32) {
      this.frame = requestAnimationFrame(this.draw);
      return;
    }
    const dt = this.previousTime ? Math.min((time - this.previousTime) / 1000, 0.05) : 1 / 30;
    this.previousTime = time;
    this.elapsed += dt;
    this.pointer.strength += ((this.pointer.active ? 1 : 0) - this.pointer.strength) * (1 - Math.exp(-dt * 7));
    const { renderer, scene, camera, group, geometry, material, ambientMaterial } = this.graphics;
    const target = this.targets[this.model];
    const viewHeight = 2 * Math.tan(19 * Math.PI / 180) * camera.position.z;
    const pointerX = this.pointer.x * viewHeight * camera.aspect * 0.5;
    const pointerY = this.pointer.y * viewHeight * 0.5;
    for (let i = 0; i < this.count; i++) {
      const offset = i * 3;
      let forceX = 0, forceY = 0, forceZ = 0;
      if (this.pointer.strength > 0.01) {
        const dx = this.positions[offset] - pointerX;
        const dy = this.positions[offset + 1] - pointerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.49) {
          const force = (1 - distance / 0.49) ** 2 * 17 * this.pointer.strength;
          forceX = dx / Math.max(distance, 0.04) * force;
          forceY = dy / Math.max(distance, 0.04) * force;
          forceZ = force * 0.24;
        }
      }
      for (let axis = 0; axis < 3; axis++) {
        const index = offset + axis;
        const drift = Math.sin(this.elapsed * 0.38 + this.seeds[i] + axis) * 0.007;
        const force = axis === 0 ? forceX : axis === 1 ? forceY : forceZ;
        this.velocities[index] += ((target[index] + drift - this.positions[index]) * 22 - this.velocities[index] * 8 + force) * dt;
        this.positions[index] += this.velocities[index] * dt;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    const ease = 1 - Math.exp(-dt * 3);
    const desiredY = Math.sin(this.elapsed * 0.09) * 0.1 + this.pointer.x * this.pointer.strength * 0.085;
    const desiredX = -0.09 - this.pointer.y * this.pointer.strength * 0.06;
    group.rotation.y += (desiredY - group.rotation.y) * ease;
    group.rotation.x += (desiredX - group.rotation.x) * ease;
    material.uniforms.uTime.value = this.elapsed;
    ambientMaterial.uniforms.uTime.value = this.elapsed;
    try {
      renderer.render(scene, camera);
      this.host.dataset.signalReady = "true";
      this.setState(this.elapsed < this.transitionUntil ? "forming" : this.pointer.strength > 0.1 ? "interacting" : "stable");
      this.frame = requestAnimationFrame(this.draw);
    } catch {
      this.unavailable = true;
      this.sync();
    }
  };

  private pause(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.previousTime = 0;
    this.pointer.active = false;
    if (!this.unavailable) this.setState("paused");
  }

  private dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    for (const cleanup of this.cleanup.splice(0)) cleanup();
    if (this.graphics) {
      this.graphics.geometry.dispose();
      this.graphics.ambientGeometry.dispose();
      this.graphics.material.dispose();
      this.graphics.ambientMaterial.dispose();
      this.graphics.renderer.dispose();
      this.graphics.renderer.domElement.remove();
      this.graphics = null;
    }
    this.host.dataset.signalReady = "false";
  }
}

export function initSignalField(): void {
  // The entry is loaded only on the homepage; the guard also protects against
  // accidentally constructing a second WebGL scene on the atlas.
  if (document.querySelector(".atlas-page")) return;
  for (const host of document.querySelectorAll<HTMLElement>("[data-signal-field]")) {
    if (host.dataset.signalInitialized === "true") continue;
    host.dataset.signalInitialized = "true";
    host.dataset.signalReady = "false";
    try {
      new SignalField(host);
    } catch {
      host.dataset.signalState = "unavailable";
      host.dataset.signalReady = "false";
    }
  }
}
