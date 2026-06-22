"""Sliding-window rate limiter for the SEA-LION free tier (10 calls/min).

`acquire()` blocks until a slot is free, guaranteeing no more than `max_calls` are granted
in any `period_s` window even under burst. `now`/`sleep` are injectable so tests can drive
time deterministically without real waiting.
"""
import threading
import time
from collections import deque
from typing import Callable


class RateLimiter:
    def __init__(
        self,
        max_calls: int,
        period_s: float,
        *,
        now: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_calls < 1:
            raise ValueError("max_calls must be >= 1")
        self.max_calls = max_calls
        self.period_s = period_s
        self._now = now
        self._sleep = sleep
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until a call slot is available, then record it."""
        with self._lock:
            while True:
                t = self._now()
                # Evict timestamps that have aged out of the window.
                while self._calls and t - self._calls[0] >= self.period_s:
                    self._calls.popleft()
                if len(self._calls) < self.max_calls:
                    self._calls.append(t)
                    return
                # Wait exactly until the oldest in-window call expires.
                self._sleep(self.period_s - (t - self._calls[0]))
