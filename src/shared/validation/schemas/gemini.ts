import { z } from "zod";
import {
  ACCOUNT_FALLBACK_STRATEGY_VALUES,
  ROUTING_STRATEGY_VALUES,
} from "@/shared/constants/routingStrategies";
import { SUPPORTED_BATCH_ENDPOINTS } from "@/shared/constants/batchEndpoints";
import { MAX_REQUEST_BODY_LIMIT_MB, MIN_REQUEST_BODY_LIMIT_MB } from "@/shared/constants/bodySize";
import { COMBO_CONFIG_MODES } from "@/shared/constants/comboConfigMode";
import { providerAllowsOptionalApiKey } from "@/shared/constants/providers";
import { HIDEABLE_SIDEBAR_ITEM_IDS } from "@/shared/constants/sidebarVisibility";
import {
  isForbiddenUpstreamHeaderName,
  isForbiddenCustomHeaderName,
} from "@/shared/constants/upstreamHeaders";
import { MAX_TIMER_TIMEOUT_MS } from "@/shared/utils/runtimeTimeouts";
import {
  MAX_EMBEDDING_INLINE_ITEM_BASE64_LENGTH,
  MAX_EMBEDDING_INLINE_ITEM_BYTES,
  MAX_EMBEDDING_INLINE_TOTAL_BYTES,
  decodedBase64Bytes,
} from "./apiV1.ts";

function inlineDataPayloads(part: unknown): string[] {
  if (!part || typeof part !== "object" || Array.isArray(part)) return [];
  const record = part as Record<string, unknown>;
  const payloads: string[] = [];
  for (const key of ["inlineData", "inline_data"]) {
    const inline = record[key];
    if (!inline || typeof inline !== "object" || Array.isArray(inline)) continue;
    const data = (inline as { data?: unknown }).data;
    if (typeof data === "string") payloads.push(data);
  }
  return payloads;
}

function decodedInlineBytesFromPart(part: unknown): number {
  return inlineDataPayloads(part).reduce((total, data) => total + decodedBase64Bytes(data), 0);
}

export const geminiPartSchema = z
  .object({
    text: z.string().optional(),
  })
  .catchall(z.unknown())
  .superRefine((part, ctx) => {
    for (const data of inlineDataPayloads(part)) {
      if (
        data.length > MAX_EMBEDDING_INLINE_ITEM_BASE64_LENGTH ||
        decodedBase64Bytes(data) > MAX_EMBEDDING_INLINE_ITEM_BYTES
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "decoded inline media must not exceed 8 MiB",
        });
      }
    }
  });

export const geminiContentSchema = z
  .object({
    role: z.string().optional(),
    parts: z.array(geminiPartSchema).optional(),
  })
  .catchall(z.unknown());

const geminiSystemInstructionSchema = z
  .object({
    parts: z.array(geminiPartSchema).optional(),
  })
  .catchall(z.unknown());

export const v1betaGeminiGenerateSchema = z
  .object({
    contents: z.array(geminiContentSchema).optional(),
    systemInstruction: geminiSystemInstructionSchema.optional(),
    system_instruction: geminiSystemInstructionSchema.optional(),
    generationConfig: z
      .object({
        stream: z.boolean().optional(),
        maxOutputTokens: z.coerce.number().int().min(1).optional(),
        temperature: z.coerce.number().optional(),
        topP: z.coerce.number().optional(),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown())
  .superRefine((value, ctx) => {
    if (!value.contents && !value.systemInstruction && !value.system_instruction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "contents or systemInstruction is required",
        path: [],
      });
    }

    const allParts = [
      ...(value.contents ?? []).flatMap((content) => content.parts ?? []),
      ...(value.systemInstruction?.parts ?? []),
      ...(value.system_instruction?.parts ?? []),
    ];
    const totalInlineBytes = allParts.reduce(
      (total, part) => total + decodedInlineBytesFromPart(part),
      0
    );
    if (totalInlineBytes > MAX_EMBEDDING_INLINE_TOTAL_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "decoded inline media must not exceed 16 MiB per request",
        path: [],
      });
    }
  });
