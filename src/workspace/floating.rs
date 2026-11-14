//! Placement planning shared by buttons, the palette and keyboard commands.
use panel_workspace::{Command, Edge, Extra, Floating, Result, Workspace};
use serde_json::json;

pub fn group_for_panel<'a>(doc: &'a Workspace, panel: &str) -> Option<&'a str> {
    doc.groups
        .iter()
        .find(|g| {
            g.views
                .iter()
                .any(|v| v.sections.iter().any(|s| s.panel_id == panel))
        })
        .map(|g| g.id.as_str())
}

pub fn float(
    doc: &Workspace,
    panel: Option<&str>,
    group: &str,
    seed: &str,
    bounds: [f64; 4],
) -> Result<Vec<Command>> {
    let source = doc.group(group).ok_or("missing group")?;
    if doc.floating.iter().any(|f| f.group_id == group) {
        return Err("group is already floating".into());
    }
    let (zone, index) = doc
        .zones
        .iter()
        .find_map(|z| {
            z.groups
                .iter()
                .position(|r| r.group_id == group)
                .map(|i| (z, i))
        })
        .ok_or("group is not docked")?;
    let mut extra = Extra::new();
    extra.insert(
        "dock".into(),
        json!({"edge":zone.edge,"index":index,"weight":zone.groups[index].weight}),
    );
    let mut commands = vec![];
    let mut target = group.to_owned();
    if let Some(panel) = panel {
        let (view, index) = source
            .views
            .iter()
            .find_map(|v| {
                v.sections
                    .iter()
                    .position(|s| s.panel_id == panel)
                    .map(|i| (v, i))
            })
            .ok_or("panel is not in group")?;
        if source.views.len() > 1 || view.sections.len() > 1 {
            target = format!("{seed}-group");
            let view_id = format!("{seed}-view");
            extra.insert(
                "return_section".into(),
                json!({"view":view.id,"index":index,"section":view.sections[index].id}),
            );
            commands.extend([
                Command::NewGroup {
                    id: target.clone(),
                    edge: zone.edge,
                    index: zone.groups.len(),
                },
                Command::NewView {
                    id: view_id.clone(),
                    title: super::panel_title(&doc.panels[panel]),
                    group_id: target.clone(),
                    index: 0,
                },
                Command::MoveSection {
                    section_id: view.sections[index].id.clone(),
                    view_id,
                    index: 0,
                },
            ]);
        }
    }
    commands.push(Command::Maximize { group_id: None });
    commands.push(Command::FloatGroup {
        window: Floating {
            group_id: target,
            x: bounds[0],
            y: bounds[1],
            width: bounds[2],
            height: bounds[3],
            extra,
        },
    });
    Ok(commands)
}

pub fn dock(doc: &Workspace, group: &str, edge: Option<Edge>) -> Result<Vec<Command>> {
    let floating = doc
        .floating
        .iter()
        .find(|f| f.group_id == group)
        .ok_or("group is not floating")?;
    if edge.is_none() {
        if let Some(saved) = floating.extra.get("return_section") {
            if let (Some(view), Some(section)) = (saved["view"].as_str(), saved["section"].as_str())
            {
                if let Some(destination) = doc.view(view) {
                    return Ok(vec![Command::MoveSection {
                        section_id: section.into(),
                        view_id: view.into(),
                        index: (saved["index"].as_u64().unwrap_or(0) as usize)
                            .min(destination.sections.len()),
                    }]);
                }
            }
        }
    }
    let saved = floating.extra.get("dock");
    let edge = edge
        .or_else(|| saved.and_then(|s| serde_json::from_value(s["edge"].clone()).ok()))
        .unwrap_or(Edge::Right);
    let count = doc
        .zones
        .iter()
        .find(|z| z.edge == edge)
        .map_or(0, |z| z.groups.len());
    let index = saved
        .and_then(|s| s["index"].as_u64())
        .unwrap_or(count as u64) as usize;
    let weight = saved.and_then(|s| s["weight"].as_f64()).unwrap_or(1.0);
    Ok(vec![
        Command::MoveGroup {
            group_id: group.into(),
            edge,
            index: index.min(count),
        },
        Command::ResizeGroup {
            group_id: group.into(),
            weight,
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use panel_workspace::{Engine, Store, Transaction};
    fn engine() -> Engine {
        Engine::new(
            Store::import(include_str!(
                "../../handlr/prototype/workspaces/panel-workspace-native.json"
            ))
            .unwrap(),
        )
        .unwrap()
    }
    fn apply(engine: &mut Engine, commands: Vec<Command>) {
        engine
            .apply(Transaction {
                expected_revision: engine.revision(),
                commands,
            })
            .unwrap();
    }
    #[test]
    fn detached_section_keeps_identity_and_returns_to_its_original_view() {
        let mut engine = engine();
        let original = engine.document().clone();
        let commands = float(
            engine.document(),
            Some("prototype-files-body"),
            "prototype-code-group",
            "float-files",
            [20., 30., 500., 400.],
        )
        .unwrap();
        apply(&mut engine, commands);
        let serialized = Store::export(engine.document()).unwrap();
        let mut restarted = Engine::new(Store::import(&serialized).unwrap()).unwrap();
        assert_eq!(restarted.document().panels, original.panels);
        assert_eq!(
            restarted.document().floating[0].group_id,
            "float-files-group"
        );
        let commands = dock(restarted.document(), "float-files-group", None).unwrap();
        apply(&mut restarted, commands);
        assert_eq!(restarted.document(), &original);
        engine.undo(engine.revision()).unwrap();
        assert_eq!(engine.document(), &original);
        engine.redo(engine.revision()).unwrap();
        assert_eq!(engine.document().floating.len(), 1);
    }
    #[test]
    fn floating_group_redocks_with_order_and_weight() {
        let mut engine = engine();
        let original = engine.document().clone();
        let commands = float(
            engine.document(),
            None,
            "prototype-code-group",
            "float-code",
            [20., 30., 500., 400.],
        )
        .unwrap();
        apply(&mut engine, commands);
        let commands = dock(engine.document(), "prototype-code-group", None).unwrap();
        apply(&mut engine, commands);
        assert_eq!(engine.document(), &original);
    }
    #[test]
    fn explicit_dock_edge_and_deleted_source_view_have_safe_destinations() {
        let mut engine = engine();
        let commands = float(
            engine.document(),
            Some("prototype-files-body"),
            "prototype-code-group",
            "float-files",
            [20., 30., 500., 400.],
        )
        .unwrap();
        apply(&mut engine, commands);
        let commands = dock(
            engine.document(),
            "float-files-group",
            Some(Edge::BottomCenter),
        )
        .unwrap();
        apply(&mut engine, commands);
        assert!(engine.document().floating.is_empty());
        assert!(
            engine
                .document()
                .zones
                .iter()
                .find(|z| z.edge == Edge::BottomCenter)
                .unwrap()
                .groups
                .iter()
                .any(|r| r.group_id == "float-files-group")
        );
    }
}
