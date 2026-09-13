import { decodeJpegFrameDataUri, estimateJpegFrameBytes } from "./videoBridgeFrameContract";
import { VIDEO_FRAME_MAX_BYTES } from "./videoBridgeRuntime";

export interface ContactSheetFrame {
  dataUri: string;
  timestampSeconds: number;
}

export interface ContactSheetOptions {
  columns?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface VideoContactSheetResult {
  dataUri?: string;
  fallbackReason?: "CONTACT_SHEET_UNAVAILABLE";
  frames: ContactSheetFrame[];
  height?: number;
  timestamps: number[];
  used: boolean;
  width?: number;
}

const MAX_FRAMES = 16;
const MAX_SHEET_BYTES = 32 * 1024 * 1024;
const LABEL_HEIGHT = 64;
const LABEL_PADDING = 16;
const TILE_SIZE = 512;
const TIMESTAMP_GLYPH_SCALE = 4;
const TIMESTAMP_GLYPH_WIDTH = 5;
const TIMESTAMP_GLYPH_GAP = 4;

const TIMESTAMP_GLYPHS: Record<string, readonly string[]> = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00100"],
  t: ["00100", "00100", "11111", "00100", "00100", "00101", "00010"],
  e: ["00000", "01110", "10001", "11111", "10000", "10001", "01110"],
  s: ["00000", "01111", "10000", "01110", "00001", "00001", "11110"],
  "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00010", "00100", "00100", "00000", "00100"],
};

function fallback(frames: readonly ContactSheetFrame[]): VideoContactSheetResult {
  return {
    fallbackReason: "CONTACT_SHEET_UNAVAILABLE",
    frames: frames.map((frame) => ({ ...frame })),
    timestamps: frames.map((frame) => frame.timestampSeconds),
    used: false,
  };
}

function formatContactSheetTimestamp(timestampSeconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(timestampSeconds * 1000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  if (minutes > 999) return `t=${timestampSeconds.toExponential(3)}s`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function buildTimestampLabel(timestampSeconds: number): Buffer {
  const label = formatContactSheetTimestamp(timestampSeconds);
  const labelTop = TILE_SIZE - LABEL_HEIGHT;
  const glyphAdvance = TIMESTAMP_GLYPH_WIDTH * TIMESTAMP_GLYPH_SCALE + TIMESTAMP_GLYPH_GAP;
  const glyphTop = labelTop + 18;
  const glyphRects: string[] = [];

  for (let index = 0; index < label.length; index++) {
    const rows = TIMESTAMP_GLYPHS[label[index]] ?? TIMESTAMP_GLYPHS["?"];
    for (let row = 0; row < rows.length; row++) {
      for (let column = 0; column < rows[row].length; column++) {
        if (rows[row][column] !== "1") continue;
        glyphRects.push(
          `<rect x="${LABEL_PADDING + index * glyphAdvance + column * TIMESTAMP_GLYPH_SCALE}" y="${glyphTop + row * TIMESTAMP_GLYPH_SCALE}" width="${TIMESTAMP_GLYPH_SCALE}" height="${TIMESTAMP_GLYPH_SCALE}" fill="#ffffff" />`
        );
      }
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}" shape-rendering="crispEdges">
      <rect x="0" y="${labelTop}" width="${TILE_SIZE}" height="${LABEL_HEIGHT}" fill="#000000" fill-opacity="0.82" />
      ${glyphRects.join("")}
    </svg>`
  );
}

/** Build an optional bounded JPEG grid; every failure except abort is fail-safe to individual frames. */
export async function buildVideoContactSheet(
  frames: readonly ContactSheetFrame[],
  options: ContactSheetOptions = {}
): Promise<VideoContactSheetResult> {
  if (options.signal?.aborted) throw new Error("Video contact sheet was aborted");
  if (frames.length < 1 || frames.length > MAX_FRAMES) return fallback(frames);
  if (
    frames.some(
      (frame) =>
        !Number.isFinite(frame.timestampSeconds) || frame.timestampSeconds < 0 || !frame.dataUri
    )
  ) {
    return fallback(frames);
  }
  const columns = Math.min(4, Math.max(1, Math.floor(options.columns ?? 2)), frames.length);
  const rows = Math.ceil(frames.length / columns);
  const controller = new AbortController();
  const timeout = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  try {
    const { default: sharp } = await import("sharp");
    if (signal.aborted) throw new Error("Video contact sheet was aborted");
    const tiles = await Promise.all(
      frames.map(async (frame) => {
        // Reject before decoding: an oversized frame must never reach sharp() just to be
        // discovered later — estimateJpegFrameBytes reads the encoded length only.
        if (estimateJpegFrameBytes(frame.dataUri) > VIDEO_FRAME_MAX_BYTES) {
          throw new Error("Contact sheet frame exceeds the maximum per-frame size");
        }
        return sharp(decodeJpegFrameDataUri(frame.dataUri))
          .resize(TILE_SIZE, TILE_SIZE, { fit: "contain", background: "#000000" })
          .composite([{ input: buildTimestampLabel(frame.timestampSeconds), left: 0, top: 0 }])
          .jpeg({ quality: 80 })
          .toBuffer();
      })
    );
    if (signal.aborted) throw new Error("Video contact sheet was aborted");
    const output = await sharp({
      create: {
        background: "#000000",
        channels: 3,
        height: rows * TILE_SIZE,
        width: columns * TILE_SIZE,
      },
    })
      .composite(
        tiles.map((input, index) => ({
          input,
          left: (index % columns) * TILE_SIZE,
          top: Math.floor(index / columns) * TILE_SIZE,
        }))
      )
      .jpeg({ quality: 80 })
      .toBuffer();
    if (signal.aborted) throw new Error("Video contact sheet was aborted");
    if (output.byteLength > MAX_SHEET_BYTES) return fallback(frames);
    return {
      dataUri: `data:image/jpeg;base64,${output.toString("base64")}`,
      frames: frames.map((frame) => ({ ...frame })),
      height: rows * TILE_SIZE,
      timestamps: frames.map((frame) => frame.timestampSeconds),
      used: true,
      width: columns * TILE_SIZE,
    };
  } catch {
    if (signal.aborted) throw new Error("Video contact sheet was aborted");
    return fallback(frames);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
