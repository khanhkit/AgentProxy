import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(repoRoot, "rust/crates/gateway/src/routes/legacy_ws.rs"), "utf8");

test("AP-ISS-0083 legacy WS declares explicit bounded upstream/downstream limits", () => {
  assert.match(source, /connect_async_with_config/);
  assert.match(source, /WS_HANDSHAKE_TIMEOUT/);
  assert.match(source, /WS_SEND_TIMEOUT/);
  assert.match(source, /WS_MAX_WRITE_BUFFER_SIZE:\s*usize\s*=\s*WS_MAX_MESSAGE_SIZE\s*\+\s*WS_WRITE_BUFFER_SIZE/);
  assert.match(source, /\.max_message_size\(Some\(WS_MAX_MESSAGE_SIZE\)\)/);
  assert.match(source, /\.max_frame_size\(Some\(WS_MAX_FRAME_SIZE\)\)/);
  assert.match(source, /\.max_write_buffer_size\(WS_MAX_WRITE_BUFFER_SIZE\)/);
  assert.match(source, /connect_upstream\(upstream_request,\s*WS_HANDSHAKE_TIMEOUT\)/);
  assert.match(source, /send_with_timeout\(upstream\.send\(message\),\s*WS_SEND_TIMEOUT\)/);
  assert.match(source, /send_with_timeout\(downstream\.send\(message\),\s*WS_SEND_TIMEOUT\)/);
});

test("AP-ISS-0083 legacy WS preserves close code and reason in both directions", () => {
  assert.match(source, /DownstreamMessage::Close\(frame\)[\s\S]*?UpstreamCloseFrame[\s\S]*?code:\s*frame\.code\.into\(\)[\s\S]*?reason:\s*frame\.reason\.to_string\(\)\.into\(\)/);
  assert.match(source, /UpstreamMessage::Close\(frame\)[\s\S]*?DownstreamCloseFrame[\s\S]*?code:\s*frame\.code\.into\(\)[\s\S]*?reason:\s*frame\.reason\.to_string\(\)\.into\(\)/);
  assert.doesNotMatch(source, /Close\(_\)\s*=>\s*Some\([^\n]*Close\(None\)/);
});
