import asyncio
import base64
from collections import deque
import mimetypes
import os
import time
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

router = APIRouter(prefix="/whatsapp-bridge")

REPO_ROOT = Path(__file__).resolve().parents[1]
ALLOWED_UPLOAD_DIRECTORIES = [
    REPO_ROOT,
    Path.home() / "Downloads",
]
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


class BridgeDisconnected(RuntimeError):
    pass


class BridgeCommandRequest(BaseModel):
    command: Literal[
        "ping",
        "get_state",
        "send_text",
        "read_last_messages",
        "inspect_file_inputs",
        "open_attach",
        "upload_file",
    ]
    text: Optional[str] = None
    limit: int = Field(default=6, ge=1, le=20)
    path: Optional[str] = None
    timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)


class BridgeResponseRequest(BaseModel):
    id: str
    ok: bool = True
    payload: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class WhatsAppBridgeManager:
    def __init__(self) -> None:
        self._connection: Optional[WebSocket] = None
        self._pending: dict[str, asyncio.Future] = {}
        self._queued_commands: deque[dict[str, Any]] = deque()
        self._active_client_id: Optional[str] = None
        self._last_poll_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def connected(self) -> bool:
        return self._connection is not None or (time.monotonic() - self._last_poll_at) < 10

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    async def register(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            existing = self._connection
            self._connection = websocket
        if existing is not None and existing is not websocket:
            await existing.close(code=1012)
        try:
            while True:
                message = await websocket.receive_json()
                await self._handle_message(message)
        except WebSocketDisconnect:
            pass
        finally:
            async with self._lock:
                if self._connection is websocket:
                    self._connection = None
            self._fail_pending("extension_disconnected")

    async def dispatch_command(self, command: dict[str, Any]) -> Any:
        command_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self._pending[command_id] = future
        envelope = {
            "id": command_id,
            "command": command["command"],
            "payload": command.get("payload", {}),
        }
        try:
            websocket = self._connection
            if websocket is not None:
                await websocket.send_json({"type": "command", **envelope})
            else:
                self._queued_commands.append(envelope)
            return await asyncio.wait_for(
                future,
                timeout=float(command.get("timeout_seconds", 20.0)),
            )
        except asyncio.TimeoutError as exc:
            self._pending.pop(command_id, None)
            self._queued_commands = deque(
                queued for queued in self._queued_commands if queued["id"] != command_id
            )
            raise TimeoutError("extension_timeout") from exc
        except Exception:
            self._pending.pop(command_id, None)
            self._queued_commands = deque(
                queued for queued in self._queued_commands if queued["id"] != command_id
            )
            raise

    async def poll_command(self, client_id: str) -> Optional[dict[str, Any]]:
        self._active_client_id = client_id
        self._last_poll_at = time.monotonic()
        if not self._queued_commands:
            return None
        return self._queued_commands.popleft()

    async def submit_response(self, message: dict[str, Any]) -> None:
        command_id = message.get("id")
        if not command_id:
            return
        future = self._pending.pop(command_id, None)
        if future is None or future.done():
            return
        if message.get("ok") is False:
            future.set_result(
                {
                    "ok": False,
                    "error": message.get("error", "extension_command_failed"),
                }
            )
            return
        future.set_result(message.get("payload"))

    async def _handle_message(self, message: dict[str, Any]) -> None:
        if message.get("type") != "response":
            return
        await self.submit_response(message)

    def _fail_pending(self, error: str) -> None:
        for command_id, future in list(self._pending.items()):
            if future.done():
                continue
            future.set_exception(BridgeDisconnected(error))
            self._pending.pop(command_id, None)

    def reset_for_tests(self) -> None:
        self._connection = None
        self._pending.clear()
        self._queued_commands.clear()
        self._active_client_id = None
        self._last_poll_at = 0.0


bridge_manager = WhatsAppBridgeManager()


def _parse_extra_allowed_directories() -> list[Path]:
    raw = os.getenv("WHATSAPP_BRIDGE_ALLOWED_DIRS", "")
    extras: list[Path] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        extras.append(Path(item).expanduser())
    return extras


def _allowed_directories() -> list[Path]:
    return [path.resolve() for path in [*ALLOWED_UPLOAD_DIRECTORIES, *_parse_extra_allowed_directories()]]


def _is_within(candidate: Path, parent: Path) -> bool:
    return candidate == parent or parent in candidate.parents


def _validate_upload_path(path_value: Optional[str]) -> Path:
    if not path_value:
        raise HTTPException(status_code=400, detail="invalid_file_path")
    try:
        resolved = Path(path_value).expanduser().resolve(strict=True)
    except (FileNotFoundError, OSError):
        raise HTTPException(status_code=400, detail="invalid_file_path")
    if not resolved.is_file():
        raise HTTPException(status_code=400, detail="invalid_file_path")
    if not any(_is_within(resolved, allowed) for allowed in _allowed_directories()):
        raise HTTPException(status_code=400, detail="invalid_file_path")
    if resolved.stat().st_size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="invalid_file_path")
    return resolved


def _build_command(body: BridgeCommandRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if body.command == "send_text":
        payload["text"] = (body.text or "").strip()
    elif body.command == "read_last_messages":
        payload["limit"] = body.limit
    elif body.command == "upload_file":
        path = _validate_upload_path(body.path)
        payload["file_name"] = path.name
        payload["file_path"] = str(path)
        payload["mime_type"] = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        payload["file_base64"] = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "command": body.command,
        "payload": payload,
        "timeout_seconds": body.timeout_seconds,
    }


@router.get("/health")
async def bridge_health() -> dict[str, Any]:
    return {
        "connected": bridge_manager.connected,
        "pending_commands": bridge_manager.pending_count,
        "allowed_directories": [str(path) for path in _allowed_directories()],
    }


@router.post("/command")
async def bridge_command(body: BridgeCommandRequest) -> Any:
    command = _build_command(body)
    if not bridge_manager.connected:
        raise HTTPException(status_code=503, detail="extension_unreachable")
    try:
        return await bridge_manager.dispatch_command(command)
    except BridgeDisconnected as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc))


@router.get("/poll")
async def bridge_poll(client_id: str = Query(..., min_length=1)) -> Any:
    command = await bridge_manager.poll_command(client_id)
    if command is None:
        return Response(status_code=204)
    return command


@router.post("/respond")
async def bridge_respond(body: BridgeResponseRequest) -> dict[str, bool]:
    await bridge_manager.submit_response(body.model_dump())
    return {"ok": True}


@router.websocket("/ws")
async def bridge_websocket(websocket: WebSocket) -> None:
    await bridge_manager.register(websocket)
