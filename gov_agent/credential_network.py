from gov_agent import config


def get_credential_network_name() -> str:
    network_name = str(getattr(config, "CREDENTIAL_CHAIN_NAME", "") or "").strip()
    return network_name or "Polygon Mumbai"


def build_credential_explorer_url(tx_hash: str | None) -> str:
    tx_hash_value = str(tx_hash or "").strip()
    if not tx_hash_value:
        return ""

    base_url = str(getattr(config, "CREDENTIAL_EXPLORER_BASE_URL", "") or "").strip().rstrip("/")
    if not base_url:
        return ""

    return f"{base_url}/{tx_hash_value}"
