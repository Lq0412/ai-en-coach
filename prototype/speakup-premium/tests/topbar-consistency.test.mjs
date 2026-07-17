import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('二级页面顶部统一为左侧返回、居中标题且无下划线',()=>{
  const section=css.slice(css.indexOf('/* Unified secondary page header. */'));
  assert.match(section,/\.align-page \.topbar\{[^}]*display:grid[^}]*grid-template-columns:44px minmax\(0,1fr\) 44px/s);
  assert.match(section,/\.align-page \.topbar\{[^}]*border-bottom:0/s);
  assert.match(section,/\.align-page \.topbar h2\{[^}]*text-align:center/s);
  assert.match(section,/\.align-page \.topbar \.ghost-icon\{[^}]*border:0[^}]*background:transparent/s);
});
