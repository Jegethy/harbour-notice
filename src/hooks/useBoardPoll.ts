"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { msUntilNextHandover } from "@/lib/board/shift";
import type { BoardSnapshot } from "@/lib/types/database";

/** Steady state. A board changes twice a day; this is already generous. */
const POLL_MS = 8_000;

/** After a failure, back off rather than hammering a server that is struggling. */
const RETRY_MS = 20_000;

/** Failures in a row before the board admits on screen that it is stale. */
const FAILURES_BEFORE_STALE = 3;

export type BoardConnection = "loading" | "live" | "stale";

export interface BoardState {
  snapshot: BoardSnapshot;
  connection: BoardConnection;
  /** Seconds left on the editing window, counted down locally. */
  unlockedSeconds: number;
  refresh: () => Promise<void>;
  setUnlockedSeconds: (seconds: number) => void;
}

interface Payload extends BoardSnapshot {
  unlocked_seconds?: number;
}

/**
 * Keeps one tablet's board current.
 *
 * Three things happen here, and they are separate on purpose.
 *
 * The poll is the update path. It sends an If-None-Match, so the ordinary
 * answer between handovers is a 304 with no body — the cost of running this all
 * day is a few hundred bytes an hour, which is why the interval can be short
 * enough to feel immediate without anyone having to think about load.
 *
 * The server's clock, not the tablet's, decides when the handover alarm below
 * is set for. A wall tablet nobody has logged into for a year is exactly the
 * device whose clock has drifted, so the offset between the two is measured on
 * every full response and the alarm is set against that.
 *
 * The handover alarm is a scheduling refinement rather than a correctness
 * mechanism. Without it the 20:00 changeover would appear whenever the poll
 * happened to land, up to eight seconds late; with it there is an extra refresh
 * timed for the moment the shift actually turns over. If the timing is wrong the
 * poll still corrects it — see the note in lib/board/shift.ts.
 */
export function useBoardPoll(floor: string, initial: BoardSnapshot): BoardState {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<BoardConnection>("loading");
  const [unlockedSeconds, setUnlockedSeconds] = useState(0);

  /** Server clock minus this device's clock, in ms. Written only from effects. */
  const offsetRef = useRef(0);
  const etagRef = useRef<string | null>(null);
  const failuresRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const headers: HeadersInit = {};
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;

      const response = await fetch(`/api/board/${floor}`, { headers, cache: "no-store" });

      if (response.status === 304) {
        failuresRef.current = 0;
        setConnection("live");
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = (await response.json()) as Payload;
      etagRef.current = response.headers.get("etag");
      offsetRef.current = Date.parse(payload.at) - Date.now();
      failuresRef.current = 0;

      setSnapshot(payload);
      setConnection("live");

      // Only trust the server's countdown from a full response. A 304 says
      // nothing about the editing window, so a zero here is the one
      // authoritative "the window has closed" signal there is.
      if (typeof payload.unlocked_seconds === "number") {
        setUnlockedSeconds(payload.unlocked_seconds);
      }
    } catch {
      failuresRef.current += 1;
      if (failuresRef.current >= FAILURES_BEFORE_STALE) {
        setConnection("stale");
      }
    }
  }, [floor]);

  // Poll. The interval widens once the board has gone stale, so a server that is
  // down is not asked every eight seconds by every tablet in the building.
  //
  // No immediate call on mount: the page was server-rendered with a fresh
  // snapshot moments ago, so the first useful poll is one interval away.
  useEffect(() => {
    const interval = connection === "stale" ? RETRY_MS : POLL_MS;
    const id = window.setInterval(() => void refresh(), interval);
    return () => window.clearInterval(id);
  }, [refresh, connection]);

  // A refresh timed for 08:00 and 20:00 exactly, re-armed after each one.
  useEffect(() => {
    const id = window.setTimeout(
      () => void refresh(),
      msUntilNextHandover(new Date(Date.now() + offsetRef.current)) + 500,
    );
    return () => window.clearTimeout(id);
  }, [refresh, snapshot.shift, snapshot.shift_date]);

  // One second tick, for the unlock countdown only — and only while there is a
  // countdown to run. The board is displayed continuously for months at a time;
  // a timer that re-renders every face on the wall once a second in order to
  // change nothing is not something to leave running.
  const countingDown = unlockedSeconds > 0;

  useEffect(() => {
    if (!countingDown) return;

    const id = window.setInterval(() => {
      setUnlockedSeconds((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [countingDown]);

  // Come back from sleep with something current. A tablet that has been dark
  // overnight would otherwise show the previous shift until the next poll.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [refresh]);

  return { snapshot, connection, unlockedSeconds, refresh, setUnlockedSeconds };
}
