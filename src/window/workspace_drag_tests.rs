#[test]
fn workspace_drag_handles_commit_moves_and_escape_cancels() {
    in_own_process("workspace_pointer_drag");
}

#[gpui::test]
fn workspace_pointer_drag(cx: &mut gpui::TestAppContext) {
    use gpui::{Modifiers, MouseButton, point, px, size};
    use serde_json::json;
    if !running_alone("workspace_pointer_drag") {
        return;
    }
    let (view, cx) = open_window(
        cx,
        "changes",
        "export default () => null;",
        json!({"id":"center","type":"block","content":{"tab":"active"}}),
    );
    view.update_in(cx, |this, window, cx| {
        this.folders
            .retain(|name, _| matches!(name.as_str(), "changes" | "prompt"));
        let doc = panel_workspace::Store::import(include_str!(
            "../../handlr/prototype/workspaces/panel-workspace-native.json"
        ))
        .unwrap();
        let mut session =
            crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/drag.json"))
                .unwrap();
        session.import(doc, 0).unwrap();
        this.file_chrome = crate::workspace::default_center();
        this.chrome =
            crate::workspace::project(session.engine.document(), &this.file_chrome).unwrap();
        this.workspace = Some(session);
        this.sync(window, cx);
    });
    cx.simulate_resize(size(px(1200.), px(900.)));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    // Header buttons reuse the terminal icons and maximize/restore the current view.
    let original = view.update(cx, |this, _| {
        this.workspace.as_ref().unwrap().engine.document().clone()
    });
    let button = cx
        .debug_bounds("workspace-expand-prototype-files-section")
        .unwrap();
    let at = button.origin + point(button.size.width / 2., button.size.height / 2.);
    cx.simulate_mouse_move(at, None, Modifiers::none());
    cx.simulate_click(at, Modifiers::none());
    view.update(cx, |this, _| {
        assert_eq!(
            this.workspace
                .as_ref()
                .unwrap()
                .engine
                .document()
                .maximized_group_id
                .as_deref(),
            Some("prototype-code-group")
        );
        assert!(this.chrome.find("@workspace/center").is_none());
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let button = cx
        .debug_bounds("workspace-expand-prototype-files-section")
        .unwrap();
    let at = button.origin + point(button.size.width / 2., button.size.height / 2.);
    cx.simulate_mouse_move(at, None, Modifiers::none());
    cx.simulate_click(at, Modifiers::none());
    view.update(cx, |this, _| {
        assert_eq!(
            this.workspace.as_ref().unwrap().engine.document(),
            &original,
            "restore must recover the exact dock arrangement"
        );
        assert!(this.chrome.find("@workspace/center").is_some());
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    // Rename remains available through the command without a dedicated header button.
    let old_id = view.update(cx, |this, _| this.copies["prototype-files-body"].id);
    assert!(cx.debug_bounds("workspace-rename-prototype-files-body").is_none());
    view.update_in(cx, |this, w, cx| {
        this.run("workspace.rename", json!({"panel":"prototype-files-body"}), w, cx);
    });
    cx.run_until_parked();
    assert!(view.update(cx, |this, _| this.overlays.iter().any(|o| o.id == "rename")));
    cx.simulate_input("Review files");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    view.update_in(cx, |this, w, cx| {
        let session = this.workspace.as_ref().unwrap();
        assert_eq!(
            crate::workspace::panel_title(
                &session.engine.document().panels["prototype-files-body"]
            ),
            "Review files"
        );
        assert_eq!(this.copies["prototype-files-body"].id, old_id);
        let revision = session.engine.revision();
        this.workspace_command(
            "workspace.undo",
            &json!({"expected_revision":revision}),
            w,
            cx,
        )
        .unwrap();
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    // Full-width edge drops and center-only edge drops have different receiving areas.
    for (edge, top, center_only) in [
        (panel_workspace::Edge::BottomCenter, false, true),
        (panel_workspace::Edge::Bottom, false, false),
        (panel_workspace::Edge::TopCenter, true, true),
        (panel_workspace::Edge::Top, true, false),
    ] {
        let (from, to, width) = view.update(cx, |this, _| {
            let bounds = this.bounds.borrow();
            let head = bounds["@workspace/header/prototype-changes-section"];
            let area = bounds[if center_only {
                "@workspace/center-stack"
            } else {
                "@workspace/root"
            }];
            let inset = px(if center_only { 64. } else { 8. });
            let y = if top {
                area.origin.y + inset
            } else {
                area.origin.y + area.size.height - inset
            };
            (
                head.origin + point(head.size.width / 2., px(14.)),
                point(area.origin.x + area.size.width / 2., y),
                area.size.width,
            )
        });
        cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
        cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
        cx.update(|w, cx| w.draw(cx).clear(cx));
        let preview = cx.debug_bounds("workspace-drop-preview").unwrap();
        assert!(
            (preview.size.width - width + if center_only { px(0.) } else { crate::settings::z(crate::workspace::PANEL_GAP * 2.) }).abs() <= px(0.5),
            "{edge:?} must shade its own width"
        );
        cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
        cx.update(|w, cx| w.draw(cx).clear(cx));
        view.update_in(cx, |this, w, cx| {
            let session = this.workspace.as_ref().unwrap();
            let doc = session.engine.document();
            assert_eq!(
                doc.zones
                    .iter()
                    .find(|z| z.edge == edge)
                    .unwrap()
                    .groups
                    .len(),
                1
            );
            let bounds = this.bounds.borrow();
            let placed = bounds[&doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.id == "prototype-changes-section"))).unwrap().id];
            assert_drop_preview_matches(preview, placed);
            let middle = bounds["@workspace/middle"];
            let left = bounds["@workspace/zone/left"];
            let right = bounds["@workspace/zone/right"];
            assert!((left.size.height - middle.size.height).abs() <= px(1.));
            assert!((right.size.height - middle.size.height).abs() <= px(1.));
            if center_only {
                assert!(
                    left.size.height > px(800.),
                    "center docks preserve the full side height"
                );
            } else {
                assert!(
                    left.size.height < px(800.),
                    "full-width docks consume height across all columns"
                );
            }
            drop(bounds);
            let revision = session.engine.revision();
            this.workspace_command(
                "workspace.undo",
                &json!({"expected_revision":revision}),
                w,
                cx,
            )
            .unwrap();
        });
        cx.update(|w, cx| w.draw(cx).clear(cx));
    }
    let (from, to, copy_id) = view.update(cx, |this, _| {
        let b = this.bounds.borrow();
        let from = b["@workspace/header/prototype-changes-section"];
        let to = b["prototype-files-section"];
        (
            from.origin + point(from.size.width / 2., px(14.)),
            to.bottom_right() - point(px(50.), px(64.)),
            this.copies["prototype-changes-body"].id,
        )
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    assert!(
        view.update(cx, |this, _| this.workspace_drag.is_some()),
        "grip must arm drag"
    );
    cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let preview = cx
        .debug_bounds("workspace-drop-preview")
        .expect("visible destination highlight");
    let destination = view.update(
        cx,
        |this, _| this.bounds.borrow()["prototype-files-section"],
    );
    assert!((preview.size.width - destination.size.width).abs() <= px(0.5));
    assert!(
        preview.contains(&to),
        "shade the destination area under the pointer"
    );
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
    view.update(cx, |this, _| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        assert_eq!(
            doc.view("prototype-code").unwrap().sections[1].panel_id,
            "prototype-changes-body"
        );
        assert_eq!(
            this.copies["prototype-changes-body"].id, copy_id,
            "moving must retain the loaded mod instance"
        );
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, _| {
        assert_drop_preview_matches(preview, this.bounds.borrow()["prototype-changes-section"]);
    });
    let before = view.update(cx, |this, _| {
        this.workspace.as_ref().unwrap().engine.document().clone()
    });
    let from = view.update(cx, |this, _| {
        let b = this.bounds.borrow()["@workspace/header/prototype-changes-section"];
        b.origin + point(b.size.width / 2., px(14.))
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(
        point(px(1100.), px(500.)),
        Some(MouseButton::Left),
        Modifiers::none(),
    );
    cx.simulate_keystrokes("escape");
    cx.simulate_mouse_up(
        point(px(1100.), px(500.)),
        MouseButton::Left,
        Modifiers::none(),
    );
    view.update(cx, |this, _| {
        assert!(this.workspace_drag.is_none());
        assert_eq!(
            this.workspace.as_ref().unwrap().engine.document(),
            &before,
            "escape must not mutate composition"
        );
    });
    // Move a section across sides using only pointer events on rendered handles.
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let (from, to) = view.update(cx, |this, _| {
        let b = this.bounds.borrow();
        (
            b["@workspace/header/prototype-changes-section"].origin
                + point(
                    b["@workspace/header/prototype-changes-section"].size.width / 2.,
                    px(14.),
                ),
            b["prototype-toolbox-section"].bottom_right() - point(px(50.), px(64.)),
        )
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
    view.update(cx, |this, _| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        assert_eq!(doc.view("prototype-code").unwrap().sections.len(), 1);
        assert!(
            doc.groups
                .iter()
                .find(|g| g.views.iter().any(|v| v
                    .sections
                    .iter()
                    .any(|s| s.panel_id == "prototype-toolbox-body")))
                .unwrap()
                .views
                .iter()
                .any(|v| v
                    .sections
                    .iter()
                    .any(|s| s.panel_id == "prototype-changes-body"))
        );
        assert_eq!(this.copies["prototype-changes-body"].id, copy_id);
        assert_eq!(doc.panels, before.panels);
    });
    // A view tab can create a group in an initially empty zone.
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let from = view.update(cx, |this, _| {
        let b = this.bounds.borrow()["@workspace/tab/prototype-context"];
        b.origin + point(b.size.width / 2., px(15.))
    });
    let to = view.update(cx, |this, _| {
        let b = this.bounds.borrow()["@workspace/root"];
        b.origin + point(b.size.width / 2., px(8.))
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let preview = cx.debug_bounds("workspace-drop-preview").unwrap();
    assert!(
        preview.size.height > px(48.),
        "edge target must highlight the receiving zone"
    );
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
    let group = view.update(cx, |this, _| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        let top = doc
            .zones
            .iter()
            .find(|z| z.edge == panel_workspace::Edge::Top)
            .unwrap();
        assert_eq!(top.groups.len(), 1);
        let group = doc.group(&top.groups[0].group_id).unwrap();
        assert_eq!(group.active_view_id, "prototype-context");
        group.id.clone()
    });
    // The group grip moves the whole group to a different zone.
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let from = view.update(cx, |this, _| {
        let b = this.bounds.borrow()["prototype-navigation-group"];
        b.origin + point(b.size.width / 2., px(15.))
    });
    let to = view.update(cx, |this, _| {
        let b = this.bounds.borrow()["@workspace/root"];
        b.origin + point(b.size.width - px(8.), b.size.height / 2.)
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
    view.update(cx, |this, _| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        assert!(
            doc.zones
                .iter()
                .find(|z| z.edge == panel_workspace::Edge::Top)
                .unwrap()
                .groups
                .iter()
                .any(|g| g.group_id == group)
        );
        assert!(
            doc.zones
                .iter()
                .find(|z| z.edge == panel_workspace::Edge::Right)
                .unwrap()
                .groups
                .iter()
                .any(|g| g.group_id == "prototype-navigation-group")
        );
        let saved =
            panel_workspace::Store::new(crate::mods::app_dir().join("workspaces/drag.json"))
                .load()
                .unwrap();
        assert_eq!(
            &saved.document, doc,
            "drop must persist exactly the accepted composition"
        );
    });
}

#[test]
fn palette_opens_panels_and_picker_only_reveals_existing_panels() {
    in_own_process("workspace_palette_open");
}

#[gpui::test]
fn workspace_palette_open(cx: &mut gpui::TestAppContext) {
    use serde_json::json;
    if !running_alone("workspace_palette_open") {return;}
    let (view,cx)=open_window(cx,"sample-panel","export default () => null;",json!({"id":"center","type":"column","children":[]}));
    view.update_in(cx,|this,w,cx| {
        this.folders.get_mut("sample-panel").unwrap().hint.workspace_header=true;
        this.folders.get_mut("sample-panel").unwrap().hint.title=Some("Sample panel".into());
        this.workspace=Some(crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/palette.json")).unwrap());
        this.chrome=this.workspace_preflight_for(this.workspace.as_ref().unwrap().engine.document(),&this.file_chrome).unwrap();
        this.sync(w,cx);
        let entries=this.panel_palette_entries();
        assert!(entries.iter().any(|e|e["args"]["name"]=="sample-panel" && e["name"]=="workspace.open"));
        assert!(!entries.iter().any(|e|e["args"]["name"]=="pane"));
        let mut personal = this.folders["sample-panel"].clone();
        personal.id = "sample-personal".into();
        personal.hint.title = Some("Files".into());
        this.folders.insert(personal.id.clone(), personal);
        let mut backup = this.folders["files"].clone();
        backup.id = "files-edited-12".into();
        this.folders.insert(backup.id.clone(), backup);
        let entries = this.panel_palette_entries();
        assert!(!entries.iter().any(|e| e["args"]["name"] == "files-edited-12"));
        assert!(entries.iter().any(|e| e["args"]["name"] == "files" && e["title"] == "Open Files (Built-in)"));
        assert!(entries.iter().any(|e| e["args"]["name"] == "sample-personal" && e["title"] == "Open Files (Personal)"));
        this.folders.remove("sample-personal");
        this.run("app.palette",json!({}),w,cx);
    });
    cx.run_until_parked();
    cx.simulate_input("Open Sample panel");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    let (panel,copy)=view.update(cx,|this,_| {
        let doc=this.workspace.as_ref().unwrap().engine.document();
        assert_eq!(doc.groups.len(),1);
        let panel=doc.panels.values().next().unwrap().id.clone();
        assert_eq!(this.workspace_picker_panels().len(),1);
        let copy=this.copies[&panel].id;
        (panel,copy)
    });
    view.update_in(cx,|this,w,cx| {
        let group=this.workspace.as_ref().unwrap().engine.document().groups[0].id.clone();
        this.workspace_action(vec![panel_workspace::Command::MoveGroup {group_id:group.clone(),edge:panel_workspace::Edge::BottomCenter,index:0}],w,cx);
        this.workspace_action(vec![panel_workspace::Command::HidePanel {panel_id:panel.clone()}],w,cx);
        assert!(this.workspace_picker_panels().is_empty());
        assert!(this.workspace_command("workspace.reveal",&json!({"panel":panel}),w,cx).is_err());
        this.workspace_command("workspace.open",&json!({"name":"sample-panel"}),w,cx).unwrap();
        assert_eq!(this.workspace.as_ref().unwrap().engine.document().panels.len(),1);
        assert_eq!(this.copies[&panel].id,copy);
        let doc=this.workspace.as_ref().unwrap().engine.document();
        assert_eq!(doc.zones.iter().find(|z|z.edge==panel_workspace::Edge::BottomCenter).unwrap().groups[0].group_id,group);
        this.run("mod.open",json!({"name":"picker"}),w,cx);
        let picker=this.overlays.iter().find(|o|o.id=="mod-picker").unwrap();
        assert_eq!(this.copies[&picker.slot].inst.props["workspacePanels"][0]["id"],panel);
    });
}

#[test]
fn no_headers_mode_updates_live_and_restores_the_panel_header() {
    in_own_process("workspace_header_mode_native");
}

#[gpui::test]
fn workspace_header_mode_native(cx: &mut gpui::TestAppContext) {
    use gpui::{px, size};
    use serde_json::json;
    if !running_alone("workspace_header_mode_native") { return; }
    let (view, cx) = open_window(cx, "changes", r#"
import { View, div } from 'gpui-kit';
import { setShared } from 'herdr';
export default class extends View { render() { return div().flex().flex_col().size_full()
  .on_size_change((size) => setShared('probe.panel-height', size.height))
  .child(div().h(42).flex_none().child('Header'))
  .child(div().flex_1().min_h(0).child('Body')); } }
"#, json!({"id":"center","type":"block","content":{"tab":"active"}}));
    view.update_in(cx, |this, window, cx| {
        this.folders.retain(|name, _| matches!(name.as_str(), "changes" | "prompt"));
        let doc = panel_workspace::Store::import(include_str!("../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
        let mut session = crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/header-mode.json")).unwrap();
        session.import(doc, 0).unwrap();
        this.file_chrome = crate::workspace::default_center();
        this.chrome = this.workspace_projection(session.engine.document(), &this.file_chrome).unwrap();
        this.workspace = Some(session);
        this.sync(window, cx);
    });
    cx.simulate_resize(size(px(1200.), px(900.)));
    for enabled in [false, true, false] {
        view.update_in(cx, |this, window, cx| {
            let mut person = this.person.clone();
            person.no_headers = enabled;
            crate::settings::write_person(&person).unwrap();
            this.watched.settings = None;
            this.reload_config(window, cx);
        });
        cx.update(|window, cx| window.draw(cx).clear(cx));
        cx.executor().advance_clock(std::time::Duration::from_secs(1));
        cx.run_until_parked();
        cx.update(|window, cx| window.draw(cx).clear(cx));
        view.update(cx, |this, _| {
            assert_eq!(this.person.no_headers, enabled);
            let measured = crate::mods::shared("probe.panel-height").and_then(|v| v.as_f64()).unwrap_or_else(|| panic!("mod did not measure: {:?}", this.copies.iter().map(|(id,c)| (id, &c.error, c.root.is_some())).collect::<Vec<_>>()));
            let bounds = this.bounds.borrow();
            let panel = bounds.get("prototype-changes-body").unwrap();
            let available = f32::from(panel.size.height) / crate::settings::zoom();
            let expected = available + if enabled { 42. } else { 0. };
            assert!((measured - expected as f64).abs() < 1., "mode={enabled}, height={measured}, expected={expected}");
            assert_eq!(this.chrome.find("@workspace/header/prototype-spaces-section").unwrap().hidden, enabled);
        });
    }
}

#[test]
fn panel_titles_and_palette_create_tab_groups() {
    in_own_process("workspace_tab_group_native");
}

#[gpui::test]
fn workspace_tab_group_native(cx: &mut gpui::TestAppContext) {
    use gpui::{Modifiers, MouseButton, point, px, size};
    use serde_json::json;
    if !running_alone("workspace_tab_group_native") { return; }
    let (view, cx) = open_window(cx, "changes", "export default () => null;",
        json!({"id":"center","type":"column","children":[]}));
    view.update_in(cx, |this, w, cx| {
        let doc = panel_workspace::Store::import(include_str!("../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
        let mut session = crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/tab-groups.json")).unwrap();
        session.import(doc, 0).unwrap();
        this.file_chrome = crate::workspace::default_center();
        this.chrome = crate::workspace::project(session.engine.document(), &this.file_chrome).unwrap();
        this.workspace = Some(session);
        this.sync(w, cx);
    });
    cx.simulate_resize(size(px(1400.), px(1000.)));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let original = view.update(cx, |this, _| this.workspace.as_ref().unwrap().engine.document().clone());
    // A section from a stack joins an existing group as a tab, preserving siblings.
    let (from, to) = view.update(cx, |this, _| {
        let b = this.bounds.borrow();
        let header = b["@workspace/header/prototype-files-section"];
        (header.origin + point(header.size.width / 2., px(14.)), b["@workspace/tab/prototype-spaces"].center())
    });
    cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, _| {
        let target = this.workspace_hit_target(to);
        assert!(matches!(&target, Some(crate::workspace::drag::Target::Views { group, .. }) if group == "prototype-navigation-group"), "{target:?}");
    });
    cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
    view.update_in(cx, |this, w, cx| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        let group = doc.group("prototype-navigation-group").unwrap();
        assert!(group.views.iter().any(|v| v.sections.len() == 1 && v.sections[0].id == "prototype-files-section"));
        assert_eq!(doc.view("prototype-code").unwrap().sections.len(), original.view("prototype-code").unwrap().sections.len() - 1);
        assert_eq!(doc.panels, original.panels);
        this.workspace_command("workspace.undo", &json!({}), w, cx).unwrap();
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let source = view.update(cx, |this, _| this.bounds.borrow()["@workspace/header/prototype-files-section"]);
    let start = source.origin + point(source.size.width / 2., px(14.));
    cx.simulate_mouse_move(start, None, Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    cx.simulate_mouse_down(start, MouseButton::Left, Modifiers::none());
    cx.simulate_mouse_move(start + point(px(5.), px(5.)), Some(MouseButton::Left), Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, _| {
        assert!(this.workspace_drag.is_some(), "panel grip starts the gesture at {start:?}");
        assert!(this.workspace_drag_layout().is_none(), "keep the tab shown when another panel remains in its stack");
    });
    // Release builds do not record debug selectors; use the same measured
    // native target rectangles as the pointer hit test.
    let target = view.update(cx, |this, _| this.workspace_tab_group_targets().into_iter()
        .find(|(target, _)| matches!(target, crate::workspace::drag::Target::TabGroup { section } if section == "prototype-spaces-section"))
        .expect("title offers Tab Group target").1.center());
    cx.simulate_mouse_move(target, Some(MouseButton::Left), Modifiers::none());
    cx.update(|w, cx| w.draw(cx).clear(cx));
    cx.simulate_mouse_up(target, MouseButton::Left, Modifiers::none());
    cx.run_until_parked();
    view.update_in(cx, |this, w, cx| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        let group = doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.panel_id == "prototype-spaces-body"))).unwrap();
        assert!(group.views.iter().any(|v| v.sections.len() == 1 && v.sections[0].panel_id == "prototype-files-body"));
        assert_eq!(doc.panels, original.panels);
        this.workspace_command("workspace.undo", &json!({}), w, cx).unwrap();
        this.run("app.palette", json!({}), w, cx);
    });
    cx.run_until_parked();
    cx.simulate_input("Create Tab Group");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    cx.simulate_input("Files");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    cx.simulate_input("Spaces");
    cx.simulate_keystrokes("enter");
    cx.run_until_parked();
    view.update(cx, |this, _| {
        assert!(!this.overlays.iter().any(|o| o.id == "palette"));
        let doc = this.workspace.as_ref().unwrap().engine.document();
        let group = doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.panel_id == "prototype-spaces-body"))).unwrap();
        assert!(group.views.iter().any(|v| v.sections.len() == 1 && v.sections[0].panel_id == "prototype-files-body"));
        assert_eq!(doc.panels, original.panels);
    });
    // Lifting the active tab reveals a neighbor only in the render preview.
    for gesture in ["cancel", "stack", "detach", "panel-cancel", "panel-stack", "panel-detach"] {
        let panel_drag = gesture.starts_with("panel-");
        let action = gesture.strip_prefix("panel-").unwrap_or(gesture);
        cx.update(|w, cx| w.draw(cx).clear(cx));
        let (group_id, source_view, from) = view.update(cx, |this, _| {
            let doc = this.workspace.as_ref().unwrap().engine.document();
            let group = doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.panel_id == "prototype-files-body"))).unwrap();
            let id = group.active_view_id.clone();
            let key = if panel_drag {
                format!("@workspace/header/{}", doc.view(&id).unwrap().sections[0].id)
            } else {
                format!("@workspace/tab/{id}")
            };
            let b = this.bounds.borrow()[&key];
            let at = if panel_drag { b.origin + point(b.size.width / 2., px(14.)) } else { b.center() };
            (group.id.clone(), id, at)
        });
        cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
        cx.simulate_mouse_move(from + point(px(6.), px(8.)), Some(MouseButton::Left), Modifiers::none());
        cx.update(|w, cx| w.draw(cx).clear(cx));
        let before_drop = view.update(cx, |this, _| {
            let doc = this.workspace.as_ref().unwrap().engine.document();
            assert_eq!(doc.group(&group_id).unwrap().active_view_id, source_view);
            let preview = this.workspace_drag_layout().expect("drag shows the neighboring tab");
            assert_ne!(preview.find(&group_id).unwrap().active_child().unwrap().id, source_view);
            doc.clone()
        });
        if action == "cancel" {
            cx.simulate_keystrokes("escape");
            cx.simulate_mouse_up(from, MouseButton::Left, Modifiers::none());
            view.update(cx, |this, _| {
                assert!(this.workspace_drag_layout().is_none());
                assert_eq!(this.workspace.as_ref().unwrap().engine.document(), &before_drop);
            });
            continue;
        }
        let at = if panel_drag {
            view.update(cx, |this, _| {
                let bounds = this.bounds.borrow();
                if action == "stack" {
                    let doc = this.workspace.as_ref().unwrap().engine.document();
                    let group = doc.group(&group_id).unwrap();
                    let target_view = doc.view(this.workspace_drag_preview_view(group)).unwrap();
                    let b = bounds[&target_view.sections[0].id];
                    b.origin + point(b.size.width / 2., b.size.height * 0.75)
                } else {
                    let b = bounds["@workspace/root"];
                    b.origin + point(px(8.), b.size.height / 2.)
                }
            })
        } else { view.update(cx, |this, _| this.workspace_view_drop_targets().into_iter()
            .find(|(target, _, label)| if action == "stack" {
                *label == "Stack Panels" && matches!(target, crate::workspace::drag::Target::Sections { view, .. } if this.workspace.as_ref().unwrap().engine.document().group(&group_id).unwrap().views.iter().any(|v| &v.id == view))
            } else {
                *label == "New Pane" && matches!(target, crate::workspace::drag::Target::Zone { edge: panel_workspace::Edge::Left, .. })
            }).expect("both drop choices are available").1.center()) };
        cx.simulate_mouse_move(at, Some(MouseButton::Left), Modifiers::none());
        cx.update(|w, cx| w.draw(cx).clear(cx));
        cx.simulate_mouse_up(at, MouseButton::Left, Modifiers::none());
        cx.run_until_parked();
        view.update_in(cx, |this, w, cx| {
            let doc = this.workspace.as_ref().unwrap().engine.document();
            let group = doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.panel_id == "prototype-files-body"))).unwrap();
            if action == "stack" {
                assert_eq!(group.id, group_id);
                assert!(group.views.iter().any(|v| v.sections.len() == 2));
            } else {
                assert_ne!(group.id, group_id);
                assert_eq!(group.views.len(), 1);
            }
            assert_eq!(doc.panels, before_drop.panels);
            this.workspace_command("workspace.undo", &json!({}), w, cx).unwrap();
        });
    }
}

fn assert_drop_preview_matches(preview: gpui::Bounds<gpui::Pixels>, placed: gpui::Bounds<gpui::Pixels>) {
    use gpui::px;
    for (name, expected, actual) in [
        ("x", preview.origin.x, placed.origin.x),
        ("y", preview.origin.y, placed.origin.y),
        ("width", preview.size.width, placed.size.width),
        ("height", preview.size.height, placed.size.height),
    ] {
        assert!((expected - actual).abs() <= px(1.), "preview {name}: {expected:?}, placed: {actual:?}");
    }
}

#[test]
fn workspace_drop_preview_matches_occupied_docks() {
    in_own_process("workspace_occupied_dock_preview");
}

#[gpui::test]
fn workspace_occupied_dock_preview(cx: &mut gpui::TestAppContext) {
    use crate::workspace::drag::Source;
    use gpui::{Modifiers, MouseButton, point, px, size};
    use panel_workspace::{Command, Edge, Engine, Transaction};
    use serde_json::json;
    if !running_alone("workspace_occupied_dock_preview") { return; }
    let (view, cx) = open_window(cx, "changes", "export default () => null;",
        json!({"id":"center","type":"column","children":[]}));
    cx.simulate_resize(size(px(1400.), px(1000.)));
    for edge in [Edge::Top, Edge::Bottom, Edge::TopCenter, Edge::BottomCenter, Edge::Left, Edge::Right] {
        for (source, panel) in [
            (Source::Section("prototype-changes-section".into()), "prototype-changes-body"),
            (Source::View("prototype-context".into()), "prototype-context-body"),
            (Source::Group("prototype-toolbox-group".into()), "prototype-toolbox-body"),
            // Moving the last left group also changes the center dock's width.
            (Source::Group("prototype-code-group".into()), "prototype-files-body"),
        ] {
            eprintln!("occupied dock {edge:?}, {source:?}");
            view.update_in(cx, |this, w, cx| {
                this.folders.retain(|name, _| matches!(name.as_str(), "changes" | "prompt"));
                let doc = panel_workspace::Store::import(include_str!("../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
                let mut engine = Engine::new(doc).unwrap();
                engine.apply(Transaction { expected_revision: 0, commands: vec![
                    Command::MoveGroup { group_id: "prototype-navigation-group".into(), edge, index: 0 },
                    Command::ResizeGroup { group_id: "prototype-navigation-group".into(), weight: 2.5 },
                ] }).unwrap();
                let mut session = crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/preview.json")).unwrap();
                session.import(engine.document().clone(), session.engine.revision()).unwrap();
                this.file_chrome = crate::workspace::default_center();
                this.chrome = this.workspace_projection(session.engine.document(), &this.file_chrome).unwrap();
                this.workspace = Some(session);
                this.sync(w, cx);
            });
            cx.update(|w, cx| w.draw(cx).clear(cx));
            let (from, to, original) = view.update(cx, |this, _| {
                let b = this.bounds.borrow();
                let root = b["@workspace/root"];
                let center = b["@workspace/center-stack"];
                let to = match edge {
                    Edge::Top => root.origin + point(root.size.width / 2., px(32.)),
                    Edge::Bottom => root.origin + point(root.size.width / 2., root.size.height - px(32.)),
                    Edge::Left => root.origin + point(px(32.), root.size.height / 2.),
                    Edge::Right => root.origin + point(root.size.width - px(32.), root.size.height / 2.),
                    Edge::TopCenter => center.origin + point(center.size.width / 2., px(64.)),
                    Edge::BottomCenter => center.origin + point(center.size.width / 2., center.size.height - px(64.)),
                };
                (root.center(), to, this.workspace.as_ref().unwrap().engine.document().clone())
            });
            cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
            view.update(cx, |this, cx| this.workspace_press(source.clone(), from, cx));
            cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
            cx.update(|w, cx| w.draw(cx).clear(cx));
            let target = view.update(cx, |this, _| this.workspace_hit_target(to).unwrap());
            if crate::workspace::drag::commands(&original, &source, &target, "preview").unwrap().is_empty() {
                assert!(cx.debug_bounds("workspace-drop-preview").is_none(), "returning to the same slot needs no move preview");
                cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
                cx.update(|w, cx| w.draw(cx).clear(cx));
                view.update(cx, |this, _| assert_eq!(this.workspace.as_ref().unwrap().engine.document(), &original));
                continue;
            }
            let preview = cx.debug_bounds("workspace-drop-preview").unwrap_or_else(|| panic!("missing preview: {edge:?}, {source:?}"));
            view.update(cx, |this, _| assert_eq!(this.workspace.as_ref().unwrap().engine.document(), &original, "preview must not mutate the document"));
            cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
            cx.update(|w, cx| w.draw(cx).clear(cx));
            view.update(cx, |this, _| {
                let doc = this.workspace.as_ref().unwrap().engine.document();
                let group = doc.groups.iter().find(|g| g.views.iter().any(|v| v.sections.iter().any(|s| s.panel_id == panel))).unwrap();
                assert!(doc.zones.iter().find(|z| z.edge == edge).unwrap().groups.iter().any(|g| g.group_id == group.id));
                assert_drop_preview_matches(preview, this.bounds.borrow()[&group.id]);
            });
        }
    }
}

#[test]
fn workspace_changes_preserve_terminal_view_and_tab_switch_geometry() {
    in_own_process("workspace_terminal_continuity");
}

#[gpui::test]
fn workspace_terminal_continuity(cx: &mut gpui::TestAppContext) {
    use gpui::{px, size};
    use serde_json::json;
    use panel_workspace::Command;
    if !running_alone("workspace_terminal_continuity") { return; }
    let (view, cx) = open_window(cx, "changes", "export default () => null;",
        json!({"id":"center","type":"block","content":{"tab":"active"}}));
    view.update_in(cx, |this, w, cx| {
        this.folders.retain(|name, _| name == "changes");
        this.model = crate::model::Model::default();
        this.model.add_space("space", "test", "/", super::Tab::new("tab", "", "terminal", "probe"));
        let doc = panel_workspace::Store::import(include_str!("../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
        let mut session = crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/continuity.json")).unwrap();
        session.import(doc, 0).unwrap();
        this.file_chrome = crate::workspace::default_center();
        this.chrome = crate::workspace::project(session.engine.document(), &this.file_chrome).unwrap();
        this.workspace = Some(session);
        this.sync(w, cx);
    });
    cx.simulate_resize(size(px(1400.), px(1000.)));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let original = view.update(cx, |this, cx| (this.terms["terminal"].view.entity_id(), this.terms["terminal"].view.read(cx).dimensions()));
    view.update_in(cx, |this, w, cx| {
        let commands = crate::workspace::drag::tab_group_commands(this.workspace.as_ref().unwrap().engine.document(),
            "prototype-files-section", "prototype-spaces-section", "continuity-tabs").unwrap();
        this.workspace_action(commands, w, cx);
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, cx| { this.terms["terminal"].view.read(cx).take_resize_history(); });
    let groups = view.update(cx, |this, _| this.workspace.as_ref().unwrap().engine.document().groups.clone());
    for group in groups {
        for tab in group.views {
            let bounds = cx.debug_bounds(Box::leak(format!("workspace-tab-{}", tab.id).into_boxed_str()));
            if let Some(bounds) = bounds {
                cx.simulate_click(bounds.center(), gpui::Modifiers::none());
            } else {
                view.update_in(cx, |this, w, cx| this.run("layout.select", json!({"stack":group.id,"child":tab.id}), w, cx));
            }
            cx.update(|w, cx| w.draw(cx).clear(cx));
            let current = view.update(cx, |this, cx| (this.terms["terminal"].view.entity_id(), this.terms["terminal"].view.read(cx).dimensions()));
            assert_eq!(current, original, "switching {} must preserve the terminal and its grid", tab.id);
            view.update(cx, |this, cx| assert!(this.terms["terminal"].view.read(cx).take_resize_history().is_empty(), "switching {} must not resize even temporarily", tab.id));
        }
    }
    // Exact report: hide the occupied top dock, then move a panel on the left.
    view.update_in(cx, |this, w, cx| {
        this.workspace_action(vec![Command::MoveGroup { group_id: "prototype-toolbox-group".into(), edge: panel_workspace::Edge::Top, index: 0 }], w, cx);
        this.run("layout.hide", json!({"id":"@workspace/zone/top"}), w, cx);
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let top_hidden_grid = view.update(cx, |this, cx| {
        this.terms["terminal"].view.read(cx).take_resize_history();
        this.terms["terminal"].view.read(cx).dimensions()
    });
    view.update_in(cx, |this, w, cx| this.workspace_action(vec![Command::MoveSection {
        section_id: "prototype-files-section".into(), view_id: "prototype-code".into(), index: 0,
    }], w, cx));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, cx| {
        assert!(this.chrome.find("@workspace/zone/top").unwrap().hidden, "moving a left panel must not reveal the hidden top dock");
        assert_eq!(this.terms["terminal"].view.read(cx).dimensions(), top_hidden_grid);
        assert!(this.terms["terminal"].view.read(cx).take_resize_history().is_empty(), "moving a left panel must not resize the terminal even temporarily");
    });
    // Hidden docks must stay hidden through unrelated transactions. Previously
    // projection revealed them for one frame and the Tabs mod hid them again.
    view.update_in(cx, |this, w, cx| this.run("layout.hide", json!({"id":"@workspace/zone/left"}), w, cx));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    let hidden_grid = view.update(cx, |this, cx| {
        let doc = this.workspace.as_ref().unwrap().engine.document();
        assert!(doc.zones.iter().find(|z| z.edge == panel_workspace::Edge::Left).unwrap().hidden);
        this.terms["terminal"].view.read(cx).take_resize_history();
        this.terms["terminal"].view.read(cx).dimensions()
    });
    view.update_in(cx, |this, w, cx| this.workspace_action(vec![Command::SelectView { view_id: "prototype-rigs".into() }], w, cx));
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, cx| {
        assert!(this.chrome.find("@workspace/zone/left").unwrap().hidden);
        assert_eq!(this.terms["terminal"].view.read(cx).dimensions(), hidden_grid);
        assert!(this.terms["terminal"].view.read(cx).take_resize_history().is_empty());
    });
    view.update_in(cx, |this, w, cx| {
        this.workspace_command("workspace.open", &json!({"name":"changes"}), w, cx).unwrap();
        assert!(!this.chrome.find("@workspace/zone/left").unwrap().hidden, "Open Panel must reveal its hidden dock");
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    view.update(cx, |this, cx| {
        let resizes = this.terms["terminal"].view.read(cx).take_resize_history();
        assert_eq!(resizes.len(), 1, "opening a hidden dock must resize once: {resizes:?}");
    });
    // Moving and closing dock panels changes the available grid, but must
    // keep the existing terminal entity attached throughout the operation.
    for command in [
        Command::MoveGroup { group_id: "prototype-code-group".into(), edge: panel_workspace::Edge::Right, index: 0 },
        Command::HidePanel { panel_id: "prototype-files-body".into() },
        Command::HidePanel { panel_id: "prototype-changes-body".into() },
    ] {
        view.update_in(cx, |this, w, cx| this.workspace_action(vec![command.clone()], w, cx));
        cx.update(|w, cx| w.draw(cx).clear(cx));
        view.update(cx, |this, cx| {
            assert!(this.reply.as_ref().is_none_or(|r| r.get("error").is_none()), "{command:?}: {:?}", this.reply);
            assert_eq!(this.terms["terminal"].view.entity_id(), original.0, "{command:?}");
            let (cols, rows) = this.terms["terminal"].view.read(cx).dimensions();
            assert!(cols > 2 && rows > 1, "dock changes must leave a usable terminal grid");
            let resizes = this.terms["terminal"].view.read(cx).take_resize_history();
            assert!(resizes.len() <= 1, "{command:?}: must resize directly to the final grid, got {resizes:?}");
        });
    }
}

#[test]
fn top_dock_panels_can_move_before_their_neighbor() {
    in_own_process("workspace_top_dock_reorder");
}

#[gpui::test]
fn workspace_top_dock_reorder(cx: &mut gpui::TestAppContext) {
    use crate::workspace::drag::{Source, Target};
    use gpui::{Modifiers, MouseButton, point, px, size};
    use panel_workspace::{Command, Edge, Engine, Transaction};
    use serde_json::json;
    if !running_alone("workspace_top_dock_reorder") { return; }
    let (view, cx) = open_window(cx, "changes", "export default () => null;",
        json!({"id":"center","type":"column","children":[]}));
    cx.simulate_resize(size(px(1400.), px(1000.)));
    for source in [Source::Group("prototype-toolbox-group".into()),
        Source::View("prototype-toolbox".into()), Source::Section("prototype-toolbox-section".into())] {
        for outer_band in [true, false] {
            view.update_in(cx, |this, w, cx| {
                let doc = panel_workspace::Store::import(include_str!("../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
                let mut engine = Engine::new(doc).unwrap();
                engine.apply(Transaction { expected_revision: 0, commands: vec![
                    Command::MoveGroup { group_id: "prototype-navigation-group".into(), edge: Edge::Top, index: 0 },
                    Command::MoveGroup { group_id: "prototype-toolbox-group".into(), edge: Edge::Top, index: 1 },
                ] }).unwrap();
                let mut session = crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/top-reorder.json")).unwrap();
                session.import(engine.document().clone(), session.engine.revision()).unwrap();
                this.file_chrome = crate::workspace::default_center();
                this.chrome = this.workspace_projection(session.engine.document(), &this.file_chrome).unwrap();
                this.workspace = Some(session);
                this.sync(w, cx);
            });
            cx.update(|w, cx| w.draw(cx).clear(cx));
            let (from, to, original) = view.update(cx, |this, _| {
                let b = this.bounds.borrow();
                let left = b["prototype-navigation-group"];
                let root = b["@workspace/root"];
                let to = if outer_band {
                    point(left.center().x, root.origin.y + px(8.))
                } else {
                    point(left.origin.x + px(8.), left.center().y)
                };
                (b["prototype-toolbox-group"].center(), to, this.workspace.as_ref().unwrap().engine.document().clone())
            });
            cx.simulate_mouse_down(from, MouseButton::Left, Modifiers::none());
            view.update(cx, |this, cx| this.workspace_press(source.clone(), from, cx));
            cx.simulate_mouse_move(to, Some(MouseButton::Left), Modifiers::none());
            view.update(cx, |this, _| assert_eq!(this.workspace_hit_target(to), Some(Target::Zone { edge: Edge::Top, index: 0 })));
            cx.update(|w, cx| w.draw(cx).clear(cx));
            let preview = cx.debug_bounds("workspace-drop-preview").expect("insertion preview");
            cx.simulate_mouse_up(to, MouseButton::Left, Modifiers::none());
            cx.update(|w, cx| w.draw(cx).clear(cx));
            view.update_in(cx, |this, w, cx| {
                let doc = this.workspace.as_ref().unwrap().engine.document();
                let top = doc.zones.iter().find(|z| z.edge == Edge::Top).unwrap();
                assert_eq!(top.groups.len(), 2);
                let group = doc.group(&top.groups[0].group_id).unwrap();
                assert!(group.views.iter().any(|v| v.sections.iter().any(|s| s.id == "prototype-toolbox-section")));
                assert_drop_preview_matches(preview, this.bounds.borrow()[&group.id]);
                assert_eq!(doc.panels, original.panels);
                this.workspace_command("workspace.undo", &json!({}), w, cx).unwrap();
                assert_eq!(this.workspace.as_ref().unwrap().engine.document(), &original);
            });
        }
    }
}
