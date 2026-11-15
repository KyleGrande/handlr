//! Native secondary windows render the owner's existing mod entities. A move
//! changes placement only; it never loads a replacement copy of a panel.
use super::*;

pub(super) struct WorkspaceFloat {
    owner: WeakEntity<AppWindow>,
    main: AnyWindowHandle,
    group: String,
    focus: FocusHandle,
    ready: bool,
    _subscriptions: Vec<Subscription>,
    save: Option<Task<()>>,
}

impl WorkspaceFloat {
    fn new(
        owner: WeakEntity<AppWindow>,
        main: AnyWindowHandle,
        group: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        focus.focus(window, cx);
        let mut subscriptions = vec![];
        if let Some(entity) = owner.upgrade() {
            subscriptions.push(cx.observe(&entity, |_, _, cx| cx.notify()));
        }
        subscriptions.push(cx.observe_window_bounds(window, |this, window, cx| {
            if !this.ready {
                return;
            }
            let WindowBounds::Windowed(bounds) = window.inner_window_bounds() else {
                return;
            };
            let content_size = window.viewport_size();
            let owner = this.owner.clone();
            let group = this.group.clone();
            let revision = owner
                .upgrade()
                .and_then(|o| o.read(cx).workspace.as_ref().map(|s| s.engine.revision()));
            this.save = Some(cx.spawn_in(window, async move |_, cx| {
                cx.background_executor()
                    .timer(Duration::from_millis(400))
                    .await;
                let _ = cx.update(|window, cx| {
                    let _ = owner.update(cx, |owner, cx| {
                        let Some(session) = &owner.workspace else {
                            return;
                        };
                        if Some(session.engine.revision()) != revision {
                            return;
                        }
                        let Some(mut floating) = session
                            .engine
                            .document()
                            .floating
                            .iter()
                            .find(|f| f.group_id == group)
                            .cloned()
                        else {
                            return;
                        };
                        let next = [
                            f32::from(bounds.origin.x) as f64,
                            f32::from(bounds.origin.y) as f64,
                            f32::from(content_size.width) as f64,
                            f32::from(content_size.height) as f64,
                        ];
                        if [floating.x, floating.y, floating.width, floating.height] == next {
                            return;
                        }
                        [floating.x, floating.y, floating.width, floating.height] = next;
                        owner.workspace_action(
                            vec![panel_workspace::Command::FloatGroup { window: floating }],
                            window,
                            cx,
                        );
                    });
                });
            }));
        }));
        let closing = owner.clone();
        let closing_group = group.clone();
        window.on_window_should_close(cx, move |_, cx| {
            if QUITTING.load(std::sync::atomic::Ordering::SeqCst) {return true}
            // Closing returns the contents to their dock. A failed save keeps
            // the window open, so its contents never disappear.
            let _ = main.update(cx, |_, window, cx| {
                let _ = closing.update(cx, |owner, cx| {
                    owner.run("workspace.dock", json!({"group":closing_group}), window, cx);
                });
            });
            false
        });
        // open_window draws once synchronously while the owner is borrowed.
        // Start drawing its entities only after that transaction has returned.
        cx.defer_in(window, |this, _, cx| {
            this.ready = true;
            cx.notify();
        });
        Self {
            owner,
            main,
            group,
            focus,
            ready: false,
            _subscriptions: subscriptions,
            save: None,
        }
    }

    fn command(&self, name: &str, mut args: Value, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(name, "tab.close" | "workspace.float" | "workspace.dock") {
            args = json!({"group":self.group});
            let owner = self.owner.clone();
            let _ = self.main.update(cx, |_, w, cx| {
                let _ = owner.update(cx, |owner, cx| {
                    owner.run("workspace.dock", args, w, cx);
                });
            });
        } else {
            let _ = self.owner.update(cx, |owner, cx| {
                owner.run(name, args, window, cx);
            });
        }
    }
}

impl Render for WorkspaceFloat {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        window.set_rem_size(px(settings::ui_font_size()));
        let group = self.group.clone();
        let content = if self.ready {
            self.owner
                .update(cx, |owner, cx| {
                    let node = owner
                        .workspace_float_layouts
                        .get(&group)
                        .cloned()
                        .or_else(|| owner.workspace_float_node(&group).ok())?;
                    Some(
                        div()
                            .relative()
                            .size_full()
                            .flex()
                            .flex_col()
                            .child(owner.render_node(&node, &HashSet::new(), None, cx))
                            .children(owner.render_overlays(
                                window.viewport_size(),
                                window.window_handle(),
                                cx,
                            )),
                    )
                })
                .ok()
                .flatten()
        } else {
            None
        };
        div()
            .id("workspace-float")
            .track_focus(&self.focus)
            .key_context("Herdr WorkspaceFloat")
            .size_full()
            .relative()
            .flex()
            .flex_col()
            .p(settings::z(crate::workspace::PANEL_GAP))
            .bg(c("canvas"))
            .text_color(c("foreground"))
            .font_family(settings::get().ui_font_family.clone())
            .on_action(
                cx.listener(|this, a: &ShellAction, w, cx| this.command(a.id(), json!({}), w, cx)),
            )
            .on_action(cx.listener(|this, a: &crate::keys::CommandBinding, w, cx| {
                if let Ok((name, args)) = a.command() {
                    this.command(&name, args, w, cx)
                }
            }))
            .capture_any_mouse_down(cx.listener(|this, ev: &MouseDownEvent, _, cx| {
                let _ = this
                    .owner
                    .update(cx, |owner, _| owner.pointer = ev.position);
            }))
            .on_mouse_move(cx.listener(|this, ev: &MouseMoveEvent, _, cx| {
                let _ = this.owner.update(cx, |owner, cx| {
                    if owner.drag.is_some() {
                        if ev.pressed_button == Some(MouseButton::Left) {
                            owner.drag_to(ev.position);
                            cx.notify();
                        } else {
                            owner.drag = None;
                            owner.save();
                        }
                    }
                });
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    let _ = this.owner.update(cx, |owner, cx| {
                        if owner.drag.take().is_some() {
                            owner.save();
                            owner.publish(cx);
                        }
                    });
                }),
            )
            .child(div().flex().flex_1().min_h_0().min_w_0().children(content))
    }
}

impl AppWindow {
    pub(super) fn workspace_float_node(&self, group: &str) -> Result<Node, String> {
        let doc = self
            .workspace
            .as_ref()
            .ok_or("no workspace")?
            .engine
            .document();
        let headers = self
            .folders
            .iter()
            .filter(|(_, m)| m.hint.workspace_header)
            .map(|(n, _)| n.clone())
            .collect();
        let mut layout = crate::workspace::group_node_with_headers(doc, group, &headers)?;
        if self.person.no_headers {
            crate::workspace::hide_panel_headers(doc, &mut layout);
        }
        Ok(layout)
    }

    pub(super) fn workspace_sync_floats(
        &mut self,
        main: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let desired = self
            .workspace
            .as_ref()
            .map(|s| s.engine.document().floating.clone())
            .unwrap_or_default();
        let stale: Vec<_> = self
            .workspace_windows
            .keys()
            .filter(|id| !desired.iter().any(|f| &f.group_id == *id))
            .cloned()
            .collect();
        for id in stale {
            if let Some(handle) = self.workspace_windows.remove(&id) {
                cx.defer(move |cx| {
                    let _ = handle.update(cx, |_, w, _| w.remove_window());
                });
            }
        }
        if let Some(session) = &self.workspace {
            let document = session.engine.document().clone();
            self.workspace_open_floats(&document, main, cx)?;
        }
        Ok(())
    }

    pub(super) fn workspace_open_floats(
        &mut self,
        document: &panel_workspace::Workspace,
        main: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        for floating in &document.floating {
            if self.workspace_windows.contains_key(&floating.group_id) {
                continue;
            }
            let at = point(px(floating.x as f32), px(floating.y as f32));
            let dimensions = size(
                px(floating.width.max(280.) as f32),
                px(floating.height.max(180.) as f32),
            );
            let bounds = if cx.displays().iter().any(|d| d.bounds().contains(&at)) {
                Bounds::new(at, dimensions)
            } else {
                Bounds::centered(None, dimensions, cx)
            };
            let owner = cx.weak_entity();
            let main = self.workspace_main_window.unwrap_or(main.window_handle());
            let group = floating.group_id.clone();
            let title = document
                .group(&group)
                .and_then(|g| g.views.iter().find(|v| v.id == g.active_view_id))
                .map(|v| v.title.clone())
                .unwrap_or_else(|| "Panel".into());
            let handle = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(bounds)),
                        titlebar: Some(TitlebarOptions {
                            title: Some(format!("Handlr — {title}").into()),
                            ..Default::default()
                        }),
                        window_min_size: Some(size(px(280.), px(180.))),
                        ..Default::default()
                    },
                    move |window, cx| {
                        cx.new(|cx| WorkspaceFloat::new(owner, main, group, window, cx))
                    },
                )
                .map_err(|e| e.to_string())?;
            self.workspace_windows
                .insert(floating.group_id.clone(), handle);
        }
        Ok(())
    }
}
