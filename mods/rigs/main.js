// Generated from main.ts by npm run build:mod.
import { setupPrompt } from './setup.js';
import { View, div, svg } from 'gpui-kit';
import { v_flex, h_flex, Input, InputState } from 'gpui-base';
import { exec, focused, theme, run, props, pickFolder, readTextFile, layout, spaces, openOverlay, closeOverlay } from 'herdr';
function localCheckout() {
    const context = focused();
    if (context?.terminal?.includes('/') || spaces().find(space => space.id === context?.space)?.machine)
        return null;
    return context?.cwd ?? null;
}
export default class Rigs extends View {
    data = { core: 'loading', rigs: [], observed_at: '' };
    setupCheckout = '';
    setupCopied = false;
    setupOptions = false;
    importProfile = false;
    guide = '';
    tools = false;
    refreshError = '';
    actionError = '';
    busy = false;
    creating = false;
    checkoutOnly = false;
    paused = false;
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
    hoveredRow = '';
    controlKey = '';
    controlOperation = '';
    collapsed = new Set();
    init(_props, cx) {
        this.cli = String(props()?.cli ?? 'rig');
        this.cliArgs = []; // Installer supplies the absolute CLI module.
        this.guide = ''; // Installer supplies the agent guide.
        if (props()?.view === 'preview') {
            this.previewMode = true;
            this.cliArgs = Array.isArray(props()?.cliArgs) ? props().cliArgs.map(String) : this.cliArgs;
            this.previewName = String(props().rig);
            if (props().plan)
                this.setPreview(props().plan, this.previewName);
            else
                this.action('plan', this.previewName, cx);
            return;
        }
        this.selected = localStorage.getItem('selected') ?? '';
        try {
            const saved = JSON.parse(localStorage.getItem('collapsed') ?? '[]');
            if (Array.isArray(saved))
                this.collapsed = new Set(saved.filter((id) => typeof id === 'string'));
        }
        catch { /* Ignore malformed view preferences; rig definitions are unaffected. */ }
        this.name = InputState.new({ placeholder: 'Rig name' });
        this.profile = InputState.new({ placeholder: 'Absolute profile.json path' });
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
    refresh(cx) {
        if (this.busy)
            return;
        this.busy = true;
        cx.spawn(async (cx) => {
            try {
                const args = ['status'];
                if (this.checkoutOnly) {
                    const cwd = localCheckout();
                    if (!cwd)
                        throw new Error('Focus a local terminal checkout first');
                    args.push('--checkout', cwd);
                }
                this.data = await this.call(args);
                this.refreshError = '';
            }
            catch (error) {
                this.refreshError = String(error);
                this.data.core = 'unavailable';
            }
            finally {
                this.busy = false;
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
                    if (this.previewMode)
                        this.setPreview(result, name);
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
                if (!this.previewMode)
                    this.refresh(cx);
                cx.notify();
            }
        });
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
                if (!this.previewMode)
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
    endpointIcons(rig, service) {
        const endpoints = Object.entries(service.endpoints);
        const t = theme();
        return h_flex().gap(1).items_center().flex_none().children(endpoints.map(([name, endpoint]) => {
            const browser = endpoint.protocol === 'http' || endpoint.protocol === 'https';
            const enabled = browser && service.state === 'running' && service.assignments === 'allocated';
            return div().id(`endpoint-${rig.id}-${service.id}-${name}`).size(22).rounded(5).flex().items_center().justify_center()
                .text_color(t.dim).text_size(15).tooltip(`${name}: ${endpoint.url} (${service.assignments})`)
                .when(enabled, el => el.cursor_pointer().hover(style => style.bg(t.hover).text_color(t.foreground)))
                .child(browser ? div().child('↗') : svg('mods/workspace-chrome/server.svg').size(12))
                .on_click((_event, cx) => { cx.stop_propagation(); if (enabled)
                cx.open_url(endpoint.url); });
        }));
    }
    operationIndicator(key, fallback) {
        return this.controlKey === key ? { kind: 'working', label: this.controlOperation === 'down' ? 'Stopping…' : this.controlOperation === 'restart' ? 'Restarting…' : 'Starting…' } : fallback;
    }
    checkoutDescription(rig) {
        const checkouts = Object.values(rig.checkouts);
        if (checkouts.length !== 1)
            return `${checkouts.length} checkouts`;
        const checkout = checkouts[0];
        const worktree = checkout.root.split('/').filter(Boolean).pop() ?? checkout.root;
        return `${worktree} · ${checkout.branch ?? 'missing checkout'}${checkout.unborn ? ' · no commits' : ''}`;
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
        const services = Object.values(rig.services), indicators = services.map(service => this.serviceIndicator(service));
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
    loadProfile(cx) {
        cx.spawn(async (cx) => {
            try {
                const text = await readTextFile(this.profile.value());
                if (!text)
                    throw new Error('Select an existing local profile');
                const profile = JSON.parse(text);
                if (profile.version !== 1 || !Array.isArray(profile.repos))
                    throw new Error('Expected version 1 profile with repo slots');
                this.repoSlots = profile.repos;
                this.selections = {};
                this.actionError = '';
            }
            catch (e) {
                this.actionError = String(e);
            }
            cx.notify();
        });
    }
    create(cx) {
        this.busy = true;
        this.actionError = '';
        cx.spawn(async (cx) => {
            try {
                if (this.repoSlots.some(r => !this.selections[r]))
                    throw new Error('Explicitly select a checkout for every repo');
                const args = ['create', this.name.value(), '--profile', this.profile.value()];
                for (const repo of this.repoSlots)
                    args.push('--repo', `${repo}=${this.selections[repo]}`);
                const result = await this.call(args);
                this.selected = result.id;
                localStorage.setItem('selected', this.selected);
                this.creating = false;
                this.openPreview(result.plan, result.id);
            }
            catch (e) {
                this.actionError = String(e);
            }
            finally {
                this.busy = false;
                if (!this.previewMode)
                    this.refresh(cx);
                cx.notify();
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
            .child(div().id('close-preview').px(8).py(4).rounded(6).cursor_pointer().text_color(t.muted)
            .hover(s => s.bg(t.hover)).child('Close').on_click(() => closeOverlay(String(props().overlay)))));
        if (this.actionError)
            root.child(div().px(20).py(8).text_color(t.blocked).whitespace_normal().child(this.actionError));
        if (this.preview) {
            const preview = this.preview;
            const review = v_flex().id('rig-preview-scroll').flex_1().min_h(0).p(20).gap(12).overflow_y_scrollbar().mode('always')
                .child(div().text_size(11).text_color(t.dim).child('Ports are proposals until Start reserves them.'));
            const field = (label, value) => v_flex().gap(2)
                .child(div().text_size(11).text_color(t.dim).child(label))
                .child(div().text_size(12).text_color(t.muted).whitespace_normal().child(value));
            for (const [repo, checkout] of Object.entries(preview.checkouts))
                review.child(field(`${repo} · ${checkout.branch}${checkout.unborn ? ' · no commits' : ''}`, checkout.root));
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
                .child(this.button('apply-plan', this.busy ? 'Working…' : preview.setup || !preview.review.approved ? 'Approve and start' : 'Start this rig', cx => this.approveAndStart(cx))));
        }
        else
            root.child(div().flex_1().p(20).text_color(t.dim).child(this.actionError ? 'Close and reopen this preview to load the current plan.' : 'Loading preview…'));
        return root;
    }
    render(_cx) {
        if (this.previewMode)
            return this.renderPreview();
        const t = theme();
        const content = v_flex().id('rigs-scroll').flex_1().min_h(0).px(8).pb(10).gap(4).overflow_y_scrollbar().mode('always');
        const icon = (id, file, tip, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
            .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
            .on_click((_e, cx) => { if (!this.busy)
            action(cx); })
            .child(svg(`mods/workspace-chrome/${file}.svg`).size(14));
        const root = v_flex().id('rigs-root').size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_color(t.foreground).text_size(13);
        root.child(h_flex().h(31).pl(16).pr(10).flex_none().items_center().justify_between().text_size(11.5).text_color(t.dim)
            .child('Rigs')
            .child(h_flex().gap(2).items_center().flex_none()
            .child(icon('options', 'settings', 'Rig options', cx => { this.tools = !this.tools; cx.notify(); }))
            .child(icon('new', 'plus', 'New rig', cx => { this.creating = !this.creating; this.setupCopied = false; this.setupOptions = false; this.setupCheckout = localCheckout() ?? ''; cx.notify(); }))));
        if (this.tools)
            content.child(v_flex().gap(2)
                .child(this.button('checkout', this.checkoutOnly ? 'Show all rigs' : 'Show rigs for this checkout', cx => { this.checkoutOnly = !this.checkoutOnly; this.refresh(cx); }))
                .child(this.button('pause', this.paused ? 'Resume polling' : 'Pause polling', cx => { this.paused = !this.paused; cx.notify(); }))
                .child(this.button('stopped', this.showStopped ? 'Hide stopped definitions' : 'Show stopped definitions', cx => { this.showStopped = !this.showStopped; cx.notify(); })));
        if (this.refreshError)
            content.child(div().px(8).text_size(12).text_color(t.blocked).child(this.refreshError));
        if (this.actionError)
            content.child(v_flex().gap(2).px(8).child(div().text_size(12).text_color(t.blocked).child(this.actionError)).child(this.button('dismiss-action-error', 'Dismiss', cx => { this.actionError = ''; cx.notify(); })));
        if (this.creating) {
            content.child(h_flex().gap(4).px(8).pb(4).items_center()
                .child(h_flex().id('copy-setup').flex_1().gap(8).px(8).py(6).rounded(6).items_center().text_size(12).text_color(t.muted)
                .tooltip(this.setupCopied ? 'Prompt copied' : 'Copy the setup prompt for your agent')
                .hover(s => s.bg(t.hover))
                .child(div().flex_1().child(this.setupCopied ? 'Copied' : 'Agent Setup Prompt'))
                .child(svg('mods/workspace-chrome/files.svg').size(14).text_color(t.dim))
                .on_click((_event, cx) => {
                if (this.busy)
                    return;
                cx.write_to_clipboard(setupPrompt({ checkout: this.setupCheckout, guide: this.guide }));
                this.setupCopied = true;
                cx.notify();
            }))
                .child(icon('setup-options', 'settings', 'Setup options', cx => { this.setupOptions = !this.setupOptions; cx.notify(); })));
        }
        if (this.creating && this.setupOptions) {
            content.child(v_flex().gap(6).px(8).pb(8)
                .child(div().text_size(11).text_color(t.dim).truncate().tooltip(this.setupCheckout).child(this.setupCheckout || 'Use your agent’s current checkout'))
                .child(this.button('setup-folder', 'Choose checkout…', cx => cx.spawn(async (cx) => {
                const folder = await pickFolder({ prompt: 'Choose checkout to set up' });
                if (folder) {
                    this.setupCheckout = folder;
                    this.setupCopied = false;
                }
                cx.notify();
            })))
                .child(this.button('copy-demo-setup', 'Try a demo · copy setup prompt', cx => {
                cx.write_to_clipboard(setupPrompt({ guide: this.guide, demo: true }));
            }))
                .child(this.button('import-profile', this.importProfile ? 'Hide existing-profile import' : 'Already have a profile? Import it', cx => { this.importProfile = !this.importProfile; cx.notify(); })));
        }
        if (this.creating && this.setupOptions && this.importProfile) {
            content.child(v_flex().gap(6).child(div().child('Create from a reviewed profile'))
                .child(Input.new(this.name).h(30).px(8).bg(t.background).border(1).border_color(t.input))
                .child(Input.new(this.profile).h(30).px(8).bg(t.background).border(1).border_color(t.input))
                .child(this.button('load-profile', 'Load repo slots', cx => this.loadProfile(cx))));
            for (const repo of this.repoSlots)
                content.child(v_flex().gap(4).child(div().child(`${repo}: ${this.selections[repo] ?? 'Choose a worktree'}`))
                    .child(h_flex().gap(6)
                    .child(this.button(`suggest-${repo}`, 'Use focused checkout', cx => { const cwd = localCheckout(); if (cwd)
                    this.selections[repo] = cwd; cx.notify(); }))
                    .child(this.button(`pick-${repo}`, 'Choose folder', cx => cx.spawn(async (cx) => { const folder = await pickFolder({ prompt: `Choose checkout for ${repo}` }); if (folder)
                    this.selections[repo] = folder; cx.notify(); })))));
            if (this.repoSlots.length)
                content.child(this.button('create', 'Save and preview', cx => this.create(cx)));
        }
        const rigs = this.data.rigs.filter(r => r.claimed || r.review_required || this.showStopped);
        for (const rig of rigs) {
            const card = v_flex().w_full().gap(2).rounded(8);
            const rigKey = `rig-${rig.id}`;
            card.child(h_flex().id(`rig-row-${rig.id}`).w_full().px(8).py(4).gap(6).rounded(6).items_center().cursor_pointer()
                .hover(style => style.bg(t.hover))
                .on_click((_event, cx) => { this.selected = rig.id; localStorage.setItem('selected', rig.id); this.openPreview(undefined, rig.id, rig.name); cx.notify(); })
                .on_hover((hovered, cx) => this.hoverRow(rigKey, hovered, cx))
                .when(rig.id === this.selected, el => el.bg(t.raised))
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
                .child(div().text_size(12).font_semibold().text_color(t.muted).truncate().child(rig.name))
                .child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).truncate().child(this.checkoutDescription(rig))))
                .child(this.controls(rig))
                .child(this.statusIcon(this.operationIndicator(rigKey, this.rigIndicator(rig)))));
            if (rig.error)
                card.child(div().pl(20).text_color(t.blocked).child(rig.error));
            for (const service of this.collapsed.has(rig.id) ? [] : Object.values(rig.services)) {
                const row = v_flex().w_full().gap(2).pl(20).pr(8).py(3).rounded(8).when(Boolean(service.checkout_match), el => el.bg(t.selected));
                const serviceKey = `service-${rig.id}-${service.id}`;
                row.child(h_flex().id(`service-row-${rig.id}-${service.id}`).w_full().h(26).gap(6).rounded(6).items_center()
                    .tooltip(service.terminal ? 'Open live output' : 'No output yet · start this service first')
                    .hover(style => style.bg(t.hover))
                    .when(Boolean(service.terminal), el => el.cursor_pointer().on_click(() => run('terminal.peek', { terminal: service.terminal })))
                    .on_hover((hovered, cx) => this.hoverRow(serviceKey, hovered, cx))
                    .child(h_flex().id(serviceKey).flex_1().min_w(0).gap(8).items_center()
                    .child(svg('mods/workspace-chrome/server.svg').size(14).text_color(t.muted))
                    .child(div().flex_1().truncate().text_color(t.muted).child(service.id)))
                    .when(Object.keys(service.endpoints).length > 0, el => el.child(this.endpointIcons(rig, service)))
                    .child(this.controls(rig, service))
                    .child(this.statusIcon(this.operationIndicator(serviceKey, this.serviceIndicator(service)))));
                for (const external of service.external_dependencies ?? [])
                    row.child(div().text_size(11).text_color(external.readiness === 'failed' ? t.blocked : t.dim).child(`${external.key} · external · ${external.readiness}`));
                if (service.degraded_dependencies.length)
                    row.child(div().text_color(t.blocked).child(`Dependency degraded: ${service.degraded_dependencies.join(', ')}`));
                card.child(row);
            }
            content.child(card);
        }
        if (!rigs.length)
            content.child(div().px(8).text_size(12).text_color(t.dim).child('No active rigs. Use + to create one.'));
        root.child(content);
        return root;
    }
}
