#!/usr/bin/env python3
"""Validate a private Kilo trigger destination without displaying its value.

The optional argument selects the trigger family: ``check`` for the Debug
trigger used by failed-commit-check repairs, ``repair`` (the default) for the
Code trigger used by every other repair request.
"""
from __future__ import annotations

import os
import re
import sys
from urllib.parse import urlsplit

REPAIR_TRIGGER_SECRET = "KILO_REPAIR_TRIGGER_URL"
DEBUG_TRIGGER_SECRET = "KILO_DEBUG_TRIGGER_URL"
DEBUG_ROUTE_KINDS = {"check"}
TRIGGER_KINDS = ("check", "repair")


def valid_kilo_webhook_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        return (
            parsed.scheme == "https"
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
            and bool(parsed.path)
            and not parsed.fragment
            and re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*", host) is not None
            and (host == "hooks.kilosessions.ai" or host == "kilo.ai" or host.endswith(".kilo.ai"))
        )
    except ValueError:
        return False


def trigger_secret_for(kind: str) -> str:
    """Route failed commit checks to Debug while preserving Code for other requests."""
    return DEBUG_TRIGGER_SECRET if kind in DEBUG_ROUTE_KINDS else REPAIR_TRIGGER_SECRET


def configured_trigger_url(kind: str) -> str:
    """Return the trigger configured for a kind without exposing its value."""
    return os.environ.get(trigger_secret_for(kind), "")


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else "repair"
    if kind not in TRIGGER_KINDS:
        print(f"::error::Unknown Kilo trigger kind {kind}.", file=sys.stderr)
        raise SystemExit(2)
    if not valid_kilo_webhook_url(configured_trigger_url(kind)):
        print(
            f"::error::Configure {trigger_secret_for(kind)} with this repository's "
            "Kilo Cloud Agent webhook trigger.",
            file=sys.stderr,
        )
        raise SystemExit(1)
