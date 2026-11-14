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
            let inset = px(if center_only { 40. } else { 8. });
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
            (preview.size.width - width).abs() <= px(0.5),
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
            to.bottom_right() - point(px(50.), px(8.)),
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
    assert_eq!(preview.size.width, destination.size.width);
    assert!((preview.size.height - destination.size.height / 2.).abs() <= px(0.5));
    assert!(
        (preview.origin.y - destination.origin.y - destination.size.height / 2.).abs() <= px(0.5)
    );
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
            b["prototype-toolbox-section"].bottom_right() - point(px(50.), px(8.)),
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
