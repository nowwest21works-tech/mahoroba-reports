((root) => {
  'use strict';
  function createProvider({ fetchImpl = root.fetch, now = Date.now, AbortControllerImpl = root.AbortController, domainImpl = FloodIdentifyDomain, endpoint = '/api/flood' } = {}) {
    const cache = new Map();
    let active = null;
    function cancel() { active?.controller.abort(); active = null; }
    async function identify(point) {
      if (root.location && root.location.hostname !== '127.0.0.1') return { status: 'UNAVAILABLE', hits: [], invalidCount: 0 };
      let tile;
      try { tile = domainImpl.tileFor(point); } catch { return { status: 'UNAVAILABLE', hits: [], invalidCount: 0 }; }
      const key = `${tile.z}/${tile.x}/${tile.y}`;
      if (active && active.key !== key) cancel();
      let collection;
      try {
        const entry = cache.get(key);
        if (entry && now() - entry.at < 300000) collection = entry.collection;
        else {
          if (!active) {
            const controller = new AbortControllerImpl();
            const request = { key, controller, promise: null };
            request.promise = (async () => {
              const response = await fetchImpl(`${endpoint}?z=${tile.z}&x=${tile.x}&y=${tile.y}`, { signal: controller.signal, cache: 'no-store' });
              if (!response.ok) throw new Error('unavailable');
              const body = await response.json();
              const checked = domainImpl.identify(body, point);
              if (controller.signal.aborted) throw new Error('cancelled');
              if (checked.status !== 'UNAVAILABLE' && !checked.invalidCount) cache.set(key, { at: now(), collection: body });
              while (cache.size > 16) cache.delete(cache.keys().next().value);
              return body;
            })().finally(() => { if (active === request) active = null; });
            active = request;
          }
          collection = await active.promise;
        }
        return domainImpl.identify(collection, point);
      } catch { return { status: 'UNAVAILABLE', hits: [], invalidCount: 0 }; }
    }
    return Object.freeze({ identify, cancel });
  }
  root.FloodIdentify = Object.freeze({ createProvider, ...createProvider() });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createProvider };
})(globalThis);
