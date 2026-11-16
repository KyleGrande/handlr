//! Local per-space working arrangements. No Core documents or terminal ownership.
use panel_workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct State {
    pub version: u32,
    pub enabled: bool,
    pub arrangements: BTreeMap<String, Workspace>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            arrangements: BTreeMap::new(),
        }
    }
}

impl State {
    fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("unsupported space arrangement version".into());
        }
        for document in self.arrangements.values() {
            document.validate()?;
        }
        Ok(())
    }
}

pub fn identity(workspace: &str, machine: &str, space: &str) -> String {
    serde_json::to_string(&(workspace, machine, space)).unwrap()
}

pub struct Arrangements {
    pub state: State,
    pub owner: Option<String>,
    pub warning: Option<String>,
    pub error: Option<String>,
    path: PathBuf,
    writable: bool,
    expected: Option<Vec<u8>>,
}

impl Arrangements {
    pub fn load(path: PathBuf) -> Self {
        let read = |path: &std::path::Path| -> Result<State, String> {
            let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
            if bytes.len() > 16 * 1024 * 1024 {
                return Err("space arrangements exceed 16 MiB".into());
            }
            let state: State = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            state.validate()?;
            Ok(state)
        };
        let backup = path.with_extension("last-good.json");
        let (state, warning, writable) = match read(&path) {
            Ok(state) => (state, None, true),
            Err(_) if !path.exists() && !backup.exists() => (State::default(), None, true),
            Err(error) => match read(&backup) {
                Ok(state) => (
                    state,
                    Some(format!("Recovered space arrangements: {error}")),
                    true,
                ),
                Err(_) => (
                    State::default(),
                    Some(format!(
                        "Cannot read space arrangements; repair {}: {error}",
                        path.display()
                    )),
                    false,
                ),
            },
        };
        let expected = std::fs::read(&path).ok();
        Self {
            state,
            owner: None,
            warning,
            error: None,
            path,
            writable,
            expected,
        }
    }

    pub fn persist(&mut self, state: State) -> Result<(), String> {
        state.validate()?;
        if !self.writable {
            return Err("Repair the space arrangements file before changing this setting".into());
        }
        if std::fs::read(&self.path).ok() != self.expected {
            return Err("Space arrangements changed outside this window; reopen this isolated app home before saving".into());
        }
        if self.state == state && self.path.exists() {
            return Ok(());
        }
        let bytes = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("space arrangements exceed 16 MiB".into());
        }
        std::fs::create_dir_all(self.path.parent().ok_or("missing arrangements directory")?)
            .map_err(|e| e.to_string())?;
        // Retain a validated recovery point before replacing the primary.
        crate::persist::write_atomic(
            &self.path.with_extension("last-good.json"),
            serde_json::to_vec_pretty(&self.state).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        crate::persist::write_atomic(&self.path, &bytes).map_err(|e| e.to_string())?;
        self.expected = Some(bytes);
        self.state = state;
        Ok(())
    }

    /// Prepare only. The window preflights/persists before publishing and owns
    /// serialization, so no delayed restore can land in another active space.
    pub fn prepare(&self, key: &str, current: &Workspace) -> Result<(State, Workspace), String> {
        let mut state = self.state.clone();
        if let Some(owner) = &self.owner {
            state.arrangements.insert(owner.clone(), current.clone());
        }
        let mut incoming = state
            .arrangements
            .get(key)
            .cloned()
            .unwrap_or_else(|| current.clone());
        // Reuse live panel identities/data. Extra current panels remain registered
        // but hidden; stored panels missing from the current registry can return.
        incoming.panels.extend(current.panels.clone());
        incoming.focused_panel_id = None;
        incoming.maximized_group_id = None;
        incoming.validate()?;
        state.arrangements.insert(key.into(), incoming.clone());
        Ok((state, incoming))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Arrangements {
        let path = std::env::temp_dir()
            .join(format!(
                "herdr-spaces-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ))
            .join("arrangements.json");
        Arrangements::load(path)
    }

    #[test]
    fn setting_defaults_off_and_identities_do_not_use_display_names() {
        let state = store();
        assert!(!state.state.enabled);
        assert_ne!(identity("w", "m1", "s"), identity("w", "m2", "s"));
        assert_ne!(identity("w1", "m", "s"), identity("w2", "m", "s"));
        assert_ne!(identity("w", "a/b", "c"), identity("w", "a", "b/c"));
    }

    #[test]
    fn seed_switch_restart_disable_and_reenable_preserve_independent_work() {
        let mut store = store();
        let mut document = Workspace::default();
        let mut enabled = store.state.clone();
        enabled.enabled = true;
        store.persist(enabled).unwrap();
        let (state, _) = store.prepare("a", &document).unwrap();
        store.persist(state).unwrap();
        store.owner = Some("a".into());
        document.zones[0].extent = 500.;
        let (state, b) = store.prepare("b", &document).unwrap();
        store.persist(state).unwrap();
        store.owner = Some("b".into());
        let mut b = b;
        b.zones[0].extent = 700.;
        let (state, a) = store.prepare("a", &b).unwrap();
        store.persist(state).unwrap();
        assert_eq!(a.zones[0].extent, 500.);
        let mut restarted = Arrangements::load(store.path.clone());
        assert!(restarted.state.enabled);
        assert_eq!(restarted.prepare("b", &a).unwrap().1.zones[0].extent, 700.);
        let mut disabled = restarted.state.clone();
        disabled.enabled = false;
        restarted.persist(disabled).unwrap();
        let mut enabled = restarted.state.clone();
        enabled.enabled = true;
        restarted.persist(enabled).unwrap();
        assert_eq!(restarted.prepare("b", &a).unwrap().1.zones[0].extent, 700.);
        std::fs::remove_dir_all(store.path.parent().unwrap()).unwrap();
    }

    #[test]
    fn corrupt_primary_recovers_and_unrecoverable_files_are_not_overwritten() {
        let mut store = store();
        let mut state = store.state.clone();
        state.enabled = true;
        store.persist(state).unwrap();
        std::fs::write(&store.path, "broken").unwrap();
        let recovered = Arrangements::load(store.path.clone());
        assert!(recovered.warning.is_some());
        std::fs::write(store.path.with_extension("last-good.json"), "broken").unwrap();
        let mut broken = Arrangements::load(store.path.clone());
        assert!(broken.persist(State::default()).is_err());
        assert_eq!(std::fs::read_to_string(&store.path).unwrap(), "broken");
        std::fs::remove_dir_all(store.path.parent().unwrap()).unwrap();
    }
}
