import unittest
from unittest.mock import MagicMock, patch


class LazySupabaseClientTests(unittest.TestCase):
    def test_private_attribute_lookup_does_not_force_client_creation(self):
        from gov_agent import db

        with patch.object(db, "create_client") as create_client_mock:
            proxy = db.LazySupabaseClient()

            with self.assertRaises(AttributeError):
                getattr(proxy, "__func__")
            with self.assertRaises(AttributeError):
                getattr(proxy, "_is_coroutine")

        self.assertEqual(create_client_mock.call_count, 0)

    def test_proxy_defers_client_creation_until_attribute_access(self):
        from gov_agent import db

        client = MagicMock()
        client.table.return_value = "ok"

        with (
            patch.object(db.config, "SUPABASE_URL", "https://example.supabase.co"),
            patch.object(db.config, "SUPABASE_KEY", "example-service-key"),
            patch.object(db, "create_client", return_value=client) as create_client_mock,
        ):
            proxy = db.LazySupabaseClient()

            self.assertEqual(create_client_mock.call_count, 0)
            self.assertEqual(proxy.table("applications"), "ok")
            self.assertEqual(create_client_mock.call_count, 1)
            self.assertEqual(proxy.table("applications"), "ok")
            self.assertEqual(create_client_mock.call_count, 1)

    def test_proxy_raises_clear_error_when_supabase_config_is_missing(self):
        from gov_agent import db

        with (
            patch.object(db.config, "SUPABASE_URL", None),
            patch.object(db.config, "SUPABASE_KEY", None),
        ):
            proxy = db.LazySupabaseClient()

            with self.assertRaises(RuntimeError) as ctx:
                proxy.table("applications")

        self.assertIn("SUPABASE_URL", str(ctx.exception))
        self.assertIn("SUPABASE_KEY", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
