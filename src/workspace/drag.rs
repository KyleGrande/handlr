//! Drag gestures resolve to the same atomic commands as keyboard/API moves.
use panel_workspace::{Command, Content, Edge, Result, Workspace};

#[derive(Clone, Debug, PartialEq)]
pub enum Source {
    Section(String),
    View(String),
    Group(String),
}

/// Insertion indices refer to the document before removing the source.
#[derive(Clone, Debug, PartialEq)]
pub enum Target {
    Sections { view: String, index: usize },
    Views { group: String, index: usize },
    Zone { edge: Edge, index: usize },
    TabGroup { section: String },
}

pub fn commands(
    doc: &Workspace,
    source: &Source,
    target: &Target,
    seed: &str,
) -> Result<Vec<Command>> {
    let mut result = vec![];
    match target {
        Target::TabGroup { section } => {
            let Source::Section(source) = source else {
                return Err("drag a panel beside another panel title to create a tab group".into());
            };
            return tab_group_commands(doc, source, section, seed);
        }
        Target::Zone { edge, index } => {
            let zone = doc.zones.iter().find(|z| z.edge == *edge);
            if zone.is_none() && !edge.is_center() {
                return Err("missing zone".into());
            }
            let groups = zone.map(|z| z.groups.as_slice()).unwrap_or(&[]);
            if *index > groups.len() {
                return Err("invalid group insertion".into());
            }
            // Lifting an entire pane and returning it to its own slot is a
            // no-op, including a pane represented by one tab or one section.
            let whole_group = doc.groups.iter().find(|g| match source {
                Source::Group(id) => &g.id == id,
                Source::View(id) => g.views.len() == 1 && g.views[0].id == *id,
                Source::Section(id) => g.views.len() == 1 && g.views[0].sections.len() == 1 && g.views[0].sections[0].id == *id,
            });
            if let Some(group) = whole_group
                && let Some(old_index) = groups.iter().position(|r| r.group_id == group.id)
                && index - usize::from(old_index < *index) == old_index
            {
                return Ok(vec![]);
            }
            if let Source::Group(id) = source {
                doc.group(id).ok_or("missing source group")?;
                let index =
                    index - usize::from(groups.iter().take(*index).any(|g| &g.group_id == id));
                result.push(Command::MoveGroup {
                    group_id: id.clone(),
                    edge: *edge,
                    index,
                });
            } else {
                let group = format!("{seed}-group");
                result.push(Command::NewGroup {
                    id: group.clone(),
                    edge: *edge,
                    index: *index,
                });
                match source {
                    Source::View(id) => result.push(Command::MoveView {
                        view_id: id.clone(),
                        group_id: group,
                        index: 0,
                    }),
                    Source::Section(id) => {
                        let section = doc
                            .groups
                            .iter()
                            .flat_map(|g| &g.views)
                            .flat_map(|v| &v.sections)
                            .find(|s| &s.id == id)
                            .ok_or("missing source section")?;
                        let title = match &doc.panels[&section.panel_id].content {
                            Content::Mod { name, .. } => name.clone(),
                            Content::Terminal { address, .. } => address.clone(),
                        };
                        let view = format!("{seed}-view");
                        result.push(Command::NewView {
                            id: view.clone(),
                            title,
                            group_id: group,
                            index: 0,
                        });
                        result.push(Command::MoveSection {
                            section_id: id.clone(),
                            view_id: view,
                            index: 0,
                        });
                    }
                    Source::Group(_) => unreachable!(),
                }
            }
        }
        Target::Sections { view, index } => {
            let dest = doc.view(view).ok_or("missing destination view")?;
            if *index > dest.sections.len() {
                return Err("invalid section insertion".into());
            }
            let sections = match source {
                Source::Section(id) => {
                    let index = index - usize::from(dest.sections.iter().take(*index).any(|s| &s.id == id));
                    vec![(id.clone(), index)]
                }
                Source::View(id) => {
                    if id == view { return Ok(vec![]); }
                    doc.view(id).ok_or("missing source view")?.sections.iter().enumerate()
                        .map(|(offset, section)| (section.id.clone(), index + offset)).collect()
                }
                Source::Group(_) => return Err("drop a panel or tab here".into()),
            };
            for (section_id, index) in sections {
                result.push(Command::MoveSection { section_id, view_id: view.clone(), index });
            }
            result.push(Command::SelectView {
                view_id: view.clone(),
            });
        }
        Target::Views { group, index } => {
            let dest = doc.group(group).ok_or("missing destination group")?;
            if *index > dest.views.len() {
                return Err("invalid view insertion".into());
            }
            match source {
                Source::View(id) => {
                    let index =
                        index - usize::from(dest.views.iter().take(*index).any(|v| &v.id == id));
                    result.push(Command::MoveView {
                        view_id: id.clone(),
                        group_id: group.clone(),
                        index,
                    });
                }
                Source::Group(id) => {
                    if id == group {
                        return Ok(vec![]);
                    }
                    let source = doc.group(id).ok_or("missing source group")?;
                    for (offset, view) in source.views.iter().enumerate() {
                        result.push(Command::MoveView {
                            view_id: view.id.clone(),
                            group_id: group.clone(),
                            index: index + offset,
                        });
                    }
                    result.push(Command::SelectView {
                        view_id: source.active_view_id.clone(),
                    });
                }
                Source::Section(id) => {
                    let section = doc.groups.iter().flat_map(|g| &g.views)
                        .flat_map(|v| &v.sections).find(|s| &s.id == id)
                        .ok_or("missing source section")?;
                    let view = format!("{seed}-view");
                    result.push(Command::NewView {
                        id: view.clone(),
                        title: super::panel_title(&doc.panels[&section.panel_id]),
                        group_id: group.clone(),
                        index: *index,
                    });
                    result.push(Command::MoveSection { section_id: id.clone(), view_id: view.clone(), index: 0 });
                    result.push(Command::SelectView { view_id: view });
                }
            }
        }
    }
    Ok(result)
}

/// Group two existing sections using existing workspace operations. Other
/// sections keep their current views, and the whole gesture remains undoable.
pub fn tab_group_commands(
    doc: &Workspace,
    source: &str,
    target: &str,
    seed: &str,
) -> Result<Vec<Command>> {
    let locate = |id: &str| doc.groups.iter().find_map(|group| {
        group.views.iter().find_map(|view| {
            view.sections.iter().find(|section| section.id == id)
                .map(|section| (group, view, section))
        })
    });
    let (source_group, source_view, source_section) = locate(source).ok_or("missing source section")?;
    let (group, view, section) = locate(target).ok_or("missing target section")?;
    if source == target || (source_group.id == group.id && source_view.id != view.id && source_view.sections.len() == 1 && view.sections.len() == 1) {
        return Ok(vec![]);
    }
    let mut commands = vec![];
    let mut index = group.views.len();
    if view.sections.len() > 1 {
        let target_view = format!("{seed}-target-view");
        commands.push(Command::NewView { id: target_view.clone(), title: super::panel_title(&doc.panels[&section.panel_id]), group_id: group.id.clone(), index });
        commands.push(Command::MoveSection { section_id: target.into(), view_id: target_view, index: 0 });
        index += 1;
    } else if group.views.len() == 1 {
        commands.push(Command::RenameView { view_id: view.id.clone(), name: super::panel_title(&doc.panels[&section.panel_id]) });
    }
    let source_view = format!("{seed}-source-view");
    commands.push(Command::NewView { id: source_view.clone(), title: super::panel_title(&doc.panels[&source_section.panel_id]), group_id: group.id.clone(), index });
    commands.push(Command::MoveSection { section_id: source.into(), view_id: source_view.clone(), index: 0 });
    commands.push(Command::SelectView { view_id: source_view });
    Ok(commands)
}

#[cfg(test)]
mod tab_group_tests {
    use super::*;
    use panel_workspace::{Engine, Transaction};
    use serde_json::json;

    fn fixture() -> Workspace {
        let mut engine = Engine::new(Workspace::default()).unwrap();
        let mut commands = vec![];
        for (group, names) in [("left", ["a", "c"]), ("right", ["b", "d"])] {
            commands.push(Command::NewGroup { id: group.into(), edge: if group == "left" { Edge::Left } else { Edge::Right }, index: 0 });
            commands.push(Command::NewView { id: format!("{group}-view"), title: group.into(), group_id: group.into(), index: 0 });
            for (index, name) in names.iter().enumerate() {
                let panel = serde_json::from_value(json!({"id":name,"title":name.to_uppercase(),"content":{"kind":"mod","name":name,"props":{"draft":name}},"binding":{"kind":"follow_active"},"storage_namespace":format!("state-{name}")})).unwrap();
                commands.push(Command::RegisterPanel { panel });
                commands.push(Command::ShowPanel { panel_id: (*name).into(), section_id: format!("{name}-section"), view_id: format!("{group}-view"), index });
            }
        }
        engine.apply(Transaction { expected_revision: 0, commands }).unwrap();
        engine.document().clone()
    }

    #[test]
    fn dropping_a_whole_pane_back_in_place_is_a_noop() {
        let mut doc = fixture();
        // One section, one tab: all three grips refer to the whole pane.
        doc.groups[0].views[0].sections.truncate(1);
        for source in [Source::Section("a-section".into()), Source::View("left-view".into()), Source::Group("left".into())] {
            for index in [0, 1] {
                assert!(commands(&doc, &source, &Target::Zone { edge: Edge::Left, index }, "same").unwrap().is_empty());
            }
            assert!(!commands(&doc, &source, &Target::Zone { edge: Edge::Right, index: 0 }, "other").unwrap().is_empty());
        }
        let stacked = fixture();
        assert!(!commands(&stacked, &Source::Section("a-section".into()), &Target::Zone { edge: Edge::Left, index: 0 }, "detach").unwrap().is_empty(), "lifting one panel out of a stack still detaches it");
    }

    #[test]
    fn grouping_from_stacks_preserves_siblings_state_and_undo() {
        let original = fixture();
        let commands = commands(&original, &Source::Section("a-section".into()), &Target::TabGroup { section: "b-section".into() }, "test").unwrap();
        let mut engine = Engine::new(original.clone()).unwrap();
        engine.apply(Transaction { expected_revision: 0, commands }).unwrap();
        let doc = engine.document();
        assert_eq!(doc.panels, original.panels, "props and storage identities must survive");
        assert_eq!(doc.view("left-view").unwrap().sections[0].panel_id, "c");
        assert_eq!(doc.view("right-view").unwrap().sections[0].panel_id, "d");
        let group = doc.group("right").unwrap();
        assert_eq!(group.views.len(), 3);
        assert_eq!(doc.view(&group.active_view_id).unwrap().sections[0].panel_id, "a");
        assert_eq!(doc.view("test-target-view").unwrap().title, "B");
        assert_eq!(doc.view("test-source-view").unwrap().title, "A");
        let restored: Workspace = serde_json::from_str(&serde_json::to_string(doc).unwrap()).unwrap();
        restored.validate().unwrap();
        assert_eq!(restored, *doc);
        engine.undo(1).unwrap();
        assert_eq!(engine.document(), &original);
    }

    #[test]
    fn two_panels_in_one_stack_become_separate_tabs() {
        let original = fixture();
        let mut engine = Engine::new(original.clone()).unwrap();
        engine.apply(Transaction { expected_revision: 0, commands: tab_group_commands(&original, "a-section", "c-section", "same").unwrap() }).unwrap();
        let group = engine.document().group("left").unwrap();
        assert_eq!(group.views.len(), 2);
        assert!(group.views.iter().all(|v| v.sections.len() == 1));
        assert_eq!(engine.document().group("right"), original.group("right"));
        assert!(tab_group_commands(engine.document(), "a-section", "c-section", "again").unwrap().is_empty());
    }

    #[test]
    fn stacking_a_tab_preserves_all_sections_order_state_and_undo() {
        let original = fixture();
        let mut engine = Engine::new(original.clone()).unwrap();
        let moves = commands(&original, &Source::View("left-view".into()), &Target::Sections { view: "right-view".into(), index: 1 }, "stack").unwrap();
        engine.apply(Transaction { expected_revision: 0, commands: moves }).unwrap();
        let doc = engine.document();
        let ids: Vec<_> = doc.view("right-view").unwrap().sections.iter().map(|s| s.panel_id.as_str()).collect();
        assert_eq!(ids, ["b", "a", "c", "d"]);
        assert!(doc.group("left").is_none());
        assert_eq!(doc.panels, original.panels);
        engine.undo(1).unwrap();
        assert_eq!(engine.document(), &original);
        assert!(commands(&original, &Source::View("left-view".into()), &Target::Sections { view: "left-view".into(), index: 1 }, "self").unwrap().is_empty());
    }

    #[test]
    fn detaching_a_tab_creates_a_separate_pane_and_persists() {
        let original = fixture();
        let mut engine = Engine::new(original.clone()).unwrap();
        let moves = commands(&original, &Source::View("left-view".into()), &Target::Zone { edge: Edge::Right, index: 1 }, "detach").unwrap();
        engine.apply(Transaction { expected_revision: 0, commands: moves }).unwrap();
        let doc = engine.document();
        assert_eq!(doc.group("detach-group").unwrap().views[0].id, "left-view");
        assert_eq!(doc.panels, original.panels);
        let restored: Workspace = serde_json::from_str(&serde_json::to_string(doc).unwrap()).unwrap();
        restored.validate().unwrap();
        assert_eq!(restored, *doc);
    }

    #[test]
    fn a_stacked_panel_dropped_on_tabs_becomes_its_own_tab() {
        for group in ["left", "right"] {
            let original = fixture();
            let mut engine = Engine::new(original.clone()).unwrap();
            let moves = commands(&original, &Source::Section("a-section".into()),
                &Target::Views { group: group.into(), index: 0 }, "tab").unwrap();
            engine.apply(Transaction { expected_revision: 0, commands: moves }).unwrap();
            let doc = engine.document();
            assert_eq!(doc.group(group).unwrap().views[0].id, "tab-view");
            assert_eq!(doc.group(group).unwrap().active_view_id, "tab-view");
            assert_eq!(doc.view("tab-view").unwrap().sections[0].panel_id, "a");
            assert_eq!(doc.view("left-view").unwrap().sections[0].panel_id, "c");
            assert_eq!(doc.panels, original.panels);
            engine.undo(1).unwrap();
            assert_eq!(engine.document(), &original);
        }
    }

    #[test]
    fn invalid_and_self_targets_cannot_lose_panels() {
        let doc = fixture();
        assert!(tab_group_commands(&doc, "a-section", "a-section", "self").unwrap().is_empty());
        assert!(tab_group_commands(&doc, "missing", "b-section", "missing").is_err());
        assert!(commands(&doc, &Source::Group("left".into()), &Target::TabGroup { section: "b-section".into() }, "group").is_err());
    }
}
