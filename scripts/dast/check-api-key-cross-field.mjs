const baseUrl = process.env.OMNIROUTE_URL || "http://localhost:20128";
const authCookie = process.env.DAST_AUTH_COOKIE;
const probeConnectionId = "e3e70682-c209-1cac-a29f-6fbed82c07cd";

if (!authCookie) {
  throw new Error("DAST_AUTH_COOKIE is required for API-key cross-field smoke");
}

async function request(path, method, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Cookie: authCookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }
  return { response, text, json };
}

async function expectStatus(label, path, method, body, expected) {
  const result = await request(path, method, body);
  if (result.response.status !== expected) {
    throw new Error(
      `${label}: expected HTTP ${expected}, got ${result.response.status}: ${result.text.slice(0, 500)}`
    );
  }
  return result;
}

await expectStatus(
  "create rejects allowedModels when modelAccessMode=all",
  "/api/keys",
  "POST",
  { name: "dast-invalid-model-access", modelAccessMode: "all", allowedModels: ["gpt-4o"] },
  400
);

const created = await expectStatus(
  "create valid probe key",
  "/api/keys",
  "POST",
  { name: `dast-cross-field-probe-${Date.now()}` },
  201
);
const keyId = created.json?.id;
if (typeof keyId !== "string" || keyId.length === 0) {
  throw new Error(
    `create valid probe key: response did not contain id: ${created.text.slice(0, 500)}`
  );
}

try {
  const patchPath = `/api/keys/${encodeURIComponent(keyId)}`;
  const cases = [
    [
      "patch rejects allowedModels when modelAccessMode=all",
      { modelAccessMode: "all", allowedModels: ["gpt-4o"] },
    ],
    [
      "patch rejects allowedConnections when connectionAccessMode=all",
      { connectionAccessMode: "all", allowedConnections: [probeConnectionId] },
    ],
    [
      "patch requires allowedConnections when connectionAccessMode=restricted",
      { connectionAccessMode: "restricted" },
    ],
    [
      "patch rejects empty allowedConnections when connectionAccessMode=restricted",
      { connectionAccessMode: "restricted", allowedConnections: [] },
    ],
  ];

  for (const [label, body] of cases) {
    await expectStatus(label, patchPath, "PATCH", body, 400);
  }
} finally {
  const cleanup = await request(`/api/keys/${encodeURIComponent(keyId)}`, "DELETE");
  if (![200, 204, 404].includes(cleanup.response.status)) {
    throw new Error(
      `cleanup probe key: expected HTTP 200/204/404, got ${cleanup.response.status}: ${cleanup.text.slice(0, 500)}`
    );
  }
}

console.log(
  "[dast-api-key-cross-field] PASS — runtime rejects all semantic-invalid API-key mutations"
);
