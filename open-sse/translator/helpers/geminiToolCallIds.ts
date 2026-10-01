/**
 * Pair Gemini functionResponse parts with the functionCall they answer.
 *
 * Gemini ids are optional. Generated ids must therefore be remembered so an
 * id-less response can reference the actual OpenAI tool_call id instead of the
 * function name. Pairing is scoped to one call round so reused names/ids in
 * later turns cannot consume an earlier unmatched call.
 */
export function createGeminiToolCallIdPairing(newId: () => string) {
  const openCalls = new Map<string, Array<{ id: string; generated: boolean }>>();
  let roundEnded = false;

  return {
    beginContent(content: { role?: unknown; parts?: unknown }): void {
      const madeCalls =
        Array.isArray(content?.parts) &&
        content.parts.some((part) => Boolean((part as { functionCall?: unknown })?.functionCall));
      if (madeCalls && roundEnded) openCalls.clear();
      if (madeCalls) roundEnded = false;
      else if (content?.role !== "model") roundEnded = true;
    },

    callId(call: { id?: unknown; name?: unknown }): string {
      const generated = !(typeof call.id === "string" && call.id);
      const id = generated ? newId() : (call.id as string);
      const name = typeof call.name === "string" ? call.name : "";
      const open = openCalls.get(name) ?? [];
      open.push({ id, generated });
      openCalls.set(name, open);
      return id;
    },

    responseId(response: { id?: unknown; name?: unknown }): string {
      const name = typeof response.name === "string" ? response.name : "";
      const open = openCalls.get(name) ?? [];
      if (typeof response.id === "string" && response.id) {
        const index = open.findIndex((call) => call.id === response.id);
        if (index !== -1) open.splice(index, 1);
        return response.id;
      }

      const index = open.findIndex((call) => call.generated);
      if (index === -1) return open.shift()?.id ?? name;
      return open.splice(index, 1)[0].id;
    },
  };
}
