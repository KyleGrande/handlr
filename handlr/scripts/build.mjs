import { mkdir, readFile, writeFile } from 'node:fs/promises';

const controls = 'workspace-prototype';
const block = (id, mod, extra = {}) => ({ id, type: 'block', content: { mod }, ...extra });
const section = (id, mod, title, weight = 1) => ({
  id, type: 'column', title, min: 28, size: { weight }, resizable: false,
  children: [
    block(`${id}-header`, controls, {
      size: { px: 28 }, content: { mod: controls, props: { role: 'section', section: id, body: `${id}-body`, title } }
    }),
    block(`${id}-body`, mod, { min: 0 })
  ]
});
const group = (id, views, weight = 1) => ({
  id, type: 'stack', active: views[0].id, size: { weight }, min: 56,
  header: { content: 'tabs', height: 30, position: 'top' }, children: views
});
const divider = { width: 1, color: 'border' };
const layout = {
  id: 'prototype-root', type: 'row', titlebar: 'system', background: 'canvas',
  preview: 'layouts/panel-workspace-prototype.svg', divider,
  children: [
    {
      id: 'prototype-left', type: 'column', size: { px: 320 }, min: 180, max: 720, divider,
      children: [
        group('prototype-code-group', [
          { id: 'prototype-code', type: 'column', title: 'Code', divider,
            children: [section('prototype-changes', 'changes', 'Changes'), section('prototype-files', 'files', 'Files', 2)] },
          { ...section('prototype-context', 'context', 'Context'), title: 'Context' }
        ], 3),
        group('prototype-navigation-group', [
          { ...section('prototype-spaces', 'spaces', 'Spaces'), title: 'Spaces' },
          { ...section('prototype-agents', 'agents', 'Agents'), title: 'Agents' }
        ], 2)
      ]
    },
    {
      id: 'prototype-center', type: 'column', min: 200, resizable: false,
      children: [
        block('prototype-center-tabs', controls, { size: { px: 38 }, content: { mod: controls, props: { role: 'tabs' } } }),
        { id: 'prototype-active-tab', type: 'block', content: { tab: 'active', pane: {
          header: { content: { mod: 'pane' }, height: 30, position: 'top', reveal: 'always' },
          border: { width: 1, color: 'border' }, focus: { width: 1, color: 'accent' }, radius: 6, gap: 6, lone: true
        } } }
      ]
    },
    {
      id: 'prototype-right', type: 'column', size: { px: 320 }, min: 180, max: 720, divider,
      children: [
        group('prototype-toolbox-group', [{ ...section('prototype-toolbox', 'toolbox', 'Toolbox'), title: 'Toolbox' }]),
        group('prototype-rigs-group', [{ ...section('prototype-rigs', 'rigs', 'Rigs'), title: 'Rigs' }])
      ]
    }
  ]
};
await mkdir(new URL('../prototype/layouts/', import.meta.url), { recursive: true });
await writeFile(new URL('../prototype/layouts/panel-workspace-prototype.json', import.meta.url), JSON.stringify(layout, null, 2) + '\n');
// Versioned document for the native host adapter; kept separate from the
// legacy-renderer prototype. Original mod props/namespaces are preserved.
const workspace = { version:1, panels:{}, groups:[], zones:[], floating:[], focused_panel_id:null };
for (const [edge, zone] of [['left',layout.children[0]],['right',layout.children[2]]]) {
  const references=[];
  for (const group of zone.children) {
    const views=group.children.map(view=>({ id:view.id,title:view.title,sections:
      (view.children[0].content?.mod===controls ? [view] : view.children).map(section=>{
        const body=section.children.find(child=>child.id.endsWith('-body'));
        workspace.panels[body.id]={ id:body.id,content:{kind:'mod',name:body.content.mod,props:body.content.props??null,duplicable:false},
          binding:{kind:'follow_active'},storage_namespace:null };
        return {id:`${section.id}-section`,panel_id:body.id,collapsed:false,weight:section.size?.weight??1,min_extent:72};
      }) }));
    workspace.groups.push({id:group.id,active_view_id:group.active,views});
    references.push({group_id:group.id,weight:group.size.weight});
  }
  workspace.zones.push({edge,extent:zone.size.px,hidden:false,groups:references});
}
for (const edge of ['top','bottom','top_center','bottom_center']) workspace.zones.push({edge,extent:200,hidden:true,groups:[]});
await mkdir(new URL('../prototype/workspaces/',import.meta.url),{recursive:true});
await writeFile(new URL('../prototype/workspaces/panel-workspace-native.json',import.meta.url),JSON.stringify(workspace,null,2)+'\n');
// Keep the native workspace's center layout available independently of packaging.
const main = JSON.parse(await readFile(new URL('../../defaults/layouts/main.json', import.meta.url), 'utf8'));
const tabs = structuredClone(main.children[1].children[0]); tabs.id = '@workspace/tabs';
const body = structuredClone(main.children[1].children[1]); body.id = '@workspace/terminal-body';
body.children = [body.children[0]]; body.children[0].id = '@workspace/active-tab';
const nativeLayout = {
  id: '@workspace/center', workspace: 'panel-workspace-native', type: 'column', resizable: false,
  preview: 'layouts/panel-workspace-native.svg',
  background: main.background, terminal_padding: main.terminal_padding, children: [tabs, body]
};
await writeFile(new URL('../prototype/layouts/panel-workspace-native.json', import.meta.url), JSON.stringify(nativeLayout, null, 2) + '\n');
console.log('Built prototype/layouts/panel-workspace-prototype.json');
console.log('Built prototype/layouts/panel-workspace-native.json and workspace document');
