import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

import { validateProviderApiKey } from "../../src/lib/providers/validation.ts";

let server: Server;
let baseUrl = "";
let modelsRequests = 0;
let chatRequests = 0;
let lastChatAuthorization: string | null = null;

const VALID_KEY = "zk-valid-test-key";

before(async () => {
  server = createServer((req, res) => {
    const requestPath = (req.url || "").split("?")[0];
    const auth = req.headers.authorization;

    if (requestPath === "/v1/models") {
      modelsRequests += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: ["gpt-oss"], image: [], submodels: [] }));
      return;
    }

    if (requestPath === "/v1/chat/completions") {
      chatRequests += 1;
      lastChatAuthorization = typeof auth === "string" ? auth : null;
      if (auth !== `Bearer ${VALID_KEY}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Key not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not Found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no assigned port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("Zylo validation rejects a bad key without trusting the open catalog", async () => {
  modelsRequests = 0;
  chatRequests = 0;
  const result = await validateProviderApiKey({
    provider: "zylo-api",
    apiKey: "zk-invalid-test-key",
    providerSpecificData: { baseUrl },
  });

  assert.equal(modelsRequests, 0);
  assert.equal(result.valid, false);
  assert.ok(chatRequests > 0);
  assert.equal(lastChatAuthorization, "Bearer zk-invalid-test-key");
});

test("Zylo validation accepts a key authenticated by the chat route", async () => {
  const result = await validateProviderApiKey({
    provider: "zylo-api",
    apiKey: VALID_KEY,
    providerSpecificData: { baseUrl },
  });
  assert.equal(result.valid, true);
});

test("the zylo alias uses the same authenticated validation probe", async () => {
  const result = await validateProviderApiKey({
    provider: "zylo",
    apiKey: "zk-invalid-test-key",
    providerSpecificData: { baseUrl },
  });
  assert.equal(result.valid, false);
});
