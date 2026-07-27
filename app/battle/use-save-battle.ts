"use client";

import { useCallback, useEffect, useRef } from "react";
import { saveBattle, type SaveBattleInput } from "./save-battle";

// Persist a battle exactly once — when a champion is crowned, or when the user
// leaves after at least one matchup. `over` drives the crowned save; an unmount
// cleanup (RESTART / REPLAY / refine remount / ← BACK) and a `pagehide`
// listener (tab close / refresh) cover abandonment. A guard makes sure the same
// battle never writes twice.

const SESSION_KEY = "bc_session_id";

/** Stable per-browser id, minted once and kept in localStorage. */
function browserSessionId(): string {
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked — fall back to an ephemeral id so the
    // write still succeeds; it just can't be claimed later.
    return crypto.randomUUID();
  }
}

/** Everything saveBattle needs except the identity fields, which we supply. */
type SavePayload = Omit<SaveBattleInput, "sessionId" | "userId">;

export function useSaveBattle(
  over: boolean,
  payload: SavePayload,
  runId = 0,
) {
  const savedRef = useRef(false);
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  });

  // A REPLAY reruns the same roster in place (no remount), so bump `runId` to
  // clear the fire-once guard — the rerun is a distinct battle worth persisting.
  useEffect(() => {
    savedRef.current = false;
  }, [runId]);

  // Stable across renders (reads only refs), so it can safely be a dependency
  // and an event handler. Reads the latest payload at fire time, so unmount /
  // pagehide save the final state rather than a stale render's.
  const flush = useCallback(() => {
    if (savedRef.current) return;
    const p = payloadRef.current;
    if (p.history.length < 1) return; // nothing worth persisting yet
    savedRef.current = true;
    void saveBattle({ ...p, sessionId: browserSessionId(), userId: null }).catch(
      () => {
        // Let a later trigger (unmount after a failed crowned save) retry.
        savedRef.current = false;
      },
    );
  }, []);

  // Crowned or naturally over.
  useEffect(() => {
    if (over) flush();
  }, [over, flush]);

  // Abandonment: real page unload, and in-app navigation away (unmount).
  useEffect(() => {
    const onLeave = () => flush();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      flush();
    };
  }, [flush]);
}
