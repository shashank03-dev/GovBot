from __future__ import annotations

from gov_agent import config


def create_client(url: str, key: str):
    from supabase import create_client as _create_client

    return _create_client(url, key)


class LazySupabaseClient:
    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        if self._client is None:
            missing = [
                name
                for name, value in (
                    ("SUPABASE_URL", config.SUPABASE_URL),
                    ("SUPABASE_KEY", config.SUPABASE_KEY),
                )
                if not value
            ]
            if missing:
                raise RuntimeError(
                    "Supabase client is not configured. Missing required environment "
                    f"variables: {', '.join(missing)}"
                )
            self._client = create_client(str(config.SUPABASE_URL), str(config.SUPABASE_KEY))
        return self._client

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return getattr(self._get_client(), name)

    def reset(self) -> None:
        self._client = None


supabase = LazySupabaseClient()
