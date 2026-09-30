const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../area-canvas/js/flood-identify-domain.js');
require('../../area-canvas/js/flood-identify.js');
const domain = require('../../area-canvas/js/coastal-identify-domain.js');
const { createProvider } = require('../../area-canvas/js/coastal-identify.js');
const gate = require('../../area-canvas/js/decision-inspector-domain.js');
const point = {lat:35,lng:136};
const ring = [[135,34],[137,34],[137,36],[135,36],[135,34]];
const hole = [[135.5,34.5],[136.5,34.5],[136.5,35.5],[135.5,35.5],[135.5,34.5]];
const collection = (...features) => ({type:'FeatureCollection',features});
for (const kind of ['storm-surge','tsunami']) {
  const prefix=kind==='storm-surge'?'A49':'A40';
  const properties = {[`${prefix}_001`]:'愛知県',[`${prefix}_002`]:'23',[`${prefix}_003`]:'3m以上5m未満',target_year:2022};
  const feature = (geometry={type:'Polygon',coordinates:[ring]}, props=properties) => ({type:'Feature',geometry,properties:props});
  test(`${kind}: source-specific XYZ bounds and fields`,()=>{
    assert.deepEqual(domain.tileFor(kind,point),{z:14,x:14381,y:6489});
    if(kind==='storm-surge') assert.deepEqual(domain.tileFor(kind,point,13),{z:13,x:7190,y:3244});
    else assert.throws(()=>domain.tileFor(kind,point,13));
    assert.throws(()=>domain.tileFor(kind,point,16));
    assert.throws(()=>domain.tileFor(kind,{lat:90,lng:0}));
    assert.equal(domain.normalizeProperties(kind,properties).depth,'3m以上5m未満');
    assert.equal(domain.normalizeProperties(kind,{A31a_205:2}).depth,null);
  });
  test(`${kind}: Polygon hit/miss, MultiPolygon and holes`,()=>{
    assert.equal(domain.identify(kind,collection(feature()),point).status,'READY');
    assert.equal(domain.identify(kind,collection(feature()),{lat:33,lng:136}).status,'NO_DATA');
    assert.equal(domain.identify(kind,collection(feature({type:'Polygon',coordinates:[ring,hole]})),point).status,'NO_DATA');
    assert.equal(domain.identify(kind,collection(feature({type:'MultiPolygon',coordinates:[[ring,hole],[ring]]})),point).status,'READY');
    assert.equal(domain.identify(kind,collection(feature()),{lat:34,lng:136}).status,'PARTIAL');
  });
  test(`${kind}: multiple Features and response years are preserved individually`,()=>{
    const result=domain.identify(kind,collection(feature(),feature(undefined,{...properties,target_year:2020})),point);
    assert.equal(result.hits.length,2);assert.equal(result.status,'READY');
    assert.deepEqual(result.hits.map(x=>x.targetYear),[2022,2020]);
    const g=domain.toGroup(kind,result);
    assert.match(g.hazardDisplay.overview[0],/2件/);
    assert.equal(g.hazardDisplay.overview.filter(x=>x==='浸水深：3m以上5m未満').length,2);
    assert.match(g.hazardDisplay.evidence.join(' '),new RegExp(`${prefix}_003`));
    assert.match(g.hazardDisplay.evidence.join(' '),/2024年度.*対象年とは区別/);
    assert.match(g.hazardDisplay.details.join(' '),/2022.*2020/);
    assert.equal(g.links.length,3);
  });
  test(`${kind}: unknown depth/code, missing or mistyped attributes remain PARTIAL`,()=>{
    for(const depth of [2,'99','UNKNOWN',null]) {
      const result=domain.identify(kind,collection(feature(undefined,{...properties,[`${prefix}_003`]:depth})),point);
      assert.equal(result.status,'PARTIAL');assert.equal(result.hits[0].depth,null);
      if(depth!==null) assert.match(domain.toGroup(kind,result).hazardDisplay.evidence.join(' '),new RegExp(String(depth)));
    }
    assert.equal(domain.identify(kind,collection(feature(undefined,{...properties,[`${prefix}_002`]:'99'})),point).status,'PARTIAL');
    assert.equal(domain.identify(kind,collection(feature(undefined,{...properties,target_year:'2022'})),point).status,'PARTIAL');
  });
  test(`${kind}: empty versus malformed data and mixed invalid Feature fail closed`,()=>{
    assert.equal(domain.identify(kind,[],point).status,'NO_DATA');
    assert.equal(domain.identify(kind,collection(),point).status,'NO_DATA');
    for(const body of [null,{},[feature()],collection(null)]) assert.equal(domain.identify(kind,body,point).status,'UNAVAILABLE');
    assert.equal(domain.identify(kind,collection(feature(),null),point).status,'PARTIAL');
    assert.match(domain.toGroup(kind,domain.identify(kind,[],point)).hazardDisplay.overview.join(' '),/浸水しないことを意味しません/);
    assert.match(domain.toGroup(kind,domain.identify(kind,null,point)).hazardDisplay.overview.join(' '),/区域外とは判定していません/);
  });
  test(`${kind}: local provider cache, expiry and unavailable are distinct from NO_DATA`,async()=>{
    let calls=0,url,clock=0;
    const provider=createProvider(kind,{now:()=>clock,fetchImpl:async u=>{calls++;url=u;return {ok:true,json:async()=>collection(feature())};}});
    assert.equal((await provider.identify(point)).status,'READY');await provider.identify(point);
    assert.equal(calls,1);assert.match(url,new RegExp(`^/api/${kind}\\?z=14&x=`));
    clock=300001;await provider.identify(point);assert.equal(calls,2);
    const offline=createProvider(kind,{fetchImpl:async()=>{throw Error('offline');}});
    assert.equal((await offline.identify(point)).status,'UNAVAILABLE');
    const empty=createProvider(kind,{fetchImpl:async()=>({ok:true,json:async()=>[]})});
    assert.equal((await empty.identify(point)).status,'NO_DATA');
  });
  test(`${kind}: cache shares in-flight work, Abort prevents stale response and latest click wins`,async()=>{
    const calls=[];
    const provider=createProvider(kind,{fetchImpl:(url,{signal})=>new Promise(resolve=>calls.push({signal,resolve}))});
    let version=0,shown=null;
    const click=async p=>{const request=++version;const result=await provider.identify(p);if(gate.acceptResult(request,version,true)) shown=result;};
    const first=click(point),shared=provider.identify(point);assert.equal(calls.length,1);
    const second=click({lat:36,lng:137});assert.equal(calls[0].signal.aborted,true);
    calls[1].resolve({ok:true,json:async()=>collection()});await second;assert.equal(shown.status,'NO_DATA');
    calls[0].resolve({ok:true,json:async()=>collection(feature())});await first;
    assert.equal((await shared).status,'UNAVAILABLE');assert.equal(shown.status,'NO_DATA');
    const next=provider.identify(point);assert.equal(calls.length,3);provider.cancel();
    calls[2].resolve({ok:true,json:async()=>collection()});assert.equal((await next).status,'UNAVAILABLE');
  });
}
test('Coastal provider rejects unsupported hazard rather than connecting another API',()=>{
  assert.throws(()=>createProvider('landslide'));
});
