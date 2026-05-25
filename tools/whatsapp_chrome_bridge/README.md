## GOVbot WhatsApp Chrome Bridge

Load this folder as an unpacked Chrome extension to let GOVbot drive your
existing `web.whatsapp.com` tab without relaunching Chrome.

### Install

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `tools/whatsapp_chrome_bridge`

### Backend

Run the GOVbot backend locally on port `8000`. The extension connects to:

- `ws://127.0.0.1:8000/whatsapp-bridge/ws`

### Supported commands

- `ping`
- `get_state`
- `send_text`
- `read_last_messages`
- `open_attach`
- `upload_file`
