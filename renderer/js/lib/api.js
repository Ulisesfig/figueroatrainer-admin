// Acceso a la API desde la interfaz. Todo pasa por el proceso principal (window.ft.api),
// que agrega el token y maneja los reintentos.

export class ApiError extends Error {
  constructor(info) {
    super(info?.message || 'Error inesperado');
    this.name = 'ApiError';
    this.status = info?.status;
    this.code = info?.code;
    this.field = info?.field;
    this.transient = Boolean(info?.transient);
  }
}

async function call(method, path, { query, body, timeoutMs } = {}) {
  const result = await window.ft.api({ method, path, query, body, timeoutMs });
  if (!result?.ok) throw new ApiError(result?.error);
  return result.data;
}

export const api = {
  get: (path, query, options) => call('GET', path, { query, ...options }),
  post: (path, body, options) => call('POST', path, { body, ...options }),
  patch: (path, body, options) => call('PATCH', path, { body, ...options }),
  put: (path, body, options) => call('PUT', path, { body, ...options }),
  del: (path, options) => call('DELETE', path, options),
};

// Mensaje entendible para mostrarle a una persona.
export function errorMessage(error) {
  if (error instanceof ApiError || error?.message) return error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo.';
}
