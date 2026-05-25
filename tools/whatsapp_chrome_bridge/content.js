function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findComposer() {
  return document.querySelector('[contenteditable="true"][role="textbox"]');
}

function findChatHeader() {
  return document.querySelector('header [title]')?.getAttribute("title")
    || document.querySelector("header span[dir='auto']")?.textContent?.trim()
    || null;
}

function getLastMessages(limit = 6) {
  return [...document.querySelectorAll('[data-testid="msg-container"]')]
    .slice(-limit)
    .map((node) => node.innerText);
}

function inspectFileInputs() {
  return [...document.querySelectorAll('input[type="file"]')].map((node, index) => ({
    index,
    accept: node.getAttribute("accept") || "",
    multiple: Boolean(node.multiple),
    capture: node.getAttribute("capture") || "",
    hidden: Boolean(node.hidden),
    disabled: Boolean(node.disabled),
    visible: node.offsetParent !== null || node.getClientRects().length > 0,
    testId: node.getAttribute("data-testid") || "",
    ariaLabel: node.getAttribute("aria-label") || ""
  }));
}

function findSendButton() {
  const candidates = [
    ...document.querySelectorAll('[data-testid="send"], button, [role="button"]')
  ].filter((node) => {
    const label = (node.getAttribute("aria-label") || "").toLowerCase();
    const testId = (node.getAttribute("data-testid") || "").toLowerCase();
    const visible = node.offsetParent !== null || node.getClientRects().length > 0;
    return visible && (
      label.includes("send")
      || testId.includes("send")
    );
  });
  return candidates.at(-1) || null;
}

function findAttachButton() {
  return [...document.querySelectorAll("button,[role='button']")].find((node) =>
    (node.getAttribute("aria-label") || "").toLowerCase() === "attach"
  ) || null;
}

function clearComposer(composer) {
  composer.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
}

async function sendText(text) {
  const composer = findComposer();
  if (!composer) {
    return { ok: false, error: "composer_not_found" };
  }
  clearComposer(composer);
  document.execCommand("insertText", false, text);
  composer.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(100);
  const sendButton = findSendButton();
  if (!sendButton) {
    return { ok: false, error: "send_button_not_found" };
  }
  sendButton.click();
  return {
    ok: true,
    sentText: text
  };
}

async function openAttach() {
  const button = findAttachButton();
  if (!button) {
    return { ok: false, error: "attach_button_not_found" };
  }
  button.click();
  await sleep(150);
  const input = document.querySelector('input[type="file"]');
  if (!input) {
    return { ok: false, error: "file_input_not_found" };
  }
  return { ok: true };
}

async function uploadFile(payload) {
  const attachState = await openAttach();
  if (attachState.ok === false) {
    return attachState;
  }
  const setFileResult = await Promise.race([
    chrome.runtime.sendMessage({
      type: "govbot_set_file_input",
      filePath: payload.file_path
    }),
    new Promise((resolve) => {
      window.setTimeout(() => resolve({ ok: false, error: "debugger_timeout" }), 10000);
    })
  ]);
  if (!setFileResult || setFileResult.ok === false) {
    return {
      ok: false,
      error: setFileResult?.error || "file_input_not_found"
    };
  }
  const input = document.querySelector('input[type="file"]');
  if (input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await sleep(1800);
  const sendButton = findSendButton();
  if (!sendButton) {
    return { ok: false, error: "send_button_not_found" };
  }
  sendButton.click();
  return {
    ok: true,
    uploadedFile: payload.file_name
  };
}

async function getState(limit) {
  return {
    ok: true,
    title: document.title,
    header: findChatHeader(),
    composerReady: Boolean(findComposer()),
    lastMessages: getLastMessages(limit)
  };
}

async function executeCommand(command, payload) {
  switch (command) {
    case "ping":
      return { ok: true, title: document.title, header: findChatHeader() };
    case "get_state":
      return getState(6);
    case "read_last_messages":
      return getState(payload?.limit || 6);
    case "inspect_file_inputs":
      return { ok: true, fileInputs: inspectFileInputs() };
    case "send_text":
      return sendText(payload?.text || "");
    case "open_attach":
      return openAttach();
    case "upload_file":
      return uploadFile(payload || {});
    default:
      return { ok: false, error: "unknown_command" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "govbot_bridge_execute") {
    return false;
  }

  const command = message.command || {};
  executeCommand(command.command, command.payload || {})
    .then((result) => {
      if (!result || result.ok === false) {
        sendResponse({
          ok: false,
          error: result?.error || "command_failed"
        });
        return;
      }
      sendResponse({
        ok: true,
        payload: result
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    });
  return true;
});

chrome.runtime.sendMessage({ type: "govbot_bridge_boot" }, () => {
  void chrome.runtime.lastError;
});
