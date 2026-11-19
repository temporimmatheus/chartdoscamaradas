const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../chart-core.js');

test('all entry points reject out-of-range, missing and fractional dimensions', () => {
  for (const [cols, rows] of [[21,1],[-2,5],[0,5],['',5],[' ',5],[2.8,5],[5,Infinity],[5,'oops']]) {
    assert.throws(() => Core.dimensions(cols, rows));
    assert.throws(() => Core.config({ username:'user', period:'1month', cols, rows }));
    assert.throws(() => Core.exportLayout(cols, rows));
  }
  assert.deepEqual(Core.dimensions('20','20'), {cols:20, rows:20, limit:400});
});
test('every allowed grid fits the output pixel and edge limits', () => {
  for (const quality of ['standard','high']) for (let c=1;c<=20;c++) for (let r=1;r<=20;r++) {
    const layout = Core.exportLayout(c,r,quality);
    assert.ok(layout.width*layout.height <= (quality==='high'?4_000_000:2_000_000));
    assert.ok(Math.max(layout.width,layout.height) <= (quality==='high'?4096:2400));
    assert.ok(layout.width>0 && layout.height>0);
  }
});
test('newer searches invalidate old responses and cancellation invalidates the current one', () => {
  const gate=Core.createRequestGate(), first=gate.start('monthly'), second=gate.start('weekly');
  assert.equal(first.controller.signal.aborted,true);
  assert.equal(gate.isCurrent(first),false); assert.equal(gate.isCurrent(second),true);
  gate.finish(first); assert.equal(gate.active(),second);
  gate.cancel(); assert.equal(gate.isCurrent(second),false);
});
test('configuration identity and filenames use the loaded chart', () => {
  const config=Core.config({username:' User ',period:'7day',cols:'5',rows:'5'});
  assert.equal(Core.matches(config,{...config,username:'user'}),true);
  assert.equal(Core.matches(config,{...config,period:'1month'}),false);
  assert.match(Core.filename(config),/^lastfm-User-7day-5x5\.png$/);
  assert.throws(()=>Core.config({...config,username:'https://last.fm/user/x'}));
  assert.throws(()=>Core.config({...config,period:'invalid'}));
});
test('malformed or blocked saved preferences fall back safely', () => {
  assert.equal(Core.readPreferences({getItem(){throw new Error('blocked')}}).cols,5);
  assert.equal(Core.readPreferences({getItem:()=>'{broken'}).period,'1month');
  assert.equal(Core.readPreferences({getItem:()=>JSON.stringify({cols:999,rows:-2,period:'oops',view:'detail'})}).cols,5);
});
test('unsafe external links and known missing covers do not enter the UI or export', () => {
  const album=Core.normalizeAlbum({name:'<b>Album</b>',artist:{name:'Artist'},playcount:'12',url:'javascript:alert(1)',image:[{size:'large','#text':'javascript:alert(1)'}]},0);
  assert.equal(album.image,''); assert.equal(album.url,''); assert.equal(album.name,'<b>Album</b>');
  assert.equal(Core.safeURL('https://last.fm.evil.example/a',true),'');
  assert.equal(Core.normalizeAlbum(null,0),null);
});
