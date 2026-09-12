/*
 * HologramField — motor holográfico 3D sobre canvas 2D (sin dependencias).
 *
 * Dibuja un núcleo de alambre (icosfera subdividida) con proyección en
 * perspectiva real, un octaedro interior, anillos orbitales inclinados
 * con satélites y estelas, campo de estrellas 3D, rejilla de horizonte,
 * barrido de escáner, ondas de choque y motes de luz.
 *
 * Interacción: parallax con el puntero, arrastrar para rotar (con inercia),
 * rueda / pellizco para zoom y clic para emitir un pulso.
 */

const TAU = Math.PI * 2;
const CAMERA_DISTANCE = 3.55;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;

function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
}

/* Matriz R = Rz · Ry · Rx para vectores columna. */
function rotationMatrix(ax, ay, az) {
    const cx = Math.cos(ax);
    const sx = Math.sin(ax);
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    const cz = Math.cos(az);
    const sz = Math.sin(az);
    return [
        [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
        [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
        [-sy, sx * cy, cx * cy]
    ];
}

function transform(m, p, out) {
    const x = p[0];
    const y = p[1];
    const z = p[2];
    out[0] = m[0][0] * x + m[0][1] * y + m[0][2] * z;
    out[1] = m[1][0] * x + m[1][1] * y + m[1][2] * z;
    out[2] = m[2][0] * x + m[2][1] * y + m[2][2] * z;
    return out;
}

/* Icosfera subdividida: vértices unitarios y aristas únicas. */
function createIcosphere(detail) {
    const q = (1 + Math.sqrt(5)) / 2;
    let verts = [
        [-1, q, 0], [1, q, 0], [-1, -q, 0], [1, -q, 0],
        [0, -1, q], [0, 1, q], [0, -1, -q], [0, 1, -q],
        [q, 0, -1], [q, 0, 1], [-q, 0, -1], [-q, 0, 1]
    ].map(normalize);
    let faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    const cache = new Map();
    const midpoint = (a, b) => {
        const key = a < b ? a * 100000 + b : b * 100000 + a;
        let mid = cache.get(key);
        if (mid === undefined) {
            const va = verts[a];
            const vb = verts[b];
            mid = verts.length;
            verts.push(normalize([
                (va[0] + vb[0]) / 2,
                (va[1] + vb[1]) / 2,
                (va[2] + vb[2]) / 2
            ]));
            cache.set(key, mid);
        }
        return mid;
    };
    for (let level = 0; level < detail; level += 1) {
        const next = [];
        for (const [a, b, c] of faces) {
            const ab = midpoint(a, b);
            const bc = midpoint(b, c);
            const ca = midpoint(c, a);
            next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = next;
    }
    const edgeKeys = new Set();
    const edges = [];
    const addEdge = (a, b) => {
        const key = a < b ? a * 100000 + b : b * 100000 + a;
        if (!edgeKeys.has(key)) {
            edgeKeys.add(key);
            edges.push([a, b]);
        }
    };
    for (const [a, b, c] of faces) {
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
    }
    return { verts, edges };
}

function createOctahedron() {
    return {
        verts: [
            [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]
        ],
        edges: [
            [0, 2], [0, 3], [0, 4], [0, 5],
            [1, 2], [1, 3], [1, 4], [1, 5],
            [2, 4], [4, 3], [3, 5], [5, 2]
        ]
    };
}

const COLORS = {
    cyan: [128, 242, 255],
    violet: [169, 130, 255],
    pink: [255, 113, 210],
    white: [224, 252, 255]
};

function mixColor(a, b, t) {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t))
    ];
}

const rgba = (color, alpha) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clamp(alpha, 0, 1).toFixed(3)})`;

const makePool = (n) => {
    const pool = new Array(n);
    for (let i = 0; i < n; i += 1) {
        pool[i] = { x1: 0, y1: 0, x2: 0, y2: 0, z: 0, scan: 0 };
    }
    return pool;
};

export class HologramField {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.anchor = options.anchor || null;
        this.readout = options.readout || null;

        const win = window;
        this.reducedMotion = Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

        this.dpr = Math.min(win.devicePixelRatio || 1, 2);
        this.width = win.innerWidth;
        this.height = win.innerHeight;

        this.pointer = { x: 0.5, y: 0.44 };
        this.center = { x: this.width * 0.72, y: this.height * 0.45, tx: 0, ty: 0 };
        this.radius = 160;
        this.targetRadius = 160;
        this._hadAnchor = false;

        // Rotación (arrastre + giro automático + inercia)
        this.rotX = -0.16;
        this.rotY = 0.4;
        this.spinVelocity = 0;
        this.tiltVelocity = 0;
        this.dragging = false;

        this.zoom = 1;
        this.targetZoom = 1;

        this.time = 0;
        this.lastFrame = 0;
        this.pulseTimer = 2.5;
        this.shockwaves = [];
        this.activePointers = new Map();
        this.pinch = null;
        this.dragStart = null;
        this.lastDrag = null;

        this.rings = [
            { radius: 1.34, tiltX: 1.18, tiltZ: -0.42, speed: 0.42, color: COLORS.cyan, spin: 0.11, segments: 110 },
            { radius: 1.72, tiltX: 1.42, tiltZ: 0.74, speed: -0.3, color: COLORS.pink, spin: -0.07, segments: 110 },
            { radius: 2.12, tiltX: 1.02, tiltZ: 0.18, speed: 0.22, color: COLORS.violet, spin: 0.05, segments: 128 }
        ];
        this.ringWorldPoints = this.rings.map(() => []);
        this.pools = null;
        this.projectedVerts = null;

        this.resize = this.resize.bind(this);
        this.render = this.render.bind(this);
        this.visibilityChange = this.visibilityChange.bind(this);
        this.updateAnchor = this.updateAnchor.bind(this);

        win.addEventListener('resize', this.resize, { passive: true });
        win.addEventListener('scroll', this.updateAnchor, { passive: true });
        document.addEventListener('visibilitychange', this.visibilityChange);

        this.resize();
        this.updateAnchor();
        this.center.x = this.center.tx;
        this.center.y = this.center.ty;
        this.radius = this.targetRadius;
        this.requestFrame = win.requestAnimationFrame.bind(win);
        this.requestFrame(this.render);
    }

    resize() {
        const win = window;
        this.dpr = Math.min(win.devicePixelRatio || 1, 2);
        this.width = win.innerWidth;
        this.height = win.innerHeight;
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.detail = this.width >= 1100 ? 3 : 2;
        this.sphere = createIcosphere(this.detail);
        this.core = createOctahedron();
        this.projectedVerts = new Float32Array(this.sphere.verts.length * 3);
        this.buildScene();
        this.updateAnchor(true);
    }

    buildScene() {
        const starCount = this.width >= 1100 ? 300 : 150;
        this.stars = Array.from({ length: starCount }, () => ({
            x: (Math.random() * 2 - 1) * 10,
            y: (Math.random() * 2 - 1) * 5.4,
            z: -2 + Math.random() * 11,
            size: Math.random() * 1.5 + 0.3,
            phase: Math.random() * TAU,
            depth: Math.random()
        }));

        this.motes = Array.from({ length: 24 }, () => ({
            radius: 1.18 + Math.random() * 1.15,
            theta: Math.acos(Math.random() * 2 - 1),
            phi: Math.random() * TAU,
            speed: (Math.random() * 0.5 + 0.12) * (Math.random() > 0.5 ? 1 : -1),
            size: Math.random() * 1.6 + 0.7,
            phase: Math.random() * TAU
        }));

        this.satellites = [
            { ring: 0, offset: 0, color: COLORS.cyan, size: 3.2, trail: [] },
            { ring: 1, offset: Math.PI, color: COLORS.pink, size: 2.8, trail: [] },
            { ring: 2, offset: Math.PI * 0.6, color: COLORS.violet, size: 2.6, trail: [] },
            { ring: 0, offset: Math.PI * 1.42, color: COLORS.white, size: 2.2, trail: [] }
        ];

        // Pools de segmentos reutilizables (sin asignaciones por fotograma)
        const edgeCount = this.sphere.edges.length;
        const ringCount = this.rings.reduce((sum, ring) => sum + ring.segments, 0);
        this.pools = {
            sphere: [makePool(edgeCount), makePool(edgeCount), makePool(edgeCount)],
            core: makePool(this.core.edges.length),
            ringsFront: this.rings.map((ring) => makePool(ring.segments)),
            ringsBack: this.rings.map((ring) => makePool(ring.segments)),
            scan: makePool(edgeCount + ringCount)
        };
    }

    updateAnchor(force = false) {
        const rect = this.anchor?.getBoundingClientRect?.();
        const inView = Boolean(rect && rect.bottom > 0 && rect.top < this.height && rect.width > 0);
        if (inView) {
            this.center.tx = clamp(rect.left + rect.width / 2, 90, this.width - 90);
            this.center.ty = clamp(rect.top + rect.height / 2, 110, this.height - 80);
            this.targetRadius = clamp(Math.min(rect.width, rect.height) * 0.46, 118, 286);
        } else if (force || !this._hadAnchor) {
            this.center.tx = this.width >= 1024 ? this.width * 0.72 : this.width * 0.5;
            this.center.ty = this.width >= 1024 ? this.height * 0.46 : this.height * 0.32;
            this.targetRadius = this.width >= 1024
                ? Math.min(this.width, this.height) * 0.185
                : Math.min(this.width * 0.34, this.height * 0.2);
        }
        this._hadAnchor = inView;
    }

    setPointer(x, y) {
        this.pointer.x = x;
        this.pointer.y = y;
    }

    pulse(strength = 1) {
        this.shockwaves.push({ age: 0, life: 1.5, strength });
        if (this.shockwaves.length > 6) this.shockwaves.shift();
    }

    zoomBy(factor) {
        this.targetZoom = clamp(this.targetZoom * factor, 0.7, 1.75);
    }

    resetView() {
        this.targetZoom = 1;
        this.spinVelocity = 0;
        this.tiltVelocity = 0;
        this.pulse(0.7);
    }

    /* --------------------------------------------------------------- */
    /* Gestos: arrastrar = rotar, rueda/pellizco = zoom, clic = pulso  */
    /* --------------------------------------------------------------- */
    attachGestures(element) {
        if (!element) return;
        this.gestureElement = element;
        element.style.cursor = 'grab';
        element.style.touchAction = 'pan-y';
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';

        const onPointerDown = (event) => {
            if (event.target.closest?.('a, button, input, textarea, label, select, dialog')) return;
            this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            try { element.setPointerCapture(event.pointerId); } catch { /* noop */ }

            if (this.activePointers.size === 1) {
                this.dragging = true;
                element.classList.add('is-grabbing');
                element.style.cursor = 'grabbing';
                this.dragStart = { x: event.clientX, y: event.clientY, time: performance.now() };
                this.lastDrag = { x: event.clientX, y: event.clientY, time: performance.now() };
                this.spinVelocity = 0;
                this.tiltVelocity = 0;
            } else if (this.activePointers.size === 2) {
                const [a, b] = [...this.activePointers.values()];
                this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.targetZoom };
            }
        };

        const onPointerMove = (event) => {
            const point = this.activePointers.get(event.pointerId);
            if (!point) return;
            point.x = event.clientX;
            point.y = event.clientY;

            if (this.activePointers.size === 2 && this.pinch) {
                const [a, b] = [...this.activePointers.values()];
                const distance = Math.hypot(a.x - b.x, a.y - b.y);
                this.targetZoom = clamp(this.pinch.zoom * (distance / this.pinch.distance), 0.7, 1.75);
                event.preventDefault();
                return;
            }

            if (!this.dragging || !this.lastDrag) return;
            const dx = event.clientX - this.lastDrag.x;
            const dy = event.clientY - this.lastDrag.y;
            this.rotY += dx * 0.0078;
            this.rotX = clamp(this.rotX + dy * 0.0078, -1.05, 0.95);

            const now = performance.now();
            const dtGesture = Math.max(8, now - this.lastDrag.time) / 1000;
            this.spinVelocity = clamp(dx * 0.0078 / dtGesture, -2.6, 2.6);
            this.tiltVelocity = clamp(dy * 0.0078 / dtGesture, -1.8, 1.8);
            this.lastDrag = { x: event.clientX, y: event.clientY, time: now };

            // Conserva el scroll vertical: sólo se captura el gesto horizontal
            if (Math.abs(event.clientX - this.dragStart.x) > Math.abs(event.clientY - this.dragStart.y)) {
                event.preventDefault();
            }
        };

        const endPointer = (event) => {
            const wasSingle = this.activePointers.size === 1 && this.dragging;
            const start = this.dragStart;
            this.activePointers.delete(event.pointerId);
            try { element.releasePointerCapture(event.pointerId); } catch { /* noop */ }

            if (this.activePointers.size < 2) this.pinch = null;

            if (this.activePointers.size === 0) {
                this.dragging = false;
                element.classList.remove('is-grabbing');
                element.style.cursor = 'grab';
                if (wasSingle && start) {
                    const moved = Math.max(
                        Math.abs(event.clientX - start.x),
                        Math.abs(event.clientY - start.y)
                    );
                    if (performance.now() - start.time < 380 && moved < 11) this.pulse(1.15);
                }
                this.dragStart = null;
                this.lastDrag = null;
            }
        };

        // Ctrl+rueda (o pellizco de trackpad, que manda ctrlKey) hace zoom;
        // la rueda normal conserva el scroll de la página
        const onWheel = (event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            this.targetZoom = clamp(this.targetZoom * Math.exp(-event.deltaY * 0.0011), 0.7, 1.75);
        };

        const onDoubleClick = (event) => {
            if (event.target.closest?.('a, button, input, textarea, label, select, dialog')) return;
            this.resetView();
        };

        element.addEventListener('pointerdown', onPointerDown);
        element.addEventListener('pointermove', onPointerMove, { passive: false });
        element.addEventListener('pointerup', endPointer);
        element.addEventListener('pointercancel', endPointer);
        element.addEventListener('pointerleave', endPointer);
        element.addEventListener('wheel', onWheel, { passive: false });
        element.addEventListener('dblclick', onDoubleClick);

        this.gestureCleanup = () => {
            element.removeEventListener('pointerdown', onPointerDown);
            element.removeEventListener('pointermove', onPointerMove);
            element.removeEventListener('pointerup', endPointer);
            element.removeEventListener('pointercancel', endPointer);
            element.removeEventListener('pointerleave', endPointer);
            element.removeEventListener('wheel', onWheel);
            element.removeEventListener('dblclick', onDoubleClick);
        };
    }

    visibilityChange() {
        if (!document.hidden) {
            this.lastFrame = 0;
            this.requestFrame(this.render);
        }
    }

    /* ¿El punto queda oculto tras la esfera de radio 1? (rayo-esfera) */
    isOccluded(world) {
        const oz = -CAMERA_DISTANCE;
        let dx = world[0];
        let dy = world[1];
        let dz = world[2] - oz;
        const dist = Math.hypot(dx, dy, dz);
        if (!dist) return false;
        dx /= dist;
        dy /= dist;
        dz /= dist;
        const b = oz * dz;
        const c = CAMERA_DISTANCE * CAMERA_DISTANCE - 1;
        const disc = b * b - c;
        if (disc < 0) return false;
        const hit = -b - Math.sqrt(disc);
        return hit < dist - 0.05;
    }

    /* --------------------------------------------------------------- */
    /* Bucle de render                                                 */
    /* --------------------------------------------------------------- */
    render(timestamp) {
        if (document.hidden) return;
        const dt = this.lastFrame ? Math.min((timestamp - this.lastFrame) / 1000, 0.05) : 0.016;
        this.lastFrame = timestamp;
        this.time += dt;
        const t = this.time;
        const motion = this.reducedMotion ? 0.32 : 1;

        this.center.x = lerp(this.center.x, this.center.tx, 0.07);
        this.center.y = lerp(this.center.y, this.center.ty, 0.07);
        this.radius = lerp(this.radius, this.targetRadius, 0.07);
        this.zoom = lerp(this.zoom, this.targetZoom, 0.09);

        if (!this.dragging) {
            this.rotY += dt * 0.16 * motion;
            this.rotY += this.spinVelocity * dt;
            this.rotX = clamp(this.rotX + this.tiltVelocity * dt, -1.05, 0.95);
            const decay = Math.pow(0.06, dt); // inercia ~1.4 s
            this.spinVelocity *= decay;
            this.tiltVelocity *= decay;
            this.rotX = lerp(this.rotX, -0.16, dt * 0.6);
        }

        const parallaxX = this.pointer.x - 0.5;
        const parallaxY = this.pointer.y - 0.5;
        const tiltX = this.rotX + parallaxY * 0.16;
        const tiltY = this.rotY + parallaxX * 0.42;
        const tiltZ = Math.sin(t * 0.31) * 0.05;

        const cx = this.center.x + parallaxX * 26;
        const cy = this.center.y + parallaxY * 18;
        const R = this.radius;
        const zoom = this.zoom;

        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        this.drawAmbientGlow(ctx, cx, cy, R);
        this.drawFloorGrid(ctx, t);
        this.drawStars(ctx, t);

        const groupMatrix = rotationMatrix(tiltX, tiltY, tiltZ);
        const sweepWorld = Math.sin(t * 0.62) * 1.02;
        this.buildDrawList(groupMatrix, t, cx, cy, R, zoom, sweepWorld);
        this.drawWireframe(ctx);
        this.drawNodes(ctx, t, cx, cy, R);
        this.drawMotes(ctx, groupMatrix, t, cx, cy, R, zoom);
        this.drawSatellites(ctx, groupMatrix, t, cx, cy, R, zoom);
        this.drawSweep(cx, cy, R, zoom, sweepWorld);
        this.drawShockwaves(cx, cy, R, zoom);
        this.drawSilhouette(ctx, t, cx, cy, R, zoom);

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        this.pulseTimer -= dt;
        if (this.pulseTimer <= 0) {
            this.pulse(0.55);
            this.pulseTimer = this.reducedMotion ? 11 : 6.4;
        }
        for (const wave of this.shockwaves) wave.age += dt;
        this.shockwaves = this.shockwaves.filter((wave) => wave.age < wave.life);

        this.updateReadout();
        this.requestFrame(this.render);
    }

    /* Proyecta todos los segmentos del fotograma en los pools por capas. */
    buildDrawList(groupMatrix, t, cx, cy, R, zoom, sweepWorld) {
        const pools = this.pools;
        const counts = {
            sphere: [0, 0, 0],
            core: 0,
            ringsFront: [0, 0, 0],
            ringsBack: [0, 0, 0],
            scan: 0
        };
        const tmp = [0, 0, 0];
        const pa = [0, 0, 0, 0];
        const pb = [0, 0, 0, 0];

        const projectWorld = (world, out) => {
            const depth = CAMERA_DISTANCE + world[2];
            const scale = CAMERA_DISTANCE / depth;
            out[0] = cx + world[0] * R * zoom * scale;
            out[1] = cy + world[1] * R * zoom * scale;
            out[2] = world[2];
            out[3] = scale;
            return out;
        };

        // El barrido ilumina de forma muy fina sólo aristas de la cara frontal
        const addToScan = (seg, normY, z) => {
            if (z >= 0 || counts.scan >= pools.scan.length) return;
            const band = Math.exp(-Math.pow((normY - sweepWorld) * 10, 2));
            if (band <= 0.72) return;
            const target = pools.scan[counts.scan];
            target.x1 = seg.x1;
            target.y1 = seg.y1;
            target.x2 = seg.x2;
            target.y2 = seg.y2;
            counts.scan += 1;
        };

        // Esfera: vértices proyectados una sola vez
        const projected = this.projectedVerts;
        const verts = this.sphere.verts;
        for (let i = 0; i < verts.length; i += 1) {
            transform(groupMatrix, verts[i], tmp);
            const depth = CAMERA_DISTANCE + tmp[2];
            const scale = CAMERA_DISTANCE / depth;
            projected[i * 3] = cx + tmp[0] * R * zoom * scale;
            projected[i * 3 + 1] = cy + tmp[1] * R * zoom * scale;
            projected[i * 3 + 2] = tmp[2];
        }

        for (const edge of this.sphere.edges) {
            const a = edge[0] * 3;
            const b = edge[1] * 3;
            const z = (projected[a + 2] + projected[b + 2]) * 0.5;
            const layer = z > 0.28 ? 0 : z < -0.28 ? 2 : 1;
            const pool = pools.sphere[layer];
            const count = counts.sphere[layer];
            const seg = pool[count];
            seg.x1 = projected[a];
            seg.y1 = projected[a + 1];
            seg.x2 = projected[b];
            seg.y2 = projected[b + 1];
            seg.z = z;
            counts.sphere[layer] += 1;
            addToScan(seg, (((seg.y1 - cy) + (seg.y2 - cy)) * 0.5) / (R * zoom), z);
        }

        // Octaedro interior contrarrotando
        const coreMatrix = rotationMatrix(
            this.rotX * 0.6 + t * 0.12,
            -this.rotY * 1.6,
            t * 0.22
        );
        const coreScreen = this.core.verts.map((v) => {
            const scaled = [v[0] * 0.42, v[1] * 0.42, v[2] * 0.42];
            const rotated = transform(coreMatrix, scaled, [0, 0, 0]);
            return projectWorld(rotated, [0, 0, 0, 0]);
        });
        for (const edge of this.core.edges) {
            const seg = pools.core[counts.core];
            const a = coreScreen[edge[0]];
            const b = coreScreen[edge[1]];
            seg.x1 = a[0];
            seg.y1 = a[1];
            seg.x2 = b[0];
            seg.y2 = b[1];
            counts.core += 1;
        }

        // Anillos orbitales (puntos en espacio de grupo; se reutilizan para satélites)
        this.rings.forEach((ring, ringIndex) => {
            const tilt = rotationMatrix(ring.tiltX, 0, ring.tiltZ + t * ring.spin);
            const points = this.ringWorldPoints[ringIndex];
            const countSegments = ring.segments;
            for (let i = 0; i <= countSegments; i += 1) {
                const angle = (i / countSegments) * TAU;
                const local = [Math.cos(angle) * ring.radius, 0, Math.sin(angle) * ring.radius];
                const tilted = transform(tilt, local, tmp);
                points[i] = transform(groupMatrix, tilted, [0, 0, 0]);
            }
            for (let i = 0; i < countSegments; i += 1) {
                projectWorld(points[i], pa);
                projectWorld(points[i + 1], pb);
                const z = (pa[2] + pb[2]) * 0.5;
                const front = z < 0.05;
                const pool = front ? pools.ringsFront[ringIndex] : pools.ringsBack[ringIndex];
                const index = front ? counts.ringsFront[ringIndex] : counts.ringsBack[ringIndex];
                const seg = pool[index];
                seg.x1 = pa[0];
                seg.y1 = pa[1];
                seg.x2 = pb[0];
                seg.y2 = pb[1];
                if (front) counts.ringsFront[ringIndex] += 1;
                else counts.ringsBack[ringIndex] += 1;
                addToScan(seg, ((pa[1] + pb[1]) * 0.5 - cy) / (R * zoom), z);
            }
        });

        this.drawCounts = counts;
    }

    strokePool(ctx, pool, count, color, alpha, width) {
        if (!count) return;
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i < count; i += 1) {
            const seg = pool[i];
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        }
        ctx.stroke();
    }

    drawWireframe(ctx) {
        const pools = this.pools;
        const counts = this.drawCounts;
        ctx.globalCompositeOperation = 'lighter';

        // Esfera por capas de profundidad (la mezcla aditiva no requiere orden)
        this.strokePool(ctx, pools.sphere[0], counts.sphere[0], mixColor(COLORS.cyan, COLORS.violet, 0.8), 0.085, 0.8);
        this.strokePool(ctx, pools.sphere[1], counts.sphere[1], mixColor(COLORS.cyan, COLORS.violet, 0.45), 0.17, 1);
        this.strokePool(ctx, pools.sphere[2], counts.sphere[2], mixColor(COLORS.cyan, COLORS.violet, 0.12), 0.34, 1.35);

        // Núcleo interno
        this.strokePool(ctx, pools.core, counts.core, mixColor(COLORS.violet, COLORS.pink, 0.5), 0.3, 1.2);

        // Anillos: cara trasera tenue, cara frontal brillante
        this.rings.forEach((ring, i) => {
            this.strokePool(ctx, pools.ringsBack[i], counts.ringsBack[i], ring.color, 0.07, 0.8);
            this.strokePool(ctx, pools.ringsFront[i], counts.ringsFront[i], ring.color, i === 0 ? 0.26 : 0.22, 1.1);
        });

        // Aristas iluminadas por el barrido del escáner
        this.strokePool(ctx, pools.scan, counts.scan, COLORS.white, 0.22, 1.1);
    }

    drawNodes(ctx, t, cx, cy, R) {
        const verts = this.sphere.verts;
        const projected = this.projectedVerts;
        ctx.globalCompositeOperation = 'lighter';

        // Nodos por vértice, dos pasadas según profundidad (estilo fijo por pasada)
        for (let pass = 0; pass < 2; pass += 1) {
            ctx.fillStyle = pass === 0
                ? rgba(mixColor(COLORS.cyan, COLORS.violet, 0.75), 0.13)
                : rgba(mixColor(COLORS.cyan, COLORS.violet, 0.2), 0.4);
            for (let i = 0; i < verts.length; i += 1) {
                const z = projected[i * 3 + 2];
                if (pass === 0 && z <= 0) continue;
                if (pass === 1 && z > 0) continue;
                const depthNorm = clamp((z + 1.15) / 2.3, 0, 1);
                const size = 0.7 + (1 - depthNorm) * 1.3;
                const x = projected[i * 3];
                const y = projected[i * 3 + 1];
                ctx.fillRect(x - size / 2, y - size / 2, size, size);
            }
        }

        // Balizas pulsantes
        const beaconCount = this.detail >= 3 ? 9 : 6;
        for (let b = 0; b < beaconCount; b += 1) {
            const index = (Math.floor((verts.length / beaconCount) * b) + (b * 37) % 23) % verts.length;
            const x = projected[index * 3];
            const y = projected[index * 3 + 1];
            const z = projected[index * 3 + 2];
            const pulse = (Math.sin(t * 2.2 + b * 1.7) + 1) / 2;
            const radius = (2.2 + pulse * 3.4) * clamp(1.2 - z * 0.25, 0.6, 1.4);
            const color = b % 3 === 0 ? COLORS.white : b % 3 === 1 ? COLORS.cyan : COLORS.violet;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
            glow.addColorStop(0, rgba(color, 0.5 + pulse * 0.3));
            glow.addColorStop(0.4, rgba(color, 0.16));
            glow.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.4, 0, TAU);
            ctx.fill();
            ctx.fillStyle = rgba(COLORS.white, 0.85);
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.34, 0, TAU);
            ctx.fill();
        }

        // Núcleo de luz central
        const breathe = (Math.sin(t * 1.8) + 1) / 2;
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
        coreGlow.addColorStop(0, rgba(COLORS.white, 0.1 + breathe * 0.07));
        coreGlow.addColorStop(0.25, rgba(COLORS.cyan, 0.09 + breathe * 0.05));
        coreGlow.addColorStop(0.6, rgba(COLORS.violet, 0.05));
        coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.7, 0, TAU);
        ctx.fill();
    }

    drawMotes(ctx, groupMatrix, t, cx, cy, R, zoom) {
        const world = [0, 0, 0];
        const screen = [0, 0, 0, 0];
        ctx.globalCompositeOperation = 'lighter';
        for (const mote of this.motes) {
            const phi = mote.phi + t * mote.speed;
            const spherical = [
                mote.radius * Math.sin(mote.theta) * Math.cos(phi),
                mote.radius * Math.cos(mote.theta),
                mote.radius * Math.sin(mote.theta) * Math.sin(phi)
            ];
            transform(groupMatrix, spherical, world);
            const depth = CAMERA_DISTANCE + world[2];
            const scale = CAMERA_DISTANCE / depth;
            screen[0] = cx + world[0] * R * zoom * scale;
            screen[1] = cy + world[1] * R * zoom * scale;
            screen[3] = scale;
            const occluded = this.isOccluded(world);
            const twinkle = 0.45 + (Math.sin(t * 2.6 + mote.phase) + 1) * 0.275;
            const alpha = clamp(
                twinkle * (occluded ? 0.14 : 0.75) * clamp(1.25 - world[2] * 0.3, 0.3, 1.3),
                0, 0.8
            );
            const size = Math.max(0.5, mote.size * scale * zoom);
            ctx.fillStyle = rgba(Math.sin(mote.phase) > 0.3 ? COLORS.cyan : COLORS.violet, alpha);
            ctx.beginPath();
            ctx.arc(screen[0], screen[1], size, 0, TAU);
            ctx.fill();
        }
    }

    drawSatellites(ctx, groupMatrix, t, cx, cy, R, zoom) {
        const world = [0, 0, 0];
        ctx.globalCompositeOperation = 'lighter';

        for (const sat of this.satellites) {
            const ring = this.rings[sat.ring];
            const angle = sat.offset + t * ring.speed;
            const local = [Math.cos(angle) * ring.radius, 0, Math.sin(angle) * ring.radius];
            const tilted = transform(rotationMatrix(ring.tiltX, 0, ring.tiltZ + t * ring.spin), local, world);
            transform(groupMatrix, tilted, world);
            const depth = CAMERA_DISTANCE + world[2];
            const scale = CAMERA_DISTANCE / depth;
            const sx = cx + world[0] * R * zoom * scale;
            const sy = cy + world[1] * R * zoom * scale;
            const occluded = this.isOccluded(world);

            // Un salto grande indica un giro brusco (o wrap de proyección):
            // se reinicia la estela para no cruzar la pantalla con una línea recta
            const lastTrail = sat.trail[sat.trail.length - 1];
            if (lastTrail && Math.hypot(sx - lastTrail.x, sy - lastTrail.y) > R * zoom * 0.45) {
                sat.trail.length = 0;
            }
            sat.trail.push({ x: sx, y: sy, occluded });
            if (sat.trail.length > 22) sat.trail.shift();

            for (let i = 1; i < sat.trail.length; i += 1) {
                const p0 = sat.trail[i - 1];
                const p1 = sat.trail[i];
                const alpha = (i / sat.trail.length) * (p1.occluded ? 0.07 : 0.3);
                ctx.strokeStyle = rgba(ring.color, alpha);
                ctx.lineWidth = 0.6 + (i / sat.trail.length) * 1.4;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
            }

            const baseAlpha = occluded ? 0.28 : 1;
            const size = sat.size * scale * zoom;
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 4);
            glow.addColorStop(0, rgba(sat.color, 0.85 * baseAlpha));
            glow.addColorStop(0.3, rgba(sat.color, 0.3 * baseAlpha));
            glow.addColorStop(1, rgba(sat.color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(sx, sy, size * 4, 0, TAU);
            ctx.fill();
            ctx.fillStyle = rgba(COLORS.white, 0.9 * baseAlpha);
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, size * 0.55), 0, TAU);
            ctx.fill();
        }
    }

    drawSweep(cx, cy, R, zoom, sweepWorld) {
        const ctx = this.ctx;
        const y = cy + sweepWorld * R * zoom;
        const radius = R * zoom * 1.01;
        const extent = radius * radius - (y - cy) * (y - cy);
        if (extent <= 0) return;
        const half = Math.sqrt(extent);
        const gradient = ctx.createLinearGradient(cx - half, y, cx + half, y);
        gradient.addColorStop(0, 'rgba(128, 242, 255, 0)');
        gradient.addColorStop(0.5, 'rgba(190, 250, 255, 0.42)');
        gradient.addColorStop(1, 'rgba(128, 242, 255, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - half, y);
        ctx.lineTo(cx + half, y);
        ctx.stroke();
    }

    drawSilhouette(ctx, t, cx, cy, R, zoom) {
        const radius = R * zoom;
        ctx.globalCompositeOperation = 'lighter';
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(128, 242, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.01, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(169, 130, 255, 0.14)';
        ctx.setLineDash([3, 13]);
        ctx.lineDashOffset = -t * 22;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.12, 0, TAU);
        ctx.stroke();

        const pulse = (Math.sin(t * 1.5) + 1) / 2;
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(COLORS.cyan, 0.03 + pulse * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (1.02 + pulse * 0.2), 0, TAU);
        ctx.stroke();
    }

    drawShockwaves(cx, cy, R, zoom) {
        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'lighter';
        for (const wave of this.shockwaves) {
            const progress = wave.age / wave.life;
            const eased = 1 - Math.pow(1 - progress, 3);
            const radius = R * zoom * (0.55 + eased * 2.5);
            const alpha = (1 - progress) * 0.4 * wave.strength;

            ctx.strokeStyle = rgba(COLORS.cyan, alpha);
            ctx.lineWidth = 1.6 * wave.strength;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, TAU);
            ctx.stroke();

            ctx.strokeStyle = rgba(COLORS.violet, alpha * 0.7);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(cx, cy, radius, radius * 0.42, 0.5, 0, TAU);
            ctx.stroke();
        }
    }

    drawAmbientGlow(ctx, cx, cy, R) {
        const glowX = this.width * (0.5 + (this.pointer.x - 0.5) * 0.12);
        const glowY = this.height * (0.42 + (this.pointer.y - 0.5) * 0.1);
        const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(this.width, this.height) * 0.55);
        glow.addColorStop(0, 'rgba(38, 156, 194, 0.09)');
        glow.addColorStop(0.45, 'rgba(64, 74, 164, 0.03)');
        glow.addColorStop(1, 'rgba(4, 7, 18, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.6);
        halo.addColorStop(0, 'rgba(128, 242, 255, 0.045)');
        halo.addColorStop(0.5, 'rgba(169, 130, 255, 0.03)');
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - R * 2.8, cy - R * 2.8, R * 5.6, R * 5.6);
        ctx.globalCompositeOperation = 'source-over';
    }

    drawStars(ctx, t) {
        const parallax = rotationMatrix(0, t * 0.014 + (this.pointer.x - 0.5) * 0.16, (this.pointer.y - 0.5) * 0.08);
        const starWorld = [0, 0, 0];
        ctx.globalCompositeOperation = 'lighter';
        const cx = this.width / 2;
        const cy = this.height / 2;
        const unit = Math.min(this.width, this.height) * 0.11;
        for (const star of this.stars) {
            starWorld[0] = star.x;
            starWorld[1] = star.y;
            starWorld[2] = star.z;
            transform(parallax, starWorld, starWorld);
            const depth = CAMERA_DISTANCE + starWorld[2];
            if (depth <= 0.25) continue;
            const scale = CAMERA_DISTANCE / depth;
            const sx = cx + starWorld[0] * unit * scale;
            const sy = cy + starWorld[1] * unit * scale;
            if (sx < -12 || sx > this.width + 12 || sy < -12 || sy > this.height + 12) continue;
            const twinkle = 0.4 + (Math.sin(t * 2.1 + star.phase) + 1) * 0.3;
            const alpha = clamp(twinkle * clamp(scale * 0.4, 0.08, 0.85), 0.05, 0.8);
            const size = star.size * clamp(scale, 0.4, 1.5);
            ctx.fillStyle = star.depth > 0.78 ? rgba(COLORS.violet, alpha) : rgba(COLORS.cyan, alpha);
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, TAU);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    drawFloorGrid(ctx, t) {
        const horizon = this.height * 0.7;
        const centerX = this.width * (0.5 + (this.pointer.x - 0.5) * 0.12);
        const bottom = this.height * 1.25;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(104, 193, 225, 0.05)';
        for (let i = -14; i <= 14; i += 1) {
            const baseX = centerX + i * (this.width * 0.075);
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.moveTo(centerX + (baseX - centerX) * 0.05, horizon);
            ctx.lineTo(baseX + (this.pointer.x - 0.5) * i * 15, bottom);
            ctx.stroke();
        }
        for (let i = 0; i < 11; i += 1) {
            const progress = (i / 10 + t * 0.06) % 1;
            const y = horizon + Math.pow(progress, 2.2) * (bottom - horizon);
            ctx.globalAlpha = (1 - progress) * 0.24;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    updateReadout() {
        if (!this.readout) return;
        const now = performance.now();
        if (now - (this._lastReadout || 0) < 140) return;
        this._lastReadout = now;
        const degrees = ((this.rotY * 180 / Math.PI) % 360 + 360) % 360;
        const depthLabel = this.dragging ? 'MANUAL OVERRIDE' : 'DEPTH MAP ACTIVE';
        this.readout.innerHTML =
            `<span class="orbit-readout__dot"></span> ${depthLabel} · ROT ${String(Math.floor(degrees)).padStart(3, '0')}° · ZM ${this.zoom.toFixed(2)}`;
    }
}
