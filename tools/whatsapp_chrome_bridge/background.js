import { createBridgeRuntime } from "./background_bridge.mjs";

const BRIDGE_BASE = "http://127.0.0.1:8000/whatsapp-bridge";

function withTimeout(promise, label, timeoutMs = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    })
  ]);
}

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: ["https://web.whatsapp.com/*"] });
  if (!tabs.length) {
    throw new Error("no_whatsapp_tab");
  }
  return tabs.find((tab) => tab.active) || tabs[0];
}

async function withDebugger(tabId, fn) {
  const target = { tabId };
  await withTimeout(chrome.debugger.attach(target, "1.3"), "debugger_attach");
  try {
    return await fn(target);
  } finally {
    try {
      await withTimeout(chrome.debugger.detach(target), "debugger_detach");
    } catch (error) {
      console.warn("GOVbot debugger detach failed", error);
    }
  }
}

async function setFileInputFiles(filePath) {
  const tab = await withTimeout(getWhatsAppTab(), "get_whatsapp_tab");
  return withDebugger(tab.id, async (target) => {
    await withTimeout(chrome.debugger.sendCommand(target, "DOM.enable"), "dom_enable");
    const documentNode = await withTimeout(
      chrome.debugger.sendCommand(target, "DOM.getDocument"),
      "dom_get_document"
    );
    const query = await withTimeout(
      chrome.debugger.sendCommand(target, "DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: 'input[type="file"]'
      }),
      "dom_query_input"
    );
    if (!query.nodeId) {
      throw new Error("file_input_not_found");
    }
    await withTimeout(
      chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
        nodeId: query.nodeId,
        files: [filePath]
      }),
      "dom_set_file_input",
      8000
    );
    return { ok: true };
  });
}

const bridgeRuntime = createBridgeRuntime({
  bridgeBase: BRIDGE_BASE,
  chromeApi: chrome,
  WebSocketCtor: WebSocket,
  setTimeoutFn: setTimeout,
  clearTimeoutFn: clearTimeout,
  logger: console
});

function ensureBridgeConnection() {
  try {
    bridgeRuntime.ensureConnection();
  } catch (error) {
    console.warn("GOVbot websocket connect failed", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("GOVbot WhatsApp bridge installed");
  ensureBridgeConnection();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ensureBridgeConnection();
  });
}

if (chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab?.url || "";
    if (url.startsWith("https://web.whatsapp.com/")) {
      ensureBridgeConnection();
    }
  });
}

ensureBridgeConnection();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "govbot_bridge_boot") {
    ensureBridgeConnection();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "govbot_set_file_input") {
    withTimeout(setFileInputFiles(message.filePath), "set_file_input", 12000)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : String(error)
        });
      });
    return true;
  }

  return false;
});
