import { useEffect, useRef, useState } from 'react';

/** Tick a second-level counter; returns current epoch in ms updated every 1s */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
