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
}

pub fn commands(
    doc: &Workspace,
    source: &Source,
    target: &Target,
    seed: &str,
) -> Result<Vec<Command>> {
    let mut result = vec![];
    match target {
        Target::Zone { edge, index } => {
            let zone = doc.zones.iter().find(|z| z.edge == *edge);
            if zone.is_none() && !edge.is_center() {
                return Err("missing zone".into());
            }
            let groups = zone.map(|z| z.groups.as_slice()).unwrap_or(&[]);
            if *index > groups.len() {
                return Err("invalid group insertion".into());
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
            let Source::Section(id) = source else {
                return Err("drop a section here".into());
            };
            let index = index - usize::from(dest.sections.iter().take(*index).any(|s| &s.id == id));
            result.push(Command::MoveSection {
                section_id: id.clone(),
                view_id: view.clone(),
                index,
            });
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
                Source::Section(_) => {
                    return Err("drop sections into a view or on a window edge".into());
                }
            }
        }
    }
    Ok(result)
}
