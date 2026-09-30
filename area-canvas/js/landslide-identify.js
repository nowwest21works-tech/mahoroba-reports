((root) => {
  'use strict';
  function createProvider(options = {}) {
    return FloodIdentify.createProvider({ ...options, endpoint: '/api/landslide', domainImpl: LandslideIdentifyDomain });
  }
  const provider = createProvider();
  root.LandslideIdentify = Object.freeze({ createProvider, identify: provider.identify, cancel: provider.cancel });
  if (typeof module !== 'undefined' && module.exports) module.exports = { createProvider };
})(globalThis);
