const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 10 * 1024 * 1024;

function parseRequestBodyLimitBytes(value) {
  if (!value) return DEFAULT_REQUEST_BODY_LIMIT_BYTES;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_BODY_LIMIT_BYTES;
}

const REQUEST_BODY_LIMIT_BYTES = parseRequestBodyLimitBytes(process.env.MAX_BODY_SIZE_BYTES);

class PayloadTooLargeError extends Error {
  constructor(limit) {
    super(`Request body exceeds ${limit} bytes`);
    this.name = "PayloadTooLargeError";
    this.code = "PAYLOAD_TOO_LARGE";
    this.statusCode = 413;
    this.limit = limit;
  }
}

function isPayloadTooLargeError(error) {
  return Boolean(error && error.code === "PAYLOAD_TOO_LARGE");
}

function parseDeclaredLength(req) {
  const raw = req && req.headers ? req.headers["content-length"] : undefined;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function collectBodyRaw(req, limit = REQUEST_BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const declaredLength = parseDeclaredLength(req);
    if (declaredLength !== null && declaredLength > limit) {
      if (typeof req.resume === "function") req.resume();
      reject(new PayloadTooLargeError(limit));
      return;
    }

    const chunks = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    };

    const finishReject = (error, drain = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (drain && typeof req.resume === "function") req.resume();
      reject(error);
    };

    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buffer.length > limit - total) {
        finishReject(new PayloadTooLargeError(limit), true);
        return;
      }
      total += buffer.length;
      chunks.push(buffer);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, total));
    };

    const onError = (error) => finishReject(error);

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

module.exports = {
  DEFAULT_REQUEST_BODY_LIMIT_BYTES,
  REQUEST_BODY_LIMIT_BYTES,
  PayloadTooLargeError,
  collectBodyRaw,
  isPayloadTooLargeError,
  parseRequestBodyLimitBytes,
};
