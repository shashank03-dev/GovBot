import test from 'node:test';
import assert from 'node:assert/strict';

import { createBridgeRuntime, toWebSocketUrl } from '../../tools/whatsapp_chrome_bridge/background_bridge.mjs';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    this.closed = false;
    this.listeners = {
      open: [],
      message: [],
      close: [],
      error: [],
    };
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', {});
  }

  emit(type, event) {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

test('toWebSocketUrl maps the bridge base to the websocket endpoint', () => {
  assert.equal(
    toWebSocketUrl('http://127.0.0.1:8000/whatsapp-bridge'),
    'ws://127.0.0.1:8000/whatsapp-bridge/ws',
  );
  assert.equal(
    toWebSocketUrl('https://govbot.example/whatsapp-bridge/'),
    'wss://govbot.example/whatsapp-bridge/ws',
  );
});

test('background bridge routes backend commands through the active WhatsApp tab and responds on the websocket', async () => {
  const sockets = [];
  const tabMessages = [];
  const chromeApi = {
    runtime: {
      lastError: null,
    },
    tabs: {
      async query() {
        return [{ id: 17, active: true, url: 'https://web.whatsapp.com/' }];
      },
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });
        callback({
          ok: true,
          payload: {
            ok: true,
            title: 'WhatsApp',
          },
        });
      },
    },
  };

  const runtime = createBridgeRuntime({
    bridgeBase: 'http://127.0.0.1:8000/whatsapp-bridge',
    chromeApi,
    WebSocketCtor: class extends FakeWebSocket {
      constructor(url) {
        super(url);
        sockets.push(this);
      }
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    logger: { warn() {}, error() {}, log() {} },
  });

  runtime.ensureConnection();

  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'ws://127.0.0.1:8000/whatsapp-bridge/ws');

  sockets[0].emit('message', {
    data: JSON.stringify({
      type: 'command',
      id: 'command-1',
      command: 'ping',
      payload: {},
    }),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(tabMessages, [
    {
      tabId: 17,
      message: {
        type: 'govbot_bridge_execute',
        command: {
          type: 'command',
          id: 'command-1',
          command: 'ping',
          payload: {},
        },
      },
    },
  ]);
  assert.deepEqual(
    sockets[0].sent.map((payload) => JSON.parse(payload)),
    [
      {
        type: 'response',
        id: 'command-1',
        ok: true,
        payload: {
          ok: true,
          title: 'WhatsApp',
        },
        error: null,
      },
    ],
  );
});
