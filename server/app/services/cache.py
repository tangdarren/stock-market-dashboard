"""Persistent TTL cache with stale-fallback + per-key async deduplication."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.storage.database import Database, parse_iso, utcnow_iso


@dataclass(frozen=True)
class CacheEntry:
    key: str
    payload: Any
    fetched_at: datetime
    expires_at: datetime

    @property
    def is_fresh(self) -> bool:
        return datetime.now(timezone.utc) < self.expires_at


class TTLCache:
    """SQLite-backed cache with per-key locks to deduplicate concurrent fetches."""

    def __init__(self, db: Database):
        self._db = db
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock

    def get(self, key: str) -> CacheEntry | None:
        with self._db.transaction() as conn:
            row = conn.execute(
                "SELECT key, payload, fetched_at, expires_at FROM cache_entries WHERE key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        return CacheEntry(
            key=row[0],
            payload=json.loads(row[1]),
            fetched_at=parse_iso(row[2]),
            expires_at=parse_iso(row[3]),
        )

    def put(self, key: str, payload: Any, ttl_seconds: int) -> CacheEntry:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=ttl_seconds)
        with self._db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO cache_entries(key, payload, fetched_at, expires_at)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    payload = excluded.payload,
                    fetched_at = excluded.fetched_at,
                    expires_at = excluded.expires_at
                """,
                (
                    key,
                    json.dumps(payload),
                    now.replace(microsecond=0).isoformat(),
                    expires.replace(microsecond=0).isoformat(),
                ),
            )
        return CacheEntry(key=key, payload=payload, fetched_at=now, expires_at=expires)

    def delete(self, key: str) -> None:
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM cache_entries WHERE key = ?", (key,))

    def clear(self) -> None:
        with self._db.transaction() as conn:
            conn.execute("DELETE FROM cache_entries")

    async def get_or_fetch(
        self,
        key: str,
        ttl_seconds: int,
        fetch: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, dict[str, Any]]:
        """Fetch `key`, using cache when fresh, otherwise call `fetch`.

        Returns ``(payload, meta)`` where meta describes cache/stale state.

        On upstream failure, the last cached payload is returned with
        ``isStale=True`` if any exists.
        """
        cached = self.get(key)
        if cached and cached.is_fresh:
            return cached.payload, self._meta(cached, cache_status="hit", is_stale=False)

        lock = await self._lock_for(key)
        async with lock:
            # Recheck after acquiring the lock — another waiter may have refreshed it.
            cached = self.get(key)
            if cached and cached.is_fresh:
                return cached.payload, self._meta(cached, cache_status="hit", is_stale=False)

            try:
                payload = await fetch()
            except Exception:
                if cached is not None:
                    return cached.payload, self._meta(
                        cached, cache_status="stale_fallback", is_stale=True
                    )
                raise

            entry = self.put(key, payload, ttl_seconds)
            return payload, self._meta(entry, cache_status="miss", is_stale=False)

    @staticmethod
    def _meta(entry: CacheEntry, *, cache_status: str, is_stale: bool) -> dict[str, Any]:
        return {
            "fetchedAt": entry.fetched_at.replace(microsecond=0).isoformat(),
            "expiresAt": entry.expires_at.replace(microsecond=0).isoformat(),
            "cacheStatus": cache_status,
            "isStale": is_stale,
        }


UTCNOW_ISO = utcnow_iso
