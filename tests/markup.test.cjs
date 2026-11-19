const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('every app control and ARIA reference exists in the document',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g))for(const id of match[1].split(' '))assert.ok(ids.includes(id),`missing aria target ${id}`);
  const js=fs.readFileSync(path.join(root,'script.js'),'utf8');
  const controls=js.match(/Object\.fromEntries\(\[([^\]]+)\]/)[1];
  for(const match of controls.matchAll(/'([^']+)'/g))assert.ok(ids.includes(match[1]),`missing UI element ${match[1]}`);
});
test('all local script, style and icon references are packaged',()=>{
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
    const url=match[1];if(url.startsWith('https:')||url==='./')continue;
    assert.ok(fs.existsSync(path.join(root,url.split('?')[0])),`missing asset ${url}`);
  }
});
test('UI uses lowercase copy and no redundant preview instructions',()=>{
  for(const match of html.matchAll(/>([^<>]+)</g))assert.equal(match[1],match[1].toLocaleLowerCase('pt-BR'));
  assert.doesNotMatch(html,/a visualização não altera|toque em um disco|sua trilha sonora|qual fase/i);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'script.js'),'utf8'),/preview-hint|renderViewHint/);
});
