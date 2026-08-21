(function (root, factory) {
  const schema = typeof module === 'object' && module.exports
    ? require('./project-schema.js')
    : root.JourneyMapProjectSchema;
  const api = factory(root, schema);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JourneyMapIndexedDb = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, schema) {
  'use strict';

  if (!schema) {
    throw new Error('JourneyMapIndexedDb.schema: JourneyMapProjectSchema is required');
  }

  // journey-map(mahorobaJourneyMaps)とは別のDB名にして、同一ブラウザでの保存衝突を避ける
  const DATABASE_NAME = 'mahorobaAreaCanvas';
  const DATABASE_VERSION = 1;
  const STORE_NAME = 'mapProjects';
  const UPDATED_AT_INDEX = 'updatedAt';

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requestResult(request, message) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        new Error(`${message}: ${request.error ? request.error.message : 'unknown error'}`),
      );
    });
  }

  function openDatabase() {
    if (!root.indexedDB) {
      return Promise.reject(new Error('このブラウザではIndexedDBを利用できません'));
    }
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'projectId',
          });
          store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX, { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(
        new Error(`保存領域を開けませんでした: ${request.error.message}`),
      );
      request.onblocked = () => reject(
        new Error('別の画面が保存領域を使用中です。ほかのタブを閉じてください'),
      );
    });
  }

  async function runTransaction(mode, operation) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = await operation(store);
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(
          new Error(`保存処理に失敗しました: ${transaction.error.message}`),
        );
        transaction.onabort = () => reject(
          new Error(`保存処理が中断されました: ${transaction.error.message}`),
        );
      });
      return result;
    } finally {
      database.close();
    }
  }

  async function putProject(record) {
    schema.validateRecord(record);
    const safeRecord = cloneData(record);
    await runTransaction('readwrite', (store) =>
      requestResult(store.put(safeRecord), '地図を保存できませんでした'));
    return cloneData(safeRecord);
  }

  async function getProject(projectId) {
    const record = await runTransaction('readonly', (store) =>
      requestResult(store.get(projectId), '保存済み地図を取得できませんでした'));
    if (record === undefined) return null;
    schema.validateRecord(record);
    return cloneData(record);
  }

  async function listProjects() {
    const records = await runTransaction('readonly', (store) =>
      requestResult(store.getAll(), '保存済み地図の一覧を取得できませんでした'));
    records.forEach(schema.validateRecord);
    return records
      .map(cloneData)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return Object.freeze({
    DATABASE_NAME,
    DATABASE_VERSION,
    STORE_NAME,
    UPDATED_AT_INDEX,
    getProject,
    listProjects,
    openDatabase,
    putProject,
  });
});
