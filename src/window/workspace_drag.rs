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

/// Match terminal dragging: shade the half that receives the insertion.
fn drop_area(mut b: Bounds<Pixels>, after: bool, horizontal: bool) -> Bounds<Pixels> {
    if horizontal {
        b.size.width /= 2.;
        if after {
            b.origin.x += b.size.width;
        }
    } else {
        b.size.height /= 2.;
        if after {
            b.origin.y += b.size.height;
        }
    }
    b
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

    fn workspace_target(&self, at: Point<Pixels>) -> Option<(Target, Bounds<Pixels>)> {
        let drag = self.workspace_drag.as_ref()?;
        let doc = self.workspace.as_ref()?.engine.document();
        let bounds = self.bounds.borrow();
        let root = *bounds.get("@workspace/root")?;
        if !root.contains(&at) {
            return None;
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
        if distance < settings::z(24.) {
            let zone = doc.zones.iter().find(|z| z.edge == edge)?;
            let extent = settings::z(zone.extent as f32);
            let mut preview = root;
            match edge {
                Edge::Left => preview.size.width = extent.min(root.size.width / 2.),
                Edge::Right => {
                    preview.size.width = extent.min(root.size.width / 2.);
                    preview.origin.x += root.size.width - preview.size.width;
                }
                Edge::Top | Edge::TopCenter => {
                    preview.size.height = extent.min(root.size.height / 2.)
                }
                Edge::Bottom | Edge::BottomCenter => {
                    preview.size.height = extent.min(root.size.height / 2.);
                    preview.origin.y += root.size.height - preview.size.height;
                }
            }
            let index = zone.groups.len();
            return Some((Target::Zone { edge, index }, preview));
        }
        // Inner bands choose center-only docks; the outer 24px bands above choose full width.
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
            if distance < settings::z(56.) {
                let zone = doc.zones.iter().find(|z| z.edge == edge);
                let extent = settings::z(zone.map_or(200., |z| z.extent) as f32)
                    .min(center.size.height / 2.);
                let mut preview = *center;
                preview.size.height = extent;
                if edge == Edge::BottomCenter {
                    preview.origin.y += center.size.height - extent;
                }
                return Some((
                    Target::Zone {
                        edge,
                        index: zone.map_or(0, |z| z.groups.len()),
                    },
                    preview,
                ));
            }
        }
        for zone in doc.zones.iter().filter(|z| !z.hidden) {
            for (group_index, reference) in zone.groups.iter().enumerate() {
                let group = doc.group(&reference.group_id)?;
                let Some(b) = bounds.get(&group.id).copied().filter(|b| b.contains(&at)) else {
                    continue;
                };
                // Views can be reordered by dropping on either half of a tab.
                for (view_index, view) in group.views.iter().enumerate() {
                    if let Some(tab) = bounds
                        .get(&format!("@workspace/tab/{}", view.id))
                        .filter(|b| b.contains(&at))
                    {
                        let target = if matches!(drag.source, Source::Section(_)) {
                            Target::Sections {
                                view: view.id.clone(),
                                index: view.sections.len(),
                            }
                        } else {
                            Target::Views {
                                group: group.id.clone(),
                                index: view_index
                                    + usize::from(at.x > tab.origin.x + tab.size.width / 2.),
                            }
                        };
                        return Some((target, b));
                    }
                }
                if matches!(drag.source, Source::Group(_)) {
                    let horizontal = !matches!(zone.edge, Edge::Left | Edge::Right);
                    let after = if horizontal {
                        at.x > b.origin.x + b.size.width / 2.
                    } else {
                        at.y > b.origin.y + b.size.height / 2.
                    };
                    return Some((
                        Target::Zone {
                            edge: zone.edge,
                            index: group_index + usize::from(after),
                        },
                        drop_area(b, after, horizontal),
                    ));
                }
                let view = doc.view(&group.active_view_id)?;
                if matches!(drag.source, Source::View(_)) {
                    return Some((
                        Target::Views {
                            group: group.id.clone(),
                            index: group.views.len(),
                        },
                        b,
                    ));
                }
                for (index, section) in view.sections.iter().enumerate() {
                    if let Some(section_bounds) =
                        bounds.get(&section.id).copied().filter(|b| b.contains(&at))
                    {
                        let after =
                            at.y > section_bounds.origin.y + section_bounds.size.height / 2.;
                        return Some((
                            Target::Sections {
                                view: view.id.clone(),
                                index: index + usize::from(after),
                            },
                            drop_area(section_bounds, after, false),
                        ));
                    }
                }
                return Some((
                    Target::Sections {
                        view: view.id.clone(),
                        index: view.sections.len(),
                    },
                    b,
                ));
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
            ("Top · full width", *root, false, false),
            ("Bottom · full width", *root, true, false),
            ("Top · center", *center, false, true),
            ("Bottom · center", *center, true, true),
        ]
        .into_iter()
        .map(|(label, b, bottom, inner)| {
            let width = settings::z(128.).min(b.size.width);
            let inset = settings::z(if inner { 32. } else { 2. });
            let y = if bottom {
                b.origin.y + b.size.height - inset - settings::z(20.)
            } else {
                b.origin.y + inset
            };
            div()
                .absolute()
                .left(b.origin.x + (b.size.width - width) / 2.)
                .top(y)
                .w(width)
                .h(settings::z(20.))
                .flex()
                .items_center()
                .justify_center()
                .rounded(settings::z(4.))
                .bg(c("background").opacity(0.95))
                .border_1()
                .border_color(c("accent"))
                .text_color(c("foreground"))
                .text_size(settings::z(10.))
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
        let guides = if moving {
            self.workspace_dock_guides()
        } else {
            vec![]
        };
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
