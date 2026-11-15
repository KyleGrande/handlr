// Exercise the actual native layout parser and workspace adapter without GPU
// dependencies. These are source includes, not a replacement implementation.
#[path = "../../../src/commands.rs"]
mod commands;
#[path = "../../../src/layout.rs"]
mod layout;
#[path = "../../../src/workspace.rs"]
mod workspace;

use panel_workspace::*;
use serde_json::json;

#[test]
fn generated_native_document_parses_and_projects_all_starter_panels() {
    let document = Store::import(include_str!("../../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
    let projected = workspace::project(&document,&workspace::default_center()).unwrap();
    assert_eq!(document.panels.len(),7);
    assert_eq!(document.groups.len(),4);
    assert_eq!(document.group("prototype-code-group").unwrap().views.len(),2);
    assert!(projected.find("prototype-context-body").is_some());
}

fn sample() -> Workspace {
    let mut engine = Engine::new(Workspace::default()).unwrap();
    engine
        .apply(Transaction {
            expected_revision: 0,
            commands: vec![
                Command::RegisterPanel {
                    panel: Panel {
                        id: "context".into(),
                        content: Content::Mod {
                            name: "context".into(),
                            props: json!({"preserve":"draft"}),
                            duplicable: false,
                        },
                        binding: Binding::FollowActive,
                        storage_namespace: None,
                        extra: Extra::new(),
                    },
                },
                Command::NewGroup {
                    id: "left-group".into(),
                    edge: Edge::Left,
                    index: 0,
                },
                Command::NewView {
                    id: "context-view".into(),
                    title: "Context".into(),
                    group_id: "left-group".into(),
                    index: 0,
                },
                Command::ShowPanel {
                    panel_id: "context".into(),
                    section_id: "context-section".into(),
                    view_id: "context-view".into(),
                    index: 0,
                },
            ],
        })
        .unwrap();
    engine.document().clone()
}

#[test]
fn projection_preserves_center_and_uses_stable_panel_slots() {
    let document = sample();
    let center = workspace::default_center();
    let projected = workspace::project(&document, &center).unwrap();
    assert_eq!(projected.find(&center.id), Some(&center));
    assert!(
        matches!(projected.find("context").unwrap().content(),Some(layout::Content::Mod { name,props }) if name=="context" && props==&json!({"preserve":"draft"}))
    );
    assert!(workspace::internal_header(
        projected.find("@workspace/header/context-section").unwrap()
    ));
    let ids: std::collections::BTreeSet<_> = projected.walk().into_iter().map(|n| &n.id).collect();
    assert_eq!(ids.len(), projected.walk().len());
    let json = serde_json::to_string(&projected).unwrap();
    let restored: layout::Node = serde_json::from_str(&json).unwrap();
    assert_eq!(restored, projected);
}

#[test]
fn workspace_root_retains_layout_look_and_blur_in_normal_and_maximized_modes() {
    let mut document = sample();
    let center: layout::Node = serde_json::from_value(json!({
        "id":"@workspace/center", "type":"column", "children":[], "window_blur":true,
        "theme":{"light":"paper","dark":"ink"},
        "colors":{"background":"#17191d66","canvas":"#1113164d","surface":"#17191dcc"},
        "font":"JetBrains Mono", "font_size":15, "terminal_opacity":1
    })).unwrap();
    for maximized in [None, Some("left-group".to_owned())] {
        document.maximized_group_id = maximized;
        let projected = workspace::project(&document, &center).unwrap();
        assert!(projected.window_blur, "the displayed root drives native blur");
        assert_eq!(projected.look, center.look, "root theme resolution must see the layout's material");
        let opaque = workspace::project(&document, &workspace::default_center()).unwrap();
        assert!(!opaque.window_blur);
        assert_eq!(opaque.look, workspace::default_center().look);
    }
}

#[test]
fn hidden_and_empty_zones_take_no_width_and_top_bottom_are_horizontal() {
    let mut document = sample();
    let projected = workspace::project(&document, &workspace::default_center()).unwrap();
    assert!(!projected.find("@workspace/zone/left").unwrap().hidden);
    assert!(projected.find("@workspace/zone/right").unwrap().hidden);
    assert!(matches!(
        projected.find("@workspace/zone/top").unwrap().kind,
        layout::Kind::Row { .. }
    ));
    document
        .zones
        .iter_mut()
        .find(|z| z.edge == Edge::Left)
        .unwrap()
        .hidden = true;
    let projected = workspace::project(&document, &workspace::default_center()).unwrap();
    assert!(projected.find("@workspace/zone/left").unwrap().hidden);
}

#[test]
fn host_identity_collisions_are_rejected_including_hidden_registry_entries() {
    let mut document = sample();
    document.panels.insert(
        "@workspace/tabs".into(),
        Panel {
            id: "@workspace/tabs".into(),
            ..document.panels["context"].clone()
        },
    );
    assert!(workspace::project(&document, &workspace::default_center()).is_err());
}

#[test]
fn failed_disk_save_never_publishes_mutation_or_history() {
    let dir = std::env::temp_dir().join(format!("herdr-session-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("workspace.json");
    let mut session = workspace::Session::load(path.clone()).unwrap();
    session.import(sample(), 0).unwrap();
    let before = session.inspect();
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert!(
        session
            .commands(vec![Command::HidePanel {
                panel_id: "context".into()
            }])
            .is_err()
    );
    assert_eq!(session.inspect(), before);
    std::fs::remove_dir_all(dir).unwrap();
}

fn starter() -> Workspace {
    Store::import(include_str!("../../../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap()
}

#[test]
fn drag_section_reorders_after_removal_and_preserves_identity_and_weights() {
    use workspace::drag::{commands, Source, Target};
    let doc = starter();
    let section = doc.groups[0].views[0].sections[0].id.clone();
    let mut engine = Engine::new(doc.clone()).unwrap();
    let moves = commands(&doc,&Source::Section(section.clone()),&Target::Sections { view:"prototype-code".into(),index:2 },"drag").unwrap();
    engine.apply(Transaction { expected_revision:0,commands:moves }).unwrap();
    assert_eq!(engine.document().view("prototype-code").unwrap().sections[1].id,section);
    assert_eq!(engine.document().panels,doc.panels);
    engine.undo(1).unwrap();
    assert_eq!(engine.document(),&doc);
}

#[test]
fn drag_last_section_to_empty_zone_creates_populated_group_atomically() {
    use workspace::drag::{commands, Source, Target};
    let doc = starter();
    let section = doc.view("prototype-context").unwrap().sections[0].clone();
    let mut engine = Engine::new(doc.clone()).unwrap();
    let moves = commands(&doc,&Source::Section(section.id.clone()),&Target::Zone { edge:Edge::Bottom,index:0 },"new").unwrap();
    engine.apply(Transaction { expected_revision:0,commands:moves }).unwrap();
    assert!(engine.document().view("prototype-context").is_none());
    assert_eq!(engine.document().view("new-view").unwrap().sections[0],section);
    assert_eq!(engine.document().panels,doc.panels);
    assert!(!engine.document().zones.iter().find(|z| z.edge==Edge::Bottom).unwrap().hidden);
    engine.undo(1).unwrap();
    assert_eq!(engine.document(),&doc);
}

#[test]
fn drag_group_can_reorder_then_merge_views_without_reloading_panels() {
    use workspace::drag::{commands, Source, Target};
    let doc = starter();
    let first = doc.zones.iter().find(|z| z.edge==Edge::Left).unwrap().groups[0].group_id.clone();
    let second = doc.zones.iter().find(|z| z.edge==Edge::Left).unwrap().groups[1].group_id.clone();
    let mut engine = Engine::new(doc.clone()).unwrap();
    let moves = commands(&doc,&Source::Group(first.clone()),&Target::Zone { edge:Edge::Left,index:2 },"unused").unwrap();
    engine.apply(Transaction { expected_revision:0,commands:moves }).unwrap();
    assert_eq!(engine.document().zones.iter().find(|z| z.edge==Edge::Left).unwrap().groups[1].group_id,first);
    let moves = commands(engine.document(),&Source::Group(first.clone()),&Target::Views { group:second.clone(),index:0 },"unused").unwrap();
    engine.apply(Transaction { expected_revision:1,commands:moves }).unwrap();
    assert!(engine.document().group(&first).is_none());
    assert_eq!(engine.document().group(&second).unwrap().views.len(),4);
    assert_eq!(engine.document().panels,doc.panels);
}

#[test]
fn invalid_drag_target_does_not_change_document() {
    use workspace::drag::{commands, Source, Target};
    let doc = starter();
    assert!(commands(&doc,&Source::Section("missing".into()),&Target::Sections { view:"prototype-code".into(),index:99 },"drag").is_err());
    assert!(commands(&doc,&Source::Section("missing".into()),&Target::Zone { edge:Edge::Top,index:0 },"drag").is_err());
    let mut engine = Engine::new(doc.clone()).unwrap();
    let moves = commands(&doc,&Source::View("missing".into()),&Target::Zone { edge:Edge::Top,index:0 },"drag").unwrap();
    assert!(engine.apply(Transaction { expected_revision:0,commands:moves }).is_err());
    assert_eq!(engine.document(),&doc);
    assert_eq!(engine.revision(),0);
}

#[test]
fn rename_changes_only_labels_persists_and_undoes() {
    let original=starter();let mut engine=Engine::new(original.clone()).unwrap();
    engine.apply(Transaction {expected_revision:0,commands:vec![
        Command::RenamePanel {panel_id:"prototype-files-body".into(),name:"  Source files  ".into()},
        Command::RenameView {view_id:"prototype-code".into(),name:"Review".into()},
    ]}).unwrap();
    let changed=engine.document();
    assert_eq!(workspace::panel_title(&changed.panels["prototype-files-body"]),"Source files");
    assert_eq!(changed.view("prototype-code").unwrap().title,"Review");
    assert_eq!(changed.panels["prototype-files-body"].content,original.panels["prototype-files-body"].content);
    assert_eq!(changed.panels["prototype-files-body"].storage_namespace,original.panels["prototype-files-body"].storage_namespace);
    let saved=Store::import(&Store::export(changed).unwrap()).unwrap();
    assert_eq!(&saved,changed);
    engine.undo(1).unwrap();assert_eq!(engine.document(),&original);
    assert!(engine.apply(Transaction {expected_revision:2,commands:vec![Command::RenamePanel {panel_id:"prototype-files-body".into(),name:"bad\nname".into()}]}).is_err());
    assert_eq!(engine.document(),&original);
}

#[test]
fn native_headers_keep_original_cards_and_omit_single_view_tabs() {
    let doc=starter();let tree=workspace::project(&doc,&workspace::default_center()).unwrap();
    assert!(tree.find("@workspace/header/prototype-files-section").unwrap().hidden);
    assert!(tree.find("@workspace/header/prototype-changes-section").unwrap().hidden);
    assert!(matches!(&tree.find("prototype-toolbox-group").unwrap().kind,layout::Kind::Stack {header:None,..}));
    assert!(matches!(&tree.find("prototype-code-group").unwrap().kind,layout::Kind::Stack {header:Some(_),..}));
}

#[test]
fn legacy_four_zone_document_can_add_center_docks_and_undo_exactly() {
    use workspace::drag::{commands,Source,Target};
    let mut original=starter();original.zones.retain(|z|!z.edge.is_center());
    original.validate().unwrap();
    for edge in [Edge::TopCenter,Edge::BottomCenter] {
        let mut engine=Engine::new(original.clone()).unwrap();
        let moves=commands(&original,&Source::Group("prototype-navigation-group".into()),&Target::Zone {edge,index:0},"center-test").unwrap();
        engine.apply(Transaction {expected_revision:0,commands:moves}).unwrap();
        assert_eq!(engine.document().zones.iter().find(|z|z.edge==edge).unwrap().groups[0].group_id,"prototype-navigation-group");
        let saved=Store::import(&Store::export(engine.document()).unwrap()).unwrap();
        assert_eq!(&saved,engine.document());
        engine.undo(1).unwrap();assert_eq!(engine.document(),&original);
    }
}

#[test]
fn full_width_and_center_docks_have_distinct_layout_ancestry() {
    for edge in [Edge::Top,Edge::Bottom,Edge::TopCenter,Edge::BottomCenter] {
        let mut engine=Engine::new(starter()).unwrap();
        engine.apply(Transaction {expected_revision:0,commands:vec![Command::MoveGroup {group_id:"prototype-navigation-group".into(),edge,index:0}]}).unwrap();
        let tree=workspace::project(engine.document(),&workspace::default_center()).unwrap();
        let path=tree.path_to("prototype-navigation-group").unwrap();
        assert_eq!(path.contains(&"@workspace/center-stack".into()),edge.is_center());
        let left=tree.path_to("prototype-code-group").unwrap();
        assert!(!left.contains(&"@workspace/center-stack".into()),"side groups stay outside center docks");
        assert_eq!(tree.find("@workspace/middle").unwrap().children().len(),3);
    }
}

#[test]
fn manifest_opt_in_shares_custom_headers_without_changing_the_document() {
    let doc=starter();let original=doc.clone();
    let plain=workspace::project(&doc,&workspace::default_center()).unwrap();
    assert!(!plain.find("@workspace/header/prototype-toolbox-section").unwrap().hidden);
    let headers=["toolbox".to_owned(),"context".to_owned(),"rigs".to_owned()].into_iter().collect();
    let shared=workspace::project_with_headers(&doc,&workspace::default_center(),&headers).unwrap();
    for name in ["toolbox","context","rigs"] {
        assert!(shared.find(&format!("@workspace/header/prototype-{name}-section")).unwrap().hidden);
    }
    assert_eq!(doc,original,"presentation capabilities must not rewrite panel data");
}

#[test]
fn workspace_terminals_use_the_shipped_app_presentation() {
    let main: layout::Node = serde_json::from_str(include_str!("../../../defaults/layouts/main.json")).unwrap();
    let main = serde_json::to_value(main).unwrap();
    let center = serde_json::to_value(workspace::default_center()).unwrap();
    let work = &main["children"][1];
    assert_eq!(center["terminal_padding"], main["terminal_padding"]);
    assert_eq!(center["background"], main["background"]);
    assert_eq!(center["children"][0]["content"], work["children"][0]["content"]);
    assert_eq!(center["children"][0]["size"], work["children"][0]["size"]);
    assert_eq!(center["children"][1]["padding"], work["children"][1]["padding"]);
    assert_eq!(center["children"][1]["children"][0]["content"], work["children"][1]["children"][0]["content"]);
}

#[test]
fn opening_panels_adds_reveals_and_reopens_without_duplicating_state() {
    let mut engine=Engine::new(Workspace::default()).unwrap();
    let open=workspace::open_mod(engine.document(),"custom","Custom panel",Edge::Right,"first");
    engine.apply(Transaction {expected_revision:0,commands:open}).unwrap();
    let panel=engine.document().panels.values().next().unwrap().clone();
    assert_eq!(engine.document().groups.len(),1);
    assert_eq!(engine.document().focused_panel_id.as_deref(),Some(panel.id.as_str()));
    let reveal=workspace::open_mod(engine.document(),"custom","Ignored new title",Edge::Left,"again");
    engine.apply(Transaction {expected_revision:1,commands:reveal}).unwrap();
    assert_eq!(engine.document().groups.len(),1);
    assert_eq!(engine.document().panels.len(),1);
    engine.apply(Transaction {expected_revision:engine.revision(),commands:vec![Command::HidePanel {panel_id:panel.id.clone()}]}).unwrap();
    assert!(engine.document().groups.is_empty());
    let closed=engine.document().clone();
    let reopen=workspace::open_mod(engine.document(),"custom","Ignored new title",Edge::Left,"reopened");
    engine.apply(Transaction {expected_revision:engine.revision(),commands:reopen}).unwrap();
    assert_eq!(engine.document().panels[&panel.id],panel);
    assert_eq!(engine.document().groups.len(),1);
    assert_eq!(engine.document().zones.iter().find(|z|z.edge==Edge::Right).unwrap().groups.len(),1);
    engine.undo(engine.revision()).unwrap();
    assert_eq!(engine.document(),&closed);
}

#[test]
fn opening_registered_panels_preserves_props_binding_and_custom_storage() {
    let mut doc=sample();
    let panel=doc.panels.get_mut("context").unwrap();
    panel.storage_namespace=Some("existing-drafts".into());
    panel.extra.insert("title".into(),json!("My context"));
    let expected=panel.clone();
    let mut engine=Engine::new(doc).unwrap();
    engine.apply(Transaction {expected_revision:0,commands:vec![Command::HidePanel {panel_id:"context".into()}]}).unwrap();
    let commands=workspace::open_mod(engine.document(),"context","Context",Edge::Right,"reopen");
    engine.apply(Transaction {expected_revision:1,commands}).unwrap();
    assert_eq!(engine.document().panels["context"],expected);
    assert_eq!(engine.document().groups[0].views[0].title,"Context");
}
