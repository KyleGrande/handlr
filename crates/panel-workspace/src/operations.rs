use crate::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub expected_revision: u64,
    pub commands: Vec<Command>,
}

/// Indices refer to the destination after the source is removed. Every input
/// method submits the same transaction; a cancelled drag submits nothing.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Command {
    RegisterPanel {
        panel: Panel,
    },
    NewGroup {
        id: String,
        edge: Edge,
        index: usize,
    },
    NewView {
        id: String,
        title: String,
        group_id: String,
        index: usize,
    },
    ShowPanel {
        panel_id: String,
        section_id: String,
        view_id: String,
        index: usize,
    },
    MoveSection {
        section_id: String,
        view_id: String,
        index: usize,
    },
    MoveView {
        view_id: String,
        group_id: String,
        index: usize,
    },
    MoveGroup {
        group_id: String,
        edge: Edge,
        index: usize,
    },
    SelectView {
        view_id: String,
    },
    RevealPanel {
        panel_id: String,
    },
    Collapse {
        section_id: String,
        collapsed: bool,
    },
    RestorePanel {
        panel_id: String,
    },
    HidePanel {
        panel_id: String,
    },
    ResizeSection {
        section_id: String,
        weight: f64,
    },
    ResizeGroup {
        group_id: String,
        weight: f64,
    },
    ResizeZone {
        edge: Edge,
        extent: f64,
    },
    HideZone {
        edge: Edge,
        hidden: bool,
    },
    FloatGroup {
        window: Floating,
    },
    Bind {
        panel_id: String,
        binding: Binding,
    },
    Duplicate {
        panel_id: String,
        new_panel_id: String,
        section_id: String,
        view_id: String,
        index: usize,
    },
    Maximize {
        group_id: Option<String>,
    },
    RenamePanel {
        panel_id: String,
        name: String,
    },
    RenameView {
        view_id: String,
        name: String,
    },
}

#[derive(Clone, Debug)]
pub struct Engine {
    document: Workspace,
    revision: u64,
    undo: Vec<Workspace>,
    redo: Vec<Workspace>,
}

impl Engine {
    pub fn new(document: Workspace) -> Result<Self> {
        document.validate()?;
        Ok(Self {
            document,
            revision: 0,
            undo: vec![],
            redo: vec![],
        })
    }
    pub fn document(&self) -> &Workspace {
        &self.document
    }
    pub fn revision(&self) -> u64 {
        self.revision
    }
    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
    fn check_revision(&self, expected: u64) -> Result<()> {
        if expected != self.revision {
            return Err(format!(
                "workspace revision conflict: expected {expected}, actual {}",
                self.revision
            ));
        }
        if self.revision == u64::MAX {
            return Err("workspace revision exhausted".into());
        }
        Ok(())
    }
    pub fn apply(&mut self, transaction: Transaction) -> Result<bool> {
        self.check_revision(transaction.expected_revision)?;
        let mut draft = self.document.clone();
        for command in transaction.commands {
            draft.apply(command)?;
        }
        draft.normalize();
        draft.validate()?;
        if draft == self.document {
            return Ok(false);
        }
        self.undo.push(std::mem::replace(&mut self.document, draft));
        if self.undo.len() > 100 {
            self.undo.remove(0);
        }
        self.redo.clear();
        self.revision += 1;
        Ok(true)
    }
    pub fn undo(&mut self, expected_revision: u64) -> Result<()> {
        self.check_revision(expected_revision)?;
        let previous = self.undo.pop().ok_or("nothing to undo")?;
        self.redo
            .push(std::mem::replace(&mut self.document, previous));
        self.revision += 1;
        Ok(())
    }
    pub fn redo(&mut self, expected_revision: u64) -> Result<()> {
        self.check_revision(expected_revision)?;
        let next = self.redo.pop().ok_or("nothing to redo")?;
        self.undo.push(std::mem::replace(&mut self.document, next));
        self.revision += 1;
        Ok(())
    }
    /// Import is one undoable change. Validate before touching current state.
    pub fn import(&mut self, document: Workspace, expected_revision: u64) -> Result<bool> {
        self.check_revision(expected_revision)?;
        document.validate()?;
        if self.document == document {
            return Ok(false);
        }
        self.undo
            .push(std::mem::replace(&mut self.document, document));
        if self.undo.len() > 100 {
            self.undo.remove(0);
        }
        self.redo.clear();
        self.revision += 1;
        Ok(true)
    }
}

fn insert<T>(items: &mut Vec<T>, index: usize, item: T) -> Result<()> {
    if index > items.len() {
        return Err("destination index is out of range".into());
    }
    items.insert(index, item);
    Ok(())
}

impl Workspace {
    fn zone_mut(&mut self, edge: Edge) -> Result<&mut Zone> {
        // Existing four-zone documents stay valid; center zones are created on first use.
        if edge.is_center() && !self.zones.iter().any(|z| z.edge == edge) {
            self.zones.push(Zone {
                edge,
                extent: 200.,
                hidden: true,
                groups: vec![],
                extra: Extra::new(),
            });
        }
        self.zones
            .iter_mut()
            .find(|z| z.edge == edge)
            .ok_or_else(|| "missing zone".into())
    }
    fn take_section(&mut self, id: &str) -> Result<Section> {
        for view in self.groups.iter_mut().flat_map(|g| &mut g.views) {
            if let Some(index) = view.sections.iter().position(|s| s.id == id) {
                return Ok(view.sections.remove(index));
            }
        }
        Err(format!("no section {id}"))
    }
    fn take_view(&mut self, id: &str) -> Result<View> {
        for group in &mut self.groups {
            if let Some(index) = group.views.iter().position(|v| v.id == id) {
                return Ok(group.views.remove(index));
            }
        }
        Err(format!("no view {id}"))
    }
    fn detach_group(&mut self, id: &str) -> Result<f64> {
        if self.group(id).is_none() {
            return Err(format!("no group {id}"));
        }
        for zone in &mut self.zones {
            if let Some(index) = zone.groups.iter().position(|r| r.group_id == id) {
                return Ok(zone.groups.remove(index).weight);
            }
        }
        if let Some(index) = self.floating.iter().position(|f| f.group_id == id) {
            self.floating.remove(index);
            return Ok(1.0);
        }
        Err("unplaced group".into())
    }
    fn select_view(&mut self, view_id: &str) -> Result<()> {
        let group = self
            .groups
            .iter_mut()
            .find(|g| g.views.iter().any(|v| v.id == view_id))
            .ok_or("no view")?;
        group.active_view_id = view_id.to_owned();
        let group_id = group.id.clone();
        for zone in &mut self.zones {
            if zone.groups.iter().any(|r| r.group_id == group_id) {
                zone.hidden = false;
            }
        }
        if self
            .maximized_group_id
            .as_ref()
            .is_some_and(|id| id != &group_id)
        {
            self.maximized_group_id = None;
        }
        Ok(())
    }
    fn remember_panel(&mut self, panel_id: &str) {
        for group in &self.groups {
            for (view_index, view) in group.views.iter().enumerate() {
                if let Some(section_index) = view.sections.iter().position(|s| s.panel_id == panel_id) {
                    let location = self.zones.iter().find_map(|zone| {
                        zone.groups.iter().enumerate().find(|(_,r)| r.group_id == group.id)
                            .map(|(index,r)| ClosedLocation::Dock {edge:zone.edge,index,weight:r.weight})
                    }).or_else(|| self.floating.iter().find(|w| w.group_id == group.id)
                        .map(|window| ClosedLocation::Float {window:window.clone()}));
                    if let Some(location) = location {
                        let mut group_snapshot = group.clone(); group_snapshot.views.clear();
                        let mut view_snapshot = view.clone(); view_snapshot.sections.clear();
                        self.closed_panels.insert(panel_id.into(), ClosedPlacement {
                            location, group:group_snapshot, view:view_snapshot, view_index,
                            section:view.sections[section_index].clone(), section_index,
                        });
                    }
                    return;
                }
            }
        }
    }

    fn restore_panel(&mut self, panel_id: &str) -> Result<()> {
        let saved = self.closed_panels.remove(panel_id).ok_or("panel has no saved placement")?;
        let view_id = saved.view.id.clone();
        if self.view(&view_id).is_none() {
            if self.group(&saved.group.id).is_none() {
                let mut group = saved.group.clone(); group.active_view_id = view_id.clone();
                self.groups.push(group);
                match saved.location {
                    ClosedLocation::Dock {edge,index,weight} => {
                        let zone = self.zone_mut(edge)?;
                        zone.groups.insert(index.min(zone.groups.len()),GroupRef {group_id:saved.group.id.clone(),weight});
                    }
                    ClosedLocation::Float {window} => self.floating.push(window),
                }
            }
            let group = self.group_mut(&saved.group.id)?;
            group.views.insert(saved.view_index.min(group.views.len()),saved.view);
        }
        let view = self.view_mut(&view_id)?;
        let mut section = saved.section; section.collapsed = false;
        view.sections.insert(saved.section_index.min(view.sections.len()),section);
        self.select_view(&view_id)?;
        self.focused_panel_id = Some(panel_id.into());
        Ok(())
    }

    fn show_panel(
        &mut self,
        panel_id: String,
        section_id: String,
        view_id: String,
        index: usize,
    ) -> Result<()> {
        if !self.panels.contains_key(&panel_id) {
            return Err("missing panel".into());
        }
        if self
            .groups
            .iter()
            .flat_map(|g| &g.views)
            .flat_map(|v| &v.sections)
            .any(|s| s.panel_id == panel_id)
        {
            return Err("panel is already placed; reveal or move it".into());
        }
        self.closed_panels.remove(&panel_id);
        insert(
            &mut self.view_mut(&view_id)?.sections,
            index,
            Section {
                id: section_id,
                panel_id,
                collapsed: false,
                weight: 1.0,
                min_extent: default_min(),
                extra: Extra::new(),
            },
        )
    }
    fn apply(&mut self, command: Command) -> Result<()> {
        match command {
            Command::RegisterPanel { panel } => {
                if self.panels.contains_key(&panel.id) {
                    return Err("panel already registered".into());
                }
                self.panels.insert(panel.id.clone(), panel);
            }
            Command::NewGroup { id, edge, index } => {
                if self.group(&id).is_some() {
                    return Err("group already exists".into());
                }
                insert(
                    &mut self.zone_mut(edge)?.groups,
                    index,
                    GroupRef {
                        group_id: id.clone(),
                        weight: 1.0,
                    },
                )?;
                self.zone_mut(edge)?.hidden = false;
                self.groups.push(Group {
                    id,
                    active_view_id: String::new(),
                    views: vec![],
                    extra: Extra::new(),
                });
            }
            Command::NewView {
                id,
                title,
                group_id,
                index,
            } => {
                if self.view(&id).is_some() {
                    return Err("view already exists".into());
                }
                let group = self.group_mut(&group_id)?;
                if group.views.is_empty() {
                    group.active_view_id = id.clone();
                }
                insert(
                    &mut group.views,
                    index,
                    View {
                        id,
                        title,
                        sections: vec![],
                        extra: Extra::new(),
                    },
                )?;
            }
            Command::ShowPanel {
                panel_id,
                section_id,
                view_id,
                index,
            } => self.show_panel(panel_id, section_id, view_id, index)?,
            Command::MoveSection {
                section_id,
                view_id,
                index,
            } => {
                if self.view(&view_id).is_none() {
                    return Err("missing destination view".into());
                }
                let section = self.take_section(&section_id)?;
                insert(&mut self.view_mut(&view_id)?.sections, index, section)?;
            }
            Command::MoveView {
                view_id,
                group_id,
                index,
            } => {
                self.group_mut(&group_id)?;
                let view = self.take_view(&view_id)?;
                let group = self.group_mut(&group_id)?;
                group.active_view_id = view.id.clone();
                insert(&mut group.views, index, view)?;
            }
            Command::MoveGroup {
                group_id,
                edge,
                index,
            } => {
                let weight = self.detach_group(&group_id)?;
                insert(
                    &mut self.zone_mut(edge)?.groups,
                    index,
                    GroupRef { group_id, weight },
                )?;
                self.zone_mut(edge)?.hidden = false;
            }
            Command::SelectView { view_id } => self.select_view(&view_id)?,
            Command::RevealPanel { panel_id } => {
                let view_id = self
                    .groups
                    .iter()
                    .flat_map(|g| &g.views)
                    .find(|v| v.sections.iter().any(|s| s.panel_id == panel_id))
                    .map(|v| v.id.clone())
                    .ok_or("panel is hidden; supply an explicit destination to show it")?;
                self.select_view(&view_id)?;
                for section in &mut self.view_mut(&view_id)?.sections {
                    if section.panel_id == panel_id {
                        section.collapsed = false;
                    }
                }
                self.focused_panel_id = Some(panel_id);
            }
            Command::Collapse {
                section_id,
                collapsed,
            } => self.section_mut(&section_id)?.collapsed = collapsed,
            Command::RestorePanel { panel_id } => self.restore_panel(&panel_id)?,
            Command::HidePanel { panel_id } => {
                if !self.panels.contains_key(&panel_id) {
                    return Err("missing panel".into());
                }
                self.remember_panel(&panel_id);
                for view in self.groups.iter_mut().flat_map(|g| &mut g.views) {
                    view.sections.retain(|s| s.panel_id != panel_id);
                }
            }
            Command::ResizeSection { section_id, weight } => {
                self.section_mut(&section_id)?.weight = weight
            }
            Command::ResizeGroup { group_id, weight } => {
                let reference = self
                    .zones
                    .iter_mut()
                    .flat_map(|z| &mut z.groups)
                    .find(|r| r.group_id == group_id)
                    .ok_or("no docked group")?;
                reference.weight = weight;
            }
            Command::ResizeZone { edge, extent } => self.zone_mut(edge)?.extent = extent,
            Command::HideZone { edge, hidden } => self.zone_mut(edge)?.hidden = hidden,
            Command::FloatGroup { window } => {
                self.detach_group(&window.group_id)?;
                self.floating.push(window);
            }
            Command::Bind { panel_id, binding } => {
                self.panels
                    .get_mut(&panel_id)
                    .ok_or("missing panel")?
                    .binding = binding
            }
            Command::Duplicate {
                panel_id,
                new_panel_id,
                section_id,
                view_id,
                index,
            } => {
                if self.panels.contains_key(&new_panel_id) {
                    return Err("duplicate identity already exists".into());
                }
                let mut panel = self.panels.get(&panel_id).ok_or("missing panel")?.clone();
                if !matches!(
                    panel.content,
                    Content::Mod {
                        duplicable: true,
                        ..
                    }
                ) {
                    return Err("panel does not support duplication".into());
                }
                panel.id = new_panel_id.clone();
                panel.storage_namespace = Some(new_panel_id.clone());
                self.panels.insert(new_panel_id.clone(), panel);
                self.show_panel(new_panel_id, section_id, view_id, index)?;
            }
            Command::RenamePanel { panel_id, name } => {
                let name = label(&name)?;
                let panel = self.panels.get_mut(&panel_id).ok_or("missing panel")?;
                if name.is_empty() {
                    panel.extra.remove("title");
                } else {
                    panel
                        .extra
                        .insert("title".into(), serde_json::Value::String(name));
                }
            }
            Command::RenameView { view_id, name } => {
                let name = label(&name)?;
                if name.is_empty() {
                    return Err("view name cannot be empty".into());
                }
                self.view_mut(&view_id)?.title = name;
            }
            Command::Maximize { group_id } => {
                if group_id.as_ref().is_some_and(|id| self.group(id).is_none()) {
                    return Err("missing group".into());
                }
                if let Some(id) = &group_id {
                    let active = self.group(id).unwrap().active_view_id.clone();
                    self.select_view(&active)?;
                }
                self.maximized_group_id = group_id;
            }
        }
        Ok(())
    }
}

fn label(name: &str) -> Result<String> {
    if name.chars().any(char::is_control) || name.chars().count() > 120 {
        return Err("name must be a single line of at most 120 characters".into());
    }
    Ok(name.trim().to_owned())
}
