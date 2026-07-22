import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/panel-extension.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/panel-extension.css',import.meta.url),'utf8');

test('个人简历页统一为返回按钮和居中标题且默认回到 Agent 首页',()=>{
  const view=source.slice(source.indexOf('const originalPersonalResumesView'),source.indexOf("const ROLE_NAME="));
  assert.match(view,/const back=state\.resumeReturnRoute==='create-plan'\?'create-plan':'agent-chat'/);
  assert.match(view,/topbar\('个人简历',back\)/);
  assert.doesNotMatch(view,/topbar\('个人简历',back,`/);
});

test('个人简历页把数量和编辑提示放入内容层级而不是顶部胶囊',()=>{
  const view=source.slice(source.indexOf('const originalPersonalResumesView'),source.indexOf("const ROLE_NAME="));
  assert.match(view,/clean-resumes-page/);
  assert.match(view,/resume-clean-overview/);
  assert.match(view,/已保存简历/);
  assert.match(view,/简历内容/);
  assert.match(view,/点击展开编辑/);
});

test('个人简历页使用黑白灰扁平列表并移除紫色选中边框',()=>{
  const styles=css.slice(css.indexOf('/* Personal resumes:'),css.indexOf('/* voice-chat：'));
  assert.match(styles,/\.resume-card\.active\{[^}]*border:0!important[^}]*background:#f3f3f1!important/s);
  assert.match(styles,/\.manual-section\{[^}]*border:0!important[^}]*border-bottom:1px solid/s);
  assert.match(styles,/\.resume-upload\{[^}]*background:#151515!important[^}]*color:#fff!important/s);
  assert.match(styles,/\.personal-resumes-page \.clean-resumes-page \.method-icon\{[^}]*background:#e6e6e2!important[^}]*color:#3f3f3c!important/s);
  assert.match(styles,/\.personal-resumes-page \.clean-resumes-page \.method-icon svg\{[^}]*stroke:currentColor!important/s);
  assert.match(styles,/\.personal-resumes-page \.manual-section-body input[^}]*background:#f7f7f5!important[^}]*box-shadow:none!important/s);
  assert.doesNotMatch(styles,/gradient|glow|#7c3aed|#8b5cf6/i);
});
