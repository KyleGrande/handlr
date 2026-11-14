use super::*;
use panel_workspace::{Command as WorkspaceCommand, Transaction, Workspace};

impl AppWindow {
    pub(super) fn panel_palette_entries(&self) -> Vec<Value> {
        self.folders.iter().filter(|(id,_)|!id.starts_with("frame-")).filter_map(|(id,found)| {
            let registered=self.workspace.as_ref().is_some_and(|s|s.engine.document().panels.values().any(|p|matches!(&p.content,panel_workspace::Content::Mod {name,..} if name==id)));
            let panel=found.hint.panel() || registered;
            if !panel && found.hint.overlay.is_none() {return None;}
            Some(json!({"name":if panel && self.workspace.is_some(){"workspace.open"}else{"mod.open"},
                "args":{"name":id},"group":if panel{"Panel"}else{"App"},
                "title":format!("Open {}",found.hint.label(id)),"words":format!("add show mod panel {id}")}))
        }).collect()
    }

    pub(super) fn workspace_picker_panels(&self) -> Vec<Value> {
        let Some(session)=&self.workspace else{return vec![]};
        let doc=session.engine.document();
        doc.groups.iter().flat_map(|g| &g.views).flat_map(|v| &v.sections)
            .filter_map(|s|doc.panels.get(&s.panel_id))
            .map(|p|json!({"id":p.id,"title":crate::workspace::panel_title(p)})).collect()
    }

    pub(super) fn workspace_panel_embedded(&self, panel: &panel_workspace::Panel) -> bool {
        crate::workspace::embedded_header(panel)
            || matches!(&panel.content,panel_workspace::Content::Mod {name,..} if self.folders.get(name).is_some_and(|m|m.hint.workspace_header))
    }

    pub(super) fn workspace_projection(&self, document: &Workspace, center: &Node) -> Result<Node, String> {
        let headers = self
            .folders
            .iter()
            .filter(|(_, m)| m.hint.workspace_header)
            .map(|(name, _)| name.clone())
            .collect();
        let mut layout = crate::workspace::project_with_headers(document, center, &headers)?;
        if self.person.no_headers {
            crate::workspace::hide_panel_headers(document, &mut layout);
        }
        Ok(layout)
    }
    pub(super) fn workspace_save_sizes(&mut self) -> Result<(), String> {
        let Some(session) = &self.workspace else {
            return Ok(());
        };
        let mut commands = vec![];
        let different = |a: f64, b: f64| (a - b).abs() > 0.00001 * a.abs().max(1.0);
        for zone in &session.engine.document().zones {
            let id = format!("{}zone/{}", crate::workspace::PREFIX, zone.edge.name());
            if let Some(Node {
                size: Some(Span::Px { px }),
                ..
            }) = self.chrome.find(&id)
            {
                if different(zone.extent, *px as f64) {
                    commands.push(WorkspaceCommand::ResizeZone {
                        edge: zone.edge,
                        extent: *px as f64,
                    });
                }
            }
            for reference in &zone.groups {
                if let Some(Node {
                    size: Some(Span::Weight { weight }),
                    ..
                }) = self.chrome.find(&reference.group_id)
                {
                    if different(reference.weight, *weight as f64) {
                        commands.push(WorkspaceCommand::ResizeGroup {
                            group_id: reference.group_id.clone(),
                            weight: *weight as f64,
                        });
                    }
                }
            }
        }
        for section in session
            .engine
            .document()
            .groups
            .iter()
            .flat_map(|g| &g.views)
            .flat_map(|v| &v.sections)
        {
            if !section.collapsed {
                if let Some(Node {
                    size: Some(Span::Weight { weight }),
                    ..
                }) = self.chrome.find(&section.id).or_else(||self.workspace_float_layouts.values().find_map(|n|n.find(&section.id)))
                {
                    if different(section.weight, *weight as f64) {
                        commands.push(WorkspaceCommand::ResizeSection {
                            section_id: section.id.clone(),
                            weight: *weight as f64,
                        });
                    }
                }
            }
        }
        if !commands.is_empty() {
            if let Err(error) = self.workspace.as_mut().unwrap().commands(commands) {
                // A failed save restores the accepted geometry as well as state.
                self.chrome = self.workspace_projection(
                    self.workspace.as_ref().unwrap().engine.document(),
                    &self.file_chrome,
                )?;
                return Err(error);
            }
        }
        Ok(())
    }

    pub(super) fn workspace_preflight_for(
        &self,
        document: &Workspace,
        center: &Node,
    ) -> Result<Node, String> {
        // Do not accept an ownership transfer until the Core transaction
        // protocol is connected. Reject before touching either placement.
        if document
            .panels
            .values()
            .any(|p| matches!(p.content, panel_workspace::Content::Terminal { .. }))
        {
            return Err(
                "terminal ownership transfer is not connected to the workspace adapter yet".into(),
            );
        }
        for floating in &document.floating {
            if document.maximized_group_id.as_deref() == Some(&floating.group_id) {
                return Err("use the floating window's native maximize control".into());
            }
            crate::workspace::group_node_with_headers(document,&floating.group_id,&Default::default())?;
        }
        for panel in document.panels.values() {
            if self.model.tab_of(&panel.id).is_some() {
                return Err("panel identity is already owned by a Core tab".into());
            }
            if let panel_workspace::Content::Mod {
                name, duplicable, ..
            } = &panel.content
            {
                let copies = document
                    .panels
                    .values()
                    .filter(|p| {
                        matches!(&p.content,
                    panel_workspace::Content::Mod { name: other, .. } if other == name)
                    })
                    .count();
                if !*duplicable && copies == 1 {
                    continue;
                }
                let supported = self
                    .folders
                    .get(name)
                    .and_then(|folder| std::fs::read_to_string(folder.dir.join("mod.json")).ok())
                    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    .is_some_and(|manifest| {
                        manifest.get("multiple_instances").and_then(Value::as_bool) == Some(true)
                    });
                if !supported {
                    return Err(format!(
                        "mod {name:?} has not declared multiple_instances support"
                    ));
                }
            }
        }
        self.workspace_projection(document, center)
    }

    pub(super) fn workspace_command(
        &mut self,
        name: &str,
        args: &Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<Value, String> {
        if matches!(name,"workspace.float"|"workspace.dock") {
            let doc = self.workspace.as_ref().ok_or("select a panel workspace first")?.engine.document();
            let panel = args.get("panel").and_then(Value::as_str)
                .or(self.workspace_active_panel.as_deref())
                .or(doc.focused_panel_id.as_deref());
            let group = args.get("group").and_then(Value::as_str)
                .or_else(||panel.and_then(|p|crate::workspace::floating::group_for_panel(doc,p)))
                .or_else(||doc.groups.first().map(|g|g.id.as_str())).ok_or("no open panel")?.to_owned();
            let commands = if name == "workspace.dock" {
                let edge = args.get("edge").map(|e|serde_json::from_value(e.clone()).map_err(|e|e.to_string())).transpose()?;
                crate::workspace::floating::dock(doc,&group,edge)?
            } else {
                let origin = window.bounds().origin;
                crate::workspace::floating::float(doc,if args.get("group").is_some(){None}else{panel},&group,&self.model.fresh_id("floating"),[f32::from(origin.x) as f64+80.,f32::from(origin.y) as f64+80.,560.,600.])?
            };
            let revision = self.workspace.as_ref().unwrap().engine.revision();
            return self.workspace_command("workspace.apply",&json!({"transaction":{"expected_revision":revision,"commands":commands}}),window,cx);
        }
        if name == "workspace.reveal" {
            let panel=args.get("panel").and_then(Value::as_str).ok_or("missing panel")?;
            let revision=self.workspace.as_ref().ok_or("select an opt-in workspace layout first")?.engine.revision();
            return self.workspace_command("workspace.apply",&json!({"transaction":{"expected_revision":revision,"commands":[WorkspaceCommand::RevealPanel {panel_id:panel.into()}]}}),window,cx);
        }
        if name == "workspace.open" {
            let name=args.get("name").and_then(Value::as_str).ok_or("missing name")?;
            let found=self.folders.get(name).ok_or("mod is not installed")?;
            let session=self.workspace.as_ref().ok_or("select an opt-in workspace layout first")?;
            let registered=session.engine.document().panels.values().any(|p|matches!(&p.content,panel_workspace::Content::Mod {name:n,..} if n==name));
            if !found.hint.panel() && !registered {return Err("mod does not declare an openable panel".into());}
            let title=found.hint.label(name);
            let edge=found.hint.place.as_deref().and_then(|p|serde_json::from_value(json!(p)).ok()).unwrap_or(panel_workspace::Edge::Right);
            let seed=self.model.fresh_id("workspace-open-");
            let commands=crate::workspace::open_mod(self.workspace.as_ref().unwrap().engine.document(),name,&title,edge,&seed);
            let revision=self.workspace.as_ref().unwrap().engine.revision();
            return self.workspace_command("workspace.apply",&json!({"transaction":{"expected_revision":revision,"commands":commands}}),window,cx);
        }
        if name == "workspace.rename" {
            let session = self
                .workspace
                .as_ref()
                .ok_or("select a panel workspace first")?;
            let title = args
                .get("name")
                .and_then(Value::as_str)
                .ok_or("missing name")?;
            let command = match (
                args.get("panel").and_then(Value::as_str),
                args.get("view").and_then(Value::as_str),
            ) {
                (Some(id), None) => WorkspaceCommand::RenamePanel {
                    panel_id: id.into(),
                    name: title.into(),
                },
                (None, Some(id)) => WorkspaceCommand::RenameView {
                    view_id: id.into(),
                    name: title.into(),
                },
                _ => return Err("specify exactly one panel or view".into()),
            };
            let revision = match args.get("expected_revision") {
                Some(value) => value
                    .as_u64()
                    .ok_or("expected_revision must be a nonnegative integer")?,
                None => session.engine.revision(),
            };
            return self.workspace_command(
                "workspace.apply",
                &json!({"transaction":{"expected_revision":revision,"commands":[command]}}),
                window,
                cx,
            );
        }
        if name == "workspace.activate" {
            let name = args
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("panel-workspace-native");
            if !mods::valid_name(name) || shipped_layouts().contains(&name) {
                return Err("choose a new personal workspace layout name".into());
            }
            let mut center = crate::workspace::default_center();
            center.workspace = Some(name.into());
            if layout_path(name).exists() {
                let existing =
                    std::fs::read_to_string(layout_path(name)).map_err(|e| e.to_string())?;
                let existing: Node = serde_json::from_str(&existing).map_err(|e| e.to_string())?;
                if existing.workspace.as_deref() != Some(name) {
                    return Err("an unrelated layout already uses that name".into());
                }
                center = existing;
            }
            let mut session =
                crate::workspace::Session::load(file(&format!("workspaces/{name}.json")))?;
            if let Some(value) = args.get("document") {
                let document: Workspace =
                    serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
                self.workspace_preflight_for(&document, &center)?;
                session.import(document, session.engine.revision())?;
            }
            self.workspace_preflight_for(session.engine.document(), &center)?;
            if !layout_path(name).exists() {
                crate::persist::write_atomic(&layout_path(name), layout_sync::text_of(&center))
                    .map_err(|e| e.to_string())?;
            }
            self.switch_layout(Some(name), window, cx);
            return Ok(self
                .workspace
                .as_ref()
                .ok_or("workspace could not be activated")?
                .inspect());
        }
        let session = self
            .workspace
            .as_ref()
            .ok_or("select an opt-in workspace layout first")?;
        if matches!(name, "workspace.inspect" | "workspace.export") {
            return Ok(if name == "workspace.inspect" {
                session.inspect()
            } else {
                json!({"document":session.engine.document()})
            });
        }
        let revision = args.get("expected_revision").and_then(Value::as_u64).or_else(||matches!(name,"workspace.undo"|"workspace.redo").then_some(session.engine.revision()));
        let mut candidate = session.engine.clone();
        let transaction = if name == "workspace.apply" {
            let transaction: Transaction = serde_json::from_value(
                args.get("transaction")
                    .cloned()
                    .ok_or("missing transaction")?,
            )
            .map_err(|e| e.to_string())?;
            candidate.apply(transaction.clone())?;
            Some(transaction)
        } else {
            None
        };
        let imported = if name == "workspace.import" {
            let document: Workspace =
                serde_json::from_value(args.get("document").cloned().ok_or("missing document")?)
                    .map_err(|e| e.to_string())?;
            candidate.import(
                document.clone(),
                revision.ok_or("missing expected_revision")?,
            )?;
            Some(document)
        } else {
            None
        };
        match name {
            "workspace.undo" => candidate.undo(revision.ok_or("missing expected_revision")?)?,
            "workspace.redo" => candidate.redo(revision.ok_or("missing expected_revision")?)?,
            "workspace.apply" | "workspace.import" => {}
            _ => return Err("unknown workspace command".into()),
        }
        let projected = self.workspace_preflight_for(candidate.document(), &self.file_chrome)?;
        if let Err(error) = self.workspace_open_floats(candidate.document(),window,cx) {
            let _ = self.workspace_sync_floats(window,cx);
            return Err(error);
        }
        let session = self.workspace.as_mut().unwrap();
        let saved = match name {
            "workspace.apply" => {
                session.change(transaction.unwrap()).map(|_|())
            }
            "workspace.import" => {
                session.import(imported.unwrap(), revision.unwrap()).map(|_|())
            }
            "workspace.undo" => session.undo(revision.unwrap()),
            "workspace.redo" => session.redo(revision.unwrap()),
            _ => unreachable!(),
        };
        if let Err(error) = saved {
            let _ = self.workspace_sync_floats(window,cx);
            return Err(error);
        }
        let reply = self.workspace.as_ref().unwrap().inspect();
        self.chrome = projected;
        self.sync(window, cx);
        Ok(reply)
    }

    pub(super) fn workspace_action(
        &mut self,
        commands: Vec<WorkspaceCommand>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(session) = &self.workspace else {
            return;
        };
        let transaction = Transaction {
            expected_revision: session.engine.revision(),
            commands,
        };
        self.run(
            "workspace.apply",
            json!({"transaction":transaction}),
            window,
            cx,
        );
    }

    pub(super) fn workspace_embedded_panel(
        &self,
        node: &Node,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let doc = self.workspace.as_ref()?.engine.document();
        let panel = doc.panels.get(&node.id)?;
        if !self.workspace_panel_embedded(panel) {
            return None;
        }
        if self.person.no_headers {
            // workspace_header mods share a 42px title row. Allocate the mod
            // the reclaimed height and clip that row out of its viewport.
            return Some(div().relative().size_full().overflow_hidden()
                .child(div().absolute().top(-settings::z(crate::workspace::SECTION_HEADER_HEIGHT as f32))
                    .bottom_0().left_0().right_0().child(self.render_slot(&node.id, cx)))
                .into_any_element());
        }
        let section = doc
            .groups
            .iter()
            .flat_map(|g| &g.views)
            .flat_map(|v| &v.sections)
            .find(|s| s.panel_id == panel.id)?;
        let header = Node::block(
            format!("{}{}", crate::workspace::HEADER, section.id),
            Content::Mod {
                name: "@workspace/header".into(),
                props: Value::Null,
            },
        );
        Some(
            div()
                .relative()
                .size_full()
                .child(self.render_slot(&node.id, cx))
                .child(
                    div()
                        .absolute()
                        .top_0()
                        .left_0()
                        .w_full()
                        .h(settings::z(crate::workspace::SECTION_HEADER_HEIGHT as f32))
                        .child(self.workspace_header(&header, cx)),
                )
                .into_any_element(),
        )
    }

    pub(super) fn workspace_header(&self, node: &Node, cx: &mut Context<Self>) -> AnyElement {
        let section_id = node
            .id
            .strip_prefix(crate::workspace::HEADER)
            .unwrap_or_default();
        let section = self.workspace.as_ref().and_then(|s| {
            s.engine
                .document()
                .groups
                .iter()
                .flat_map(|g| &g.views)
                .flat_map(|v| &v.sections)
                .find(|s| s.id == section_id)
        });
        let Some(section) = section else {
            return div().into_any_element();
        };
        let title = self
            .workspace
            .as_ref()
            .and_then(|s| s.engine.document().panels.get(&section.panel_id))
            .map(crate::workspace::panel_title)
            .unwrap_or_default();
        let panel = section.panel_id.clone();
        let embedded = self
            .workspace
            .as_ref()
            .and_then(|s| s.engine.document().panels.get(&panel))
            .is_some_and(|panel| self.workspace_panel_embedded(panel))
            && !section.collapsed;
        let measured = node.id.clone();
        let bounds = self.bounds.clone();
        let document = self.workspace.as_ref().unwrap().engine.document();
        let group = document
            .groups
            .iter()
            .find(|g| {
                g.views
                    .iter()
                    .any(|v| v.sections.iter().any(|s| s.id == section.id))
            })
            .unwrap();
        let expanded = document.maximized_group_id.as_deref() == Some(group.id.as_str());
        let group_id = group.id.clone();
        let floating = document.floating.iter().any(|f|f.group_id == group.id);
        let float_panel = panel.clone();
        let grip = self.workspace_grip(
            crate::workspace::drag::Source::Section(section.id.clone()),
            cx,
        );
        let action = |id: String, icon: &str| {
            div()
                .id(SharedString::from(id.clone()))
                .opacity(0.)
                .group_hover("workspace-section-header", |s| s.opacity(1.))
                .debug_selector(move || id)
                .flex_none()
                .p(settings::z(3.))
                .rounded(settings::z(4.))
                .text_color(c("foreground"))
                .cursor_pointer()
                .hover(|s| s.bg(c("hover")).text_color(c("foreground")))
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(
                    svg()
                        .path(SharedString::from(format!("mods/pane/{icon}.svg")))
                        .size(settings::z(14.))
                        .text_color(c("foreground")),
                )
        };
        div()
            .size_full()
            .relative()
            .flex()
            .items_center()
            .px(settings::z(14.))
            .gap(settings::z(4.))
            .group("workspace-section-header")
            .when(!embedded, |d| {
                d.bg(c("background")).border_b_1().border_color(c("border"))
            })
            .child(
                canvas(
                    move |b, _, _| {
                        bounds.borrow_mut().insert(measured, b);
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .left_0()
                .top_0()
                .size_full(),
            )
            .text_size(settings::z(13.))
            .children((!embedded).then(|| {
                div()
                    .id(SharedString::from(format!("workspace-title-{}", panel)))
                    .max_w(relative(0.4))
                    .min_w_0()
                    .truncate()
                    .h_full()
                    .flex()
                    .items_center()
                    .font_weight(FontWeight::SEMIBOLD)
                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .on_click(cx.listener({
                        let panel = panel.clone();
                        move |this, event: &ClickEvent, w, cx| {
                            if matches!(event,ClickEvent::Mouse(e) if e.up.click_count>=2) {
                                this.run("workspace.rename", json!({"panel":panel}), w, cx);
                            }
                            cx.stop_propagation();
                        }
                    }))
                    .child(title)
            }))
            .child(div().flex_1())
            .child(
                action(format!("workspace-float-{panel}"), if floating {"dock"} else {"float"})
                    .on_click(cx.listener(move |this,_,w,cx| {
                        this.run(if floating {"workspace.dock"} else {"workspace.float"},json!({"panel":float_panel}),w,cx);
                        cx.stop_propagation();
                    })),
            )
            .child(
                action(
                    format!("workspace-expand-{}", section.id),
                    if expanded { "unzoom" } else { "zoom" },
                )
                .on_click(cx.listener(move |this, _, w, cx| {
                    if floating {w.zoom_window();return;}
                    this.workspace_action(
                        vec![WorkspaceCommand::Maximize {
                            group_id: if expanded {
                                None
                            } else {
                                Some(group_id.clone())
                            },
                        }],
                        w,
                        cx,
                    );
                    cx.stop_propagation();
                })),
            )
            .child(
                action(format!("hide-{panel}"), "close").on_click(cx.listener(
                    move |this, _, w, cx| {
                        this.workspace_action(
                            vec![WorkspaceCommand::HidePanel {
                                panel_id: panel.clone(),
                            }],
                            w,
                            cx,
                        );
                        cx.stop_propagation();
                    },
                )),
            )
            .child(
                div()
                    .absolute()
                    .opacity(0.)
                    .group_hover("workspace-section-header", |s| s.opacity(1.))
                    .top(settings::z(
                        (crate::workspace::SECTION_HEADER_HEIGHT as f32 - 18.) / 2.,
                    ))
                    .left(relative(0.5))
                    .ml(-settings::z(14.))
                    .children((!floating).then_some(grip)),
            )
            .into_any_element()
    }
}
