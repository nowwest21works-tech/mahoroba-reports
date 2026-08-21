// ========== 顧客・案件別ローカル地図 ==========
(() => {
  const schema = JourneyMapProjectSchema;
  const storage = JourneyMapIndexedDb;
  const defaultViewport = MapCirclesDomain.DEFAULT_VIEWPORT;
  const emptyFeatureCollection = Object.freeze({
    type: 'FeatureCollection',
    features: Object.freeze([]),
  });
  const elements = {
    householdCode: document.getElementById('household-code'),
    journeyName: document.getElementById('journey-name'),
    mapProjectName: document.getElementById('map-project-name'),
    newProject: document.getElementById('new-project'),
    saveProject: document.getElementById('save-project'),
    savedProjects: document.getElementById('saved-projects'),
    openProject: document.getElementById('open-project'),
    duplicateProject: document.getElementById('duplicate-project'),
    exportProject: document.getElementById('export-project'),
    importProject: document.getElementById('import-project'),
    importFile: document.getElementById('import-file'),
    projectState: document.getElementById('project-state'),
  };
  let currentRecord = null;
  let dirty = false;
  let replacingState = false;

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setBusy(busy) {
    [
      elements.newProject,
      elements.saveProject,
      elements.savedProjects,
      elements.openProject,
      elements.duplicateProject,
      elements.exportProject,
      elements.importProject,
    ].forEach((element) => {
      element.disabled = busy;
    });
  }

  function setProjectState(message, kind = 'normal') {
    elements.projectState.textContent = message;
    elements.projectState.dataset.kind = kind;
  }

  function renderDirtyState() {
    const base = currentRecord
      ? `保存済み · ${currentRecord.projectId.slice(0, 8)}`
      : '未保存の新しい地図';
    setProjectState(dirty ? `${base} · 未保存の変更あり` : base, dirty ? 'dirty' : 'normal');
  }

  function markDirty() {
    if (replacingState) return;
    dirty = true;
    renderDirtyState();
  }

  function confirmDiscardIfNeeded() {
    return !dirty || window.confirm(
      '保存前の変更があります。保存せずに現在の地図を閉じますか？',
    );
  }

  function readMetadata() {
    return {
      householdCode: elements.householdCode.value.trim(),
      journeyName: elements.journeyName.value.trim(),
      mapProjectName: elements.mapProjectName.value.trim(),
    };
  }

  function writeMetadata(record) {
    elements.householdCode.value = record.householdCode;
    elements.journeyName.value = record.journeyName;
    elements.mapProjectName.value = record.mapProjectName;
  }

  function captureInput() {
    const runtime = MapCirclesAppState.captureProjectState();
    return {
      ...readMetadata(),
      featureCollection: runtime.featureCollection,
      viewport: runtime.viewport,
    };
  }

  function applyRecord(record) {
    schema.validateRecord(record);
    replacingState = true;
    try {
      MapCirclesAppState.replaceProjectState(
        record.featureCollection,
        record.viewport,
      );
      writeMetadata(record);
      currentRecord = cloneData(record);
      dirty = false;
      elements.savedProjects.value = record.projectId;
      renderDirtyState();
    } finally {
      replacingState = false;
    }
  }

  function formatSavedOption(record) {
    const updatedAt = new Date(record.updatedAt).toLocaleString('ja-JP', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return `${record.householdCode}｜${record.journeyName}｜${record.mapProjectName}｜${updatedAt}`;
  }

  async function refreshProjectList(selectedProjectId = null) {
    const records = await storage.listProjects();
    elements.savedProjects.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = records.length === 0
      ? '保存済み地図はありません'
      : '保存済み地図を選択';
    elements.savedProjects.append(placeholder);
    records.forEach((record) => {
      const option = document.createElement('option');
      option.value = record.projectId;
      option.textContent = formatSavedOption(record);
      elements.savedProjects.append(option);
    });
    elements.savedProjects.value = selectedProjectId || '';
    return records;
  }

  async function withBusy(task) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setProjectState(error.message, 'error');
      showStatus(error.message, 5000);
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentProject() {
    const input = captureInput();
    const record = currentRecord
      ? schema.updateRecord(currentRecord, input)
      : schema.createRecord(input);
    await storage.putProject(record);
    currentRecord = cloneData(record);
    dirty = false;
    await refreshProjectList(record.projectId);
    renderDirtyState();
    showStatus('地図をこのブラウザに保存しました');
  }

  async function openSelectedProject() {
    const projectId = elements.savedProjects.value;
    if (!projectId) throw new Error('開く地図を一覧から選んでください');
    const record = await storage.getProject(projectId);
    if (!record) throw new Error('選択した地図が見つかりません');
    if (!confirmDiscardIfNeeded()) return;
    applyRecord(record);
    showStatus('保存済み地図を開きました');
  }

  function startNewProject() {
    if (!confirmDiscardIfNeeded()) return;
    const draft = {
      householdCode: 'HH-001',
      journeyName: '土地探し 第1回',
      mapProjectName: '新しい地図',
      featureCollection: cloneData(emptyFeatureCollection),
      viewport: cloneData(defaultViewport),
    };
    replacingState = true;
    try {
      MapCirclesAppState.replaceProjectState(
        draft.featureCollection,
        draft.viewport,
      );
      writeMetadata(draft);
      currentRecord = null;
      dirty = false;
      elements.savedProjects.value = '';
      renderDirtyState();
      showStatus('新しい地図を開始しました');
    } finally {
      replacingState = false;
    }
  }

  async function duplicateCurrentProject() {
    const source = currentRecord
      ? schema.updateRecord(currentRecord, captureInput())
      : schema.createRecord(captureInput());
    const duplicate = schema.duplicateRecord(source);
    await storage.putProject(duplicate);
    applyRecord(duplicate);
    await refreshProjectList(duplicate.projectId);
    showStatus('地図を複製して保存しました');
  }

  function exportCurrentProject() {
    const record = currentRecord
      ? schema.updateRecord(currentRecord, captureInput())
      : schema.createRecord(captureInput());
    const blob = new Blob(
      [JSON.stringify(record, null, 2)],
      { type: 'application/json;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = schema.createBackupFilename(record);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showStatus('JSONバックアップを書き出しました');
  }

  async function importBackupFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      throw new Error('JSONファイルを読み取れませんでした');
    }
    schema.validateRecord(parsed);
    if (!confirmDiscardIfNeeded()) return;
    const previousRuntime = MapCirclesAppState.captureProjectState();
    const previousMetadata = readMetadata();
    const previousRecord = currentRecord ? cloneData(currentRecord) : null;
    const previousDirty = dirty;
    const previousSelection = elements.savedProjects.value;
    try {
      applyRecord(parsed);
      await storage.putProject(parsed);
      await refreshProjectList(parsed.projectId);
    } catch (error) {
      replacingState = true;
      try {
        MapCirclesAppState.replaceProjectState(
          previousRuntime.featureCollection,
          previousRuntime.viewport,
        );
        writeMetadata(previousMetadata);
        currentRecord = previousRecord;
        dirty = previousDirty;
        elements.savedProjects.value = previousSelection;
        renderDirtyState();
      } finally {
        replacingState = false;
      }
      throw error;
    }
    showStatus('JSONバックアップを読み込みました');
  }

  elements.newProject.addEventListener('click', startNewProject);
  elements.saveProject.addEventListener('click', () => withBusy(saveCurrentProject));
  elements.openProject.addEventListener('click', () => withBusy(openSelectedProject));
  elements.duplicateProject.addEventListener(
    'click',
    () => withBusy(duplicateCurrentProject),
  );
  elements.exportProject.addEventListener('click', () => withBusy(
    async () => exportCurrentProject(),
  ));
  elements.importProject.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => withBusy(async () => {
    const [file] = elements.importFile.files;
    try {
      await importBackupFile(file);
    } finally {
      elements.importFile.value = '';
    }
  }));
  [
    elements.householdCode,
    elements.journeyName,
    elements.mapProjectName,
  ].forEach((element) => element.addEventListener('input', markDirty));
  document.addEventListener('journeymap:state-changed', markDirty);
  map.on('moveend', markDirty);

  withBusy(async () => {
    await refreshProjectList();
    renderDirtyState();
  });
})();
