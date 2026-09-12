import { GeminiImageClient, getFriendlyApiError } from './gemini.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const client = new GeminiImageClient();
const state = {
    style: 'holographic editorial',
    ratio: '1:1',
    reference: null,
    currentImage: null,
    busy: false,
    history: []
};

const elements = {
    root: document.documentElement,
    canvas: $('#ambient-canvas'),
    cursorHalo: $('#cursor-halo'),
    cursorDot: $('#cursor-dot'),
    prompt: $('#prompt'),
    promptCount: $('#prompt-count'),
    form: $('#generator-form'),
    generateButton: $('#generate-btn'),
    enhanceButton: $('#enhance-prompt-btn'),
    faceFocus: $('#face-focus'),
    referenceDrop: $('#reference-drop'),
    referenceInput: $('#reference-input'),
    referenceEmpty: $('#reference-empty'),
    referencePreview: $('#reference-preview'),
    referenceImage: $('#reference-image'),
    referenceName: $('#reference-name'),
    referenceSize: $('#reference-size'),
    removeReference: $('#remove-reference-btn'),
    previewStage: $('#preview-stage'),
    emptyPreview: $('#empty-preview'),
    loadingPreview: $('#loading-preview'),
    loadingCopy: $('#loading-copy'),
    errorPreview: $('#error-preview'),
    errorTitle: $('#error-title'),
    errorCopy: $('#error-copy'),
    resultImage: $('#result-image'),
    resultBadge: $('#result-badge'),
    renderStatus: $('#render-status'),
    renderFrame: $('#render-frame'),
    copyPrompt: $('#copy-prompt-btn'),
    download: $('#download-btn'),
    galleryGrid: $('#gallery-grid'),
    galleryCount: $('#gallery-count'),
    apiSettings: $('#api-settings-btn'),
    apiStatusDot: $('#api-status-dot'),
    apiStatusLabel: $('#api-status-label'),
    apiDialog: $('#api-dialog'),
    closeDialog: $('#close-dialog-btn'),
    apiForm: $('#api-form'),
    apiKey: $('#api-key'),
    toggleKey: $('#toggle-key-btn'),
    clearKey: $('#clear-key-btn'),
    apiHelper: $('#api-helper'),
    dialogStatus: $('#dialog-status'),
    errorSettings: $('#error-settings-btn'),
    toastRegion: $('#toast-region')
};

class AmbientField {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.pointer = { x: 0.5, y: 0.46 };
        this.stars = [];
        this.resize = this.resize.bind(this);
        this.render = this.render.bind(this);

        window.addEventListener('resize', this.resize, { passive: true });
        this.resize();
        requestAnimationFrame(this.render);
    }

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.stars = Array.from({ length: Math.max(85, Math.floor(this.width / 11)) }, () => ({
            x: Math.random(),
            y: Math.random(),
            depth: Math.random(),
            size: Math.random() * 1.4 + 0.25,
            phase: Math.random() * Math.PI * 2
        }));
    }

    setPointer(x, y) {
        this.pointer.x = x;
        this.pointer.y = y;
    }

    render(time) {
        const ctx = this.context;
        const { width, height, dpr, pointer } = this;
        const t = time * 0.00035;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const glowX = width * (0.5 + (pointer.x - 0.5) * 0.12);
        const glowY = height * (0.43 + (pointer.y - 0.5) * 0.1);
        const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.54);
        glow.addColorStop(0, 'rgba(38, 156, 194, 0.10)');
        glow.addColorStop(0.42, 'rgba(64, 74, 164, 0.035)');
        glow.addColorStop(1, 'rgba(4, 7, 18, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        this.drawStars(ctx, t);
        this.drawDepthGrid(ctx, t);
        this.drawOrbitalField(ctx, t);

        requestAnimationFrame(this.render);
    }

    drawStars(ctx, time) {
        for (const star of this.stars) {
            const drift = (star.depth * 15 + 3) * time;
            const x = ((star.x * this.width + (this.pointer.x - 0.5) * star.depth * 42 + drift) % (this.width + 20)) - 10;
            const y = ((star.y * this.height + (this.pointer.y - 0.5) * star.depth * 28) % (this.height + 20)) - 10;
            const pulse = 0.45 + Math.sin(time * 2.5 + star.phase) * 0.25;
            ctx.globalAlpha = Math.max(0.08, pulse * (0.35 + star.depth * 0.65));
            ctx.fillStyle = star.depth > 0.76 ? '#b9a8ff' : '#8befff';
            ctx.beginPath();
            ctx.arc(x, y, star.size * (0.6 + star.depth), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawDepthGrid(ctx, time) {
        const horizon = this.height * 0.67;
        const centerX = this.width * (0.5 + (this.pointer.x - 0.5) * 0.13);
        const bottom = this.height * 1.25;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(104, 193, 225, 0.052)';
        for (let i = -14; i <= 14; i += 1) {
            const baseX = centerX + i * (this.width * 0.075);
            ctx.beginPath();
            ctx.moveTo(centerX + (baseX - centerX) * 0.05, horizon);
            ctx.lineTo(baseX + (this.pointer.x - 0.5) * i * 15, bottom);
            ctx.stroke();
        }
        for (let i = 0; i < 11; i += 1) {
            const progress = ((i / 10 + time * 0.08) % 1);
            const y = horizon + Math.pow(progress, 2.2) * (bottom - horizon);
            ctx.globalAlpha = (1 - progress) * 0.26;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawOrbitalField(ctx, time) {
        const cx = this.width * 0.77 + (this.pointer.x - 0.5) * 26;
        const cy = this.height * 0.56 + (this.pointer.y - 0.5) * 20;
        const radius = Math.min(this.width, this.height) * 0.22;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.18 + Math.sin(time * 0.7) * 0.03);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(128, 242, 255, 0.11)';
        ctx.setLineDash([2, 11]);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.48, radius * 0.37, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(169, 130, 255, 0.085)';
        ctx.setLineDash([1, 17]);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.16, radius * 0.59, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulse = (Math.sin(time * 1.7) + 1) / 2;
        const pulseRadius = radius * (0.72 + pulse * 0.35);
        ctx.strokeStyle = `rgba(128, 242, 255, ${0.04 + pulse * 0.11})`;
        ctx.beginPath();
        ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

function setupCursorEffects(ambient) {
    const pointer = { targetX: window.innerWidth / 2, targetY: window.innerHeight / 2, x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const tiltCards = $$('.tilt-card');
    elements.cursorHalo.style.left = '0px';
    elements.cursorHalo.style.top = '0px';
    elements.cursorDot.style.left = '0px';
    elements.cursorDot.style.top = '0px';

    window.addEventListener('pointermove', (event) => {
        pointer.targetX = event.clientX;
        pointer.targetY = event.clientY;
        const normalizedX = event.clientX / Math.max(window.innerWidth, 1);
        const normalizedY = event.clientY / Math.max(window.innerHeight, 1);
        elements.root.style.setProperty('--pointer-x', `${normalizedX * 100}%`);
        elements.root.style.setProperty('--pointer-y', `${normalizedY * 100}%`);
        ambient.setPointer(normalizedX, normalizedY);

        for (const card of tiltCards) {
            const rect = card.getBoundingClientRect();
            const inside = event.clientX >= rect.left - 35 && event.clientX <= rect.right + 35 && event.clientY >= rect.top - 35 && event.clientY <= rect.bottom + 35;
            if (!inside) continue;
            const strength = Number(card.dataset.tiltStrength || 1);
            const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
            const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
            card.style.setProperty('--tilt-x', (x * strength).toFixed(3));
            card.style.setProperty('--tilt-y', (y * strength).toFixed(3));
            card.style.setProperty('--card-x', `${Math.max(0, Math.min(100, (x + 1) * 50))}%`);
            card.style.setProperty('--card-y', `${Math.max(0, Math.min(100, (y + 1) * 50))}%`);
        }
    }, { passive: true });

    for (const card of tiltCards) {
        card.addEventListener('pointerleave', () => {
            card.style.setProperty('--tilt-x', '0');
            card.style.setProperty('--tilt-y', '0');
        });
    }

    const animate = () => {
        pointer.x += (pointer.targetX - pointer.x) * 0.13;
        pointer.y += (pointer.targetY - pointer.y) * 0.13;
        elements.cursorHalo.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
        elements.cursorDot.style.transform = `translate3d(${pointer.targetX}px, ${pointer.targetY}px, 0)`;
        requestAnimationFrame(animate);
    };
    animate();
}

function setApiStatus(status, label) {
    elements.apiStatusDot.className = `status-dot status--${status}`;
    elements.apiStatusLabel.textContent = label;
}

function setDialogStatus(status, message) {
    elements.dialogStatus.className = `dialog-status ${status ? `is-${status}` : ''}`;
    const dot = $('.status-dot', elements.dialogStatus);
    dot.className = `status-dot ${status ? `status--${status === 'success' ? 'online' : status}` : ''}`;
    $('span:last-child', elements.dialogStatus).textContent = message;
}

function setApiHelper(status, message) {
    elements.apiHelper.className = `api-helper ${status ? `is-${status}` : ''}`;
    elements.apiHelper.textContent = message;
}

function openApiDialog(message = '') {
    elements.apiKey.value = client.getStoredKey();
    if (message) {
        setDialogStatus('error', message);
        setApiHelper('error', message);
    } else {
        setDialogStatus('', client.hasKey ? 'Conexión guardada. Vuelve a validarla cuando quieras.' : 'Esperando una conexión segura.');
        setApiHelper('', 'La key se valida contra la API antes de guardar la conexión.');
    }

    if (typeof elements.apiDialog.showModal === 'function') {
        if (!elements.apiDialog.open) elements.apiDialog.showModal();
    } else {
        elements.apiDialog.setAttribute('open', '');
    }
    window.setTimeout(() => elements.apiKey.focus(), 80);
}

function closeApiDialog() {
    if (typeof elements.apiDialog.close === 'function' && elements.apiDialog.open) {
        elements.apiDialog.close();
    } else {
        elements.apiDialog.removeAttribute('open');
    }
}

function updatePromptCount() {
    elements.promptCount.textContent = `${elements.prompt.value.length} / 800`;
}

function setChoice(buttons, selected) {
    buttons.forEach((button) => {
        const isSelected = button === selected;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-checked', String(isSelected));
    });
}

function composePrompt() {
    const rawPrompt = elements.prompt.value.trim();
    const focusDirective = elements.faceFocus.checked
        ? 'Prioritize a tack-sharp, well-lit face with crisp eyes, natural skin texture, clean hair strands and accurate facial proportions. The face is the focal point and must remain in precise focus.'
        : 'Keep the main subject clearly defined and naturally detailed.';
    const antiBlurDirective = 'Do not blur, smear, soften, obscure, censor, haze or distort the face. Avoid defocus on facial features, waxy skin and low-detail eyes.';
    return `${rawPrompt}. Visual direction: ${state.style}. ${focusDirective} ${antiBlurDirective} Preserve clean edges, coherent lighting and high-fidelity detail throughout the image.`;
}

function setPreviewState(nextState) {
    elements.previewStage.dataset.state = nextState;
    elements.emptyPreview.hidden = nextState !== 'empty';
    elements.loadingPreview.hidden = nextState !== 'loading';
    elements.errorPreview.hidden = nextState !== 'error';
    elements.resultImage.hidden = nextState !== 'result';
    elements.resultBadge.hidden = nextState !== 'result';
}

function setRenderStatus(kind, label) {
    elements.renderStatus.className = `meta-value ${kind ? `is-${kind}` : ''}`;
    elements.renderStatus.innerHTML = `<i class="meta-dot"></i> ${label}`;
}

function setLoading(isLoading) {
    state.busy = isLoading;
    elements.generateButton.classList.toggle('is-loading', isLoading);
    elements.generateButton.setAttribute('aria-busy', String(isLoading));
    elements.generateButton.querySelector('.generate-btn__label').textContent = isLoading ? 'RENDERING...' : 'GENERATE IMAGE';
}

function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type ? `is-${type}` : ''}`;
    toast.textContent = message;
    elements.toastRegion.append(toast);
    window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        window.setTimeout(() => toast.remove(), 300);
    }, 4200);
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsReference(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const separator = dataUrl.indexOf(',');
            if (separator === -1) {
                reject(new Error('No se pudo leer la imagen.'));
                return;
            }
            resolve({
                data: dataUrl.slice(separator + 1),
                dataUrl,
                mimeType: file.type,
                name: file.name,
                size: file.size
            });
        };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(file);
    });
}

async function setReference(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        showToast('Usa una imagen PNG, JPG o WEBP.', 'error');
        return;
    }
    if (file.size > 8 * 1024 * 1024) {
        showToast('La referencia supera el límite de 8 MB.', 'error');
        return;
    }

    try {
        state.reference = await readFileAsReference(file);
        elements.referenceImage.src = state.reference.dataUrl;
        elements.referenceName.textContent = state.reference.name;
        elements.referenceSize.textContent = formatSize(state.reference.size);
        elements.referenceEmpty.hidden = true;
        elements.referencePreview.hidden = false;
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function removeReference() {
    state.reference = null;
    elements.referenceInput.value = '';
    elements.referenceImage.removeAttribute('src');
    elements.referenceEmpty.hidden = false;
    elements.referencePreview.hidden = true;
}

function addToGallery(image, prompt) {
    state.history.unshift({ image, prompt, ratio: state.ratio, time: new Date() });
    state.history = state.history.slice(0, 8);
    elements.galleryGrid.innerHTML = '';

    state.history.forEach((entry, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'gallery-card';
        card.title = 'Abrir este render';
        card.innerHTML = `<img src="${entry.image.dataUrl}" alt="Render de Lumiina ${index + 1}"><span class="gallery-card__label"><span>0${index + 1} / ${entry.ratio}</span><span>↗ OPEN</span></span>`;
        card.addEventListener('click', () => showResult(entry.image, entry.prompt));
        elements.galleryGrid.append(card);
    });

    elements.galleryCount.textContent = `${state.history.length} / SESSION`;
}

function showResult(image, prompt = elements.prompt.value.trim()) {
    state.currentImage = image;
    elements.resultImage.src = image.dataUrl;
    elements.resultImage.alt = `Imagen generada: ${prompt.slice(0, 90)}`;
    elements.copyPrompt.disabled = false;
    elements.download.disabled = false;
    elements.renderFrame.textContent = `${state.ratio} · GEMINI IMAGE`;
    setPreviewState('result');
    setRenderStatus('success', 'READY');
}

function showError(error) {
    const message = getFriendlyApiError(error);
    elements.errorTitle.textContent = error?.code === 'NO_IMAGE_MODEL' ? 'Image core no disponible.' : 'No se pudo completar el render.';
    elements.errorCopy.textContent = message;
    setPreviewState('error');
    setRenderStatus('error', 'ERROR');
    if (error?.code === 'MISSING_KEY' || error?.status === 401 || error?.status === 403) {
        elements.errorSettings.hidden = false;
    }
}

async function handleGenerate(event) {
    event.preventDefault();
    if (state.busy) return;

    const prompt = elements.prompt.value.trim();
    if (!prompt) {
        elements.prompt.focus();
        showToast('Escribe una idea para iniciar la secuencia.', 'error');
        return;
    }
    if (!client.hasKey) {
        openApiDialog('Conecta una Gemini API key antes de iniciar el render.');
        return;
    }

    setLoading(true);
    setPreviewState('loading');
    setRenderStatus('rendering', 'SYNTHESIZING');
    elements.copyPrompt.disabled = true;
    elements.download.disabled = true;

    const loadingMessages = [
        'Calibrando el detalle facial...',
        'Construyendo el campo de luz...',
        'Afilando ojos, piel y textura...',
        'Proyectando la dimensión final...'
    ];
    let loadingIndex = 0;
    elements.loadingCopy.textContent = loadingMessages[0];
    const loadingInterval = window.setInterval(() => {
        loadingIndex = (loadingIndex + 1) % loadingMessages.length;
        elements.loadingCopy.textContent = loadingMessages[loadingIndex];
    }, 3800);

    try {
        const result = await client.generateImage({
            prompt: composePrompt(),
            aspectRatio: state.ratio,
            reference: state.reference
        });
        const image = {
            data: result.data,
            mimeType: result.mimeType,
            dataUrl: `data:${result.mimeType};base64,${result.data}`,
            model: result.model
        };
        showResult(image, prompt);
        addToGallery(image, prompt);
        setApiStatus('online', 'API ONLINE');
        showToast(`Render completado con ${result.model}.`, 'success');
    } catch (error) {
        showError(error);
        if (error?.status === 401 || error?.status === 403 || error?.code === 'NO_IMAGE_MODEL') {
            setApiStatus('error', 'API CHECK');
        }
        showToast(getFriendlyApiError(error), 'error');
    } finally {
        window.clearInterval(loadingInterval);
        setLoading(false);
    }
}

async function verifyConnection({ closeOnSuccess = false } = {}) {
    const key = elements.apiKey.value.trim();
    if (!key) {
        client.clearApiKey();
        setApiStatus('offline', 'API OFFLINE');
        setDialogStatus('error', 'Introduce una API key para continuar.');
        setApiHelper('error', 'La key está vacía.');
        return false;
    }

    client.setApiKey(key);
    setApiStatus('checking', 'CHECKING...');
    setDialogStatus('checking', 'Comprobando acceso a Gemini...');
    setApiHelper('', 'Consultando modelos disponibles para tu proyecto...');

    const submitButton = $('button[type="submit"]', elements.apiForm);
    submitButton.disabled = true;
    try {
        const result = await client.verify();
        setApiStatus('online', 'API ONLINE');
        setDialogStatus('success', `Conexión validada · ${result.model}`);
        setApiHelper('success', `Image core disponible: ${result.model}`);
        showToast('Gemini está conectado y listo para generar.', 'success');
        if (closeOnSuccess) window.setTimeout(closeApiDialog, 650);
        return true;
    } catch (error) {
        setApiStatus('error', 'API ERROR');
        setDialogStatus('error', getFriendlyApiError(error));
        setApiHelper('error', getFriendlyApiError(error));
        return false;
    } finally {
        submitButton.disabled = false;
    }
}

function setupInteractions() {
    elements.prompt.addEventListener('input', updatePromptCount);
    updatePromptCount();

    $$('.style-chip').forEach((button) => {
        button.addEventListener('click', () => {
            state.style = button.dataset.style;
            setChoice($$('.style-chip'), button);
        });
    });

    $$('.segment').forEach((button) => {
        button.addEventListener('click', () => {
            state.ratio = button.dataset.ratio;
            elements.renderFrame.textContent = `${state.ratio} · 2K TARGET`;
            setChoice($$('.segment'), button);
        });
    });

    elements.enhanceButton.addEventListener('click', () => {
        const prompt = elements.prompt.value.trim();
        if (!prompt) {
            elements.prompt.focus();
            return;
        }
        const enhancement = ' composición editorial equilibrada, iluminación volumétrica, profundidad cinematográfica, textura realista, lente de 50 mm';
        if (!prompt.toLowerCase().includes('iluminación volumétrica')) {
            elements.prompt.value = `${prompt}${enhancement}`.slice(0, 800);
            updatePromptCount();
            showToast('Dirección visual mejorada.', 'success');
        } else {
            showToast('El prompt ya tiene una capa de enhancement.');
        }
    });

    elements.referenceEmpty.addEventListener('click', () => elements.referenceInput.click());
    elements.referenceDrop.addEventListener('dragover', (event) => {
        event.preventDefault();
        elements.referenceDrop.classList.add('is-dragging');
    });
    elements.referenceDrop.addEventListener('dragleave', () => elements.referenceDrop.classList.remove('is-dragging'));
    elements.referenceDrop.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.referenceDrop.classList.remove('is-dragging');
        setReference(event.dataTransfer.files?.[0]);
    });
    elements.referenceInput.addEventListener('change', () => setReference(elements.referenceInput.files?.[0]));
    elements.removeReference.addEventListener('click', removeReference);
    elements.form.addEventListener('submit', handleGenerate);

    elements.apiSettings.addEventListener('click', () => openApiDialog());
    elements.errorSettings.addEventListener('click', () => openApiDialog());
    elements.closeDialog.addEventListener('click', closeApiDialog);
    elements.apiDialog.addEventListener('click', (event) => {
        if (event.target === elements.apiDialog) closeApiDialog();
    });
    elements.apiForm.addEventListener('submit', (event) => {
        event.preventDefault();
        verifyConnection({ closeOnSuccess: true });
    });
    elements.clearKey.addEventListener('click', () => {
        client.clearApiKey();
        elements.apiKey.value = '';
        setApiStatus('offline', 'API OFFLINE');
        setDialogStatus('', 'Esperando una conexión segura.');
        setApiHelper('', 'La key se valida contra la API antes de guardar la conexión.');
        showToast('Conexión eliminada de este dispositivo.');
    });
    elements.toggleKey.addEventListener('click', () => {
        const showing = elements.apiKey.type === 'text';
        elements.apiKey.type = showing ? 'password' : 'text';
        elements.toggleKey.textContent = showing ? 'SHOW' : 'HIDE';
        elements.toggleKey.setAttribute('aria-label', showing ? 'Mostrar API key' : 'Ocultar API key');
    });

    elements.download.addEventListener('click', () => {
        if (!state.currentImage) return;
        const link = document.createElement('a');
        link.href = state.currentImage.dataUrl;
        link.download = `lumiina-${Date.now()}.${state.currentImage.mimeType.split('/')[1] || 'png'}`;
        document.body.append(link);
        link.click();
        link.remove();
        showToast('Imagen descargada.', 'success');
    });

    elements.copyPrompt.addEventListener('click', async () => {
        const text = elements.prompt.value.trim();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Prompt copiado al portapapeles.', 'success');
        } catch {
            showToast('No se pudo acceder al portapapeles.', 'error');
        }
    });

    $$('.main-nav a').forEach((link) => {
        link.addEventListener('click', () => {
            $$('.main-nav a').forEach((item) => item.classList.remove('is-active'));
            link.classList.add('is-active');
        });
    });
}

async function checkStoredConnection() {
    if (!client.hasKey) return;
    setApiStatus('checking', 'CHECKING...');
    try {
        await client.verify();
        setApiStatus('online', 'API ONLINE');
    } catch {
        setApiStatus('error', 'API CHECK');
    }
}

function init() {
    const ambient = new AmbientField(elements.canvas);
    setupCursorEffects(ambient);
    setupInteractions();
    checkStoredConnection();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
elements.canvas);
    setupCursorEffects(ambient);
    setupInteractions();
    checkStoredConnection();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
