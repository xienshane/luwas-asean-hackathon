"""Unit tests for the SEA-LION rate limiter (Phase 2.5).

The free tier allows 10 calls/min. The limiter must never let more than that through in
any 60s window, even under burst. A fake clock (sleep advances time) makes it deterministic.
"""
from app.core.rate_limiter import RateLimiter


def fake_clock():
    state = {"t": 0.0}
    return state, (lambda: state["t"]), (lambda dt: state.__setitem__("t", state["t"] + dt))


def test_first_burst_up_to_limit_is_instant():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    grants = []
    for _ in range(10):
        rl.acquire()
        grants.append(state["t"])
    assert grants == [0.0] * 10          # the first 10 go through with no waiting


def test_never_exceeds_limit_under_burst():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    grants = []
    for _ in range(25):                  # burst of 25 against a 10/min limit
        rl.acquire()
        grants.append(state["t"])

    # Invariant: the i-th grant is at least one full period after the (i-10)-th, so no
    # 60s window ever holds more than 10 grants.
    for i in range(10, len(grants)):
        assert grants[i] - grants[i - 10] >= 60


def test_window_slides_no_unnecessary_wait():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    for _ in range(10):
        rl.acquire()                     # fill the window at t=0
    state["t"] = 61                      # a minute passes with no calls
    grants_before = state["t"]
    rl.acquire()                         # should be immediate (window cleared)
    assert state["t"] == grants_before


# --- try_acquire(): non-blocking counterpart (Phase 5.2 / B2) ---------------
# A caller holding a Gemini fallback must never sit on a 60s wait; it asks for a slot and
# routes elsewhere when refused. `state["t"] == 0.0` is the proof that nothing slept.

def test_try_acquire_grants_up_to_limit_without_sleeping():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    assert [rl.try_acquire() for _ in range(10)] == [True] * 10
    assert state["t"] == 0.0


def test_try_acquire_refuses_when_window_is_full():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    for _ in range(10):
        rl.try_acquire()
    assert rl.try_acquire() is False
    assert state["t"] == 0.0


def test_try_acquire_grants_again_after_window_slides():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=10, period_s=60, now=now, sleep=sleep)
    for _ in range(10):
        rl.try_acquire()
    assert rl.try_acquire() is False
    state["t"] = 61
    assert rl.try_acquire() is True


def test_refused_call_does_not_consume_a_slot():
    state, now, sleep = fake_clock()
    rl = RateLimiter(max_calls=2, period_s=60, now=now, sleep=sleep)
    rl.try_acquire()
    rl.try_acquire()
    assert rl.try_acquire() is False
    state["t"] = 61
    assert [rl.try_acquire() for _ in range(3)] == [True, True, False]
