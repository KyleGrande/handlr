//! Window-local workspace adapter. The composition engine stays independent
//! of Core and GPUI. Prepare and persist a candidate before publishing it.
use crate::layout::{Content, Node};
use panel_workspace::{Command, Edge, Engine, Result, Store, Transaction, Workspace};
use serde_json::{Value, json};
use std::path::PathBuf;
#[path = "workspace/drag.rs"]
pub mod drag;
#[path = "workspace/floating.rs"]
pub mod floating;

pub const PREFIX: &str = "@workspace/";
pub const HEADER: &str = "@workspace/header/";
pub const SECTION_HEADER_HEIGHT: f64 = 42.;
pub const PANEL_GAP: f32 = 8.;

pub fn embedded_header(panel: &panel_workspace::Panel) -> bool {
    matches!(&panel.content,panel_workspace::Content::Mod {name,..} if matches!(name.as_str(),"files"|"changes"))
}

pub fn embedded_header_with(
    panel: &panel_workspace::Panel,
    mods: &std::collections::BTreeSet<String>,
) -> bool {
    embedded_header(panel)
        || matches!(&panel.content,panel_workspace::Content::Mod {name,..} if mods.contains(name))
}

pub fn panel_title(panel: &panel_workspace::Panel) -> String {
    if let Some(title) = panel
        .extra
        .get("title")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        return title.into();
    }
    let title = match &panel.content {
        panel_workspace::Content::Mod { name, .. } => name,
        panel_workspace::Content::Terminal { address, .. } => return address.clone(),
    };
    let mut chars = title.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().to_string() + chars.as_str())
        .unwrap_or_default()
}

/// Open one logical mod panel, reusing its identity, props and storage when it
/// was previously closed. Placement changes remain one undoable transaction.
pub fn open_mod(document: &Workspace, name: &str, title: &str, edge: Edge, seed: &str) -> Vec<Command> {
    let existing = document.panels.values().find(|p| matches!(&p.content, panel_workspace::Content::Mod {name:n,..} if n==name));
    if let Some(panel) = existing {
        if document.groups.iter().flat_map(|g| &g.views).flat_map(|v| &v.sections).any(|s| s.panel_id==panel.id) {
            return vec![Command::RevealPanel {panel_id:panel.id.clone()}];
        }
        if document.closed_panels.contains_key(&panel.id) {
            return vec![Command::RestorePanel {panel_id:panel.id.clone()}];
        }
    }
    let mut commands = vec![];
    let id = existing.map(|p|p.id.clone()).unwrap_or_else(||format!("{seed}-panel"));
    if existing.is_none() {
        let mut extra=panel_workspace::Extra::new();extra.insert("title".into(),json!(title));
        commands.push(Command::RegisterPanel {panel:panel_workspace::Panel {
            id:id.clone(),content:panel_workspace::Content::Mod {name:name.into(),props:Value::Null,duplicable:false},
            binding:panel_workspace::Binding::FollowActive,storage_namespace:None,extra,
        }});
    }
    let group_id=format!("{seed}-group");let view_id=format!("{seed}-view");
    commands.extend([
        Command::NewGroup {id:group_id.clone(),edge,index:document.zones.iter().find(|z|z.edge==edge).map_or(0,|z|z.groups.len())},
        Command::NewView {id:view_id.clone(),title:existing.map(panel_title).unwrap_or_else(||title.into()),group_id,index:0},
        Command::ShowPanel {panel_id:id.clone(),section_id:format!("{seed}-section"),view_id,index:0},
        Command::RevealPanel {panel_id:id},
    ]);
    commands
}

pub struct Session {
    pub engine: Engine,
    store: Store,
    pub warning: Option<String>,
}

impl Session {
    pub fn load(path: PathBuf) -> Result<Self> {
        let store = Store::new(path);
        let loaded = store.load()?;
        Ok(Self {
            engine: Engine::new(loaded.document)?,
            store,
            warning: loaded.warning,
        })
    }
    pub fn change(&mut self, transaction: Transaction) -> Result<bool> {
        let mut candidate = self.engine.clone();
        let changed = candidate.apply(transaction)?;
        if changed {
            self.store.save(candidate.document())?;
            self.engine = candidate;
        }
        Ok(changed)
    }
    pub fn undo(&mut self, revision: u64) -> Result<()> {
        let mut candidate = self.engine.clone();
        candidate.undo(revision)?;
        self.store.save(candidate.document())?;
        self.engine = candidate;
        Ok(())
    }
    pub fn redo(&mut self, revision: u64) -> Result<()> {
        let mut candidate = self.engine.clone();
        candidate.redo(revision)?;
        self.store.save(candidate.document())?;
        self.engine = candidate;
        Ok(())
    }
    pub fn import(&mut self, document: Workspace, revision: u64) -> Result<bool> {
        let mut candidate = self.engine.clone();
        let changed = candidate.import(document, revision)?;
        if changed {
            self.store.save(candidate.document())?;
            self.engine = candidate;
        }
        Ok(changed)
    }
    pub fn inspect(&self) -> Value {
        json!({"revision": self.engine.revision(), "document": self.engine.document(),
            "can_undo": self.engine.can_undo(), "can_redo": self.engine.can_redo(), "warning": self.warning})
    }
    pub fn commands(&mut self, commands: Vec<Command>) -> Result<bool> {
        self.change(Transaction {
            expected_revision: self.engine.revision(),
            commands,
        })
    }
}

fn node(value: Value) -> Result<Node> {
    serde_json::from_value(value).map_err(|e| e.to_string())
}

pub fn group_node_with_headers(
    document: &Workspace,
    group_id: &str,
    headers: &std::collections::BTreeSet<String>,
) -> Result<Node> {
    let group = document.group(group_id).ok_or("missing group")?;
    let mut views = vec![];
    for view in &group.views {
        let mut sections = vec![];
        for section in &view.sections {
            let panel = document
                .panels
                .get(&section.panel_id)
                .ok_or("missing panel")?;
            let content = match &panel.content {
                panel_workspace::Content::Mod { name, props, .. } => {
                    json!({"mod":name, "props":props})
                }
                panel_workspace::Content::Terminal {
                    machine_id,
                    address,
                } => {
                    let address = if machine_id.is_empty() {
                        address.clone()
                    } else {
                        format!("{machine_id}/{address}")
                    };
                    json!({"terminal":address})
                }
            };
            let embedded = embedded_header_with(panel, headers) && !section.collapsed;
            sections.push(json!({"id":section.id, "type":"column", "resizable":false,"background":"background",
                "radius":10,"border":if embedded {Value::Null} else {json!({"width":1,"color":"border"})},
                "size": if section.collapsed { json!({"px":SECTION_HEADER_HEIGHT}) } else { json!({"weight":section.weight}) },
                "min":if section.collapsed {SECTION_HEADER_HEIGHT} else {SECTION_HEADER_HEIGHT+section.min_extent},
                "children":[
                    {"id":format!("{HEADER}{}",section.id),"type":"block","hidden":embedded,"size":{"px":SECTION_HEADER_HEIGHT},"content":{"mod":"@workspace/header"}},
                    {"id":panel.id,"type":"block","hidden":section.collapsed,"content":content}
                ]}));
        }
        views.push(json!({"id":view.id,"type":"column","title":view.title,"gap":PANEL_GAP,"children":sections}));
    }
    node(
        json!({"id":group.id,"type":"stack","active":group.active_view_id,
        "min":SECTION_HEADER_HEIGHT+72.,
        "header":if group.views.len()>1 {json!({"content":"tabs","height":30,"position":"top"})} else {Value::Null},"children":views}),
    )
}

/// The center is supplied unchanged by the existing tab/space layout. Outer
/// geometry and selection never go into the machine's Core document.
#[cfg(test)]
pub fn project(document: &Workspace, center: &Node) -> Result<Node> {
    project_with_headers(document, center, &Default::default())
}

pub fn project_with_headers(
    document: &Workspace,
    center: &Node,
    headers: &std::collections::BTreeSet<String>,
) -> Result<Node> {
    document.validate()?;
    let mut identifiers = std::collections::BTreeSet::new();
    for node in center.walk() {
        identifiers.insert(node.id.as_str());
    }
    for panel in document.panels.values() {
        if identifiers.contains(panel.id.as_str()) || panel.id.starts_with(PREFIX) {
            return Err(format!(
                "panel identity collides with host layout: {}",
                panel.id
            ));
        }
    }
    for group in &document.groups {
        for id in std::iter::once(group.id.as_str()).chain(group.views.iter().flat_map(|v| {
            std::iter::once(v.id.as_str()).chain(
                v.sections
                    .iter()
                    .flat_map(|s| [s.id.as_str(), s.panel_id.as_str()]),
            )
        })) {
            if identifiers.contains(id) || id.starts_with(PREFIX) {
                return Err(format!(
                    "workspace identity collides with host layout: {id}"
                ));
            }
        }
    }
    if let Some(id) = &document.maximized_group_id {
        return node(json!({"id":format!("{PREFIX}root"),"type":"column","background":"canvas","padding":PANEL_GAP,
            "children":[group_node_with_headers(document,id,headers)?]}));
    }
    let mut zones = std::collections::BTreeMap::new();
    for zone in &document.zones {
        let mut children = vec![];
        for reference in &zone.groups {
            let mut child = serde_json::to_value(group_node_with_headers(
                document,
                &reference.group_id,
                headers,
            )?)
            .map_err(|e| e.to_string())?;
            child["size"] = json!({"weight":reference.weight});
            children.push(child);
        }
        let name = zone.edge.name();
        zones.insert(
            zone.edge,
            json!({"id":format!("{PREFIX}zone/{name}"),
            "type":if matches!(zone.edge,Edge::Left|Edge::Right){"column"}else{"row"},
            "hidden":zone.hidden||children.is_empty(), "size":{"px":zone.extent},"min":56,
            "gap":PANEL_GAP,"children":children}),
        );
    }
    for edge in [Edge::TopCenter, Edge::BottomCenter] {
        zones.entry(edge).or_insert_with(||json!({"id":format!("{PREFIX}zone/{}",edge.name()),"type":"row","hidden":true,"size":{"px":200},"children":[]}));
    }
    node(
        json!({"id":format!("{PREFIX}root"),"type":"column","background":"canvas","padding":PANEL_GAP,"gap":PANEL_GAP,
        "children":[zones[&Edge::Top],
            {"id":format!("{PREFIX}middle"),"type":"row","gap":PANEL_GAP,
                "children":[zones[&Edge::Left],
                    {"id":format!("{PREFIX}center-stack"),"type":"column","gap":PANEL_GAP,
                        "children":[zones[&Edge::TopCenter],center,zones[&Edge::BottomCenter]]},
                    zones[&Edge::Right]]},
            zones[&Edge::Bottom]]}),
    )
}

pub fn default_center() -> Node {
    // Reuse the shipped app's terminal presentation so the workspace does not
    // drift into a separate terminal theme. Only placement IDs are different.
    let main: serde_json::Value = serde_json::from_str(include_str!("../defaults/layouts/main.json"))
        .expect("shipped main layout is valid JSON");
    let work = &main["children"][1];
    let mut tabs = work["children"][0].clone();
    tabs["id"] = json!(format!("{PREFIX}tabs"));
    let mut body = work["children"][1].clone();
    let mut terminal = body["children"][0].clone();
    terminal["id"] = json!(format!("{PREFIX}active-tab"));
    body["id"] = json!(format!("{PREFIX}terminal-body"));
    body["children"] = json!([terminal]);
    node(json!({"id":format!("{PREFIX}center"),"type":"column","resizable":false,
        "background":main["background"],"terminal_padding":main["terminal_padding"],
        "children":[tabs,body]})).expect("built-in workspace center is a valid layout")
}

pub fn internal_header(node: &Node) -> bool {
    node.id.starts_with(HEADER)
        && matches!(node.content(), Some(Content::Mod { name, .. }) if name == "@workspace/header")
}


/// Presentation only: retain stored collapse state, identities and tab selection.
/// Re-projecting without this transform restores every original header.
pub fn hide_panel_headers(document: &Workspace, layout: &mut Node) {
    for group in &document.groups {
        if let Some(node) = layout.find_mut(&group.id) {
            node.min = Some(72.);
        }
        for section in group.views.iter().flat_map(|view| &view.sections) {
            if let Some(node) = layout.find_mut(&section.id) {
                node.size = Some(crate::layout::Size::Weight { weight: section.weight as f32 });
                node.min = Some(section.min_extent.max(16.) as f32);
                // Embedded mods normally own their border; their title row is
                // clipped in this mode, so the section supplies a complete frame.
                node.border = Some(crate::layout::Line { width: 1., color: "border".into() });
            }
            if let Some(header) = layout.find_mut(&format!("{HEADER}{}", section.id)) {
                header.hidden = true;
            }
            if let Some(panel) = layout.find_mut(&section.panel_id) {
                panel.hidden = false;
            }
        }
    }
}

#[cfg(test)]
mod header_mode_tests {
    use super::*;

    #[test]
    fn no_headers_reclaims_height_without_changing_saved_state_or_group_tabs() {
        let mut document = Store::import(include_str!("../handlr/prototype/workspaces/panel-workspace-native.json")).unwrap();
        document.groups[0].views[0].sections[0].collapsed = true;
        let saved = serde_json::to_value(&document).unwrap();
        let normal = project(&document, &default_center()).unwrap();
        let mut compact = normal.clone();
        hide_panel_headers(&document, &mut compact);
        for group in &document.groups {
            let before = normal.find(&group.id).unwrap();
            let after = compact.find(&group.id).unwrap();
            match (&before.kind, &after.kind) {
                (crate::layout::Kind::Stack { header: a, active: x, .. }, crate::layout::Kind::Stack { header: b, active: y, .. }) => {
                    assert_eq!(a, b);
                    assert_eq!(x, y);
                }
                _ => panic!("group must remain a navigable stack"),
            }
            for section in group.views.iter().flat_map(|v| &v.sections) {
                assert!(compact.find(&format!("{HEADER}{}", section.id)).unwrap().hidden);
                assert!(!compact.find(&section.panel_id).unwrap().hidden);
                let before = normal.find(&section.id).unwrap();
                let after = compact.find(&section.id).unwrap();
                if !section.collapsed {
                    assert!(after.min.unwrap() < before.min.unwrap());
                }
                assert!(matches!(after.size, Some(crate::layout::Size::Weight { .. })));
            }
            let mut floating = group_node_with_headers(&document, &group.id, &Default::default()).unwrap();
            hide_panel_headers(&document, &mut floating);
            for section in group.views.iter().flat_map(|v| &v.sections) {
                assert!(floating.find(&format!("{HEADER}{}", section.id)).unwrap().hidden);
            }
        }
        assert_eq!(serde_json::to_value(&document).unwrap(), saved);
        assert_eq!(project(&document, &default_center()).unwrap(), normal);
        assert_eq!(normal.find("@workspace/center"), compact.find("@workspace/center"));
    }
}
