import test from "node:test";
import assert from "node:assert/strict";

import { CredentialMaskerGuardrail } from "../../src/lib/guardrails/credentialMasker.ts";

async function withCredentialRedactionEnabled(fn: () => Promise<void>) {
  const original = process.env.CREDENTIAL_REDACTION_ENABLED;
  process.env.CREDENTIAL_REDACTION_ENABLED = "true";
  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.CREDENTIAL_REDACTION_ENABLED;
    else process.env.CREDENTIAL_REDACTION_ENABLED = original;
  }
}

const KEY_SHAPED = "AIza" + "B7qX".repeat(8);
const IMAGE_URL = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUg${KEY_SHAPED}AAAAAElFTkSuQmCC`;

test("base64 image data URLs pass through the credential masker unchanged", async () => {
  await withCredentialRedactionEnabled(async () => {
    const guardrail = new CredentialMaskerGuardrail();
    const payload = {
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: IMAGE_URL } }],
        },
      ],
    };

    const result = await guardrail.preCall(payload, {} as never);
    const next = (result?.modifiedPayload ?? payload) as typeof payload;
    assert.equal(next.messages[0].content[0].image_url.url, IMAGE_URL);
  });
});

test("the same key-shaped text outside a data URL is still redacted", async () => {
  await withCredentialRedactionEnabled(async () => {
    const guardrail = new CredentialMaskerGuardrail();
    const result = await guardrail.preCall(
      { messages: [{ role: "user", content: `key=${KEY_SHAPED}` }] },
      {} as never
    );
    const next = result?.modifiedPayload as { messages: Array<{ content: string }> };
    assert.ok(next);
    assert.match(next.messages[0].content, /\[REDACTED:google\]/);
  });
});
