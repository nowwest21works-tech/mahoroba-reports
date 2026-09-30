const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../area-canvas/js/flood-identify-domain.js');
require('../../area-canvas/js/flood-identify.js');
const d = require('../../area-canvas/js/landslide-identify-domain.js');
const { createProvider } = require('../../area-canvas/js/landslide-identify.js');
const gate = require('../../area-canvas/js/decision-inspector-domain.js');
const point={lat:35,lng:136};
const ring=[[135,34],[137,34],[137,36],[135,36],[135,34]];
const hole=[[135.5,34.5],[136.5,34.5],[136.5,35.5],[135.5,35.5],[135.5,34.5]];
const props={A33_001:1,A33_002:1,A33_003:'23',A33_004:'TEST-1',A33_005:'QA区域',A33_006:'QA所在地',A33_007:'2018/03/15',A33_008:0};
const feature=(p=props,g={type:'Polygon',coordinates:[ring]})=>({type:'Feature',properties:p,geometry:g});
const fc=(...features)=>({type:'FeatureCollection',features});
test('Landslide: official XYZ 11..15, point validation and source fields',()=>{
  assert.deepEqual(d.tileFor(point),{z:14,x:14381,y:6489});
  for(const z of [11,12,13]) assert.deepEqual(d.tileFor(point,z),{z,x:Math.floor(14381/2**(14-z)),y:Math.floor(6489/2**(14-z))});
  assert.equal(d.tileFor(point,15).z,15);
  for(const z of [10,16,14.5]) assert.throws(()=>d.tileFor(point,z));
  assert.throws(()=>d.tileFor({lat:90,lng:0}));
  assert.equal(d.FIELDS.length,8);assert.ok(!d.FIELDS.includes('target_year'));
});
test('Landslide: Polygon hit/miss, MultiPolygon, holes and boundaries',()=>{
  assert.equal(d.identify(fc(feature()),point).status,'READY');
  assert.equal(d.identify(fc(feature()),{lat:33,lng:136}).status,'NO_DATA');
  assert.equal(d.identify(fc(feature(props,{type:'Polygon',coordinates:[ring,hole]})),point).status,'NO_DATA');
  assert.equal(d.identify(fc(feature(props,{type:'MultiPolygon',coordinates:[[ring,hole],[ring]]})),point).status,'READY');
  assert.equal(d.identify(fc(feature()),{lat:34,lng:136}).status,'PARTIAL');
});
test('Landslide: warning/special areas, all phenomena and duplicate Features retained',()=>{
  const result=d.identify(fc(...[1,2,3].flatMap(A33_001=>[1,2].map(A33_002=>feature({...props,A33_001,A33_002}))),feature()),point);
  assert.equal(result.status,'READY');assert.equal(result.hits.length,7);
  assert.deepEqual(new Set(result.hits.map(x=>x.phenomenon)),new Set(['急傾斜地の崩壊','土石流','地滑り']));
  const g=d.toGroup(result);assert.match(g.hazardDisplay.overview[0],/7件/);
  assert.match(g.hazardDisplay.overview.join(' '),/特別警戒区域（指定済）/);
  assert.equal(g.hazardDisplay.overview.filter(x=>x==='急傾斜地の崩壊').length,3);
  assert.ok(!g.hazardDisplay.overview.join(' ').includes('浸水深'));
});
test('Landslide: official pre-designation and unspecified flag retain distinct meanings',()=>{
  for(const A33_002 of [3,4]) {
    const hit=d.identify(fc(feature({...props,A33_002,A33_008:1})),point).hits[0];
    assert.match(hit.zone,/指定前・基礎調査結果の公表/);assert.equal(hit.unspecified,'特別警戒区域未指定');
  }
});
test('Landslide: unknown codes or missing/mistyped attributes remain PARTIAL with raw evidence',()=>{
  for(const [key,value] of [['A33_001',99],['A33_002',9],['A33_008',7],['A33_001','1'],['A33_003','99'],['A33_004',null],['A33_007',2024]]) {
    const result=d.identify(fc(feature({...props,[key]:value})),point);assert.equal(result.status,'PARTIAL');
    assert.equal(result.hits[0].raw[key],value);
    assert.match(d.toGroup(result).hazardDisplay.evidence.join(' '),/未知コード・欠測/);
  }
});
test('Landslide: malformed/empty/mixed collections preserve all four statuses',()=>{
  assert.equal(d.identify([],point).status,'NO_DATA');assert.equal(d.identify(fc(),point).status,'NO_DATA');
  for(const body of [null,{},[feature()],fc(null),fc(feature(props,{type:'Polygon',coordinates:[ring.slice(0,-1)]}))])
    assert.equal(d.identify(body,point).status,'UNAVAILABLE');
  const partial=d.identify(fc(feature(),null),point);assert.equal(partial.status,'PARTIAL');assert.equal(partial.hits.length,1);
  assert.match(d.toGroup(d.identify([],point)).hazardDisplay.overview.join(' '),/斜面災害等の危険がないことを意味しません/);
  assert.match(d.toGroup(d.identify(null,point)).hazardDisplay.overview.join(' '),/区域外とは判定していません/);
});
test('Landslide: official Line forms are never converted to area or silent NO_DATA',()=>{
  for(const geometry of [{type:'LineString',coordinates:ring},{type:'MultiLineString',coordinates:[ring]}]) {
    const line=feature(props,geometry);
    assert.equal(d.identify(fc(line),point).status,'UNAVAILABLE');
    const result=d.identify(fc(feature(),line),point);assert.equal(result.status,'PARTIAL');assert.equal(result.hits.length,1);
    assert.equal(result.lineCount,1);assert.match(d.toGroup(result).hazardDisplay.evidence.join(' '),/Polygonへ補完していません/);
  }
});
test('Landslide: formal evidence, source links and reference year remain below folds',()=>{
  const g=d.toGroup(d.identify(fc(feature({...props,target_year:2099})),point));
  assert.equal(g.hazardDisplay.detailsTitle,'詳細');assert.equal(g.links.length,7);
  for(const field of d.FIELDS) assert.ok(g.hazardDisplay.evidence.some(x=>x.startsWith(field)));
  assert.match(g.hazardDisplay.evidence.join(' '),/target_yearはありません/);
  assert.ok(!g.lines.join(' ').includes('2099'));assert.match(g.hazardDisplay.details.join(' '),/2018\/03\/15/);
  assert.ok(!g.hazardDisplay.overview.join(' ').includes('2024年度'));
});
test('Landslide: local endpoint, cache/expiry and failure distinct from NO_DATA',async()=>{
  let calls=0,clock=0;
  const p=createProvider({now:()=>clock,fetchImpl:async url=>{assert.match(url,/^\/api\/landslide\?z=14&x=/);calls++;return {ok:true,json:async()=>fc(feature())};}});
  assert.equal((await p.identify(point)).status,'READY');await p.identify(point);assert.equal(calls,1);
  clock=300001;await p.identify(point);assert.equal(calls,2);
  assert.equal((await createProvider({fetchImpl:async()=>{throw Error('offline');}}).identify(point)).status,'UNAVAILABLE');
  assert.equal((await createProvider({fetchImpl:async()=>({ok:true,json:async()=>[]})}).identify(point)).status,'NO_DATA');
});
test('Landslide: same-tile sharing, abort/stale cache protection and latest click wins',async()=>{
  const calls=[];const p=createProvider({fetchImpl:(url,{signal})=>new Promise(resolve=>calls.push({signal,resolve}))});
  let version=0,shown;
  const click=async point=>{const v=++version;const result=await p.identify(point);if(gate.acceptResult(v,version,true)) shown=result;};
  const old=click(point),same=p.identify(point);assert.equal(calls.length,1);
  const latest=click({lat:36,lng:137});assert.equal(calls[0].signal.aborted,true);
  calls[1].resolve({ok:true,json:async()=>fc()});await latest;assert.equal(shown.status,'NO_DATA');
  calls[0].resolve({ok:true,json:async()=>fc(feature())});await old;assert.equal((await same).status,'UNAVAILABLE');assert.equal(shown.status,'NO_DATA');
  const next=p.identify(point);assert.equal(calls.length,3);p.cancel();calls[2].resolve({ok:true,json:async()=>fc()});assert.equal((await next).status,'UNAVAILABLE');
});
