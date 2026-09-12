const API_ROOT = 'https://generativelanguage.googleapis.com/v1';
const API_KEY_STORAGE = 'lumiina.gemini.api-key';
const MODEL_PREFERENCE = [
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-exp-image-generation'
];

export class GeminiApiError extends Error {
    constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
        super(message);
        this.name = 'GeminiApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function getStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function withoutModelPrefix(name = '') {
    return name.replace(/^models\//, '');
}

function getErrorMessage(payload, fallback) {
    return payload?.error?.message || payload?.message || fallback;
}

/**
 * Small browser-side adapter for the Gemini REST API.
 *
 * Lumiina is a static site, so the user key is intentionally supplied at
 * runtime instead of being shipped in source code. It is kept in localStorage
 * only, and sent in the x-goog-api-key header for each request.
 */
export class GeminiImageClient {
    constructor() {
        this.apiKey = getStorage()?.getItem(API_KEY_STORAGE) || '';
        this.models = null;
        this.modelCheckedAt = 0;
    }

    get hasKey() {
        return Boolean(this.apiKey);
    }

    getStoredKey() {
        return this.apiKey;
    }

    setApiKey(value) {
        this.apiKey = value.trim();
        this.models = null;
        this.modelCheckedAt = 0;

        const storage = getStorage();
        if (!storage) return;

        try {
            if (this.apiKey) {
                storage.setItem(API_KEY_STORAGE, this.apiKey);
            } else {
                storage.removeItem(API_KEY_STORAGE);
            }
        } catch {
            // Private browsing modes can deny storage. The in-memory key still works.
        }
    }

    clearApiKey() {
        this.setApiKey('');
    }

    async request(path, { method = 'GET', body, timeout = 30000 } = {}) {
        if (!this.apiKey) {
            throw new GeminiApiError('Falta la Gemini API key.', { code: 'MISSING_KEY' });
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeout);
        const headers = {
            Accept: 'application/json',
            'x-goog-api-key': this.apiKey
        };

        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(`${API_ROOT}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal
            });

            const contentType = response.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await response.json().catch(() => ({}))
                : { message: await response.text() };

            if (!response.ok) {
                const apiError = payload?.error || {};
                throw new GeminiApiError(
                    getErrorMessage(payload, `Gemini devolvió un error HTTP ${response.status}.`),
                    {
                        status: response.status,
                        code: apiError.status || apiError.code || `HTTP_${response.status}`,
                        details: payload
                    }
                );
            }

            return payload;
        } catch (error) {
            if (error instanceof GeminiApiError) throw error;
            if (error?.name === 'AbortError') {
                throw new GeminiApiError('La conexión con Gemini ha tardado demasiado. Inténtalo de nuevo.', {
                    code: 'TIMEOUT'
                });
            }
            throw new GeminiApiError('No se pudo conectar con la API de Gemini. Comprueba tu conexión.', {
                code: 'NETWORK',
                details: error
            });
        } finally {
            window.clearTimeout(timer);
        }
    }

    async listModels({ refresh = false } = {}) {
        const cacheIsFresh = this.models && Date.now() - this.modelCheckedAt < 5 * 60 * 1000;
        if (!refresh && cacheIsFresh) return this.models;

        const payload = await this.request('/models');
        this.models = Array.isArray(payload.models) ? payload.models : [];
        this.modelCheckedAt = Date.now();
        return this.models;
    }

    getImageModels(models) {
        const usable = models.filter((model) => {
            const methods = model.supportedGenerationMethods || [];
            return methods.includes('generateContent');
        });

        const byName = new Map(usable.map((model) => [withoutModelPrefix(model.name), model]));
        const preferred = MODEL_PREFERENCE
            .map((name) => byName.get(name))
            .filter(Boolean);

        const discovered = usable
            .filter((model) => /image|nano.?banana/i.test(withoutModelPrefix(model.name || model.displayName)))
            .sort((a, b) => withoutModelPrefix(a.name).localeCompare(withoutModelPrefix(b.name)));

        return [...new Map([...preferred, ...discovered].map((model) => [model.name, model])).values()];
    }

    async verify() {
        const models = await this.listModels({ refresh: true });
        const imageModels = this.getImageModels(models);
        if (!imageModels.length) {
            throw new GeminiApiError('La key es válida, pero no hay un modelo de imágenes habilitado para este proyecto.', {
                code: 'NO_IMAGE_MODEL'
            });
        }

        return {
            model: withoutModelPrefix(imageModels[0].name),
            imageModels: imageModels.map((model) => withoutModelPrefix(model.name))
        };
    }

    async generateImage({ prompt, aspectRatio = '1:1', reference = null }) {
        if (!prompt?.trim()) {
            throw new GeminiApiError('Escribe un prompt antes de iniciar el render.', { code: 'EMPTY_PROMPT' });
        }

        const models = await this.listModels();
        const imageModels = this.getImageModels(models);
        if (!imageModels.length) {
            throw new GeminiApiError('No encontramos un modelo de generación de imágenes habilitado para esta key.', {
                code: 'NO_IMAGE_MODEL'
            });
        }

        const parts = [{ text: prompt.trim() }];
        if (reference?.data && reference?.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: reference.mimeType,
                    data: reference.data
                }
            });
        }

        let lastError = null;
        for (const model of imageModels.slice(0, 3)) {
            const modelName = withoutModelPrefix(model.name);
            const imageSize = /lite/i.test(modelName) ? '1K' : '2K';
            const requestBodies = [this.buildImageRequest(parts, aspectRatio, false, imageSize)];
            // Older Nano Banana releases accepted imageConfig instead of the current
            // responseFormat.image shape. Keep the compatibility retry narrow so a
            // normal prompt/key error is not hidden behind repeated requests.
            if (/2\.5|2\.0/i.test(modelName)) {
                requestBodies.push(this.buildImageRequest(parts, aspectRatio, true, imageSize));
            }

            for (const body of requestBodies) {
                try {
                    const payload = await this.request(`/models/${encodeURIComponent(modelName)}:generateContent`, {
                        method: 'POST',
                        body,
                        timeout: 120000
                    });
                    return this.extractImage(payload, modelName);
                } catch (error) {
                    lastError = error;
                    if (![400, 404].includes(error.status) && error.code !== 'NOT_FOUND') throw error;
                    if (error.status === 404 || error.code === 'NOT_FOUND') break;
                }
            }
        }

        throw lastError || new GeminiApiError('Gemini no ha podido generar la imagen.', { code: 'GENERATE_FAILED' });
    }

    buildImageRequest(parts, aspectRatio, legacy = false, imageSize = '2K') {
        const generationConfig = {
            responseModalities: ['TEXT', 'IMAGE']
        };

        if (legacy) {
            generationConfig.imageConfig = { aspectRatio };
        } else {
            generationConfig.responseFormat = {
                image: {
                    aspectRatio,
                    imageSize
                }
            };
        }

        return {
            contents: [{ role: 'user', parts }],
            generationConfig
        };
    }

    extractImage(payload, model) {
        const candidates = payload?.candidates || [];
        const parts = candidates.flatMap((candidate) => candidate?.content?.parts || []);
        const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
        const imageData = imagePart?.inlineData || imagePart?.inline_data;

        if (!imageData?.data) {
            const finishReason = candidates[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                throw new GeminiApiError('Gemini bloqueó este prompt por sus filtros de seguridad. Prueba otra descripción.', {
                    code: 'SAFETY'
                });
            }

            const text = parts.find((part) => part.text)?.text;
            throw new GeminiApiError(
                text || 'Gemini respondió, pero no devolvió una imagen. Comprueba que tu proyecto tenga acceso a un modelo de imágenes.',
                { code: 'NO_IMAGE_RESPONSE', details: payload }
            );
        }

        return {
            data: imageData.data.replace(/\s/g, ''),
            mimeType: imageData.mimeType || 'image/png',
            model,
            text: parts.filter((part) => part.text).map((part) => part.text).join('\n').trim(),
            raw: payload
        };
    }
}

export function getFriendlyApiError(error) {
    if (!(error instanceof GeminiApiError)) return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';

    if (error.code === 'MISSING_KEY') return 'Conecta una Gemini API key para activar el render.';
    if (error.code === 'NO_IMAGE_MODEL') return 'La key responde, pero este proyecto no tiene un modelo de imágenes habilitado.';
    if (error.code === 'EMPTY_PROMPT') return 'Escribe una idea para iniciar la secuencia.';
    if (error.code === 'SAFETY') return error.message;
    if (error.code === 'TIMEOUT') return error.message;
    if (error.code === 'NETWORK') return error.message;
    if (error.status === 400) return 'Gemini rechazó la configuración del render. Prueba con otro prompt o formato.';
    if (error.status === 401 || error.status === 403) return 'La API key no es válida o no tiene acceso a Gemini. Genera una nueva key en Google AI Studio.';
    if (error.status === 429) return 'Se alcanzó el límite de Gemini. Espera un momento y vuelve a intentarlo.';
    if (error.status === 404) return 'El modelo de imágenes no está disponible para esta key o región.';

    return error.message || 'Gemini no ha podido completar el render.';
}
