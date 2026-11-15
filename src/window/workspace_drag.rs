//! Host-owned drag handles and previews for local workspace composition.
use super::*;
use crate::workspace::drag::{self, Source, Target};
use panel_workspace::Edge;

pub(super) struct WorkspaceDrag {
    source: Source,
    revision: u64,
    down: Point<Pixels>,
    moving: bool,
    target: Option<(Target, Bounds<Pixels>)>,
}

impl AppWindow {
    pub(super) fn workspace_press(
        &mut self,
        source: Source,
        at: Point<Pixels>,
        cx: &mut Context<Self>,
    ) {
        if self.workspace_save_sizes().is_err() {
            return;
        }
        let Some(session) = &self.workspace else {
            return;
        };
        self.workspace_drag = Some(WorkspaceDrag {
            source,
            revision: session.engine.revision(),
            down: at,
            moving: false,
            target: None,
        });
        cx.notify();
    }

    pub(super) fn workspace_grip(&self, source: Source, cx: &mut Context<Self>) -> AnyElement {
        if self
            .workspace
            .as_ref()
            .is_some_and(|s| s.engine.document().maximized_group_id.is_some())
        {
            return div().into_any_element();
        }
        div()
            .id(SharedString::from(format!("workspace-grip-{source:?}")))
            .w(settings::z(28.))
            .h(settings::z(18.))
            .rounded(settings::z(4.))
            .bg(c("background").opacity(0.85))
            .hover(|s| s.bg(c("hover")))
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(settings::z(3.))
            .group("workspace-grip")
            .cursor(CursorStyle::OpenHand)
            .occlude()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, ev: &MouseDownEvent, _, cx| {
                    this.workspace_press(source.clone(), ev.position, cx);
                    cx.stop_propagation();
                }),
            )
            .children((0..2).map(|_| {
                div().flex().gap(settings::z(3.)).children((0..3).map(|_| {
                    div()
                        .size(settings::z(2.))
                        .rounded_full()
                        .bg(c("dim"))
                        .group_hover("workspace-grip", |s| s.bg(c("foreground")))
                }))
            }))
            .into_any_element()
    }

    pub(super) fn workspace_tabs(&self, n: &Node, cx: &mut Context<Self>) -> AnyElement {
        let mut row = div()
            .size_full()
            .relative()
            .group("workspace-group-header")
            .flex()
            .bg(c("background"))
            .border_b_1()
            .border_color(c("border"))
            .text_xs();
        for (i, ch) in n.children().iter().enumerate() {
            let (group, view, drag_view) = (n.id.clone(), ch.id.clone(), ch.id.clone());
            let bounds = self.bounds.clone();
            let measured = format!("@workspace/tab/{}", ch.id);
            row = row.child(
                div()
                    .id(SharedString::from(format!("workspace-tab-{}", ch.id)))
                    .relative()
                    .px_3()
                    .h_full()
                    .flex()
                    .items_center()
                    .cursor(CursorStyle::OpenHand)
                    .hover(|s| s.bg(c("hover")))
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, ev: &MouseDownEvent, _, cx| {
                            this.workspace_press(Source::View(drag_view.clone()), ev.position, cx);
                            cx.stop_propagation();
                        }),
                    )
                    .on_click(cx.listener(move |this, event: &ClickEvent, w, cx| {
                        if matches!(event,ClickEvent::Mouse(e) if e.up.click_count>=2) {
                            this.run("workspace.rename", json!({"view":view}), w, cx);
                        } else {
                            this.run("layout.select", json!({"stack":group,"child":view}), w, cx);
                        }
                    }))
                    .child(ch.title.clone().unwrap_or_else(|| (i + 1).to_string()))
                    .child(
                        canvas(
                            move |b, _, _| {
                                bounds.borrow_mut().insert(measured, b);
                            },
                            |_, _, _, _| {},
                        )
                        .absolute()
                        .size_full(),
                    ),
            );
        }
        row.child(
            div()
                .absolute()
                .opacity(0.)
                .group_hover("workspace-group-header", |s| s.opacity(1.))
                .top(settings::z(6.))
                .left(relative(0.5))
                .ml(-settings::z(14.))
                .child(self.workspace_grip(Source::Group(n.id.clone()), cx)),
        )
        .into_any_element()
    }

    /// Reveal a neighbor when lifting a tab or its only panel, without saving a selection.
    pub(super) fn workspace_drag_preview_view<'a>(&self, group: &'a panel_workspace::Group) -> &'a str {
        if let Some(drag) = &self.workspace_drag {
            let lifting_tab = match &drag.source {
                Source::View(id) => id == &group.active_view_id,
                Source::Section(id) => group.views.iter().find(|v| v.id == group.active_view_id)
                    .is_some_and(|v| v.sections.len() == 1 && v.sections[0].id == *id),
                Source::Group(_) => false,
            };
            if drag.moving && lifting_tab {
                if let Some(view) = group.views.iter().find(|v| v.id != group.active_view_id) {
                    return &view.id;
                }
            }
        }
        &group.active_view_id
    }

    pub(super) fn workspace_drag_layout(&self) -> Option<Node> {
        let session = self.workspace.as_ref()?;
        let group = session.engine.document().groups.iter()
            .find(|g| self.workspace_drag_preview_view(g) != g.active_view_id)?;
        let mut layout = self.chrome.clone();
        layout.select(&group.id, self.workspace_drag_preview_view(group));
        Some(layout)
    }

    pub(super) fn workspace_view_drop_targets(&self) -> Vec<(Target, Bounds<Pixels>, &'static str)> {
        if self.person.no_headers { return vec![]; }
        let Some(drag) = &self.workspace_drag else { return vec![] };
        let Source::View(source) = &drag.source else { return vec![] };
        let Some(session) = &self.workspace else { return vec![] };
        let doc = session.engine.document();
        let bounds = self.bounds.borrow();
        let mut targets = vec![];
        for zone in doc.zones.iter().filter(|z| !z.hidden) {
            for (index, reference) in zone.groups.iter().enumerate() {
                let Some(group) = doc.group(&reference.group_id) else { continue };
                let Some(view) = doc.view(self.workspace_drag_preview_view(group)) else { continue };
                let Some(section) = view.sections.first() else { continue };
                let Some(header) = bounds.get(&format!("{}{}", crate::workspace::HEADER, section.id)) else { continue };
                let width = settings::z(96.).min(((header.size.width - settings::z(28.)) / 2.).max(px(0.)));
                if width < settings::z(40.) { continue; }
                let title = crate::workspace::panel_title(&doc.panels[&section.panel_id]);
                let offset = settings::z(28. + title.chars().count() as f32 * 7.)
                    .min((header.size.width - width * 2. - settings::z(18.)).max(px(0.)));
                let area = Bounds::new(header.origin + point(offset, settings::z(8.)), size(width, settings::z(26.)));
                if &view.id != source {
                    targets.push((Target::Sections { view: view.id.clone(), index: view.sections.len() }, area, "Stack Panels"));
                }
                let next = Bounds::new(area.origin + point(width + settings::z(4.), px(0.)), area.size);
                targets.push((Target::Zone { edge: zone.edge, index: index + 1 }, next, "New Pane"));
            }
        }
        targets
    }

    // Offer the same explicit target on native and mod-owned title rows.
    pub(super) fn workspace_tab_group_targets(&self) -> Vec<(Target, Bounds<Pixels>)> {
        if self.person.no_headers { return vec![]; }
        let Some(drag) = &self.workspace_drag else { return vec![] };
        let Source::Section(source) = &drag.source else { return vec![] };
        let Some(session) = &self.workspace else { return vec![] };
        let doc = session.engine.document();
        let bounds = self.bounds.borrow();
        doc.groups.iter().filter(|g| !doc.floating.iter().any(|f| f.group_id == g.id))
            .filter_map(|g| doc.view(self.workspace_drag_preview_view(g))).flat_map(|v| &v.sections)
            .filter_map(|section| {
                if section.id == *source { return None; }
                if drag::tab_group_commands(doc, source, &section.id, "preview").ok()?.is_empty() { return None; }
                let header = *bounds.get(&format!("{}{}", crate::workspace::HEADER, section.id))?;
                let title = crate::workspace::panel_title(&doc.panels[&section.panel_id]);
                let width = settings::z(116.).min((header.size.width - settings::z(28.)).max(px(0.)));
                if width <= px(0.) { return None; }
                let offset = settings::z(28. + title.chars().count() as f32 * 7.)
                    .min((header.size.width - width - settings::z(14.)).max(px(0.)));
                let area = Bounds::new(header.origin + point(offset, settings::z(8.)), size(width, settings::z(26.)));
                Some((Target::TabGroup { section: section.id.clone() }, area))
            }).collect()
    }

    fn workspace_target(&self, at: Point<Pixels>) -> Option<(Target, Bounds<Pixels>)> {
        // Title chips describe tab grouping rather than a spatial insertion.
        if let Some(target) = self.workspace_tab_group_targets().into_iter().find(|(_, b)| b.contains(&at)) {
            return Some(target);
        }
        let target = self.workspace_hit_target(at)?;
        let source = &self.workspace_drag.as_ref()?.source;
        let doc = self.workspace.as_ref()?.engine.document();
        // Run the release transaction on a private draft, including removal of
        // empty source containers. Geometry then uses the renderer's sizing rules.
        let mut seed = "workspace-preview".to_owned();
        while self.chrome.walk().iter().any(|n| n.id.starts_with(&seed))
            || doc.panels.keys().any(|id| id.starts_with(&seed))
            || doc.groups.iter().any(|g| g.id.starts_with(&seed) || g.views.iter().any(|v|
                v.id.starts_with(&seed) || v.sections.iter().any(|s| s.id.starts_with(&seed))))
        {
            seed.push('-');
        }
        let commands = drag::commands(doc, source, &target, &seed).ok()?;
        if commands.is_empty() { return None; }
        let mut draft = panel_workspace::Engine::new(doc.clone()).ok()?;
        draft.apply(panel_workspace::Transaction { expected_revision: 0, commands }).ok()?;
        let layout = self.workspace_projection(draft.document(), &self.file_chrome).ok()?;
        let ids = match (&target, source) {
            (Target::Zone { .. }, Source::Group(id)) => vec![id.clone()],
            (Target::Zone { .. }, _) => vec![format!("{seed}-group")],
            (Target::Sections { .. }, Source::Section(id)) => vec![id.clone()],
            (Target::Sections { .. }, Source::View(id)) => doc.view(id)?.sections.iter().map(|s| s.id.clone()).collect(),
            (Target::Views { group, .. }, _) => vec![group.clone()],
            _ => return None,
        };
        let mut root = *self.bounds.borrow().get("@workspace/root")?;
        // The measuring canvas has no inset, so its static position starts at
        // the root's content origin while its size spans the padding box.
        let (y, x) = pane_size::padding(&layout);
        root.origin -= point(settings::z(x), settings::z(y));
        let focused = HashSet::new();
        let mut areas = ids.iter().map(|id| pane_size::block_bounds(&layout, root, id, None, &focused, settings::zoom()));
        let mut preview = areas.next()??;
        for area in areas {
            preview = preview.union(&area?);
        }
        Some((target, preview))
    }

    pub(crate) fn workspace_hit_target(&self, at: Point<Pixels>) -> Option<Target> {
        let drag = self.workspace_drag.as_ref()?;
        let doc = self.workspace.as_ref()?.engine.document();
        let bounds = self.bounds.borrow();
        let root = *bounds.get("@workspace/root")?;
        if !root.contains(&at) {
            return None;
        }
        if let Some((target, _, _)) = self.workspace_view_drop_targets().into_iter().find(|(_, b, _)| b.contains(&at)) {
            return Some(target);
        }
        // Tab labels take priority over spatial edge bands, including in the
        // topmost dock where the tab row overlaps the outer window band.
        for group in doc.groups.iter().filter(|g| doc.zones.iter().any(|z|
            !z.hidden && z.groups.iter().any(|r| r.group_id == g.id)))
        {
            if group.views.len() < 2 || !bounds.get(&group.id).is_some_and(|b| b.contains(&at)) {
                continue;
            }
            for (view_index, view) in group.views.iter().enumerate() {
                if let Some(tab) = bounds.get(&format!("@workspace/tab/{}", view.id))
                    .filter(|b| b.contains(&at))
                {
                    return Some(Target::Views {
                        group: group.id.clone(),
                        index: view_index + usize::from(at.x > tab.center().x),
                    });
                }
            }
        }
        // Prefer a pane's insertion edge to a perpendicular window edge.
        // Otherwise the leftmost top pane's left edge can only open a side dock.
        for zone in doc.zones.iter().filter(|z| !z.hidden) {
            for (index, reference) in zone.groups.iter().enumerate() {
                let Some(b) = bounds.get(&reference.group_id).filter(|b| b.contains(&at)) else { continue };
                let (position, start, length) = if matches!(zone.edge, Edge::Left | Edge::Right) {
                    (at.y, b.origin.y, b.size.height)
                } else {
                    (at.x, b.origin.x, b.size.width)
                };
                let band = settings::z(48.).min(length / 4.);
                if position < start + band || position > start + length - band {
                    return Some(Target::Zone {
                        edge: zone.edge,
                        index: index + usize::from(position > start + length / 2.),
                    });
                }
            }
        }
        // Edge bands remain reachable even when the zone is hidden or empty.
        let (distance, edge) = [
            (at.x - root.origin.x, Edge::Left),
            (root.origin.x + root.size.width - at.x, Edge::Right),
            (at.y - root.origin.y, Edge::Top),
            (root.origin.y + root.size.height - at.y, Edge::Bottom),
        ]
        .into_iter()
        .min_by(|a, b| a.0.partial_cmp(&b.0).unwrap())
        .unwrap();
        if distance < settings::z(40.) {
            let zone = doc.zones.iter().find(|z| z.edge == edge)?;
            let horizontal = !matches!(edge, Edge::Left | Edge::Right);
            let index = zone.groups.iter().position(|reference| {
                bounds.get(&reference.group_id).is_some_and(|b| if horizontal {
                    at.x <= b.center().x
                } else {
                    at.y <= b.center().y
                })
            }).unwrap_or(zone.groups.len());
            return Some(Target::Zone { edge, index });
        }
        // Inner bands choose center-only docks; the outer 40px bands above choose full width.
        if let Some(center) = bounds
            .get("@workspace/center-stack")
            .filter(|b| b.contains(&at))
        {
            let (distance, edge) = [
                (at.y - center.origin.y, Edge::TopCenter),
                (
                    center.origin.y + center.size.height - at.y,
                    Edge::BottomCenter,
                ),
            ]
            .into_iter()
            .min_by(|a, b| a.0.partial_cmp(&b.0).unwrap())
            .unwrap();
            if distance < settings::z(96.) {
                let zone = doc.zones.iter().find(|z| z.edge == edge);
                return Some(Target::Zone {
                    edge,
                    index: zone.map_or(0, |z| z.groups.len()),
                });
            }
        }
        for zone in doc.zones.iter().filter(|z| !z.hidden) {
            for (group_index, reference) in zone.groups.iter().enumerate() {
                let group = doc.group(&reference.group_id)?;
                let Some(b) = bounds.get(&group.id).copied().filter(|b| b.contains(&at)) else {
                    continue;
                };
                if matches!(drag.source, Source::Group(_)) {
                    let horizontal = !matches!(zone.edge, Edge::Left | Edge::Right);
                    let after = if horizontal {
                        at.x > b.origin.x + b.size.width / 2.
                    } else {
                        at.y > b.origin.y + b.size.height / 2.
                    };
                    return Some(Target::Zone {
                        edge: zone.edge,
                        index: group_index + usize::from(after),
                    });
                }
                let view = doc.view(self.workspace_drag_preview_view(group))?;
                for (index, section) in view.sections.iter().enumerate() {
                    if let Some(section_bounds) =
                        bounds.get(&section.id).copied().filter(|b| b.contains(&at))
                    {
                        let after =
                            at.y > section_bounds.origin.y + section_bounds.size.height / 2.;
                        return Some(Target::Sections {
                            view: view.id.clone(),
                            index: index + usize::from(after),
                        });
                    }
                }
                return Some(Target::Sections {
                    view: view.id.clone(),
                    index: view.sections.len(),
                });
            }
        }
        None
    }

    fn workspace_drag_move(&mut self, at: Point<Pixels>, pressed: bool, cx: &mut Context<Self>) {
        let Some(d) = &mut self.workspace_drag else {
            return;
        };
        if !pressed
            || self
                .workspace
                .as_ref()
                .is_none_or(|s| s.engine.revision() != d.revision)
        {
            self.workspace_drag = None;
            cx.notify();
            return;
        }
        if !d.moving && (at.x - d.down.x).abs().max((at.y - d.down.y).abs()) < settings::z(4.) {
            return;
        }
        d.moving = true;
        let target = self.workspace_target(at);
        self.workspace_drag.as_mut().unwrap().target = target;
        cx.notify();
    }

    fn workspace_drag_release(
        &mut self,
        at: Point<Pixels>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let target = self.workspace_target(at);
        let Some(d) = self.workspace_drag.take() else {
            return false;
        };
        cx.notify();
        if !d.moving {
            return false;
        }
        if let Some((target, _)) = target {
            let seed = self.model.fresh_id("workspace-");
            if let Some(session) = &self.workspace {
                match drag::commands(session.engine.document(), &d.source, &target, &seed) {
                    Ok(commands) => self.run(
                        "workspace.apply",
                        json!({"transaction":{"expected_revision":d.revision,"commands":commands}}),
                        window,
                        cx,
                    ),
                    Err(error) => self.command_error("Move panel", &error, window, cx),
                }
            }
        }
        true
    }

    fn workspace_dock_guides(&self) -> Vec<AnyElement> {
        let bounds = self.bounds.borrow();
        let (Some(root), Some(center)) = (
            bounds.get("@workspace/root"),
            bounds.get("@workspace/center-stack"),
        ) else {
            return vec![];
        };
        [
            ("Left", *root, false, false, true),
            ("Right", *root, true, false, true),
            ("Top · full width", *root, false, false, false),
            ("Bottom · full width", *root, true, false, false),
            ("Top · center", *center, false, true, false),
            ("Bottom · center", *center, true, true, false),
        ]
        .into_iter()
        .map(|(label, b, end, inner, vertical)| {
            let width = settings::z(if vertical { 32. } else { 160. }).min(b.size.width);
            let height = settings::z(if vertical { 128. } else { 32. }).min(b.size.height);
            let inset = settings::z(if inner { 48. } else { 4. });
            let x = if vertical {
                if end { b.origin.x + b.size.width - inset - width } else { b.origin.x + inset }
            } else { b.origin.x + (b.size.width - width) / 2. };
            let y = if vertical { b.origin.y + (b.size.height - height) / 2. }
                else if end { b.origin.y + b.size.height - inset - height }
                else { b.origin.y + inset };
            div()
                .absolute()
                .left(x)
                .top(y)
                .w(width)
                .h(height)
                .flex()
                .items_center()
                .justify_center()
                .rounded(settings::z(4.))
                .bg(c("background").opacity(0.95))
                .border_1()
                .border_color(c("accent"))
                .text_color(c("foreground"))
                .text_size(settings::z(11.))
                .child(label)
                .into_any_element()
        })
        .collect()
    }

    pub(super) fn workspace_drag_layer(&self, cx: &mut Context<Self>) -> AnyElement {
        let moving = self.workspace_drag.as_ref().is_some_and(|d| d.moving);
        let preview = self
            .workspace_drag
            .as_ref()
            .and_then(|d| d.target.as_ref())
            .map(|(_, b)| {
                div()
                    .id("workspace-drop-preview")
                    .debug_selector(|| "workspace-drop-preview".into())
                    .absolute()
                    .left(b.origin.x)
                    .top(b.origin.y)
                    .w(b.size.width)
                    .h(b.size.height)
                    .bg(c("accent").opacity(0.18))
                    .border_2()
                    .border_color(c("accent"))
                    .into_any_element()
            });
        let mut guides = if moving {
            self.workspace_dock_guides()
        } else {
            vec![]
        };
        if moving {
            guides.extend(self.workspace_tab_group_targets().into_iter().map(|(target, b)| {
                let Target::TabGroup { section } = target else { unreachable!() };
                let id = format!("workspace-tab-group-target-{section}");
                div().id(SharedString::from(id.clone())).debug_selector(move || id).absolute().left(b.origin.x).top(b.origin.y).w(b.size.width).h(b.size.height)
                    .rounded(settings::z(5.)).bg(c("background")).border_1().border_color(c("accent"))
                    .flex().items_center().justify_center().text_size(settings::z(11.)).text_color(c("accent"))
                    .child("+ Tab Group").into_any_element()
            }));
        }
        if moving {
            guides.extend(self.workspace_view_drop_targets().into_iter().map(|(_, b, label)| {
                div().absolute().left(b.origin.x).top(b.origin.y).w(b.size.width).h(b.size.height)
                    .rounded(settings::z(5.)).bg(c("background")).border_1().border_color(c("accent"))
                    .flex().items_center().justify_center().text_size(settings::z(11.)).text_color(c("accent"))
                    .child(label).into_any_element()
            }));
        }
        let this = cx.entity().downgrade();
        div()
            .id("workspace-drag-layer")
            .absolute()
            .inset_0()
            .when(moving, |d| d.occlude().cursor(CursorStyle::ClosedHand))
            .children(preview)
            .children(guides)
            .child(
                canvas(
                    |_, _, _| {},
                    move |_, _, window, _| {
                        let t = this.clone();
                        window.on_mouse_event(move |ev: &MouseMoveEvent, phase, _, cx| {
                            if phase == DispatchPhase::Capture {
                                let _ = t.update(cx, |this, cx| {
                                    this.workspace_drag_move(
                                        ev.position,
                                        ev.pressed_button == Some(MouseButton::Left),
                                        cx,
                                    )
                                });
                            }
                        });
                        let t = this.clone();
                        window.on_mouse_event(move |ev: &MouseUpEvent, phase, window, cx| {
                            if phase == DispatchPhase::Capture
                                && ev.button == MouseButton::Left
                                && t.update(cx, |this, cx| {
                                    this.workspace_drag_release(ev.position, window, cx)
                                })
                                .unwrap_or(false)
                            {
                                cx.stop_propagation();
                            }
                        });
                    },
                )
                .absolute()
                .size_full(),
            )
            .into_any_element()
    }
}
