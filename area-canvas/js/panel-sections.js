// Native details keep each section independent and keyboard operable.
(() => {
  const storageKey = 'mahorobaAreaCanvas.panelSections.v1';
  const sections = [...document.querySelectorAll('#panel details[data-panel-section]')];
  const defaults = Object.fromEntries(
    sections.map((section) => [section.dataset.panelSection, section.open]),
  );
  const sectionKeys = new Set(Object.keys(defaults));
  const schemaVersion = 2;
  let saved = null;
  let migrate = false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)
        && value.schemaVersion === schemaVersion
        && value.sections && typeof value.sections === 'object'
        && !Array.isArray(value.sections)) {
        saved = value.sections;
        migrate = Object.entries(saved).some(([key, open]) =>
          !sectionKeys.has(key) || typeof open !== 'boolean')
          || [...sectionKeys].some((key) => typeof saved[key] !== 'boolean');
      } else {
        // Previous flat 15-section preferences cannot map safely to the new groups.
        migrate = true;
      }
    }
  } catch (_) {
    // Broken preferences fall back to the defaults declared in the HTML.
    migrate = true;
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        schemaVersion,
        sections: Object.fromEntries(
          sections.map((section) => [section.dataset.panelSection, section.open]),
        ),
      }));
    } catch (_) {
      // Preferences are optional.
    }
  }

  sections.forEach((section) => {
    const key = section.dataset.panelSection;
    section.open = saved && typeof saved[key] === 'boolean'
      ? saved[key]
      : defaults[key];
    const summary = section.querySelector(':scope > summary');
    const update = () => summary.setAttribute('aria-expanded', String(section.open));
    update();
    section.addEventListener('toggle', () => {
      update();
      persist();
    });
  });

  if (migrate) persist();
})();
