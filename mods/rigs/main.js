// Generated from main.ts by npm run build:mod.
import { setupPrompt } from './setup.js';
import { View, div, svg } from 'gpui-kit';
import { v_flex, h_flex, Input, InputState, Editor, EditorState } from 'gpui-base';
import { appHome, exec, focused, panes, theme, run, props, pickFolder, writeTextFile, layout, spaces, openOverlay, closeOverlay } from 'herdr';
// Namespace access keeps this mod compatible with Herdr versions without panel().
import * as WorkspaceHost from 'herdr';
const workspacePanel = () => WorkspaceHost.panel?.() ?? null;
function localCheckout() {
    const context = focused();
    const list = spaces(), space = list.find(space => space.id === context?.space) ?? list.find(space => space.active);
    if (context?.terminal?.includes('/') || space?.machine)
        return null;
    const pane = context?.pane ? panes().find(pane => pane.pane === context.pane) : undefined;
    return pane?.cwd || context?.cwd || space?.folder || null;
}
export default class Rigs extends View {
    data = { core: 'loading', rigs: [], observed_at: '' };
    setupCheckout = '';
    guide = '';
    menuMode = false;
    createMode = false;
    menuLoaded = false;
    profiles = [];
    tools = false;
    refreshError = '';
    actionError = '';
    busy = false;
    checkoutOnly = true;
    paused = false;
    requestedScope;
    dataScope;
    preview = null;
    selected = '';
    repoSlots = [];
    selections = {};
    decisionInputs = {};
    name;
    profile;
    cli = '';
    cliArgs = [];
    previewName = '';
    showStopped = false;
    previewMode = false;
    modName = 'rigs';
    headerHovered = false;
    hoveredRow = '';
    controlKey = '';
    controlOperation = '';
    observing = false;
    observationError = '';
    contextMode = '';
    deleteMode = false;
    profileMode = false;
    editRig = '';
    definition = null;
    profileDocument = null;
    profileEditor;
    loadedProfile = '';
    managementLoading = false;
    profileRigNames = [];
    collapsed = new Set();
    init(_props, cx) {
        this.cli = String(props()?.cli ?? 'rig');
        this.cliArgs = []; // Installer supplies the absolute CLI module.
        this.guide = ''; // Installer supplies the agent guide.
        if (typeof props()?.guide === 'string')
            this.guide = props().guide;
        if (Array.isArray(props()?.cliArgs))
            this.cliArgs = props().cliArgs.map(String);
        if (props()?.view === 'preview') {
            this.previewMode = true;
            this.cliArgs = Array.isArray(props()?.cliArgs) ? props().cliArgs.map(String) : this.cliArgs;
            this.previewName = String(props().rig);
            this.loadDefinition(this.previewName, cx);
            if (props().plan) {
                this.setPreview(props().plan, this.previewName);
                this.refreshPreviewApps(cx);
            }
            else
                this.action('plan', this.previewName, cx);
            cx.timer.every(5000, cx => this.refreshPreviewApps(cx));
            return;
        }
        this.name = InputState.new({ placeholder: 'Rig name' });
        this.profile = InputState.new({ placeholder: 'Absolute profile.json path' });
        if (props()?.view === 'rig-menu' || props()?.view === 'profile-menu') {
            this.contextMode = String(props().view);
            if (this.contextMode === 'rig-menu')
                this.loadDefinition(String(props().rig), cx);
            return;
        }
        if (props()?.view === 'delete') {
            this.deleteMode = true;
            if (props().target === 'rig')
                this.loadDefinition(String(props().rig), cx);
            else
                this.loadProfileDocument(String(props().profilePath), cx);
            return;
        }
        if (props()?.view === 'profile-editor') {
            this.profileMode = true;
            this.profileEditor = EditorState.new({ language: 'json', value: '', readonly: false });
            this.loadProfileDocument(String(props().profilePath), cx);
            return;
        }
        if (props()?.view === 'new-menu') {
            this.menuMode = true;
            this.setupCheckout = String(props()?.checkout ?? '');
            this.loadProfiles(cx);
            return;
        }
        if (props()?.view === 'create' || props()?.view === 'edit') {
            this.createMode = true;
            if (props().view === 'edit') {
                this.editRig = String(props().rig);
                this.loadDefinition(this.editRig, cx, true);
                return;
            }
            this.name.set_value(String(props()?.suggestedName ?? ''));
            this.profile.set_value(String(props()?.profilePath ?? ''));
            this.selections = props()?.selections ?? {};
            if (this.profile.value())
                this.loadProfile(cx, true);
            return;
        }
        this.selected = localStorage.getItem('selected') ?? '';
        this.checkoutOnly = localStorage.getItem('scope') !== 'all';
        try {
            const saved = JSON.parse(localStorage.getItem('collapsed') ?? '[]');
            if (Array.isArray(saved))
                this.collapsed = new Set(saved.filter((id) => typeof id === 'string'));
        }
        catch { /* Ignore malformed view preferences; rig definitions are unaffected. */ }
        cx.timer.every(5000, cx => { if (!this.paused && this.visible())
            this.refresh(cx); });
        this.refresh(cx);
    }
    visible() {
        const nodeId = props()?.nodeId;
        if (!nodeId)
            return true; // Overlay/manual installations have no layout-owned node.
        const find = (node, shown) => {
            const visible = shown && !node.hidden;
            if (node.id === nodeId)
                return visible;
            return (node.children ?? []).some(child => find(child, visible && (node.type !== 'stack' || !node.active || node.active === child.id)));
        };
        const tree = layout();
        return tree ? find(tree, true) : false;
    }
    async call(args) {
        const result = await exec(this.cli, [...this.cliArgs, ...args, '--json'], { timeout: 600000 });
        let response;
        try {
            response = JSON.parse(result.stdout);
        }
        catch {
            throw new Error('Cannot read rig response. Check the CLI installation.');
        }
        if (result.code !== 0 || response.outcome === 'error')
            throw new Error(response.error?.message ?? 'Rig command failed');
        if (response.schema_version !== 1)
            throw new Error('Unsupported rig schema version');
        return response;
    }
    loadDefinition(id, cx, populate = false) {
        this.managementLoading = true;
        cx.spawn(async (cx) => {
            try {
                this.definition = await this.call(['show', id]);
                if (populate && this.definition) {
                    this.name.set_value(this.definition.name);
                    this.profile.set_value(this.definition.profile);
                    this.selections = { ...this.definition.checkouts };
                    this.loadProfile(cx, true);
                }
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.managementLoading = false;
                cx.notify();
            }
        });
    }
    loadProfileDocument(file, cx) {
        this.managementLoading = true;
        cx.spawn(async (cx) => {
            try {
                this.profileDocument = await this.call(['profile', 'show', '--profile', file]);
                if (this.profileMode && this.profileDocument)
                    this.profileEditor.set_value(this.profileDocument.content ?? '');
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.managementLoading = false;
                cx.notify();
            }
        });
    }
    openEditRig(id) {
        openOverlay({ mod: this.modName, kind: 'dialog', width: 640, height: 620, props: { view: 'edit', rig: id, cli: this.cli, cliArgs: this.cliArgs, guide: this.guide, parent: this.previewMode ? props().overlay : undefined } });
    }
    openProfileEditor(file) {
        openOverlay({ mod: this.modName, kind: 'dialog', width: 860, height: 720, props: { view: 'profile-editor', profilePath: file, cli: this.cli, cliArgs: this.cliArgs, parent: this.previewMode ? props().overlay : undefined } });
    }
    openDelete(target, value, label) {
        openOverlay({ mod: this.modName, kind: 'dialog', width: 550, height: 370,
            props: { view: 'delete', target, ...(target === 'rig' ? { rig: value } : { profilePath: value }), label, cli: this.cli, cliArgs: this.cliArgs, parent: this.previewMode || this.profileMode ? props().overlay : undefined } });
    }
    openContext(target, value, label) {
        openOverlay({ mod: this.modName, kind: 'popup', width: 200, height: target === 'rig' ? 104 : 73,
            props: { view: `${target}-menu`, ...(target === 'rig' ? { rig: value } : { profilePath: value }), label, cli: this.cli, cliArgs: this.cliArgs, guide: this.guide } });
    }
    renderContext() {
        const t = theme();
        const rig = this.contextMode === 'rig-menu', id = String(props().rig ?? ''), file = String(props().profilePath ?? '');
        const root = v_flex().w_full().min_h(0).p(5).bg(t.popover).text_size(12.8).text_color(t.foreground);
        const choose = (action) => { action(); closeOverlay(String(props().overlay)); };
        const item = (id, label, action) => div().id(id).h(31).flex_none().px(8).rounded(7)
            .flex().items_center().cursor_pointer().hover(style => style.bg(t.hover)).child(label)
            .on_click(() => choose(action));
        if (rig) {
            root.child(item('edit-rig', 'Edit rig…', () => this.openEditRig(id)));
            if (this.definition)
                root.child(item('edit-rig-profile', 'Edit profile…', () => this.openProfileEditor(this.definition.profile)));
            else
                root.child(div().h(31).flex_none().px(8).flex().items_center().text_color(t.dim).tooltip(this.actionError || 'Loading profile…')
                    .child(div().truncate().child(this.actionError || 'Loading profile…')));
            root.child(item('delete-rig', 'Delete rig…', () => this.openDelete('rig', id, String(props().label))));
        }
        else {
            root.child(item('edit-profile', 'Edit profile…', () => this.openProfileEditor(file)));
            root.child(item('delete-profile', 'Delete profile…', () => this.openDelete('profile', file, String(props().label))));
        }
        return root;
    }
    renderDelete() {
        const t = theme();
        const rig = props().target === 'rig', item = rig ? this.definition : this.profileDocument;
        const blocked = rig ? this.definition?.active : !!this.profileDocument?.rigs.length;
        const ready = !!item && !this.managementLoading && !blocked;
        const root = v_flex().size_full().min_h(0).p(20).gap(12).bg(t.chrome).text_color(t.foreground);
        root.child(div().text_size(16).font_medium().child(`Delete ${rig ? 'rig' : 'profile'}`))
            .child(div().text_size(13).whitespace_normal().child(rig ? this.definition?.name ?? String(props().label) : this.profileDocument?.path ?? String(props().label)))
            .child(div().text_size(12).text_color(t.dim).whitespace_normal().child(rig
            ? 'Removes this rig definition. The profile file, checkouts and service data remain.'
            : this.profileDocument?.missing ? 'Removes this missing profile from the saved list.' : 'Deletes this profile file and removes it from the saved list.'));
        if (blocked)
            root.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(rig
                ? 'Stop and reconcile the rig before deleting it.'
                : `Used by: ${this.profileDocument.rigs.map(item => item.name).join(', ')}. Assign another profile to those rigs or delete the rigs first.`));
        if (this.managementLoading)
            root.child(div().text_size(12).text_color(t.dim).child('Loading…'));
        if (this.actionError)
            root.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(this.actionError));
        root.child(div().flex_1());
        root.child(h_flex().gap(8).justify_end()
            .child(this.button('cancel-delete', 'Cancel', () => closeOverlay(String(props().overlay))))
            .child(this.button('confirm-delete', this.busy ? 'Deleting…' : 'Delete', cx => { if (ready)
            this.deleteItem(cx); }).opacity(ready ? 1 : 0.35).text_color(t.blocked)));
        return root;
    }
    deleteItem(cx) {
        if (this.busy || this.managementLoading)
            return;
        this.busy = true;
        this.actionError = '';
        cx.spawn(async (cx) => {
            let deleted = false;
            try {
                if (props().target === 'rig' && this.definition)
                    await this.call(['delete', this.definition.id, '--revision', this.definition.revision]);
                else if (this.profileDocument)
                    await this.call(['profile', 'delete', '--profile', this.profileDocument.path, '--revision', this.profileDocument.revision]);
                else
                    throw new Error('Load the item before deleting');
                deleted = true;
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.busy = false;
                cx.notify();
            }
            if (deleted) {
                if (props().parent)
                    closeOverlay(String(props().parent));
                closeOverlay(String(props().overlay));
            }
        });
    }
    renderProfileEditor() {
        const t = theme();
        const root = v_flex().size_full().min_h(0).bg(t.chrome).text_color(t.foreground);
        root.child(h_flex().px(20).py(14).gap(12).items_center().border_b(1).border_color(t.border)
            .child(div().flex_1().text_size(16).font_medium().child('Edit profile'))
            .child(this.button('editor-close', 'Close', () => closeOverlay(String(props().overlay)))));
        root.child(div().px(20).py(8).text_size(12).text_color(t.dim).whitespace_normal().child(this.profileDocument?.path ?? String(props().profilePath)));
        const refs = this.profileDocument?.rigs ?? [];
        root.child(div().px(20).pb(8).text_size(12).text_color(t.dim).whitespace_normal().child(refs.length
            ? `Shared by: ${refs.map(rig => rig.name).join(', ')}. Stop these rigs before saving changes.` : 'Reusable configuration · saving does not start services.'));
        if (this.actionError)
            root.child(div().px(20).py(6).text_size(12).text_color(t.blocked).whitespace_normal().child(this.actionError));
        if (this.managementLoading)
            root.child(div().px(20).text_size(12).text_color(t.dim).child('Loading…'));
        root.child(Editor.new(this.profileEditor).flex_1().min_h(0));
        root.child(h_flex().px(20).py(12).gap(8).justify_between().border_t(1).border_color(t.border)
            .child(this.button('editor-delete', 'Delete profile…', () => this.openDelete('profile', String(props().profilePath), String(props().profilePath))))
            .child(this.button('editor-save', this.busy ? 'Saving…' : 'Save profile', cx => this.saveProfile(cx))));
        return root;
    }
    saveProfile(cx) {
        if (this.busy || this.managementLoading || !this.profileDocument)
            return;
        this.busy = true;
        this.actionError = '';
        const document = this.profileDocument, content = this.profileEditor.value();
        cx.spawn(async (cx) => {
            let saved = false;
            try {
                const draft = `${appHome()}/mods/${this.modName}/.rig-profile-draft-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
                await writeTextFile(draft, content, null);
                await this.call(['profile', 'update', '--profile', document.path, '--revision', document.revision, '--input', draft, '--consume-input', 'true']);
                saved = true;
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.busy = false;
                cx.notify();
            }
            if (saved) {
                if (props().parent)
                    closeOverlay(String(props().parent));
                closeOverlay(String(props().overlay));
            }
        });
    }
    refresh(cx) {
        if (this.busy)
            return;
        const scope = this.viewScope();
        this.requestedScope = scope;
        if (scope === null) {
            this.data = { ...this.data, rigs: [], connections: [] };
            this.dataScope = null;
            this.refreshError = '';
            cx.notify();
            return;
        }
        this.busy = true;
        cx.spawn(async (cx) => {
            try {
                const args = ['status'];
                if (scope !== 'all')
                    args.push('--checkout', scope);
                const result = await this.call(args);
                if (scope === this.viewScope()) {
                    this.data = result;
                    this.dataScope = scope;
                    this.refreshError = '';
                }
            }
            catch (error) {
                if (scope === this.viewScope()) {
                    this.refreshError = String(error);
                    this.data = { ...this.data, rigs: [], connections: [] };
                    this.dataScope = scope;
                }
            }
            finally {
                this.busy = false;
                cx.notify();
            }
        });
    }
    viewScope() { return this.checkoutOnly ? localCheckout() : 'all'; }
    refreshPreviewApps(cx) {
        if (this.observing || !Object.keys(this.preview?.observed_apps ?? {}).length)
            return;
        this.observing = true;
        cx.spawn(async (cx) => {
            try {
                this.data = await this.call(['status', this.previewName]);
                this.observationError = '';
            }
            catch {
                this.observationError = 'App observation unavailable';
            }
            finally {
                this.observing = false;
                cx.notify();
            }
        });
    }
    action(command, name, cx) {
        if (this.busy)
            return;
        this.busy = true;
        this.actionError = '';
        cx.spawn(async (cx) => {
            try {
                const result = await this.call([command, name, ...(command === 'up' && this.preview ? ['--review', this.preview.review.fingerprint] : [])]);
                if (command === 'plan') {
                    if (this.previewMode) {
                        this.setPreview(result, name);
                        this.refreshPreviewApps(cx);
                    }
                    else
                        this.openPreview(result, name);
                }
                else {
                    this.preview = null;
                    this.previewName = '';
                }
            }
            catch (e) {
                this.actionError = String(e);
            }
            finally {
                this.busy = false;
                if (!this.previewMode && !this.createMode && !this.menuMode)
                    this.refresh(cx);
                cx.notify();
            }
        });
    }
    openNewMenu() {
        openOverlay({ mod: this.modName, kind: 'popup', width: 340, height: 380,
            props: { view: 'new-menu', cli: this.cli, cliArgs: this.cliArgs, guide: this.guide, checkout: localCheckout() ?? '' } });
    }
    loadProfiles(cx) {
        cx.spawn(async (cx) => {
            try {
                const catalog = await this.call(['profile', 'list']);
                this.profileRigNames = catalog.rig_names ?? [];
                this.profiles = catalog.profiles.map((profile) => ({
                    path: profile.path, label: (profile.path.split('/').pop() ?? profile.path).replace(/\.json$/i, '').replace(/^rig[.-]/, ''),
                    selections: profile.rigs[0]?.checkouts ?? {}, services: profile.services,
                })).sort((a, b) => a.label.localeCompare(b.label));
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.menuLoaded = true;
                cx.notify();
            }
        });
    }
    openCreate(choice) {
        const base = (choice?.label ?? 'new-rig').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'new-rig';
        const names = new Set([...this.profileRigNames, ...this.data.rigs.map(rig => rig.name)]);
        let name = `${base}-dev`, suffix = 2;
        while (names.has(name))
            name = `${base}-dev-${suffix++}`;
        openOverlay({ mod: this.modName, kind: 'dialog', width: 640, height: 580,
            props: { view: 'create', cli: this.cli, cliArgs: this.cliArgs, guide: this.guide, profilePath: choice?.path ?? '', suggestedName: name, selections: choice?.selections ?? {} } });
    }
    renderMenu() {
        const t = theme();
        const item = (id, label, icon, action) => h_flex().id(id).h(34).flex_none().px(9).gap(9).rounded(6).items_center().cursor_pointer().text_size(13).text_color(t.foreground)
            .hover(style => style.bg(t.hover)).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14).flex_none().text_color(t.muted))
            .child(div().flex_1().truncate().child(label)).on_click((_event, cx) => action(cx));
        const height = Math.min(420, 140 + Math.max(1, this.profiles.length) * 36 + (this.actionError ? 28 : 0));
        const root = v_flex().id('rig-new-menu').w_full().h(height).min_h(0).p(6).gap(3).bg(t.popover).text_color(t.foreground);
        root.child(item('menu-copy-setup', 'Agent Setup Prompt', 'files', cx => {
            cx.write_to_clipboard(setupPrompt({ checkout: this.setupCheckout, guide: this.guide }));
            closeOverlay(String(props().overlay));
        }));
        root.child(div().h(1).my(4).bg(t.border));
        root.child(div().px(9).py(4).text_size(11).text_color(t.dim).child('Profiles'));
        const list = v_flex().id('profile-list').flex_1().min_h(0).gap(2).overflow_y_scrollbar().mode('always');
        for (const choice of this.profiles)
            list.child(item(`profile-${choice.path}`, choice.label, 'file-text', () => {
                const overlay = String(props().overlay);
                this.openCreate(choice);
                closeOverlay(overlay);
            }).tooltip(`${choice.path}\n${Object.keys(choice.selections).length} repo slots · ${choice.services} services\nRight-click to edit or delete this profile`)
                .on_mouse_down('right', (_event, cx) => { cx.stop_propagation(); this.openContext('profile', choice.path, choice.label); closeOverlay(String(props().overlay)); }));
        if (!this.profiles.length)
            list.child(div().px(9).py(8).text_size(12).text_color(t.dim).child(this.menuLoaded ? 'No saved profiles yet' : 'Loading profiles…'));
        root.child(list);
        if (this.actionError)
            root.child(div().px(9).text_size(11).text_color(t.blocked).whitespace_normal().child(this.actionError));
        root.child(div().h(1).my(4).bg(t.border));
        root.child(item('menu-import', 'Import profile…', 'folder', () => { const overlay = String(props().overlay); this.openCreate(); closeOverlay(overlay); }));
        return root;
    }
    renderCreate() {
        const t = theme();
        const root = v_flex().id('rig-create').size_full().min_h(0).bg(t.chrome).text_color(t.foreground);
        root.child(h_flex().px(20).py(14).gap(12).items_center().border_b(1).border_color(t.border)
            .child(div().flex_1().text_size(16).font_medium().child(this.editRig ? 'Edit rig' : 'New rig'))
            .child(div().id('close-create').px(8).py(4).cursor_pointer().text_size(12).child('Close').on_click(() => closeOverlay(String(props().overlay)))));
        const fields = v_flex().flex_1().min_h(0).p(20).gap(9).overflow_y_scrollbar().mode('always');
        if (this.definition?.active)
            fields.child(div().text_size(12).text_color(t.dim).whitespace_normal().child('You can rename this running rig. Stop it before changing its profile or worktrees.'));
        if (this.managementLoading)
            fields.child(div().text_size(12).text_color(t.dim).child('Loading rig…'));
        fields.child(div().text_size(11).text_color(t.dim).child('Rig name'))
            .child(Input.new(this.name).h(32).px(8).bg(t.background).border(1).border_color(t.input))
            .child(div().text_size(11).text_color(t.dim).child('Profile'))
            .child(Input.new(this.profile).h(32).px(8).bg(t.background).border(1).border_color(t.input))
            .child(this.button('load-profile', 'Load repo slots', cx => this.loadProfile(cx, true)));
        for (const repo of this.repoSlots)
            fields.child(v_flex().gap(5).py(6)
                .child(div().text_size(12).font_medium().child(repo))
                .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(this.selections[repo] || 'Choose a worktree'))
                .child(h_flex().gap(6)
                .child(this.button(`suggest-${repo}`, 'Use focused checkout', cx => { const directory = localCheckout(); if (directory)
                this.selections[repo] = directory; cx.notify(); }))
                .child(this.button(`choose-${repo}`, 'Choose folder…', cx => cx.spawn(async (cx) => { const directory = await pickFolder({ prompt: `Choose checkout for ${repo}` }); if (directory)
                this.selections[repo] = directory; cx.notify(); })))));
        if (this.actionError)
            fields.child(div().text_size(12).text_color(t.blocked).whitespace_normal().child(this.actionError));
        root.child(fields);
        root.child(h_flex().px(20).py(12).justify_end().border_t(1).border_color(t.border)
            .child(this.button('save-rig', this.busy ? 'Saving…' : 'Save and preview', cx => this.create(cx))));
        return root;
    }
    openPreview(preview, name, label = preview?.name ?? name) {
        openOverlay({ mod: this.modName, kind: 'dialog', width: 820, height: 700,
            props: { view: 'preview', ...(preview ? { plan: preview } : {}), rig: name, label, cli: this.cli, cliArgs: this.cliArgs } });
    }
    setPreview(preview, name) {
        this.preview = preview;
        this.previewName = name;
        this.decisionInputs = Object.fromEntries((preview.setup?.questions ?? []).map(question => {
            const input = InputState.new({ placeholder: 'Describe the reviewed choice' });
            input.set_value(preview.setup?.decisions[question] ?? '');
            return [question, input];
        }));
    }
    approveAndStart(cx) {
        if (!this.preview || this.busy)
            return;
        const name = this.previewName, fingerprint = this.preview.review.fingerprint;
        const args = ['approve', name, '--review', fingerprint];
        for (const [key, input] of Object.entries(this.decisionInputs))
            args.push('--decision', `${key}=${input.value()}`);
        this.busy = true;
        this.actionError = '';
        cx.spawn(async (cx) => {
            let started = false;
            try {
                await this.call(args);
                await this.call(['up', name, '--review', fingerprint]);
                this.preview = null;
                this.previewName = '';
                started = true;
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.busy = false;
                if (!this.previewMode && !this.createMode && !this.menuMode)
                    this.refresh(cx);
                cx.notify();
            }
            if (started && this.previewMode)
                closeOverlay(String(props().overlay));
        });
    }
    control(command, rig, service, cx) {
        if (this.busy)
            return;
        const scope = service ? ['--service', service.id] : [];
        this.busy = true;
        this.actionError = '';
        this.controlKey = service ? `service-${rig.id}-${service.id}` : `rig-${rig.id}`;
        this.controlOperation = command;
        cx.spawn(async (cx) => {
            try {
                if (command === 'down')
                    await this.call(['down', rig.id, ...scope]);
                else {
                    // The explicit Start/Restart click authorizes the saved configuration; preview is optional.
                    const plan = await this.call(['plan', rig.id]);
                    if (service && !Object.hasOwn(plan.services, service.id))
                        throw new Error(`Unknown service ${service.id}`);
                    await this.call(['approve', rig.id, '--review', plan.review.fingerprint]);
                    await this.call([command, rig.id, '--review', plan.review.fingerprint, ...scope]);
                }
            }
            catch (error) {
                this.actionError = String(error);
            }
            finally {
                this.busy = false;
                this.controlKey = '';
                this.controlOperation = '';
                this.refresh(cx);
                cx.notify();
            }
        });
    }
    hoverRow(key, hovered, cx) {
        const next = hovered ? key : this.hoveredRow === key ? '' : this.hoveredRow;
        if (next !== this.hoveredRow) {
            this.hoveredRow = next;
            cx.notify();
        }
    }
    controls(rig, service) {
        const t = theme();
        const key = service ? `service-${rig.id}-${service.id}` : `rig-${rig.id}`;
        const services = service ? [service] : Object.values(rig.services);
        const active = service ? ['running', 'starting', 'unknown'].includes(service.state) : rig.claimed;
        const unknown = services.some(item => item.state === 'unknown');
        const canStart = !unknown && services.some(item => !['running', 'starting'].includes(item.state));
        const control = (command, label, glyph, enabled) => div().id(`${key}-${command}`).size(22).rounded(5).flex().items_center().justify_center().text_size(12)
            .text_color(t.muted).opacity(enabled && !this.busy ? 1 : 0.3).tooltip(`${label} ${service ? service.id : 'rig'}`)
            .when(enabled && !this.busy, el => el.cursor_pointer().hover(style => style.bg(t.hover).text_color(t.foreground)))
            .child(glyph).on_click((_event, cx) => { cx.stop_propagation(); if (enabled && !this.busy)
            this.control(command, rig, service, cx); });
        return h_flex().gap(1).items_center().flex_none().opacity(this.hoveredRow === key || this.controlKey === key ? 1 : 0)
            .child(control('up', 'Start', '▶', canStart))
            .child(control('down', 'Stop', '■', active))
            .child(control('restart', 'Restart', '↻', active && !unknown));
    }
    connectionRows(rig) {
        const t = theme();
        const groups = new Map();
        for (const link of this.data.connections ?? []) {
            const peer = link.consumer.rig === rig.id ? link.provider : link.provider.rig === rig.id ? link.consumer : undefined;
            if (!peer)
                continue;
            const group = groups.get(peer.rig) ?? { id: peer.rig, name: peer.name, links: [] };
            group.links.push(link);
            groups.set(peer.rig, group);
        }
        return [...groups.values()].map(group => h_flex().id(`connection-${rig.id}-${group.id}`).h(22).pl(34).pr(8).gap(5).items_center().cursor_pointer()
            .tooltip(group.links.map(link => `${link.consumer.name}/${link.consumer.service} → ${link.provider.name}/${link.provider.service}\n${link.consumer.binding}: ${link.url} · ${link.state}`).join('\n\n'))
            .child(div().w(12).flex_none().border_t(1).border_color(t.border))
            .child(div().text_size(17).text_color(group.links.some(link => link.state === 'live') ? t.ansi2 : t.dim).child('↔'))
            .child(div().flex_1().truncate().text_size(11).text_color(t.dim).hover(style => style.text_color(t.foreground)).child(group.name))
            .on_click((_event, cx) => { cx.stop_propagation(); this.openPreview(undefined, group.id, group.name); }));
    }
    serviceSource(rig, service) {
        const checkout = rig.checkouts[service.repo];
        if (!checkout)
            return { label: service.repo, tooltip: `Repo slot: ${service.repo}` };
        const base = (value) => value.split('/').filter(Boolean).pop() ?? value;
        const repo = checkout.repository ? base(checkout.repository.replace(/\/\.git$/, '')) : base(checkout.root);
        const tree = base(checkout.root), branch = checkout.branch ?? 'missing checkout';
        const app = service.cwd?.startsWith(checkout.root + '/') ? service.cwd.slice(checkout.root.length + 1) : '.';
        return { label: `${repo}${tree !== repo ? ` / ${tree}` : ''} · ${branch} · ${app === '.' ? 'root' : app}`,
            tooltip: `Repository: ${repo}\nWorktree: ${checkout.root}\nBranch: ${branch}\nApp: ${app}\nRepo slot: ${service.repo}` };
    }
    sidebarEndpoints(service) {
        return Object.entries(service.endpoints).filter(([name, endpoint]) => name.toLowerCase() !== 'metrics' && (endpoint.protocol === 'http' || endpoint.protocol === 'https'));
    }
    endpointIcons(rig, service) {
        const t = theme();
        return h_flex().gap(1).items_center().flex_none().children(this.sidebarEndpoints(service).map(([name, endpoint]) => {
            const enabled = service.state === 'running' && service.assignments === 'allocated';
            return div().id(`endpoint-${rig.id}-${service.id}-${name}`).size(22).rounded(5).flex().items_center().justify_center()
                .text_color(t.dim).text_size(15).tooltip(`${name}: ${endpoint.url} (${service.assignments})`)
                .when(enabled, el => el.cursor_pointer().hover(style => style.bg(t.hover).text_color(t.foreground)))
                .child(div().child('↗'))
                .on_click((_event, cx) => { cx.stop_propagation(); if (enabled)
                cx.open_url(endpoint.url); });
        }));
    }
    operationIndicator(key, fallback) {
        return this.controlKey === key ? { kind: 'working', label: this.controlOperation === 'down' ? 'Stopping…' : this.controlOperation === 'restart' ? 'Restarting…' : 'Starting…' } : fallback;
    }
    checkoutDescription(rig) {
        const services = Object.keys(rig.services).length, checkouts = Object.keys(rig.checkouts).length;
        const apps = Object.keys(rig.observed_apps ?? {}).length;
        return `${services ? `${services} service${services === 1 ? '' : 's'} · ` : ''}${apps ? `${apps} app${apps === 1 ? '' : 's'} · ` : ''}${checkouts} checkout${checkouts === 1 ? '' : 's'}`;
    }
    button(id, label, action) {
        const t = theme();
        return div().id(id).px(8).py(4).rounded(6).text_size(12).text_color(t.muted).child(label)
            .hover(s => s.bg(t.hover)).on_click((_e, cx) => { if (!this.busy)
            action(cx); });
    }
    serviceIndicator(service) {
        if (service.state === 'unknown')
            return { kind: 'blocked', label: 'Unknown · restore Core access and reconcile ownership' };
        if (service.error || service.readiness === 'failed' || service.degraded_dependencies.length || service.external_dependencies?.some(dependency => dependency.readiness === 'failed'))
            return { kind: 'blocked', label: service.error ?? 'Running with an unhealthy dependency or readiness check' };
        if (service.state === 'exited')
            return service.exit_code === 0 ? { kind: 'done', label: 'Exited successfully' } : { kind: 'blocked', label: `Exited${service.exit_code === undefined ? '' : ` · code ${service.exit_code}`}` };
        if (service.state === 'starting')
            return { kind: 'working', label: 'Starting' };
        if (service.state === 'running')
            return { kind: 'working', label: service.readiness === 'ready' ? 'Running · ready' : 'Running · no readiness check' };
        return { kind: 'idle', label: 'Stopped' };
    }
    rigIndicator(rig) {
        const services = Object.values(rig.services), indicators = [...services.map(service => this.serviceIndicator(service)), ...Object.values(rig.observed_apps ?? {}).map(app => this.appIndicator(app))];
        if (rig.error || indicators.some(status => status.kind === 'blocked'))
            return { kind: 'blocked', label: rig.error ?? 'Rig needs attention · inspect its services' };
        if (indicators.some(status => status.kind === 'working'))
            return { kind: 'working', label: 'Running' };
        if (rig.claimed)
            return { kind: 'blocked', label: 'Reservations retained · inspect and reconcile stopped services' };
        if (indicators.length && indicators.every(status => status.kind === 'done'))
            return { kind: 'done', label: 'Finished' };
        return { kind: 'idle', label: rig.review_required ? 'Draft · awaiting approval' : 'Stopped' };
    }
    appIndicator(app) {
        if (app.state === 'unknown')
            return { kind: 'blocked', label: app.error ?? 'App observation unavailable' };
        if (app.state === 'running')
            return { kind: 'working', label: `Observed running · ${app.matches.length} process${app.matches.length === 1 ? '' : 'es'} · readiness not checked` };
        return { kind: 'idle', label: 'Not running · externally launched app' };
    }
    statusIcon(status) {
        const t = theme();
        // Quiet theme-colored indicators; running processes do not animate the sidebar.
        const color = status.kind === 'working' ? (status.label.endsWith('…') || status.label === 'Starting' ? t.working : t.ansi2)
            : status.kind === 'blocked' ? t.blocked : status.kind === 'done' ? t.done : t.dim;
        const glyph = div().size(7).mx(3).flex_none().rounded(4)
            .when(status.kind === 'idle', el => el.border(1.5).border_color(color))
            .when(status.kind !== 'idle', el => el.bg(color));
        return h_flex().w(14).flex_none().items_center().justify_center().tooltip(status.label).child(glyph);
    }
    loadProfile(cx, preserveSelections = false) {
        this.loadedProfile = '';
        cx.spawn(async (cx) => {
            try {
                const file = this.profile.value();
                const document = await this.call(['profile', 'import', '--profile', file]);
                if (this.profile.value() !== file)
                    return;
                const profile = JSON.parse(document.content);
                if (profile.version !== 1 || !Array.isArray(profile.repos))
                    throw new Error('Expected version 1 profile with repo slots');
                this.repoSlots = profile.repos;
                this.selections = preserveSelections ? Object.fromEntries(this.repoSlots.filter(repo => this.selections[repo]).map(repo => [repo, this.selections[repo]])) : {};
                this.loadedProfile = file;
                this.actionError = '';
            }
            catch (e) {
                this.actionError = String(e);
            }
            cx.notify();
        });
    }
    create(cx) {
        if (this.busy || this.managementLoading)
            return;
        this.busy = true;
        this.actionError = '';
        cx.spawn(async (cx) => {
            let created = false;
            try {
                if (!this.repoSlots.length)
                    throw new Error('Load a profile before saving');
                if (this.profile.value() !== this.loadedProfile)
                    throw new Error('Load repo slots for the selected profile before saving');
                if (this.editRig && !this.definition)
                    throw new Error('Load the rig before saving');
                if (this.repoSlots.some(r => !this.selections[r]))
                    throw new Error('Explicitly select a checkout for every repo');
                const args = this.editRig ? ['configure', this.editRig, '--name', this.name.value(), '--revision', this.definition.revision, '--profile', this.profile.value()]
                    : ['create', this.name.value(), '--profile', this.profile.value()];
                for (const repo of this.repoSlots)
                    args.push('--repo', `${repo}=${this.selections[repo]}`);
                const result = await this.call(args);
                this.selected = result.id;
                localStorage.setItem('selected', this.selected);
                this.openPreview(this.editRig ? result : result.plan, result.id);
                created = true;
            }
            catch (e) {
                this.actionError = String(e);
            }
            finally {
                this.busy = false;
                if (!this.previewMode && !this.createMode && !this.menuMode)
                    this.refresh(cx);
                cx.notify();
            }
            if (created && this.createMode) {
                if (props().parent)
                    closeOverlay(String(props().parent));
                closeOverlay(String(props().overlay));
            }
        });
    }
    renderPreview() {
        const t = theme();
        const root = v_flex().id('rig-preview').size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(13);
        root.child(h_flex().px(20).py(14).gap(12).items_center().border_b(1).border_color(t.border)
            .child(v_flex().flex_1().gap(3)
            .child(div().text_size(11).text_color(t.dim).child('Rig preview'))
            .child(div().text_size(16).font_medium().child(this.preview?.name ?? String(props()?.label ?? 'Loading…'))))
            .child(this.button('preview-edit', 'Edit rig…', () => this.openEditRig(this.previewName)))
            .child(this.button('preview-delete', 'Delete rig…', () => this.openDelete('rig', this.previewName, this.preview?.name ?? this.previewName)))
            .child(div().id('close-preview').px(8).py(4).rounded(6).cursor_pointer().text_color(t.muted)
            .hover(s => s.bg(t.hover)).child('Close').on_click(() => closeOverlay(String(props().overlay)))));
        if (this.actionError)
            root.child(div().px(20).py(8).text_color(t.blocked).whitespace_normal().child(this.actionError));
        if (this.definition)
            root.child(v_flex().px(20).py(8).gap(4).border_b(1).border_color(t.border)
                .child(div().text_size(11).text_color(t.dim).child('Profile'))
                .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(this.definition.profile))
                .child(h_flex().gap(8)
                .child(this.button('preview-edit-profile', 'Edit profile…', () => this.openProfileEditor(this.definition.profile)))
                .child(this.button('preview-delete-profile', 'Delete profile…', () => this.openDelete('profile', this.definition.profile, this.definition.profile)))));
        if (this.preview) {
            const preview = this.preview;
            const review = v_flex().id('rig-preview-scroll').flex_1().min_h(0).p(20).gap(12).overflow_y_scrollbar().mode('always')
                .child(div().text_size(11).text_color(t.dim).child(preview.order.length ? 'Ports are proposals until Start reserves them.' : 'Read-only process monitoring · no launch or reservations.'));
            const field = (label, value) => v_flex().gap(2)
                .child(div().text_size(11).text_color(t.dim).child(label))
                .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(value));
            for (const [repo, checkout] of Object.entries(preview.checkouts))
                review.child(field(`${repo} · ${checkout.branch}${checkout.unborn ? ' · no commits' : ''}`, checkout.root));
            if (preview.order.length)
                review.child(field('Startup order', preview.order.join(' → ')));
            for (const id of preview.order) {
                const service = preview.services[id];
                const block = v_flex().gap(6).py(6).border_t(1).border_color(t.border)
                    .child(div().text_size(12).font_medium().child(id))
                    .child(field('Working directory', service.cwd))
                    .child(field('Command arguments', JSON.stringify(service.argv)))
                    .child(field('Data scope', service.data_scope));
                for (const [name, endpoint] of Object.entries(service.endpoints))
                    block.child(field(name, endpoint.url));
                if (!Object.keys(service.endpoints).length)
                    block.child(field('Endpoints', 'None configured · no managed browser URL'));
                for (const [key, value] of Object.entries(service.env))
                    block.child(field(key, value));
                block.child(field('Wait for', service.depends_on.length ? service.depends_on.join(', ') : 'No service prerequisites'));
                block.child(field('Readiness', service.readiness ? `${service.readiness.kind ?? 'http'} · ${service.readiness.endpoint}${service.readiness.path ?? '/'} · ${service.readiness.timeout ?? 20}s deadline` : 'Running without a readiness check'));
                for (const external of service.external_checks ?? [])
                    block.child(field(`External check · ${external.key}`, `${external.url} · ${external.timeout}s deadline`));
                review.child(block);
            }
            for (const [id, app] of Object.entries(preview.observed_apps ?? {})) {
                const observation = this.observationError ? undefined : this.data.rigs.find(rig => rig.id === preview.id)?.observed_apps?.[id];
                const block = v_flex().gap(6).py(6).border_t(1).border_color(t.border)
                    .child(div().text_size(12).font_medium().child(`${id} · observed app`))
                    .child(field('Process name', app.process_name))
                    .child(field('Executable', app.executable ?? 'Any path with this exact executable name'))
                    .child(field('Machine', `${app.machine ?? 'This computer'} · ${app.platform}`))
                    .child(field('Repo slot', app.repo))
                    .child(field('Status', observation ? this.appIndicator(observation).label : this.observationError || 'Checking…'))
                    .child(field('Ownership', 'External · monitored only. Rig controls do not start, stop or restart this app. Process presence does not prove readiness or a Metro connection.'));
                for (const match of observation?.matches ?? [])
                    block.child(field(`PID ${match.pid} · started ${match.started_at}`, match.executable ?? 'Executable path unavailable'));
                review.child(block);
            }
            if (preview.setup) {
                review.child(div().text_size(12).font_medium().child('Review proposed choices'));
                for (const question of preview.setup.questions)
                    review.child(v_flex().gap(3)
                        .child(div().text_size(11).text_color(t.dim).child(question.replace(/_/g, ' ')))
                        .child(Input.new(this.decisionInputs[question]).h(32).px(8).bg(t.background).border(1).border_color(t.input)));
                review.child(div().text_size(11).text_color(t.dim).child('Edit any proposed choice. Every listed choice needs a decision. Changes to commands, bindings or data scope belong in the profile; close and reopen this preview afterward. Approval applies to this configuration and checkout.'));
            }
            root.child(review);
            root.child(h_flex().px(20).py(12).justify_end().border_t(1).border_color(t.border)
                .when(preview.order.length > 0, el => el.child(this.button('apply-plan', this.busy ? 'Working…' : preview.setup || !preview.review.approved ? 'Approve and start' : 'Start this rig', cx => this.approveAndStart(cx))))
                .when(!preview.order.length, el => el.child(div().text_size(12).text_color(t.dim).child('Monitoring automatically · no managed services to start'))));
        }
        else
            root.child(div().flex_1().p(20).text_color(t.dim).child(this.actionError ? 'Close and reopen this preview to load the current plan.' : 'Loading preview…'));
        return root;
    }
    workspaceHeader() { return workspacePanel(); }
    render(cx) {
        if (this.contextMode)
            return this.renderContext();
        if (this.deleteMode)
            return this.renderDelete();
        if (this.profileMode)
            return this.renderProfileEditor();
        if (this.menuMode)
            return this.renderMenu();
        if (this.createMode)
            return this.renderCreate();
        if (this.previewMode)
            return this.renderPreview();
        const dock = this.workspaceHeader();
        const embedded = Boolean(dock?.embedded_header);
        const scope = this.viewScope();
        if (!this.paused && this.visible() && scope !== this.requestedScope)
            this.refresh(cx);
        const t = theme();
        const content = v_flex().id('rigs-scroll').flex_1().min_h(0).px(8).pb(10).gap(4).overflow_y_scrollbar().mode('always');
        const icon = (id, file, tip, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
            .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
            .on_click((_e, cx) => { if (!this.busy)
            action(cx); })
            .child(svg(`mods/workspace-chrome/${file}.svg`).size(14));
        const root = v_flex().id('rigs-root').size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_color(t.foreground).text_size(13)
            .when(embedded, el => el.bg(t.background).rounded(10).overflow_hidden().border_1());
        root.child(h_flex().id("rigs-header").on_hover((on, cx) => { this.headerHovered = on; cx.notify(); }).h(embedded ? 42 : 31).pl(embedded ? 14 : 16).pr(embedded ? 82 : 10).flex_none().items_center().gap(8).text_size(embedded ? 13 : 11.5).text_color(embedded ? t.foreground : t.dim)
            .when(embedded, el => el.border_b(1).border_color(t.border).justify_start().gap(8))
            .child(div().min_w(0).truncate().when(embedded, el => el.font_semibold().max_w(72)).on_click((event, cx) => {
            if (dock && event.click_count >= 2) {
                cx.stop_propagation();
                run('workspace.rename', { panel: dock.id });
            }
        }).child(dock?.title ?? 'Rigs'))
            .child(h_flex().opacity(this.headerHovered ? 1 : 0).gap(2).items_center().flex_none()
            .child(icon('options', 'settings', 'Rig options', cx => { this.tools = !this.tools; cx.notify(); }))
            .child(icon('new', 'plus', 'New rig', () => this.openNewMenu()))));
        if (this.tools)
            content.child(v_flex().gap(2)
                .child(this.button('checkout', this.checkoutOnly ? 'Show all rigs' : 'Show focused rigs', cx => {
                this.checkoutOnly = !this.checkoutOnly;
                localStorage.setItem('scope', this.checkoutOnly ? 'focused' : 'all');
                this.refresh(cx);
            }))
                .child(this.button('pause', this.paused ? 'Resume polling' : 'Pause polling', cx => { this.paused = !this.paused; cx.notify(); }))
                .child(this.button('stopped', this.showStopped ? 'Hide stopped definitions' : 'Show stopped definitions', cx => { this.showStopped = !this.showStopped; cx.notify(); })));
        if (this.refreshError && scope === this.dataScope)
            content.child(div().px(8).text_size(12).text_color(t.blocked).child(this.refreshError));
        if (this.actionError)
            content.child(v_flex().gap(2).px(8).child(div().text_size(12).text_color(t.blocked).child(this.actionError)).child(this.button('dismiss-action-error', 'Dismiss', cx => { this.actionError = ''; cx.notify(); })));
        const rigs = (scope === this.dataScope ? this.data.rigs : []).filter(r => r.claimed || r.review_required || Object.keys(r.observed_apps ?? {}).length || this.showStopped);
        for (const rig of rigs) {
            const card = v_flex().w_full().gap(2).rounded(8);
            const rigKey = `rig-${rig.id}`;
            card.child(h_flex().id(`rig-row-${rig.id}`).w_full().h(30).flex_none().px(8).gap(9).rounded(8).items_center().cursor_pointer()
                .text_size(13).text_color(t.foreground)
                .when(rig.id !== this.selected, el => el.hover(style => style.bg(t.hover)))
                .on_click((_event, cx) => { this.selected = rig.id; localStorage.setItem('selected', rig.id); this.openPreview(undefined, rig.id, rig.name); cx.notify(); })
                .on_mouse_down('right', (_event, cx) => { cx.stop_propagation(); this.openContext('rig', rig.id, rig.name); })
                .on_hover((hovered, cx) => this.hoverRow(rigKey, hovered, cx))
                .when(rig.id === this.selected, el => el.bg(t.selected))
                .child(div().id(`collapse-${rig.id}`).w(18).h(22).flex_none().flex().items_center().justify_center().rounded(4).cursor_pointer()
                .text_color(t.dim).tooltip(this.collapsed.has(rig.id) ? 'Expand services' : 'Collapse services').hover(style => style.bg(t.hover).text_color(t.foreground))
                .child(svg(`mods/workspace-chrome/chevron-${this.collapsed.has(rig.id) ? 'right' : 'down'}.svg`).size(12))
                .on_click((_event, cx) => {
                cx.stop_propagation();
                if (this.collapsed.has(rig.id))
                    this.collapsed.delete(rig.id);
                else
                    this.collapsed.add(rig.id);
                localStorage.setItem('collapsed', JSON.stringify([...this.collapsed]));
                cx.notify();
            }))
                .child(h_flex().id(`select-${rig.id}`).flex_1().min_w(0).gap(5).items_center().cursor_pointer()
                .tooltip(Object.entries(rig.checkouts).map(([slot, checkout]) => `${slot}: ${checkout.root} (${checkout.branch ?? 'missing'})`).join('\n'))
                .hover(style => style.text_color(t.foreground))
                .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(rig.name))
                .child(h_flex().flex_1().min_w(0).justify_end().items_center()
                .child(div().min_w(0).text_size(11.5).text_color(t.dim).truncate().child(this.checkoutDescription(rig)))))
                .when(Object.keys(rig.services).length > 0, el => el.child(this.controls(rig)))
                .child(this.statusIcon(this.operationIndicator(rigKey, this.rigIndicator(rig)))));
            if (!this.collapsed.has(rig.id))
                card.children(this.connectionRows(rig));
            if (rig.error)
                card.child(div().pl(20).text_color(t.blocked).child(rig.error));
            for (const service of this.collapsed.has(rig.id) ? [] : Object.values(rig.services)) {
                const row = v_flex().w_full().gap(2).pl(20).pr(8).py(3).rounded(8).when(Boolean(service.checkout_match), el => el.bg(t.selected));
                const serviceKey = `service-${rig.id}-${service.id}`;
                const source = this.serviceSource(rig, service);
                row.child(h_flex().id(`service-row-${rig.id}-${service.id}`).w_full().h(26).gap(6).rounded(6).items_center()
                    .tooltip(service.terminal ? 'Open live output' : 'No output yet · start this service first')
                    .hover(style => style.bg(t.hover))
                    .when(Boolean(service.terminal), el => el.cursor_pointer().on_click(() => run('terminal.peek', { terminal: service.terminal })))
                    .on_hover((hovered, cx) => this.hoverRow(serviceKey, hovered, cx))
                    .child(h_flex().id(serviceKey).flex_1().min_w(0).gap(6).items_center().tooltip(source.tooltip)
                    .child(svg('mods/workspace-chrome/server.svg').size(14).text_color(t.muted))
                    .child(div().truncate().text_size(12).text_color(t.muted).child(service.id))
                    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(source.label)))
                    .child(this.controls(rig, service))
                    .child(h_flex().gap(2).items_center().flex_none()
                    .when(service.state === 'running' && service.assignments === 'allocated' && this.sidebarEndpoints(service).length > 0, el => el.child(this.endpointIcons(rig, service)))
                    .child(this.statusIcon(this.operationIndicator(serviceKey, this.serviceIndicator(service))))));
                if (service.degraded_dependencies.length)
                    row.child(div().text_color(t.blocked).child(`Dependency degraded: ${service.degraded_dependencies.join(', ')}`));
                card.child(row);
            }
            for (const app of this.collapsed.has(rig.id) ? [] : Object.values(rig.observed_apps ?? {})) {
                const source = this.serviceSource(rig, app);
                const details = `${source.tooltip}\nObserved app: ${app.process_name}\nMachine: ${app.machine ?? 'this computer'} (${app.platform})\n${app.executable ?? 'Any executable path'}\nExternal · rig controls do not manage this app\n${app.matches.map(match => `PID ${match.pid} · ${match.started_at}\n${match.executable ?? 'Path unavailable'}`).join('\n')}`;
                card.child(h_flex().id(`observed-app-${rig.id}-${app.id}`).w_full().h(32).pl(20).pr(8).gap(6).rounded(6).items_center().cursor_pointer()
                    .hover(style => style.bg(t.hover)).tooltip(details)
                    .on_click(() => this.openPreview(undefined, rig.id, rig.name))
                    .child(svg('mods/workspace-chrome/server.svg').size(14).text_color(t.muted))
                    .child(div().truncate().text_size(12).text_color(t.muted).child(app.id))
                    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${source.label} · observed`))
                    .child(this.statusIcon(this.appIndicator(app))));
            }
            content.child(card);
        }
        if (!rigs.length)
            content.child(div().px(8).text_size(12).text_color(t.dim).whitespace_normal().child(this.paused && scope !== this.dataScope ? 'Polling paused. Resume to load rigs for this view.'
                : this.checkoutOnly && scope === null ? 'Focus a local checkout, or choose Show all rigs in options.'
                    : this.busy && scope !== this.dataScope ? 'Loading rigs…'
                        : this.checkoutOnly ? 'No visible rigs for the focused checkout. Use +, show stopped definitions, or choose Show all rigs.'
                            : 'No active rigs. Use + to create one.'));
        root.child(content);
        return root;
    }
}
