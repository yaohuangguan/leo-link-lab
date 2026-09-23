import { useEffect, useState } from 'react';

export function useMetricHistory(value: number | null, maxPoints = 60, resetKey = '') {
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    setHistory([]);
  }, [resetKey]);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    setHistory(previous => [...previous, value].slice(-maxPoints));
  }, [value, maxPoints]);

  return history;
}
