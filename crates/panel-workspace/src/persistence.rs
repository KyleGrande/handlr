use crate::*;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub struct Store {
    path: PathBuf,
}
pub struct LoadResult {
    pub document: Workspace,
    pub recovered: bool,
    pub warning: Option<String>,
}

fn read(path: &Path) -> Result<Workspace> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("workspace exceeds 16 MiB".into());
    }
    let document: Workspace =
        serde_json::from_slice(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    document.validate()?;
    Ok(document)
}

fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let temp = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)?;
        Ok::<_, std::io::Error>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("cannot save {}: {e}", path.display()))
}

impl Store {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    fn backup(&self) -> PathBuf {
        self.path.with_extension("last-good.json")
    }
    pub fn load(&self) -> Result<LoadResult> {
        match read(&self.path) {
            Ok(document) => Ok(LoadResult {
                document,
                recovered: false,
                warning: None,
            }),
            Err(primary_error) => match read(&self.backup()) {
                Ok(document) => Ok(LoadResult {
                    document,
                    recovered: true,
                    warning: Some(primary_error),
                }),
                Err(_backup_error) if !self.path.exists() && !self.backup().exists() => {
                    Ok(LoadResult {
                        document: Workspace::default(),
                        recovered: false,
                        warning: None,
                    })
                }
                Err(backup_error) => Err(format!(
                    "workspace recovery required; primary: {primary_error}; backup: {backup_error}"
                )),
            },
        }
    }
    pub fn save(&self, document: &Workspace) -> Result<()> {
        document.validate()?;
        let bytes = serde_json::to_vec_pretty(document).map_err(|e| e.to_string())?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        // Only rotate a validated primary. A damaged file must never replace
        // the last good document or disappear without a retained copy.
        if let Ok(previous) = read(&self.path) {
            atomic(
                &self.backup(),
                &serde_json::to_vec_pretty(&previous).map_err(|e| e.to_string())?,
            )?;
        } else if self.path.exists() {
            let mut sequence = 0u64;
            loop {
                let preserved = self
                    .path
                    .with_extension(format!("corrupt-{}-{sequence}.json", std::process::id()));
                match fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&preserved)
                {
                    Ok(mut file) => {
                        file.write_all(&fs::read(&self.path).map_err(|e| e.to_string())?)
                            .map_err(|e| e.to_string())?;
                        file.sync_all().map_err(|e| e.to_string())?;
                        break;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => sequence += 1,
                    Err(e) => return Err(e.to_string()),
                }
            }
        }
        atomic(&self.path, &bytes)
    }
    pub fn export(document: &Workspace) -> Result<String> {
        document.validate()?;
        serde_json::to_string_pretty(document).map_err(|e| e.to_string())
    }
    pub fn import(text: &str) -> Result<Workspace> {
        if text.len() > 16 * 1024 * 1024 {
            return Err("workspace exceeds 16 MiB".into());
        }
        let document: Workspace = serde_json::from_str(text).map_err(|e| e.to_string())?;
        document.validate()?;
        Ok(document)
    }
}
