import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const drawerSource=source.slice(source.indexOf('function appDrawer()'),source.indexOf('bottomNav=function'));

test('侧栏功能入口只显示文字，不渲染左侧图标',()=>{
  assert.doesNotMatch(drawerSource,/drawerIcon\(/);
  assert.doesNotMatch(drawerSource,/<svg\b/);
});

test('侧栏只负责导航和历史，不重复 Agent 首页的创建入口',()=>{
  assert.doesNotMatch(drawerSource,/item\('create-job','创建模拟面试'\)/);
  assert.doesNotMatch(drawerSource,/item\('role-create','场景练习'\)/);
  assert.match(drawerSource,/item\('home','练习记录'\)/);
  assert.match(drawerSource,/item\('mistakes','错题回顾'\)/);
  assert.match(drawerSource,/app-drawer-recent/);
});

test('从侧栏打开一级页面时记录返回首页对话的来源',()=>{
  assert.match(source,/state\.drawerEntryRoute\s*=\s*target===['"]agent-chat['"]\?['"]['"]:target/);
});

test('侧栏一级页面的返回按钮回到 SpeakUp 首页对话',()=>{
  assert.match(source,/drawerEntryRoute===state\.route/);
  assert.match(source,/go\(['"]agent-chat['"]\)/);
});
