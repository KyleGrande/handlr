//! Two versions of bundled mods: the app-provided files and the active user copy.
use super::{Files, Installed, as_shipped, fingerprint, write_if_changed};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io, path::Path};

#[derive(Default, Deserialize, Serialize)]
struct Ownership {
    #[serde(default)]
    user_owned: bool,
    #[serde(default)]
    pending: bool,
}
type State = BTreeMap<String, Ownership>;

fn load_state(home: &Path) -> io::Result<State> {
    match std::fs::read_to_string(home.join("mod-ownership.json")) {
        Ok(text) => serde_json::from_str(&text).map_err(io::Error::other),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(State::new()),
        Err(e) => Err(e),
    }
}
fn save_state(home: &Path, state: &State) -> io::Result<()> {
    crate::persist::write_atomic(&home.join("mod-ownership.json"), serde_json::to_string_pretty(state)? + "\n")
}
fn provided(home: &Path, name: &str) -> std::path::PathBuf {
    home.join("app-provided/mods").join(name)
}
fn signature(files: &Files) -> String {
    fingerprint(serde_json::to_string(files).unwrap().as_bytes())
}

/// Stage a complete directory, then swap it; roll back if the swap fails.
fn install(target: &Path, files: &BTreeMap<String, Vec<u8>>) -> io::Result<()> {
    let parent = target.parent().ok_or_else(|| io::Error::other("missing mod parent"))?;
    std::fs::create_dir_all(parent)?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let stage = parent.join(format!(".mod-stage-{nonce}"));
    let old = parent.join(format!(".mod-previous-{nonce}"));
    let result = (|| {
        for (path, bytes) in files {
            let file = stage.join(path);
            std::fs::create_dir_all(file.parent().unwrap())?;
            std::fs::write(file, bytes)?;
        }
        let existed = target.exists();
        if existed { std::fs::rename(target, &old)?; }
        if let Err(error) = std::fs::rename(&stage, target) {
            if existed { let _ = std::fs::rename(&old, target); }
            return Err(error);
        }
        if existed { std::fs::remove_dir_all(&old)?; }
        Ok(())
    })();
    if stage.exists() { let _ = std::fs::remove_dir_all(stage); }
    result
}

fn read_files(root: &Path) -> io::Result<BTreeMap<String, Vec<u8>>> {
    fn walk(root: &Path, dir: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> io::Result<()> {
        for item in std::fs::read_dir(dir)? {
            let path = item?.path();
            if path.file_name().unwrap().to_string_lossy().starts_with('.') { continue; }
            if path.is_dir() { walk(root, &path, files)?; }
            else {
                let relative = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
                if matches!(relative.as_str(), "gpui-kit.d.ts" | "jsconfig.json") { continue; }
                files.insert(relative, std::fs::read(path)?);
            }
        }
        Ok(())
    }
    let mut files = BTreeMap::new();
    if root.exists() { walk(root, root, &mut files)?; }
    Ok(files)
}
fn hashes(files: &BTreeMap<String, Vec<u8>>) -> Files {
    files.iter().map(|(name, bytes)| (name.clone(), fingerprint(bytes))).collect()
}

pub(super) fn sync(mods: &Path, record: &Path, bundled: &[(&str, &[u8])]) -> io::Result<()> {
    let home = record.parent().unwrap();
    let mut installed: Installed = serde_json::from_str(&std::fs::read_to_string(record).unwrap_or_default()).unwrap_or_default();
    let mut state = load_state(home)?;
    let names: std::collections::BTreeSet<_> = bundled.iter().filter_map(|(p, _)| p.split('/').next()).collect();
    let dropped: Vec<_> = installed.keys().filter(|n| !n.starts_with("layout:") && !names.contains(n.as_str())).cloned().collect();
    for name in dropped {
        let target = mods.join(&name);
        if !state.get(&name).is_some_and(|s| s.user_owned) && target.exists() && as_shipped(&target, &installed[&name]) {
            std::fs::remove_dir_all(&target)?;
        }
        if provided(home, &name).exists() { std::fs::remove_dir_all(provided(home, &name))?; }
        state.remove(&name);
        installed.remove(&name);
    }
    for name in names {
        let files: BTreeMap<_, _> = bundled.iter().filter_map(|(p, bytes)|
            Some((p.strip_prefix(&format!("{name}/"))?.to_owned(), bytes.to_vec()))).collect();
        let latest = hashes(&files);
        let target = mods.join(name);
        let previous = installed.get(name);
        let ownership = state.entry(name.into()).or_default();
        if !target.exists() { ownership.user_owned = false; ownership.pending = false; }
        else if !as_shipped(&target, previous.unwrap_or(&latest)) { ownership.user_owned = true; }
        let stock = provided(home, name);
        if !stock.exists() || !as_shipped(&stock, &latest) { install(&stock, &files)?; }
        if ownership.user_owned {
            if previous.is_some_and(|old| old != &latest) { ownership.pending = true; }
        } else if !target.exists() || !as_shipped(&target, &latest) {
            install(&target, &files)?;
        }
        installed.insert(name.into(), latest);
    }
    save_state(home, &state)?;
    write_if_changed(record, serde_json::to_string_pretty(&installed)? + "\n")
}

pub(crate) fn user_owned(home: &Path, name: &str) -> bool {
    if load_state(home).ok().and_then(|s| s.get(name).map(|s| s.user_owned)).unwrap_or(false) { return true; }
    let installed: Installed = serde_json::from_str(&std::fs::read_to_string(home.join("installed.json")).unwrap_or_default()).unwrap_or_default();
    installed.get(name).is_some_and(|files| !as_shipped(&home.join("mods").join(name), files))
}

pub(crate) fn pending(home: &Path) -> io::Result<Vec<serde_json::Value>> {
    let mut updates = vec![];
    for (name, state) in load_state(home)? {
        if !state.pending { continue; }
        let app = read_files(&provided(home, &name))?;
        let user = read_files(&home.join("mods").join(&name))?;
        let names: std::collections::BTreeSet<_> = app.keys().chain(user.keys()).collect();
        let files: Vec<_> = names.into_iter().filter(|key| app.get(*key) != user.get(*key)).cloned().collect();
        updates.push(serde_json::json!({"name":name,"files":files,"version":signature(&hashes(&app)),"user_version":signature(&hashes(&user))}));
    }
    Ok(updates)
}

pub(crate) fn resolve(home: &Path, name: &str, action: &str, version: &str, user_version: Option<&str>) -> io::Result<()> {
    if !super::valid_name(name) { return Err(io::Error::other("invalid mod name")); }
    let mut state = load_state(home)?;
    let ownership = state.get_mut(name).filter(|s| s.pending).ok_or_else(|| io::Error::other("this update has already been resolved"))?;
    let app = read_files(&provided(home, name))?;
    if signature(&hashes(&app)) != version { return Err(io::Error::other("a newer update is available; reopen Panel Updates")); }
    match action {
        "keep" => { ownership.user_owned = true; }
        "use" => {
            let target = home.join("mods").join(name);
            let user = read_files(&target)?;
            if user_version != Some(signature(&hashes(&user)).as_str()) { return Err(io::Error::other("your version changed; reopen Panel Updates before replacing it")); }
            install(&target, &app)?;
            ownership.user_owned = false;
        }
        _ => return Err(io::Error::other("choose keep or use")),
    }
    ownership.pending = false;
    save_state(home, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let home = crate::test_tmp().join(format!("panel-ownership-{nonce}"));
            std::fs::create_dir_all(home.join("mods")).unwrap();
            Self(home)
        }
        fn sync(&self, files: &[(&str, &[u8])]) { sync(&self.0.join("mods"), &self.0.join("installed.json"), files).unwrap(); }
        fn edit(&self, text: &str) { std::fs::write(self.0.join("mods/a/main.js"), text).unwrap(); }
        fn user(&self) -> String { std::fs::read_to_string(self.0.join("mods/a/main.js")).unwrap() }
        fn pending(&self) -> serde_json::Value { pending(&self.0).unwrap().into_iter().next().unwrap() }
        fn resolve(&self, action: &str) {
            let p = self.pending();
            resolve(&self.0, "a", action, p["version"].as_str().unwrap(), p["user_version"].as_str()).unwrap();
        }
    }
    impl Drop for Fixture { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    #[test]
    fn edits_become_user_owned_without_clones_or_restart_replacements() {
        let f = Fixture::new();
        let v1: &[(&str, &[u8])] = &[("a/main.js", b"app one")];
        f.sync(v1); f.edit("mine");
        assert!(user_owned(&f.0, "a"), "edits count as user-owned even before restart");
        for _ in 0..3 { f.sync(v1); assert_eq!(f.user(), "mine"); }
        assert!(pending(&f.0).unwrap().is_empty());
        assert!(!f.0.join("mods/a-edited").exists());
        assert_eq!(std::fs::read_to_string(provided(&f.0, "a").join("main.js")).unwrap(), "app one");
    }

    #[test]
    fn keep_mine_suppresses_only_the_current_update() {
        let f = Fixture::new();
        f.sync(&[("a/main.js", b"one")]); f.edit("mine");
        let v2: &[(&str, &[u8])] = &[("a/main.js", b"two")];
        f.sync(v2); assert_eq!(f.user(), "mine");
        assert_eq!(pending(&f.0).unwrap().len(), 1);
        f.resolve("keep"); f.sync(v2);
        assert!(pending(&f.0).unwrap().is_empty()); assert!(user_owned(&f.0, "a"));
        f.sync(&[("a/main.js", b"three")]);
        assert_eq!(pending(&f.0).unwrap().len(), 1); assert_eq!(f.user(), "mine");
        assert_eq!(std::fs::read_to_string(provided(&f.0, "a").join("main.js")).unwrap(), "three");
    }

    #[test]
    fn use_update_replaces_only_after_freshness_checks_and_returns_to_app_ownership() {
        let f = Fixture::new();
        f.sync(&[("a/main.js", b"one"), ("a/old.js", b"old")]); f.edit("mine");
        f.sync(&[("a/main.js", b"two"), ("a/new.js", b"new")]);
        let p = f.pending();
        assert!(resolve(&f.0, "a", "use", "stale", p["user_version"].as_str()).is_err());
        f.edit("changed during review");
        assert!(resolve(&f.0, "a", "use", p["version"].as_str().unwrap(), p["user_version"].as_str()).is_err());
        assert_eq!(f.user(), "changed during review");
        f.resolve("use"); assert_eq!(f.user(), "two");
        assert!(!f.0.join("mods/a/old.js").exists()); assert!(f.0.join("mods/a/new.js").exists());
        assert!(!user_owned(&f.0, "a")); assert!(pending(&f.0).unwrap().is_empty());
        f.sync(&[("a/main.js", b"three")]); assert_eq!(f.user(), "three");
        assert!(pending(&f.0).unwrap().is_empty());
    }

    #[test]
    fn newer_bundle_invalidates_an_open_review_and_keeps_user_files() {
        let f = Fixture::new();
        f.sync(&[("a/main.js", b"one")]); f.edit("mine");
        f.sync(&[("a/main.js", b"two")]); let old = f.pending();
        f.sync(&[("a/main.js", b"three")]);
        assert!(resolve(&f.0, "a", "keep", old["version"].as_str().unwrap(), None).is_err());
        assert_eq!(f.user(), "mine"); assert_eq!(pending(&f.0).unwrap().len(), 1);
    }

    #[test]
    fn corrupt_ownership_data_never_overwrites_a_user_version() {
        let f = Fixture::new();
        f.sync(&[("a/main.js", b"one")]); f.edit("mine");
        std::fs::write(f.0.join("mod-ownership.json"), "broken").unwrap();
        assert!(sync(&f.0.join("mods"), &f.0.join("installed.json"), &[("a/main.js", b"two")]).is_err());
        assert_eq!(f.user(), "mine");
    }
}
