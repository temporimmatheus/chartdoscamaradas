const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const Core=require('../chart-core.js');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.attrs={};this.dataset={};this.events={};this._value='';this.hidden=false;this.disabled=false;this.style={setProperty(){}};}
  set value(v){this._value=String(v)} get value(){return this._value}
  setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]??null}removeAttribute(k){delete this.attrs[k]}
  addEventListener(k,fn){(this.events[k]??=[]).push(fn)}
  emit(k,extra={}){for(const fn of this.events[k]||[])fn({target:this,preventDefault(){},...extra})}
  append(...nodes){for(const node of nodes){if(node.tag==='#fragment'){this.append(...[...node.children]);node.children=[];}else{node.remove?.();node.parent=this;this.children.push(node)}}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes)}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}}
  focus(){this.focused=true}click(){this.clicked=(this.clicked||0)+1;this.emit('click')}showModal(){this.open=true}close(){this.open=false}
}
const tick=()=>new Promise(setImmediate);
const albums=count=>Array.from({length:count},(_,i)=>({rank:i+1,name:`Album ${i}`,artist:'Artist',image:'',url:'',playcount:4}));
function app(exporter){
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),els={};
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const element=new Element(match[1]);element.hidden=/\bhidden\b/.test(match[2]);els[match[3]]=element;
  }
  const presets=[3,5,10].map(n=>{const b=new Element('button');b.dataset.size=String(n);return b});
  const pending=[],window=new Element('window');
  const context={ChartCore:Core,LastfmClient:{createClient:()=>({getAlbums:config=>new Promise((resolve,reject)=>pending.push({config,resolve,reject}))})},
    ChartExporter:exporter||{},document:{getElementById:id=>els[id],querySelectorAll:()=>presets,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')},
    localStorage:{getItem:()=>null,setItem(){}},window,navigator:{},URL,AbortController,DOMException,Intl,console,File,Blob};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../script.js'),'utf8'),context);
  els.username.value='user';return {els,pending,presets,window,context};
}
async function generate(a,count=25){a.els['chart-form'].emit('submit');assert.ok(a.pending.length);a.pending.at(-1).resolve({albums:albums(count),total:count});await tick();}
test('generate reveals the grid, hides the empty state, and enables download',async()=>{
  const a=app();await generate(a);
  assert.equal(a.els['chart-grid'].hidden,false);assert.equal(a.els['empty-state'].hidden,true);
  assert.equal(a.els['chart-grid'].children.length,25);assert.equal(a.els['export-btn'].disabled,false);
  assert.equal(a.els['chart-user'].textContent,'@user');
});
test('older results cannot replace the currently selected period',async()=>{
  const a=app();a.els['chart-form'].emit('submit');a.els.period.value='7day';a.els.period.emit('change');
  a.pending[1].resolve({albums:[{...albums(1)[0],name:'Weekly'}]});await tick();
  a.pending[0].resolve({albums:[{...albums(1)[0],name:'Monthly'}]});await tick();
  const button=a.els['chart-grid'].children[0].children[0];
  assert.equal(button.children[2].textContent,'Weekly');assert.match(a.els['chart-meta'].textContent,/7 dias/);
});
test('duplicate submit is deduplicated even without native disabled-button handling',()=>{
  const a=app();a.els['chart-form'].emit('submit');a.els['chart-form'].emit('submit');assert.equal(a.pending.length,1);
});
test('an empty response keeps download disabled and explains the empty chart',async()=>{
  const a=app();await generate(a,0);assert.equal(a.els['export-btn'].disabled,true);assert.equal(a.els['empty-state'].hidden,false);assert.equal(a.els['chart-grid'].hidden,true);
});
test('failure clears previous data so resize cannot resurrect a stale chart',async()=>{
  const a=app();await generate(a);a.els.period.value='7day';a.els.period.emit('change');a.pending.at(-1).reject(new Error('offline'));await tick();
  a.els.cols.value='6';a.els.cols.emit('change');await tick();
  assert.equal(a.els['chart-grid'].children.length,0);assert.equal(a.els['export-btn'].disabled,true);assert.equal(a.pending.length,2);
});
test('changing identity disables exporting the previous user and cancels pending responses',async()=>{
  const a=app();await generate(a);a.els.username.value='different';a.els.username.emit('input');
  assert.equal(a.els['export-btn'].disabled,true);assert.equal(a.els['chart-user'].textContent,'@user');
});
test('growing the grid requests the required number of albums',async()=>{
  const a=app();await generate(a);a.els.cols.value='6';a.els.rows.value='6';a.els.cols.emit('change');
  assert.equal(a.pending.at(-1).config.limit,36);a.pending.at(-1).resolve({albums:albums(36)});await tick();
  assert.equal(a.els['chart-grid'].children.length,36);
});
test('invalid dimension changes cannot bypass the limit or enable export',async()=>{
  const a=app();await generate(a);a.els.cols.value='21';a.els.cols.emit('change');assert.equal(a.pending.length,1);assert.equal(a.els['export-btn'].disabled,true);assert.equal(a.els.error.hidden,false);
});
test('export is exclusive, preserves identity, and leaves a manual save link',async()=>{
  let resolve,renders=0;const a=app({render:()=>{renders++;return new Promise(r=>{resolve=r})},toBlob:async()=>new Blob(['PNG'],{type:'image/png'})});
  await generate(a);a.els['export-btn'].emit('click');a.els['export-btn'].emit('click');
  assert.equal(renders,1);assert.equal(a.els['settings-fields'].disabled,true);
  resolve({canvas:{width:10,height:10},missing:0});await tick();await tick();
  assert.equal(a.els['download-link'].hidden,false);assert.match(a.els['download-link'].download,/user-1month-5x5/);assert.equal(a.els['settings-fields'].disabled,false);
  a.window.emit('pagehide');
});
