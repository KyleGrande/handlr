#[test]
fn floating_windows_keep_the_live_copy_and_redock() {
    in_own_process("workspace_native_float");
}

#[gpui::test]
fn workspace_native_float(cx: &mut gpui::TestAppContext) {
    use serde_json::json;
    if !running_alone("workspace_native_float") {
        return;
    }
    let (view, cx) = open_window(
        cx,
        "files",
        r#"import { View, div } from "gpui-kit";
        import { shared, setShared } from "herdr";
        export default class extends View {
          init() { this.draft = "unsaved floating draft"; setShared("float.loads", (shared("float.loads") || 0) + 1); }
          render() { setShared("float.draft", this.draft); return div().child(this.draft); }
        }"#,
        json!({"id":"center","type":"block","content":{"tab":"active"}}),
    );
    let original = view.update_in(cx, |this, window, cx| {
        this.folders
            .retain(|name, _| matches!(name.as_str(), "files" | "prompt"));
        let doc = panel_workspace::Store::import(include_str!(
            "../../handlr/prototype/workspaces/panel-workspace-native.json"
        ))
        .unwrap();
        let mut session =
            crate::workspace::Session::load(crate::mods::app_dir().join("workspaces/float.json"))
                .unwrap();
        session.import(doc.clone(), 0).unwrap();
        this.file_chrome = crate::workspace::default_center();
        this.chrome = crate::workspace::project(&doc, &this.file_chrome).unwrap();
        this.workspace = Some(session);
        this.sync(window, cx);
        doc
    });
    let copy = view.update(cx, |this, _| this.copies["prototype-files-body"].id);
    let (group, handle) = view.update_in(cx, |this, window, cx| {
        let result = this.workspace_command(
            "workspace.float",
            &json!({"panel":"prototype-files-body"}),
            window,
            cx,
        );
        result.unwrap();
        let group = this.workspace.as_ref().unwrap().engine.document().floating[0]
            .group_id
            .clone();
        assert_eq!(this.copies["prototype-files-body"].id, copy);
        assert!(this.chrome.find("prototype-files-body").is_none());
        let handle = this.workspace_windows[&group];
        (group, handle)
    });
    cx.update_window(handle.into(), |_, window, cx| {
        window.draw(cx).clear(cx);
    })
    .unwrap();
    view.update_in(cx, |this, window, cx| {
        let result = this.workspace_command("workspace.undo", &json!({}), window, cx);
        result.unwrap();
        assert_eq!(
            this.workspace.as_ref().unwrap().engine.document(),
            &original
        );
        assert_eq!(this.copies["prototype-files-body"].id, copy);
        let result = this.workspace_command("workspace.redo", &json!({}), window, cx);
        result.unwrap();
        assert_eq!(this.copies["prototype-files-body"].id, copy);
        let result = this.workspace_command("workspace.dock", &json!({"group":group}), window, cx);
        result.unwrap();
        assert_eq!(
            this.workspace.as_ref().unwrap().engine.document(),
            &original
        );
        assert!(this.workspace_windows.is_empty());
        assert_eq!(this.copies["prototype-files-body"].id, copy);
    });
    assert_eq!(crate::mods::shared("float.loads"), Some(json!(1)));
    assert_eq!(
        crate::mods::shared("float.draft"),
        Some(json!("unsaved floating draft"))
    );
    view.update_in(cx, |this, window, cx| {
        this.workspace_active_panel = Some("prototype-files-body".into());
        this.focus.focus(window, cx);
    });
    cx.update(|w, cx| w.draw(cx).clear(cx));
    cx.simulate_keystrokes(if cfg!(target_os = "macos") {
        "cmd-alt-f"
    } else {
        "ctrl-alt-f"
    });
    view.update(cx, |this, _| {
        assert_eq!(
            this.workspace
                .as_ref()
                .unwrap()
                .engine
                .document()
                .floating
                .len(),
            1
        )
    });
    cx.simulate_keystrokes(if cfg!(target_os = "macos") {
        "cmd-alt-z"
    } else {
        "ctrl-alt-z"
    });
    view.update(cx, |this, _| {
        assert!(
            this.workspace
                .as_ref()
                .unwrap()
                .engine
                .document()
                .floating
                .is_empty()
        )
    });
    cx.simulate_keystrokes(if cfg!(target_os = "macos") {
        "cmd-alt-f"
    } else {
        "ctrl-alt-f"
    });
    let handle = view.update(cx, |this, _| {
        *this.workspace_windows.values().next().unwrap()
    });
    cx.update_window(handle.into(), |_, window, cx| {
        window.draw(cx).clear(cx);
        window.dispatch_action(
            Box::new(gpui_shell::action::ShellAction::new("tab.close")),
            cx,
        );
    })
    .unwrap();
    view.update(cx, |this, _| {
        assert!(
            this.workspace
                .as_ref()
                .unwrap()
                .engine
                .document()
                .floating
                .is_empty()
        );
        assert_eq!(this.copies["prototype-files-body"].id, copy);
    });
    // Persistence failure must leave the dock and live entity untouched and
    // remove any secondary window opened while preparing the transaction.
    let path = crate::mods::app_dir().join("workspaces/float.json");
    let backup = path.with_extension("saved.json");
    std::fs::rename(&path, &backup).unwrap();
    std::fs::create_dir(&path).unwrap();
    view.update_in(cx, |this, window, cx| {
        assert!(
            this.workspace_command(
                "workspace.float",
                &json!({"panel":"prototype-files-body"}),
                window,
                cx
            )
            .is_err()
        );
        assert!(this.workspace_windows.is_empty());
        assert!(
            this.workspace
                .as_ref()
                .unwrap()
                .engine
                .document()
                .floating
                .is_empty()
        );
        assert_eq!(this.copies["prototype-files-body"].id, copy);
    });
    std::fs::remove_dir(&path).unwrap();
    std::fs::rename(&backup, &path).unwrap();
}
