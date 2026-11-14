use panel_workspace::*;
use serde_json::json;

fn panel(id: &str) -> Panel {
    Panel {
        id: id.into(),
        content: Content::Mod {
            name: "context".into(),
            props: json!({"draft":"unsaved"}),
            duplicable: true,
        },
        binding: Binding::FollowActive,
        storage_namespace: Some(id.into()),
        extra: Extra::new(),
    }
}
fn apply(engine: &mut Engine, commands: Vec<Command>) {
    engine
        .apply(Transaction {
            expected_revision: engine.revision(),
            commands,
        })
        .unwrap();
    engine.document().validate().unwrap();
}
fn fixture() -> Engine {
    let mut engine = Engine::new(Workspace::default()).unwrap();
    apply(
        &mut engine,
        vec![
            Command::RegisterPanel {
                panel: panel("files"),
            },
            Command::RegisterPanel {
                panel: panel("changes"),
            },
            Command::RegisterPanel {
                panel: panel("context"),
            },
            Command::RegisterPanel {
                panel: panel("spaces"),
            },
            Command::NewGroup {
                id: "code-group".into(),
                edge: Edge::Left,
                index: 0,
            },
            Command::NewView {
                id: "code".into(),
                title: "Code".into(),
                group_id: "code-group".into(),
                index: 0,
            },
            Command::NewView {
                id: "context-view".into(),
                title: "Context".into(),
                group_id: "code-group".into(),
                index: 1,
            },
            Command::ShowPanel {
                panel_id: "changes".into(),
                section_id: "changes-section".into(),
                view_id: "code".into(),
                index: 0,
            },
            Command::ShowPanel {
                panel_id: "files".into(),
                section_id: "files-section".into(),
                view_id: "code".into(),
                index: 1,
            },
            Command::ShowPanel {
                panel_id: "context".into(),
                section_id: "context-section".into(),
                view_id: "context-view".into(),
                index: 0,
            },
            Command::NewGroup {
                id: "navigation".into(),
                edge: Edge::Left,
                index: 1,
            },
            Command::NewView {
                id: "spaces-view".into(),
                title: "Spaces".into(),
                group_id: "navigation".into(),
                index: 0,
            },
            Command::ShowPanel {
                panel_id: "spaces".into(),
                section_id: "spaces-section".into(),
                view_id: "spaces-view".into(),
                index: 0,
            },
        ],
    );
    engine
}

#[test]
fn select_preserves_code_state_and_neighbor_geometry() {
    let mut e = fixture();
    apply(
        &mut e,
        vec![
            Command::ResizeSection {
                section_id: "files-section".into(),
                weight: 3.5,
            },
            Command::Collapse {
                section_id: "changes-section".into(),
                collapsed: true,
            },
        ],
    );
    let code = e.document().view("code").unwrap().clone();
    let neighbor = e.document().group("navigation").unwrap().clone();
    let zones = e.document().zones.clone();
    apply(
        &mut e,
        vec![Command::SelectView {
            view_id: "context-view".into(),
        }],
    );
    assert!(e.document().visible_panel("context"));
    assert!(!e.document().visible_panel("files"));
    assert_eq!(e.document().zones, zones);
    assert_eq!(e.document().group("navigation"), Some(&neighbor));
    apply(
        &mut e,
        vec![Command::SelectView {
            view_id: "code".into(),
        }],
    );
    assert_eq!(e.document().view("code"), Some(&code));
}

#[test]
fn invalid_move_and_revision_conflict_preserve_document_and_history() {
    let mut e = fixture();
    let before = e.document().clone();
    let revision = e.revision();
    assert!(
        e.apply(Transaction {
            expected_revision: revision,
            commands: vec![Command::MoveSection {
                section_id: "files-section".into(),
                view_id: "context-view".into(),
                index: 999
            }]
        })
        .is_err()
    );
    assert_eq!(e.document(), &before);
    assert_eq!(e.revision(), revision);
    assert!(
        e.apply(Transaction {
            expected_revision: revision - 1,
            commands: vec![]
        })
        .is_err()
    );
    assert_eq!(e.document(), &before);
    e.undo(revision).unwrap();
    assert!(e.document().panels.is_empty());
}

#[test]
fn multiple_commands_commit_or_rollback_together() {
    let mut e = fixture();
    let before = e.document().clone();
    assert!(
        e.apply(Transaction {
            expected_revision: e.revision(),
            commands: vec![
                Command::HidePanel {
                    panel_id: "files".into()
                },
                Command::MoveGroup {
                    group_id: "missing".into(),
                    edge: Edge::Top,
                    index: 0
                },
            ]
        })
        .is_err()
    );
    assert_eq!(e.document(), &before);
}

#[test]
fn section_view_and_group_moves_preserve_instances_once_and_undo() {
    let mut e = fixture();
    let original = e.document().clone();
    apply(
        &mut e,
        vec![Command::MoveSection {
            section_id: "files-section".into(),
            view_id: "context-view".into(),
            index: 1,
        }],
    );
    apply(
        &mut e,
        vec![Command::MoveView {
            view_id: "context-view".into(),
            group_id: "navigation".into(),
            index: 1,
        }],
    );
    for edge in [Edge::Right, Edge::Top, Edge::Bottom, Edge::Left] {
        apply(
            &mut e,
            vec![Command::MoveGroup {
                group_id: "navigation".into(),
                edge,
                index: 0,
            }],
        );
    }
    assert_eq!(e.document().panels, original.panels);
    let moved = e.document().clone();
    for _ in 0..6 {
        e.undo(e.revision()).unwrap();
    }
    assert_eq!(e.document(), &original);
    for _ in 0..6 {
        e.redo(e.revision()).unwrap();
    }
    assert_eq!(e.document(), &moved);
}

#[test]
fn hide_normalizes_empty_containers_but_keeps_instance_and_reopen_path() {
    let mut e = fixture();
    let panel = e.document().panels["context"].clone();
    apply(
        &mut e,
        vec![Command::HidePanel {
            panel_id: "context".into(),
        }],
    );
    assert!(e.document().view("context-view").is_none());
    assert_eq!(e.document().panels["context"], panel);
    apply(
        &mut e,
        vec![
            Command::NewView {
                id: "reopened".into(),
                title: "Context".into(),
                group_id: "navigation".into(),
                index: 1,
            },
            Command::ShowPanel {
                panel_id: "context".into(),
                section_id: "reopened-section".into(),
                view_id: "reopened".into(),
                index: 0,
            },
            Command::RevealPanel {
                panel_id: "context".into(),
            },
        ],
    );
    assert_eq!(e.document().focused_panel_id.as_deref(), Some("context"));
    assert_eq!(e.document().panels["context"], panel);
}

#[test]
fn sole_group_can_move_to_empty_zone_float_resize_and_redock() {
    let mut e = fixture();
    let instances = e.document().panels.clone();
    apply(
        &mut e,
        vec![Command::MoveGroup {
            group_id: "code-group".into(),
            edge: Edge::Bottom,
            index: 0,
        }],
    );
    apply(
        &mut e,
        vec![Command::FloatGroup {
            window: Floating {
                group_id: "code-group".into(),
                x: 40.0,
                y: 50.0,
                width: 400.0,
                height: 500.0,
                extra: Extra::new(),
            },
        }],
    );
    assert_eq!(e.document().floating.len(), 1);
    apply(
        &mut e,
        vec![Command::FloatGroup {
            window: Floating {
                group_id: "code-group".into(),
                x: 30.0,
                y: 20.0,
                width: 600.0,
                height: 700.0,
                extra: Extra::new(),
            },
        }],
    );
    assert_eq!(e.document().floating.len(), 1);
    assert_eq!(e.document().floating[0].width, 600.0);
    apply(
        &mut e,
        vec![Command::MoveGroup {
            group_id: "code-group".into(),
            edge: Edge::Right,
            index: 0,
        }],
    );
    assert!(e.document().floating.is_empty());
    assert_eq!(e.document().panels, instances);
}

#[test]
fn pinned_target_survives_moves_and_duplicate_has_independent_namespace() {
    let mut e = fixture();
    let binding = Binding::Pinned {
        machine_id: "remote".into(),
        checkout_id: "checkout".into(),
    };
    apply(
        &mut e,
        vec![
            Command::Bind {
                panel_id: "context".into(),
                binding: binding.clone(),
            },
            Command::Duplicate {
                panel_id: "context".into(),
                new_panel_id: "context-copy".into(),
                section_id: "copy-section".into(),
                view_id: "code".into(),
                index: 2,
            },
            Command::MoveGroup {
                group_id: "code-group".into(),
                edge: Edge::Top,
                index: 0,
            },
        ],
    );
    assert_eq!(e.document().panels["context"].binding, binding);
    let copy = &e.document().panels["context-copy"];
    assert_eq!(copy.binding, binding);
    assert_ne!(
        copy.storage_namespace,
        e.document().panels["context"].storage_namespace
    );
    assert_eq!(copy.content, e.document().panels["context"].content);
}

#[test]
fn terminal_content_is_preserved_and_cannot_be_duplicated() {
    let mut e = fixture();
    let mut terminal = panel("terminal");
    terminal.content = Content::Terminal {
        machine_id: "remote".into(),
        address: "t7".into(),
    };
    apply(
        &mut e,
        vec![
            Command::RegisterPanel {
                panel: terminal.clone(),
            },
            Command::ShowPanel {
                panel_id: "terminal".into(),
                section_id: "terminal-section".into(),
                view_id: "code".into(),
                index: 2,
            },
            Command::Collapse {
                section_id: "terminal-section".into(),
                collapsed: true,
            },
            Command::MoveSection {
                section_id: "terminal-section".into(),
                view_id: "spaces-view".into(),
                index: 1,
            },
        ],
    );
    assert_eq!(e.document().panels["terminal"], terminal);
    let before = e.document().clone();
    assert!(
        e.apply(Transaction {
            expected_revision: e.revision(),
            commands: vec![Command::Duplicate {
                panel_id: "terminal".into(),
                new_panel_id: "terminal-copy".into(),
                section_id: "copy-section".into(),
                view_id: "code".into(),
                index: 0
            }]
        })
        .is_err()
    );
    assert_eq!(e.document(), &before);
    apply(
        &mut e,
        vec![Command::HidePanel {
            panel_id: "terminal".into(),
        }],
    );
    assert_eq!(e.document().panels["terminal"], terminal);
}

#[test]
fn reveal_locates_owner_and_repairs_focus_without_duplicating() {
    let mut e = fixture();
    apply(
        &mut e,
        vec![
            Command::Collapse {
                section_id: "context-section".into(),
                collapsed: true,
            },
            Command::HideZone {
                edge: Edge::Left,
                hidden: true,
            },
            Command::RevealPanel {
                panel_id: "context".into(),
            },
        ],
    );
    assert!(e.document().visible_panel("context"));
    assert_eq!(e.document().panels.len(), 4);
    apply(
        &mut e,
        vec![Command::Collapse {
            section_id: "context-section".into(),
            collapsed: true,
        }],
    );
    assert_ne!(e.document().focused_panel_id.as_deref(), Some("context"));
}

#[test]
fn allocator_keeps_headers_and_requests_scroll_when_minimums_cannot_fit() {
    let e = fixture();
    let mut sections = e.document().view("code").unwrap().sections.clone();
    sections[0].weight = 1.0;
    sections[1].weight = 3.0;
    let (sizes, extent) = section_extents(&sections, 400.0, 28.0).unwrap();
    assert_eq!(extent, 400.0);
    assert_eq!(sizes, vec![150.0, 250.0]);
    let (sizes, extent) = section_extents(&sections, 40.0, 28.0).unwrap();
    assert_eq!(extent, 200.0);
    assert_eq!(sizes, vec![100.0, 100.0]);
    for section in &mut sections {
        section.collapsed = true;
    }
    let (sizes, extent) = section_extents(&sections, 40.0, 28.0).unwrap();
    assert_eq!(sizes, vec![28.0, 28.0]);
    assert_eq!(extent, 56.0);
    assert_eq!(sections[1].weight, 3.0);
}

#[test]
fn invalid_weights_and_duplicate_placement_are_rejected() {
    let mut e = fixture();
    let before = e.document().clone();
    for weight in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(
            e.apply(Transaction {
                expected_revision: e.revision(),
                commands: vec![Command::ResizeSection {
                    section_id: "files-section".into(),
                    weight
                }]
            })
            .is_err()
        );
        assert_eq!(e.document(), &before);
    }
    assert!(
        e.apply(Transaction {
            expected_revision: e.revision(),
            commands: vec![Command::ShowPanel {
                panel_id: "files".into(),
                section_id: "another-section".into(),
                view_id: "spaces-view".into(),
                index: 1
            }]
        })
        .is_err()
    );
    assert_eq!(e.document(), &before);
}

#[test]
fn import_round_trip_preserves_extensions_and_undoes_atomically() {
    let mut e = fixture();
    let original = e.document().clone();
    let mut document = original.clone();
    document
        .extra
        .insert("future-preference".into(), json!({"keep":true}));
    document
        .panels
        .get_mut("context")
        .unwrap()
        .extra
        .insert("future-panel".into(), json!(123));
    let imported = Store::import(&Store::export(&document).unwrap()).unwrap();
    assert_eq!(imported, document);
    e.import(imported, e.revision()).unwrap();
    e.undo(e.revision()).unwrap();
    assert_eq!(e.document(), &original);
    let mut future = document;
    future.version = 999;
    assert!(e.import(future, e.revision()).is_err());
    assert_eq!(e.document(), &original);
}

#[test]
fn disk_save_recovers_last_good_and_retains_damaged_primary() {
    let path = std::env::temp_dir().join(format!("herdr-workspace-{}", std::process::id()));
    std::fs::create_dir_all(&path).unwrap();
    let store = Store::new(path.join("workspace.json"));
    let e = fixture();
    store.save(e.document()).unwrap();
    store.save(e.document()).unwrap();
    std::fs::write(store.path(), "{damaged").unwrap();
    let recovered = store.load().unwrap();
    assert!(recovered.recovered);
    assert_eq!(&recovered.document, e.document());
    store.save(&recovered.document).unwrap();
    assert!(
        std::fs::read_dir(&path).unwrap().any(|p| p
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains("corrupt"))
    );
    assert_eq!(store.load().unwrap().document, recovered.document);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn closed_panels_restore_the_last_dock_and_geometry_after_restart() {
    for edge in [Edge::Left,Edge::Right,Edge::Top,Edge::Bottom,Edge::TopCenter,Edge::BottomCenter] {
        let mut e=fixture();
        apply(&mut e,vec![
            Command::MoveGroup {group_id:"navigation".into(),edge,index:0},
            Command::ResizeGroup {group_id:"navigation".into(),weight:2.75},
            Command::ResizeZone {edge,extent:380.0},
            Command::ResizeSection {section_id:"spaces-section".into(),weight:3.25},
        ]);
        let panel=e.document().panels["spaces"].clone();
        apply(&mut e,vec![Command::HidePanel {panel_id:"spaces".into()}]);
        assert!(e.document().group("navigation").is_none());
        // Repeat-close must not erase the saved location.
        apply(&mut e,vec![Command::HidePanel {panel_id:"spaces".into()}]);
        let closed=Store::import(&Store::export(e.document()).unwrap()).unwrap();
        let mut restarted=Engine::new(closed.clone()).unwrap();
        apply(&mut restarted,vec![Command::RestorePanel {panel_id:"spaces".into()}]);
        let doc=restarted.document();
        let zone=doc.zones.iter().find(|z|z.edge==edge).unwrap();
        assert_eq!(zone.extent,380.0);
        assert!(!zone.hidden);
        assert_eq!(zone.groups[0].group_id,"navigation");
        assert_eq!(zone.groups[0].weight,2.75);
        let section=&doc.view("spaces-view").unwrap().sections[0];
        assert_eq!(section.id,"spaces-section");
        assert_eq!(section.weight,3.25);
        assert_eq!(doc.panels["spaces"],panel);
        assert!(doc.closed_panels.is_empty());
        let restored=doc.clone();
        restarted.undo(restarted.revision()).unwrap();
        assert_eq!(restarted.document(),&closed);
        restarted.redo(restarted.revision()).unwrap();
        assert_eq!(restarted.document(),&restored);
    }
}

#[test]
fn restore_reuses_surviving_views_and_recreates_removed_tabs_in_order() {
    let mut e=fixture();
    apply(&mut e,vec![Command::ResizeSection {section_id:"changes-section".into(),weight:2.5}]);
    apply(&mut e,vec![Command::HidePanel {panel_id:"changes".into()}]);
    apply(&mut e,vec![Command::MoveGroup {group_id:"code-group".into(),edge:Edge::Right,index:0}]);
    apply(&mut e,vec![Command::RestorePanel {panel_id:"changes".into()}]);
    let code=e.document().view("code").unwrap();
    assert_eq!(code.sections.iter().map(|s|s.panel_id.as_str()).collect::<Vec<_>>(),vec!["changes","files"]);
    assert_eq!(code.sections[0].weight,2.5);
    assert_eq!(e.document().zones.iter().find(|z|z.edge==Edge::Right).unwrap().groups[0].group_id,"code-group");
    apply(&mut e,vec![Command::HidePanel {panel_id:"context".into()}]);
    apply(&mut e,vec![Command::RestorePanel {panel_id:"context".into()}]);
    let group=e.document().group("code-group").unwrap();
    assert_eq!(group.views.iter().map(|v|v.id.as_str()).collect::<Vec<_>>(),vec!["code","context-view"]);
    assert_eq!(group.active_view_id,"context-view");
}

#[test]
fn explicit_show_replaces_the_closed_location_and_next_close_records_the_new_one() {
    let mut e=fixture();
    apply(&mut e,vec![Command::HidePanel {panel_id:"spaces".into()}]);
    apply(&mut e,vec![Command::ShowPanel {panel_id:"spaces".into(),section_id:"new-position".into(),view_id:"code".into(),index:0}]);
    assert!(!e.document().closed_panels.contains_key("spaces"));
    apply(&mut e,vec![Command::HidePanel {panel_id:"spaces".into()}]);
    apply(&mut e,vec![Command::RestorePanel {panel_id:"spaces".into()}]);
    assert_eq!(e.document().view("code").unwrap().sections[0].id,"new-position");
}
