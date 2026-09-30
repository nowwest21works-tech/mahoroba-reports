((root) => {
  'use strict';
  function createProvider(kind, options = {}) {
    CoastalIdentifyDomain.providerFor(kind);
    return FloodIdentify.createProvider({ ...options, endpoint: `/api/${kind}`,
      domainImpl: {
        tileFor: (point) => CoastalIdentifyDomain.tileFor(kind, point),
        identify: (collection, point) => CoastalIdentifyDomain.identify(kind, collection, point),
      } });
  }
  const stormSurge = createProvider('storm-surge');
  const tsunami = createProvider('tsunami');
  root.CoastalIdentify = Object.freeze({ createProvider, stormSurge, tsunami,
    cancel: () => { stormSurge.cancel(); tsunami.cancel(); } });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createProvider };
})(globalThis);
