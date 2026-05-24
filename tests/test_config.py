import importlib
import os
import unittest
from unittest.mock import patch

import gov_agent.config as config_module


class ConfigDefaultsTests(unittest.TestCase):
    def test_secret_key_has_dev_fallback_but_validation_still_requires_env(self):
        with patch.dict(
            os.environ,
            {
                "WHATSAPP_TOKEN": "",
                "WHATSAPP_PHONE_NUMBER_ID": "",
                "WHATSAPP_VERIFY_TOKEN": "",
                "SUPABASE_URL": "",
                "SUPABASE_KEY": "",
                "GEMINI_API_KEY": "",
                "SECRET_KEY": "",
            },
            clear=False,
        ):
            reloaded = importlib.reload(config_module)

            self.assertTrue(reloaded.SECRET_KEY)
            with self.assertRaises(ValueError) as ctx:
                reloaded.validate_config()

        importlib.reload(config_module)
        self.assertIn("SECRET_KEY", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
