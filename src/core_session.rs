//! A launch-scoped Core connection profile. Keep the app's own home/layout
//! untouched, and use one profile for connect, mod hc calls and subprocesses.
use std::{collections::BTreeMap, ffi::OsString, path::Path, process::Command, sync::OnceLock};
use crate::settings::CoreSession;

const KEYS: [&str; 5] = ["HC_SESSION", "HC_SOCKET", "XDG_STATE_HOME", "XDG_CONFIG_HOME", "XDG_RUNTIME_DIR"];
type Environment = BTreeMap<&'static str, Option<OsString>>;
static PROFILE: OnceLock<Environment> = OnceLock::new();

pub fn init(mode: Option<CoreSession>) {
    let _ = PROFILE.set(profile(mode, &crate::mods::app_dir(), |key| std::env::var_os(key)));
}

fn profile(mode: Option<CoreSession>, home: &Path, inherited: impl Fn(&str) -> Option<OsString>) -> Environment {
    match mode {
        // Older configs and command-line launches retain their original behavior.
        None => Environment::new(),
        Some(CoreSession::Shared) => KEYS.into_iter().map(|key| (key, None)).collect(),
        Some(CoreSession::Own) => {
            // Preserve the current installed session's exact paths so existing work
            // remains available. A launcher without overrides gets a private core.
            let root = home.join("core");
            let defaults = [
                OsString::from("handlr"), root.join("core.sock").into_os_string(),
                root.join("state").into_os_string(), root.join("config").into_os_string(),
                root.join("run").into_os_string(),
            ];
            KEYS.into_iter().zip(defaults).map(|(key, fallback)| (key, Some(inherited(key).unwrap_or(fallback)))).collect()
        }
    }
}

fn apply_profile(command: &mut Command, profile: &Environment) {
    for (key, value) in profile {
        match value {
            Some(value) => { command.env(key, value); }
            None => { command.env_remove(key); }
        }
    }
}

pub fn apply(command: &mut Command) {
    if let Some(profile) = PROFILE.get() { apply_profile(command, profile); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_preserves_existing_session_and_legacy_launches_are_unchanged() {
        let env = profile(Some(CoreSession::Own), Path::new("/app"), |key| Some(format!("original-{key}").into()));
        for key in KEYS { assert_eq!(env[key], Some(format!("original-{key}").into())); }
        assert!(profile(None, Path::new("/app"), |_| panic!("must not read environment")).is_empty());
    }

    #[test]
    fn own_without_launcher_overrides_has_private_storage() {
        let env = profile(Some(CoreSession::Own), Path::new("/app"), |_| None);
        assert_eq!(env["HC_SESSION"], Some("handlr".into()));
        assert_eq!(env["HC_SOCKET"], Some(Path::new("/app").join("core").join("core.sock").into_os_string()));
        for (key, suffix) in [("XDG_STATE_HOME", "state"), ("XDG_CONFIG_HOME", "config"), ("XDG_RUNTIME_DIR", "run")] {
            assert_eq!(env[key], Some(Path::new("/app").join("core").join(suffix).into_os_string()));
        }
    }

    #[test]
    fn shared_removes_every_core_override_but_preserves_app_home() {
        let mut cmd = Command::new("unused");
        for key in KEYS { cmd.env(key, "isolated"); }
        cmd.env("HERDR_APP_HOME", "/handlr-layout");
        apply_profile(&mut cmd, &profile(Some(CoreSession::Shared), Path::new("/app"), |_| None));
        let env: BTreeMap<_, _> = cmd.get_envs().collect();
        for key in KEYS { assert_eq!(env[std::ffi::OsStr::new(key)], None); }
        assert_eq!(env[std::ffi::OsStr::new("HERDR_APP_HOME")], Some(std::ffi::OsStr::new("/handlr-layout")));
    }
}
