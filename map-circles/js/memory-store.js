(function (root, factory) {
  const domain = typeof module === 'object' && module.exports
    ? require('./domain.js')
    : root.MapCirclesDomain;
  const api = factory(root, domain);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MapCirclesMemoryStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, domain) {
  'use strict';

  if (!domain) {
    throw new Error('MapCirclesMemoryStore.domain: MapCirclesDomain is required');
  }

  class StoreError extends Error {
    constructor(entity, field, message) {
      super(`${entity}.${field}: ${message}`);
      this.name = 'StoreError';
      this.entity = entity;
      this.field = field;
    }
  }

  function fail(entity, field, message) {
    throw new StoreError(entity, field, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertPlainObject(entity, field, value) {
    if (!isPlainObject(value)) fail(entity, field, 'must be a plain object');
  }

  function cloneValue(entity, field, value) {
    try {
      if (root && typeof root.structuredClone === 'function') {
        return root.structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      fail(entity, field, `must be deep-cloneable: ${error.message}`);
    }
  }

  function createMemoryStore(options) {
    const config = options === undefined ? {} : options;
    assertPlainObject('Store', 'options', config);
    for (const field of Object.keys(config)) {
      if (!['idGenerator', 'clock'].includes(field)) {
        fail('Store', field, 'is not allowed');
      }
    }
    if (config.idGenerator !== undefined && typeof config.idGenerator !== 'function') {
      fail('Store', 'idGenerator', 'must be a function');
    }
    if (config.clock !== undefined && typeof config.clock !== 'function') {
      fail('Store', 'clock', 'must be a function');
    }

    const creationDependencies = {};
    if (config.idGenerator) creationDependencies.idGenerator = config.idGenerator;
    if (config.clock) creationDependencies.clock = config.clock;
    const clock = config.clock || (() => new Date().toISOString());

    const households = new Map();
    const journeys = new Map();
    const mapProjects = new Map();

    function clone(entity, value) {
      return cloneValue(entity, 'entity', value);
    }

    function assertUnique(entity, collection, id) {
      if (collection.has(id)) fail(entity, 'id', `duplicate ID ${id}`);
    }

    function requireEntity(entity, collection, id) {
      const current = collection.get(id);
      if (!current) fail(entity, 'id', `not found: ${id}`);
      return current;
    }

    function nextUpdatedAt(entity, currentTimestamp) {
      let value;
      try {
        value = clock();
      } catch (error) {
        fail(entity, 'updatedAt', `clock failed: ${error.message}`);
      }
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        fail(entity, 'updatedAt', 'clock must return an ISO-8601 timestamp');
      }

      const currentTime = Date.parse(currentTimestamp);
      const proposedTime = Date.parse(value);
      if (proposedTime <= currentTime) {
        return new Date(currentTime + 1).toISOString();
      }
      return value;
    }

    function updateEntity({
      entity,
      collection,
      id,
      patch,
      immutableFields,
      validate,
    }) {
      const current = requireEntity(entity, collection, id);
      assertPlainObject(entity, 'patch', patch);
      const safePatch = cloneValue(entity, 'patch', patch);

      for (const field of immutableFields) {
        if (Object.prototype.hasOwnProperty.call(safePatch, field)) {
          fail(entity, field, 'is immutable');
        }
      }

      const candidate = {
        ...clone(entity, current),
        ...safePatch,
        updatedAt: nextUpdatedAt(entity, current.updatedAt),
      };
      validate(candidate);
      collection.set(id, clone(entity, candidate));
      return clone(entity, candidate);
    }

    function createHousehold(input) {
      const safeInput = cloneValue('Household', 'input', input);
      const household = domain.createHousehold(safeInput, creationDependencies);
      assertUnique('Household', households, household.id);
      households.set(household.id, clone('Household', household));
      return clone('Household', household);
    }

    function getHousehold(id) {
      const household = households.get(id);
      return household ? clone('Household', household) : null;
    }

    function listHouseholds() {
      return Array.from(households.values(), (value) => clone('Household', value));
    }

    function updateHousehold(id, patch) {
      return updateEntity({
        entity: 'Household',
        collection: households,
        id,
        patch,
        immutableFields: ['schemaVersion', 'id', 'createdAt', 'updatedAt'],
        validate: domain.validateHousehold,
      });
    }

    function removeHousehold(id) {
      if (!households.has(id)) return false;
      if (Array.from(journeys.values()).some((journey) => journey.householdId === id)) {
        fail('Household', 'id', 'cannot remove while Journey children exist');
      }
      households.delete(id);
      return true;
    }

    function createJourney(input) {
      const safeInput = cloneValue('Journey', 'input', input);
      const journey = domain.createJourney(safeInput, creationDependencies);
      assertUnique('Journey', journeys, journey.id);
      if (!households.has(journey.householdId)) {
        fail('Journey', 'householdId', `referenced Household not found: ${journey.householdId}`);
      }
      journeys.set(journey.id, clone('Journey', journey));
      return clone('Journey', journey);
    }

    function getJourney(id) {
      const journey = journeys.get(id);
      return journey ? clone('Journey', journey) : null;
    }

    function listJourneys() {
      return Array.from(journeys.values(), (value) => clone('Journey', value));
    }

    function updateJourney(id, patch) {
      return updateEntity({
        entity: 'Journey',
        collection: journeys,
        id,
        patch,
        immutableFields: [
          'schemaVersion',
          'id',
          'householdId',
          'createdAt',
          'updatedAt',
        ],
        validate: domain.validateJourney,
      });
    }

    function removeJourney(id) {
      if (!journeys.has(id)) return false;
      if (Array.from(mapProjects.values()).some((project) => project.journeyId === id)) {
        fail('Journey', 'id', 'cannot remove while MapProject children exist');
      }
      journeys.delete(id);
      return true;
    }

    function createMapProject(input) {
      const safeInput = cloneValue('MapProject', 'input', input);
      const mapProject = domain.createMapProject(safeInput, creationDependencies);
      assertUnique('MapProject', mapProjects, mapProject.id);
      if (!journeys.has(mapProject.journeyId)) {
        fail('MapProject', 'journeyId', `referenced Journey not found: ${mapProject.journeyId}`);
      }
      mapProjects.set(mapProject.id, clone('MapProject', mapProject));
      return clone('MapProject', mapProject);
    }

    function getMapProject(id) {
      const mapProject = mapProjects.get(id);
      return mapProject ? clone('MapProject', mapProject) : null;
    }

    function listMapProjects() {
      return Array.from(mapProjects.values(), (value) => clone('MapProject', value));
    }

    function updateMapProject(id, patch) {
      return updateEntity({
        entity: 'MapProject',
        collection: mapProjects,
        id,
        patch,
        immutableFields: [
          'schemaVersion',
          'id',
          'journeyId',
          'createdAt',
          'updatedAt',
        ],
        validate: domain.validateMapProject,
      });
    }

    function removeMapProject(id) {
      if (!mapProjects.has(id)) return false;
      mapProjects.delete(id);
      return true;
    }

    function snapshot() {
      return cloneValue('Store', 'snapshot', {
        schemaVersion: domain.SCHEMA_VERSION,
        households: listHouseholds(),
        journeys: listJourneys(),
        mapProjects: listMapProjects(),
      });
    }

    return Object.freeze({
      createHousehold,
      getHousehold,
      listHouseholds,
      updateHousehold,
      removeHousehold,
      createJourney,
      getJourney,
      listJourneys,
      updateJourney,
      removeJourney,
      createMapProject,
      getMapProject,
      listMapProjects,
      updateMapProject,
      removeMapProject,
      snapshot,
    });
  }

  return Object.freeze({
    StoreError,
    createMemoryStore,
  });
});
