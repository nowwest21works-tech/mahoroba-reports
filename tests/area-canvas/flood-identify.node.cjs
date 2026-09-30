const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../../area-canvas/js/flood-identify-domain.js');
const { createProvider } = require('../../area-canvas/js/flood-identify.js');
const p = { lat: 35, lng: 136 };
// Synthetic geometry is test-only; it is never loaded by the product.
const ring = [[135,34],[137,34],[137,36],[135,36],[135,34]];
const props = { A31a_201: 'test-river', A31a_202: '試験河川', A31a_203: 'test-manager', A31a_204: '試験管理者', A31a_205: 2 };
const feature = (geometry = { type: 'Polygon', coordinates: [ring] }, properties = props) => ({ type: 'Feature', geometry, properties });
const collection = (...features) => ({ type: 'FeatureCollection', features });

test('XYZ uses official allowed zoom and geographic bounds', () => {
  assert.deepEqual(domain.tileFor({ lat: 0, lng: 0 }), { z:14, x:8192, y:8192 });
  assert.deepEqual(domain.tileFor(p), { z:14, x:14381, y:6489 });
  assert.deepEqual(domain.tileFor({ lat: 0, lng: 0 },15), { z:15, x:16384, y:16384 });
  for (const point of [{ lat:NaN,lng:0 }, {lat:90,lng:0}, {lat:0,lng:180}]) assert.throws(() => domain.tileFor(point));
  assert.throws(() => domain.tileFor(p,13));
});
test('Polygon hit/miss, MultiPolygon and holes are evaluated without raster', () => {
  assert.equal(domain.identify(collection(feature()),p).status,'READY');
  assert.equal(domain.identify(collection(feature()),{lat:33,lng:136}).status,'NO_DATA');
  const hole = [[135.5,34.5],[136.5,34.5],[136.5,35.5],[135.5,35.5],[135.5,34.5]];
  assert.equal(domain.identify(collection(feature({type:'Polygon',coordinates:[ring,hole]})),p).status,'NO_DATA');
  const multi = feature({type:'MultiPolygon',coordinates:[[ring,hole],[ring]]});
  assert.equal(domain.identify(collection(multi),p).hits.length,1);
  const boundary = domain.identify(collection(feature()),{lat:34,lng:136});
  assert.equal(boundary.status,'PARTIAL');
  assert.equal(boundary.hits[0].boundary,true);
  assert.equal(domain.identify(collection(feature({type:'Polygon',coordinates:[ring,hole]})),{lat:34.5,lng:136}).status,'PARTIAL');
});
test('overlapping rivers and duplicate fragments are all preserved', () => {
  const result = domain.identify(collection(feature(),feature(undefined,{...props,A31a_202:'別河川'}),feature()),p);
  assert.equal(result.status,'READY');
  assert.deepEqual(result.hits.map(x=>x.riverName),['試験河川','別河川','試験河川']);
});
test('official depth codes only; unknown/missing official attributes remain partial', () => {
  assert.deepEqual(Object.values(domain.DEPTHS),['0～0.5m未満','0.5～3.0m未満','3.0～5.0m未満','5.0～10.0m未満','10.0～20.0m未満','20.0m以上']);
  for (const rank of [99,'2',null]) {
    const result=domain.identify(collection(feature(undefined,{...props,A31a_205:rank})),p);
    assert.equal(result.status,'PARTIAL'); assert.equal(result.hits[0].depth,null);
  }
  assert.equal(domain.identify(collection(feature(undefined,{})),p).status,'PARTIAL');
});
test('empty, malformed and partially malformed data never imply safe or complete No Hit', () => {
  assert.equal(domain.identify(collection(),p).status,'NO_DATA');
  assert.equal(domain.identify([],p).status,'NO_DATA');
  for(const body of [null,{},[feature()],collection(feature({type:'Point',coordinates:[136,35]}))])
    assert.equal(domain.identify(body,p).status,'UNAVAILABLE');
  assert.equal(domain.identify(collection(feature(),null),p).status,'PARTIAL');
  assert.equal(domain.identify(collection(null),p).status,'UNAVAILABLE');
  const invalid=feature({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]});
  assert.equal(domain.identify(collection(invalid),p).status,'UNAVAILABLE');
  assert.match(domain.toGroup(domain.identify(collection(),p)).lines.join(' '),/浸水しないことを意味しません/);
});
test('provider uses local same-origin endpoint, tile cache and distinct unavailable result', async () => {
  let requests=0, url;
  const provider=createProvider({fetchImpl:async (u)=>{requests++;url=u;return {ok:true,json:async()=>collection(feature())};}});
  assert.equal((await provider.identify(p)).status,'READY');
  await provider.identify({...p,lng:136.000001});
  assert.equal(requests,1); assert.match(url,/^\/api\/flood\?z=14&x=\d+&y=\d+$/);
  const offline=createProvider({fetchImpl:async()=>{throw Error('offline');}});
  assert.equal((await offline.identify(p)).status,'UNAVAILABLE');
  const empty=createProvider({fetchImpl:async()=>({ok:true,json:async()=>[]})});
  assert.equal((await empty.identify(p)).status,'NO_DATA');
});
test('provider shares in-flight same tile and cancels prior tile without caching stale response', async () => {
  const requests=[];
  const provider=createProvider({fetchImpl:(url,{signal})=>new Promise(resolve=>requests.push({url,signal,resolve}))});
  const a=provider.identify(p), same=provider.identify(p);
  assert.equal(requests.length,1);
  const b=provider.identify({lat:36,lng:137});
  assert.equal(requests[0].signal.aborted,true);
  requests[1].resolve({ok:true,json:async()=>collection()});
  assert.equal((await b).status,'NO_DATA');
  requests[0].resolve({ok:true,json:async()=>collection(feature())});
  assert.equal((await a).status,'UNAVAILABLE'); assert.equal((await same).status,'UNAVAILABLE');
  const c=provider.identify(p); assert.equal(requests.length,3);
  provider.cancel(); requests[2].resolve({ok:true,json:async()=>collection()});
  assert.equal((await c).status,'UNAVAILABLE');
});
test('provider keeps valid evidence but marks malformed fragments partial', async () => {
  const provider=createProvider({fetchImpl:async()=>({ok:true,json:async()=>collection(feature(),null)})});
  const result=await provider.identify(p); assert.equal(result.status,'PARTIAL'); assert.equal(result.hits.length,1);
});
