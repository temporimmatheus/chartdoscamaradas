const test=require('node:test');
const assert=require('node:assert/strict');
const {createClient}=require('../lastfm.js');
const response=top=>({ok:true,json:async()=>({topalbums:top})});
const album=i=>({name:`Album ${i}`,artist:{name:'Artist'},image:[],playcount:'1'});
test('growing a chart obtains missing albums and shrinking uses cached data',async()=>{
  const calls=[];const client=createClient({apiKey:'test',fetchImpl:async url=>{
    const q=new URL(url).searchParams; calls.push(q);const size=Number(q.get('limit'));
    return response({album:Array.from({length:size},(_,i)=>album(i)), '@attr':{total:'1000'}});
  }});
  const input={username:'user',period:'1month'};
  assert.equal((await client.getAlbums({...input,limit:25})).albums.length,25);
  assert.equal((await client.getAlbums({...input,limit:36})).albums.length,36);
  assert.equal((await client.getAlbums({...input,limit:9})).cached,true);
  assert.equal(calls.length,2);
});
test('400 albums are paginated with consistent page size and ranks',async()=>{
  const calls=[]; const client=createClient({apiKey:'test',fetchImpl:async url=>{
    const q=new URL(url).searchParams,page=Number(q.get('page'));calls.push(page);
    return response({album:Array.from({length:100},(_,i)=>album((page-1)*100+i)),'@attr':{total:'400',totalPages:'4'}});
  }});
  const result=await client.getAlbums({username:'user',period:'overall',limit:400});
  assert.equal(result.albums.length,400);assert.equal(result.albums[399].rank,400);assert.deepEqual(calls,[1,2,3,4]);
});
test('exhausted and empty results are cached without inventing albums',async()=>{
  let calls=0;const client=createClient({apiKey:'test',fetchImpl:async()=>{calls++;return response({album:[],'@attr':{total:'0'}})}});
  const input={username:'user',period:'7day'};
  assert.equal((await client.getAlbums({...input,limit:25})).albums.length,0);
  assert.equal((await client.getAlbums({...input,limit:400})).albums.length,0);assert.equal(calls,1);
});
test('a late aborted response cannot populate the cache',async()=>{
  let resolve,calls=0;const client=createClient({apiKey:'test',fetchImpl:()=>{calls++;return new Promise(r=>{resolve=r})}});
  const controller=new AbortController();const input={username:'user',period:'7day',limit:1};
  const pending=client.getAlbums({...input,signal:controller.signal});controller.abort();resolve(response({album:[album(1)]}));
  await assert.rejects(pending,{name:'AbortError'});
  const next=client.getAlbums(input);resolve(response({album:[album(2)]}));await next;assert.equal(calls,2);
});
test('request timeout is recovered as a useful error',async()=>{
  const client=createClient({apiKey:'test',timeoutMs:5,fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
  await assert.rejects(client.getAlbums({username:'user',period:'7day',limit:1}),/demorou/);
});
test('API, HTTP, malformed and offline errors are handled',async()=>{
  for(const [fetchImpl,pattern] of [
    [async()=>({ok:true,json:async()=>({error:29})}),/Muitas buscas/],
    [async()=>({ok:false,status:429}),/Muitas buscas/],
    [async()=>({ok:true,json:async()=>({})}),/inesperados/],
    [async()=>{throw new TypeError('offline')},/conexão/]
  ]) await assert.rejects(createClient({apiKey:'test',fetchImpl}).getAlbums({username:'user',period:'7day',limit:1}),pattern);
});
test('cache expires and explicit refresh bypasses it',async()=>{
  let now=0,calls=0;const client=createClient({apiKey:'test',now:()=>now,ttlMs:100,fetchImpl:async()=>{calls++;return response({album:[album(calls)]})}});
  const input={username:'user',period:'7day',limit:1};
  await client.getAlbums(input);await client.getAlbums(input);assert.equal(calls,1);
  now=101;await client.getAlbums(input);assert.equal(calls,2);
  await client.getAlbums({...input,refresh:true});assert.equal(calls,3);
});
