//! Window-local composition. This crate has no process, Core, or UI dependency:
//! moving, hiding and selecting content cannot launch or terminate a terminal.
mod operations;
mod persistence;

pub use operations::{Command, Engine, Transaction};
pub use persistence::{LoadResult, Store};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub type Result<T> = std::result::Result<T, String>;
pub type Extra = BTreeMap<String, Value>;
pub const VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Edge {
    Left,
    Right,
    Top,
    Bottom,
    TopCenter,
    BottomCenter,
}

impl Edge {
    pub fn is_center(self) -> bool {
        matches!(self, Self::TopCenter | Self::BottomCenter)
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Top => "top",
            Self::Bottom => "bottom",
            Self::TopCenter => "top_center",
            Self::BottomCenter => "bottom_center",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Content {
    Mod {
        name: String,
        #[serde(default)]
        props: Value,
        #[serde(default)]
        duplicable: bool,
    },
    Terminal {
        machine_id: String,
        address: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Binding {
    FollowActive,
    Pinned {
        machine_id: String,
        checkout_id: String,
    },
}

impl Default for Binding {
    fn default() -> Self {
        Self::FollowActive
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Panel {
    pub id: String,
    pub content: Content,
    #[serde(default)]
    pub binding: Binding,
    /// None retains the legacy mod/props namespace. New copies must get their
    /// own namespace; placement and context binding never enter mod props.
    #[serde(default)]
    pub storage_namespace: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Section {
    pub id: String,
    pub panel_id: String,
    #[serde(default)]
    pub collapsed: bool,
    pub weight: f64,
    #[serde(default = "default_min")]
    pub min_extent: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}
fn default_min() -> f64 {
    72.0
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct View {
    pub id: String,
    pub title: String,
    pub sections: Vec<Section>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub active_view_id: String,
    pub views: Vec<View>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GroupRef {
    pub group_id: String,
    pub weight: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Zone {
    pub edge: Edge,
    pub extent: f64,
    pub hidden: bool,
    pub groups: Vec<GroupRef>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Floating {
    pub group_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, flatten)]
    pub extra: Extra,
}

/// Last placement of a closed panel. Empty container snapshots retain their
/// identity and styling without retaining any other panel's contents.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClosedPlacement {
    pub location: ClosedLocation,
    pub group: Group,
    pub view: View,
    pub view_index: usize,
    pub section: Section,
    pub section_index: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClosedLocation {
    Dock { edge: Edge, index: usize, weight: f64 },
    Float { window: Floating },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub version: u32,
    pub panels: BTreeMap<String, Panel>,
    pub groups: Vec<Group>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub closed_panels: BTreeMap<String, ClosedPlacement>,
    pub zones: Vec<Zone>,
    #[serde(default)]
    pub floating: Vec<Floating>,
    #[serde(default)]
    pub focused_panel_id: Option<String>,
    // Maximize is ephemeral: exporting/restarting restores normal composition.
    #[serde(skip)]
    pub maximized_group_id: Option<String>,
    #[serde(default, flatten)]
    pub extra: Extra,
}

impl Default for Workspace {
    fn default() -> Self {
        Self {
            version: VERSION,
            panels: BTreeMap::new(),
            groups: vec![],
            closed_panels: BTreeMap::new(),
            zones: [
                Edge::Left,
                Edge::Right,
                Edge::Top,
                Edge::Bottom,
                Edge::TopCenter,
                Edge::BottomCenter,
            ]
            .into_iter()
            .map(|edge| Zone {
                edge,
                extent: if matches!(edge, Edge::Left | Edge::Right) {
                    320.0
                } else {
                    200.0
                },
                hidden: true,
                groups: vec![],
                extra: Extra::new(),
            })
            .collect(),
            floating: vec![],
            focused_panel_id: None,
            maximized_group_id: None,
            extra: Extra::new(),
        }
    }
}

fn positive(value: f64) -> bool {
    value.is_finite() && value > 0.0
}
fn unique(ids: &mut BTreeSet<String>, id: &str) -> Result<()> {
    if id.is_empty() || !ids.insert(id.to_owned()) {
        return Err(format!("empty or duplicate identity: {id:?}"));
    }
    Ok(())
}

impl Workspace {
    pub fn validate(&self) -> Result<()> {
        if self.version != VERSION {
            return Err(format!("unsupported workspace version {}", self.version));
        }
        let mut ids = BTreeSet::new();
        let mut namespaces = BTreeSet::new();
        let mut addresses = BTreeSet::new();
        for (key, panel) in &self.panels {
            unique(&mut ids, &panel.id)?;
            if *key != panel.id {
                return Err(format!("panel key mismatch: {key}"));
            }
            if let Some(namespace) = &panel.storage_namespace {
                // A single path component under the host-controlled instance directory.
                if namespace.is_empty()
                    || !namespace
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
                    || !namespaces.insert(namespace)
                {
                    return Err("invalid or reused storage namespace".into());
                }
            }
            match &panel.content {
                Content::Mod { name, .. } if name.is_empty() => return Err("empty mod name".into()),
                Content::Terminal {
                    machine_id,
                    address,
                } => {
                    if address.is_empty() || !addresses.insert((machine_id, address)) {
                        return Err("empty or repeated terminal address".into());
                    }
                }
                _ => {}
            }
            if let Binding::Pinned { checkout_id, .. } = &panel.binding {
                if checkout_id.is_empty() {
                    return Err("empty pinned checkout".into());
                }
            }
        }
        let mut placed_panels = BTreeSet::new();
        let mut group_ids = BTreeSet::new();
        for group in &self.groups {
            unique(&mut ids, &group.id)?;
            group_ids.insert(group.id.as_str());
            if group.views.is_empty() || !group.views.iter().any(|v| v.id == group.active_view_id) {
                return Err(format!("invalid active view in {}", group.id));
            }
            for view in &group.views {
                unique(&mut ids, &view.id)?;
                if view.sections.is_empty() {
                    return Err(format!("empty view {}", view.id));
                }
                for section in &view.sections {
                    unique(&mut ids, &section.id)?;
                    if !self.panels.contains_key(&section.panel_id)
                        || !placed_panels.insert(section.panel_id.as_str())
                    {
                        return Err(format!(
                            "missing or multiply placed panel {}",
                            section.panel_id
                        ));
                    }
                    if !positive(section.weight)
                        || !section.min_extent.is_finite()
                        || section.min_extent < 0.0
                    {
                        return Err("invalid section dimensions".into());
                    }
                }
            }
        }
        for (id, saved) in &self.closed_panels {
            if !self.panels.contains_key(id) || placed_panels.contains(id.as_str())
                || saved.section.panel_id != *id || saved.group.id.is_empty()
                || saved.view.id.is_empty() || saved.section.id.is_empty()
                || !saved.group.views.is_empty() || !saved.view.sections.is_empty()
                || !positive(saved.section.weight) || !saved.section.min_extent.is_finite() || saved.section.min_extent < 0.0
            { return Err("invalid closed panel placement".into()); }
            match &saved.location {
                ClosedLocation::Dock {weight,..} if !positive(*weight) => return Err("invalid closed group weight".into()),
                ClosedLocation::Float {window} if window.group_id != saved.group.id || !window.x.is_finite() || !window.y.is_finite() || !positive(window.width) || !positive(window.height) => return Err("invalid closed floating placement".into()),
                _ => {}
            }
        }
        let mut edges = BTreeSet::new();
        let mut placed_groups = BTreeSet::new();
        for zone in &self.zones {
            if !edges.insert(zone.edge) || !positive(zone.extent) {
                return Err("invalid or repeated zone".into());
            }
            for reference in &zone.groups {
                if !positive(reference.weight)
                    || !group_ids.contains(reference.group_id.as_str())
                    || !placed_groups.insert(reference.group_id.as_str())
                {
                    return Err("invalid group placement".into());
                }
            }
        }
        if [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom]
            .iter()
            .any(|edge| !edges.contains(edge))
        {
            return Err("four outer zones are required".into());
        }
        for window in &self.floating {
            if !group_ids.contains(window.group_id.as_str())
                || !placed_groups.insert(window.group_id.as_str())
                || !window.x.is_finite()
                || !window.y.is_finite()
                || !positive(window.width)
                || !positive(window.height)
            {
                return Err("invalid floating placement".into());
            }
        }
        if placed_groups.len() != group_ids.len() {
            return Err("unplaced group".into());
        }
        if let Some(id) = &self.focused_panel_id {
            if !self.visible_panel(id) {
                return Err("focus must reference a visible panel".into());
            }
        }
        if self
            .maximized_group_id
            .as_ref()
            .is_some_and(|id| !group_ids.contains(id.as_str()))
        {
            return Err("missing maximized group".into());
        }
        Ok(())
    }

    pub fn group(&self, id: &str) -> Option<&Group> {
        self.groups.iter().find(|g| g.id == id)
    }
    pub fn view(&self, id: &str) -> Option<&View> {
        self.groups
            .iter()
            .flat_map(|g| &g.views)
            .find(|v| v.id == id)
    }
    pub fn view_mut(&mut self, id: &str) -> Result<&mut View> {
        self.groups
            .iter_mut()
            .flat_map(|g| &mut g.views)
            .find(|v| v.id == id)
            .ok_or_else(|| format!("no view {id}"))
    }
    pub fn group_mut(&mut self, id: &str) -> Result<&mut Group> {
        self.groups
            .iter_mut()
            .find(|g| g.id == id)
            .ok_or_else(|| format!("no group {id}"))
    }
    pub fn section_mut(&mut self, id: &str) -> Result<&mut Section> {
        self.groups
            .iter_mut()
            .flat_map(|g| &mut g.views)
            .flat_map(|v| &mut v.sections)
            .find(|s| s.id == id)
            .ok_or_else(|| format!("no section {id}"))
    }
    pub fn visible_panel(&self, panel: &str) -> bool {
        self.groups.iter().any(|g| {
            let displayed = self
                .maximized_group_id
                .as_ref()
                .is_none_or(|id| id == &g.id)
                && (self.floating.iter().any(|f| f.group_id == g.id)
                    || self
                        .zones
                        .iter()
                        .any(|z| !z.hidden && z.groups.iter().any(|r| r.group_id == g.id)));
            displayed
                && g.views.iter().any(|v| {
                    v.id == g.active_view_id
                        && v.sections
                            .iter()
                            .any(|s| s.panel_id == panel && !s.collapsed)
                })
        })
    }
    pub(crate) fn normalize(&mut self) {
        for group in &mut self.groups {
            group.views.retain(|v| !v.sections.is_empty());
            if !group.views.iter().any(|v| v.id == group.active_view_id) {
                group.active_view_id = group
                    .views
                    .first()
                    .map(|v| v.id.clone())
                    .unwrap_or_default();
            }
        }
        self.groups.retain(|g| !g.views.is_empty());
        let groups: BTreeSet<_> = self.groups.iter().map(|g| g.id.as_str()).collect();
        for zone in &mut self.zones {
            zone.groups.retain(|r| groups.contains(r.group_id.as_str()));
        }
        self.floating
            .retain(|f| groups.contains(f.group_id.as_str()));
        if self
            .maximized_group_id
            .as_ref()
            .is_some_and(|id| !groups.contains(id.as_str()))
        {
            self.maximized_group_id = None;
        }
        if self
            .focused_panel_id
            .as_ref()
            .is_some_and(|id| !self.visible_panel(id))
        {
            self.focused_panel_id = self
                .groups
                .iter()
                .flat_map(|g| &g.views)
                .flat_map(|v| &v.sections)
                .find(|s| self.visible_panel(&s.panel_id))
                .map(|s| s.panel_id.clone());
        }
    }
}

/// Preferred weights survive collapse. When minimums cannot fit, return the
/// required scroll extent rather than silently clipping sections.
pub fn section_extents(
    sections: &[Section],
    available: f64,
    header: f64,
) -> Result<(Vec<f64>, f64)> {
    if !available.is_finite() || available < 0.0 || !positive(header) {
        return Err("invalid allocation bounds".into());
    }
    if sections
        .iter()
        .any(|s| !positive(s.weight) || !s.min_extent.is_finite() || s.min_extent < 0.0)
    {
        return Err("invalid section dimensions".into());
    }
    let mut sizes: Vec<_> = sections
        .iter()
        .map(|s| header + if s.collapsed { 0.0 } else { s.min_extent })
        .collect();
    let minimum: f64 = sizes.iter().sum();
    let remaining = (available - minimum).max(0.0);
    let weight: f64 = sections
        .iter()
        .filter(|s| !s.collapsed)
        .map(|s| s.weight)
        .sum();
    for (size, section) in sizes.iter_mut().zip(sections) {
        if !section.collapsed {
            *size += remaining * (section.weight / weight);
        }
    }
    let extent = sizes.iter().sum::<f64>().max(available);
    Ok((sizes, extent))
}
