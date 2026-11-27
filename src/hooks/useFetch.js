import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../services/api';

/** Real loading/error state for every request: skeletons show only while a request is actually in flight. */
export default function useFetch(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await fnRef.current();
      if (id === seq.current) setData(r);
      return r;
    } catch (e) {
      if (id === seq.current) setError(errMsg(e));
      return null;
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (immediate) run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, deps);
  return { data, loading, error, reload: run, setData };
}
