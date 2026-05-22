import importlib
import pathlib
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gov_agent.models import WhatsAppIncoming


def _load_flow_router():
    existing = sys.modules.get("gov_agent.flow_router")
    if isinstance(existing, types.SimpleNamespace):
        sys.modules.pop("gov_agent.flow_router", None)
    sys.modules.setdefault(
        "gov_agent.rag_engine",
        types.SimpleNamespace(query_eligibility=None),
    )
    sys.modules.setdefault(
        "gov_agent.graph",
        types.SimpleNamespace(run_application=None),
    )
    return importlib.import_module("gov_agent.flow_router")


def _load_session_manager():
    sys.modules["gov_agent.flow_router"] = _load_flow_router()
    return importlib.import_module("gov_agent.session_manager")


class FlowRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_restart_from_completed_returns_main_menu(self):
        flow_router = _load_flow_router()
        session = {"state": "completed", "collected_data": {"portal": "nsp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="restart")

        reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply, flow_router.MENU)
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

    async def test_delete_session_falls_back_to_reset_when_delete_fails(self):
        session_manager = _load_session_manager()
        delete_step = MagicMock()
        delete_step.eq.return_value.execute.side_effect = Exception("fk blocked")
        delete_chain = MagicMock()
        delete_chain.delete.return_value = delete_step

        upsert_chain = MagicMock()
        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [delete_chain, upsert_chain]

        with patch.object(session_manager, "supabase", supabase_mock):
            await session_manager.delete_session("919999999999")

        upsert_chain.upsert.return_value.execute.assert_called_once_with()
        upsert_payload = upsert_chain.upsert.call_args.args[0]
        self.assertEqual(
            upsert_payload,
            {
                "phone": "919999999999",
                "state": "greeting",
                "collected_data": {},
            },
        )


if __name__ == "__main__":
    unittest.main()
