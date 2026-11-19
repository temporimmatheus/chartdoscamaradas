const test=require('node:test');const assert=require('node:assert/strict');
const Exporter=require('../chart-export.js');
function canvas(){const calls=[];const ctx=new Proxy({measureText:s=>({width:String(s).length*8})},{get(target,key){return target[key]||((...args)=>calls.push([key,...args]))}});return {width:0,height:0,calls,getContext:()=>ctx};}
const snapshot={username:'user',period:'1month',cols:5,rows:5,albums:Array.from({length:25},(_,i)=>({rank:i+1,name:'Album '+i,artist:'Artist',image:'https://example.com/'+i}))};
test('cover failures produce a complete PNG layout with bounded parallel work',async()=>{
  let active=0,max=0,done=0;const output=canvas();
  const result=await Exporter.render(snapshot,{createCanvas:()=>output,imageLoader:async()=>{active++;max=Math.max(max,active);await new Promise(setImmediate);active--;return null},onProgress:()=>done++});
  assert.equal(result.missing,25);assert.equal(done,25);assert.ok(max<=6);assert.ok(output.calls.some(c=>c[0]==='fillText'&&c[1]==='Album 0'));
  assert.ok(output.calls.some(c=>c[0]==='fillText'&&c[1]==='@user'));
  assert.ok(!output.calls.some(c=>c[0]==='fillText'&&c[1]==='amigos do mati'));
});
test('non-square covers are cropped to a square',async()=>{
  const output=canvas();await Exporter.render({...snapshot,cols:1,rows:1,albums:snapshot.albums.slice(0,1)},{createCanvas:()=>output,imageLoader:async()=>({naturalWidth:400,naturalHeight:200})});
  const drawing=output.calls.find(c=>c[0]==='drawImage');assert.deepEqual(drawing.slice(2,6),[100,0,200,200]);
});
test('cancel stops exporting and releases the canvas',async()=>{
  const controller=new AbortController(),output=canvas();
  await assert.rejects(Exporter.render(snapshot,{signal:controller.signal,createCanvas:()=>output,imageLoader:async()=>{controller.abort();return null}}),{name:'AbortError'});
  assert.equal(output.width,0);assert.equal(output.height,0);
});
test('a global cover deadline stops slow work and keeps placeholders',async()=>{
  const result=await Exporter.render(snapshot,{imageBudgetMs:5,createCanvas:canvas,imageLoader:(url,signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve(null),{once:true}))});
  assert.equal(result.missing,25);
});
test('empty export, unsupported canvas and null PNG blobs are recoverable',async()=>{
  await assert.rejects(Exporter.render({...snapshot,albums:[]}),/antes de exportar/);
  await assert.rejects(Exporter.render(snapshot,{createCanvas:()=>({getContext:()=>null})}),/navegador/);
  await assert.rejects(Exporter.toBlob({toBlob:callback=>callback(null)}),/qualidade padrão/);
});
