import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import { sendLiveWsMessage } from "../../src/server/ws/liveServer.ts";

function fakeSocket(
  bufferedAmount: number,
  options: { accumulateSentBytes?: boolean } = {}
): {
  ws: WebSocket;
  sent: string[];
  getBufferedAmount: () => number;
  wasTerminated: () => boolean;
} {
  const sent: string[] = [];
  let currentBufferedAmount = bufferedAmount;
  let terminated = false;
  const ws = {
    readyState: WebSocket.OPEN,
    get bufferedAmount() {
      return currentBufferedAmount;
    },
    send(payload: string) {
      sent.push(payload);
      if (options.accumulateSentBytes) {
        currentBufferedAmount += Buffer.byteLength(payload, "utf8");
      }
    },
    terminate() {
      terminated = true;
    },
  } as unknown as WebSocket;

  return {
    ws,
    sent,
    getBufferedAmount: () => currentBufferedAmount,
    wasTerminated: () => terminated,
  };
}

test("live WS sends normally while the outbound buffer is below the limit", () => {
  const socket = fakeSocket(0);

  assert.equal(sendLiveWsMessage(socket.ws, { type: "pong" }), true);
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.wasTerminated(), false);
});

test("live WS sheds a slow client before adding more data to an oversized outbound buffer", () => {
  const socket = fakeSocket(Number.MAX_SAFE_INTEGER);

  assert.equal(sendLiveWsMessage(socket.ws, { type: "pong" }), false);
  assert.equal(socket.sent.length, 0);
  assert.equal(socket.wasTerminated(), true);
});

test("live WS slow-reader stress remains bounded instead of growing the outbound queue indefinitely", () => {
  const socket = fakeSocket(0, { accumulateSentBytes: true });
  const message = { type: "event", data: "x".repeat(4096) };

  let accepted = 0;
  for (let i = 0; i < 10_000; i++) {
    if (!sendLiveWsMessage(socket.ws, message)) break;
    accepted++;
  }

  assert.ok(accepted > 0);
  assert.ok(accepted < 1_000, `expected bounded sends, got ${accepted}`);
  assert.ok(socket.getBufferedAmount() < 1_100_000);
  assert.equal(socket.wasTerminated(), true);
});
