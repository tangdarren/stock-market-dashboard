from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.services.cache import TTLCache
from app.storage.database import Database


@pytest.mark.asyncio
async def test_cache_hit_and_stale_fallback(tmp_path):
    cache = TTLCache(Database(tmp_path / "cache.db"))

    call_count = {"n": 0}

    async def fetcher():
        call_count["n"] += 1
        return {"value": call_count["n"]}

    payload, meta = await cache.get_or_fetch("k", ttl_seconds=60, fetch=fetcher)
    assert payload == {"value": 1}
    assert meta["cacheStatus"] == "miss"
    assert meta["isStale"] is False

    payload2, meta2 = await cache.get_or_fetch("k", ttl_seconds=60, fetch=fetcher)
    assert payload2 == {"value": 1}
    assert meta2["cacheStatus"] == "hit"
    assert call_count["n"] == 1

    # Manually expire the cached entry so the next fetch attempts the network.
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).replace(microsecond=0).isoformat()
    with cache._db.transaction() as conn:
        conn.execute("UPDATE cache_entries SET expires_at = ? WHERE key = ?", (past, "k"))

    async def failing():
        raise RuntimeError("upstream is down")

    payload3, meta3 = await cache.get_or_fetch("k", ttl_seconds=60, fetch=failing)
    assert payload3 == {"value": 1}
    assert meta3["cacheStatus"] == "stale_fallback"
    assert meta3["isStale"] is True


@pytest.mark.asyncio
async def test_get_or_fetch_deduplicates_concurrent_misses(tmp_path):
    cache = TTLCache(Database(tmp_path / "cache.db"))
    calls = {"n": 0}

    async def slow_fetch():
        await asyncio.sleep(0.05)
        calls["n"] += 1
        return {"value": calls["n"]}

    results = await asyncio.gather(
        cache.get_or_fetch("z", ttl_seconds=60, fetch=slow_fetch),
        cache.get_or_fetch("z", ttl_seconds=60, fetch=slow_fetch),
        cache.get_or_fetch("z", ttl_seconds=60, fetch=slow_fetch),
    )

    values = [r[0]["value"] for r in results]
    assert values == [1, 1, 1]
    assert calls["n"] == 1
