const DEFAULT_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;

export function toWebSocketUrl(bridgeBase) {
  const normalizedBase = bridgeBase.endsWith("/")
    ? bridgeBase.slice(0, -1)
    : bridgeBase;
  const url = new URL(`${normalizedBase}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function buildErrorMessage(error, fallback) {
  if (!error) {
    return fallback;
  }
  if (typeof error.message === "string" && error.message) {
    return error.message;
  }
  return String(error);
}

export function createBridgeRuntime({
  bridgeBase,
  chromeApi,
  WebSocketCtor,
  setTimeoutFn,
  clearTimeoutFn,
  logger,
}) {
  const websocketUrl = toWebSocketUrl(bridgeBase);
  const openState = typeof WebSocketCtor.OPEN === "number" ? WebSocketCtor.OPEN : 1;
  const connectingState = typeof WebSocketCtor.CONNECTING === "number" ? WebSocketCtor.CONNECTING : 0;
  let reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  let reconnectTimer = null;
  let socket = null;
  let disposed = false;

  function isSocketActive(candidate) {
    return candidate
      && (candidate.readyState === openState || candidate.readyState === connectingState);
  }

  function clearReconnectTimer() {
    if (reconnectTimer === null) {
      return;
    }
    clearTimeoutFn(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer !== null) {
      return;
    }
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  async function getWhatsAppTab() {
    const tabs = await chromeApi.tabs.query({ url: ["https://web.whatsapp.com/*"] });
    if (!tabs.length) {
      throw new Error("no_whatsapp_tab");
    }
    return tabs.find((tab) => tab.active) || tabs[0];
  }

  function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chromeApi.tabs.sendMessage(tabId, message, (response) => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message || "message_delivery_failed"));
          return;
        }
        resolve(response);
      });
    });
  }

  async function dispatchCommand(commandEnvelope) {
    try {
      const tab = await getWhatsAppTab();
      const result = await sendMessageToTab(tab.id, {
        type: "govbot_bridge_execute",
        command: commandEnvelope,
      });
      if (!result || result.ok === false) {
        return {
          type: "response",
          id: commandEnvelope.id,
          ok: false,
          payload: null,
          error: result?.error || "command_failed",
        };
      }
      return {
        type: "response",
        id: commandEnvelope.id,
        ok: true,
        payload: result.payload,
        error: null,
      };
    } catch (error) {
      return {
        type: "response",
        id: commandEnvelope.id,
        ok: false,
        payload: null,
        error: buildErrorMessage(error, "command_failed"),
      };
    }
  }

  async function handleSocketMessage(rawMessage, sourceSocket = socket) {
    let message = rawMessage;
    if (typeof rawMessage === "string") {
      try {
        message = JSON.parse(rawMessage);
      } catch (error) {
        logger.warn("GOVbot websocket payload parse failed", error);
        return null;
      }
    }
    if (!message || message.type !== "command") {
      return null;
    }
    const responseEnvelope = await dispatchCommand(message);
    if (sourceSocket === socket && sourceSocket && sourceSocket.readyState === openState) {
      sourceSocket.send(JSON.stringify(responseEnvelope));
    }
    return responseEnvelope;
  }

  function connect() {
    if (disposed) {
      return null;
    }
    if (isSocketActive(socket)) {
      return socket;
    }

    clearReconnectTimer();
    const nextSocket = new WebSocketCtor(websocketUrl);
    socket = nextSocket;

    nextSocket.addEventListener("open", () => {
      reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    });

    nextSocket.addEventListener("message", (event) => {
      handleSocketMessage(event.data, nextSocket).catch((error) => {
        logger.error("GOVbot websocket command handling failed", error);
      });
    });

    nextSocket.addEventListener("close", () => {
      if (socket === nextSocket) {
        socket = null;
      }
      scheduleReconnect();
    });

    nextSocket.addEventListener("error", (event) => {
      logger.warn("GOVbot websocket error", event);
    });

    return nextSocket;
  }

  function ensureConnection() {
    return connect();
  }

  function dispose() {
    disposed = true;
    clearReconnectTimer();
    if (isSocketActive(socket)) {
      socket.close();
    }
    socket = null;
  }

  return {
    connect,
    ensureConnection,
    dispatchCommand,
    dispose,
    handleSocketMessage,
  };
}
