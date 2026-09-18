const MAX_WAV_HEADER_BYTES = 64 * 1024;

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * Read a trustworthy duration from a PCM WAV upload without decoding the media.
 *
 * Only bounded RIFF/WAVE header bytes are inspected. The function validates the
 * PCM fmt fields and the declared data chunk against the actual Blob size before
 * using `dataSize / byteRate`. Unsupported containers/codecs and malformed WAVs
 * deliberately return null so billing can fail open to an explicit zero-cost
 * fallback rather than guessing from file size.
 */
export async function resolveUploadedAudioDurationSeconds(
  file: unknown
): Promise<number | null> {
  if (!(file instanceof Blob) || file.size < 44) return null;

  const prefixSize = Math.min(file.size, MAX_WAV_HEADER_BYTES);
  const bytes = new Uint8Array(await file.slice(0, prefixSize).arrayBuffer());
  if (bytes.length < 12 || readFourCc(bytes, 0) !== "RIFF" || readFourCc(bytes, 8) !== "WAVE") {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredRiffBytes = view.getUint32(4, true) + 8;
  if (declaredRiffBytes < 12 || declaredRiffBytes > file.size) return null;

  let byteRate: number | null = null;
  let dataSize: number | null = null;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = readFourCc(bytes, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadOffset = offset + 8;
    const chunkEnd = payloadOffset + chunkSize;
    if (chunkEnd > file.size) return null;

    if (chunkId === "fmt ") {
      if (chunkSize < 16 || payloadOffset + 16 > bytes.length) return null;
      const audioFormat = view.getUint16(payloadOffset, true);
      const channels = view.getUint16(payloadOffset + 2, true);
      const sampleRate = view.getUint32(payloadOffset + 4, true);
      const parsedByteRate = view.getUint32(payloadOffset + 8, true);
      const blockAlign = view.getUint16(payloadOffset + 12, true);
      const bitsPerSample = view.getUint16(payloadOffset + 14, true);

      if (
        audioFormat !== 1 ||
        channels <= 0 ||
        sampleRate <= 0 ||
        parsedByteRate <= 0 ||
        blockAlign <= 0 ||
        bitsPerSample <= 0 ||
        bitsPerSample % 8 !== 0
      ) {
        return null;
      }

      const expectedBlockAlign = channels * (bitsPerSample / 8);
      if (blockAlign !== expectedBlockAlign || parsedByteRate !== sampleRate * blockAlign) {
        return null;
      }
      byteRate = parsedByteRate;
    } else if (chunkId === "data") {
      dataSize = chunkSize;
    }

    if (byteRate !== null && dataSize !== null) {
      const seconds = dataSize / byteRate;
      return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    }

    const paddedChunkEnd = chunkEnd + (chunkSize % 2);
    if (paddedChunkEnd <= offset) return null;
    offset = paddedChunkEnd;
  }

  return null;
}
