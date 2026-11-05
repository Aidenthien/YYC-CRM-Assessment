"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface State<T> {
  data: T | null;
  error: string | null;
  key: string;
}

/** GET a JSON endpoint. Pass null to skip. `mutate` allows optimistic local edits. */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<State<T>>({ data: null, error: null, key: "" });
  const key = `${path}#${tick}`;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((data) => !cancelled && setState({ data, error: null, key }))
      .catch((e: Error) => !cancelled && setState((s) => ({ data: s.data, error: e.message, key })));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const mutate = useCallback(
    (fn: (d: T) => T) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)),
    [],
  );

  return {
    data: state.data,
    error: path ? state.error : null,
    loading: !!path && state.key !== key,
    reload,
    mutate,
  };
}
