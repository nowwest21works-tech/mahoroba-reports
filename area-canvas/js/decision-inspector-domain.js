((root) => {
  'use strict';
  function normalizeStatus(status) {
    if (status === 'NO_FEATURE') return 'NO_DATA';
    return ['READY', 'PARTIAL', 'UNAVAILABLE', 'NO_DATA'].includes(status) ? status : 'UNAVAILABLE';
  }
  // Aggregate only point evidence, never layer visibility or contextual selections.
  function summarizeStatus(statuses) {
    if (!Array.isArray(statuses) || !statuses.length) return 'UNAVAILABLE';
    const normalized = statuses.map(normalizeStatus);
    if (normalized.every((status) => status === 'READY')) return 'READY';
    if (normalized.every((status) => status === 'NO_DATA')) return 'NO_DATA';
    if (normalized.every((status) => status === 'UNAVAILABLE')) return 'UNAVAILABLE';
    return 'PARTIAL';
  }
  function acceptResult(version, currentVersion, enabled) {
    return enabled === true && Number.isInteger(version) && version === currentVersion;
  }
  const api = Object.freeze({ normalizeStatus, summarizeStatus, acceptResult });
  root.DecisionInspectorDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
