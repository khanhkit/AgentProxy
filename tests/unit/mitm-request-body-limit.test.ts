import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.MAX_BODY_SIZE_BYTES = "32";

const { startHttpProxyServer } = await import("../../src/mitm/inspector/httpProxyServer.ts");

async function withUpstream(): Promise<{
  port: number;
  hits: () => number;
  close: () => Promise<void>;
}> {
  let hitCount = 0;
  const server = http.createServer((_req, res) => {
    hitCount += 1;
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("upstream");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    port,
    hits: () => hitCount,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function postThroughProxy(
  proxyPort: number,
  upstreamPort: number,
  body: Buffer,
  declaredLength?: number
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      host: `127.0.0.1:${upstreamPort}`,
      "content-type": "application/octet-stream",
    };
    if (declaredLength !== undefined) headers["content-length"] = String(declaredLength);

    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "POST",
        path: `http://127.0.0.1:${upstreamPort}/upload`,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.once("error", reject);
    if (declaredLength === undefined) {
      const split = Math.max(1, Math.floor(body.length / 2));
      req.write(body.subarray(0, split));
      req.end(body.subarray(split));
    } else {
      req.end(body);
    }
  });
}

test("inspector HTTP proxy rejects oversized declared bodies before forwarding", async () => {
  const upstream = await withUpstream();
  const proxy = await startHttpProxyServer(0);
  try {
    const response = await postThroughProxy(proxy.port, upstream.port, Buffer.alloc(33, 0x61), 33);
    assert.equal(response.status, 413);
    assert.match(response.body, /PAYLOAD_TOO_LARGE/);
    assert.equal(upstream.hits(), 0);
  } finally {
    await proxy.stop();
    await upstream.close();
  }
});

test("inspector HTTP proxy rejects chunked bodies once streamed bytes exceed the limit", async () => {
  const upstream = await withUpstream();
  const proxy = await startHttpProxyServer(0);
  try {
    const response = await postThroughProxy(proxy.port, upstream.port, Buffer.alloc(33, 0x61));
    assert.equal(response.status, 413);
    assert.match(response.body, /PAYLOAD_TOO_LARGE/);
    assert.equal(upstream.hits(), 0);
  } finally {
    await proxy.stop();
    await upstream.close();
  }
});

test("inspector HTTP proxy preserves under-limit request forwarding", async () => {
  const upstream = await withUpstream();
  const proxy = await startHttpProxyServer(0);
  try {
    const response = await postThroughProxy(proxy.port, upstream.port, Buffer.alloc(32, 0x61));
    assert.equal(response.status, 200);
    assert.equal(response.body, "upstream");
    assert.equal(upstream.hits(), 1);
  } finally {
    await proxy.stop();
    await upstream.close();
  }
});

test("standalone MITM server wires the bounded body collector and returns 413 on overflow", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const source = fs.readFileSync(serverPath, "utf8");

  assert.match(source, /boundedBody\.cjs/);
  assert.match(source, /collectBodyRaw\(req,\s*REQUEST_BODY_LIMIT_BYTES\)/);
  assert.match(source, /PAYLOAD_TOO_LARGE/);
  assert.match(source, /writeHead\(413/);
});
