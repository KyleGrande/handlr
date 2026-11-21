//! Embeds app-provided mods listed in mods/bundled.txt, internal UI mods
//! from mods/frame, and program icons from defaults/icons. Source locations
//! are separate from the stable installed mod and frame paths.
//!
//! Worktrees may share one target dir, and with it this script and its output.
//! So nothing here names this checkout: paths are relative to the package and
//! the generated code includes files through the compiling crate's
//! `CARGO_MANIFEST_DIR`.

use std::path::Path;

fn walk(dir: &Path, base: &Path, root: &Path, prefix: &str, out: &mut Vec<String>) {
    let mut entries: Vec<_> = std::fs::read_dir(dir).unwrap().flatten().map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        // Host checks generate editor metadata beside sources; it is not a
        // runtime asset and must not change the app-provided mod payload.
        if matches!(p.file_name().and_then(|name| name.to_str()), Some("gpui-kit.d.ts" | "jsconfig.json")) { continue; }
        if p.is_dir() {
            walk(&p, base, root, prefix, out);
        } else {
            let path = p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
            println!("cargo:rerun-if-changed={path}");
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            let rel = if prefix.is_empty() { rel } else { format!("{prefix}/{rel}") };
            out.push(format!("    ({rel:?}, include_bytes!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/{path}\"))),"));
        }
    }
}

fn embed(base: &Path, folder: &str, name: &str, file: &str) {
    println!("cargo:rerun-if-changed={folder}");
    let mut lines = Vec::new();
    let root = base.join(folder);
    walk(&root, base, &root, "", &mut lines);
    let code = format!("pub const {name}: &[(&str, &[u8])] = &[\n{}\n];\n", lines.join("\n"));
    std::fs::write(Path::new(&std::env::var("OUT_DIR").unwrap()).join(file), code).unwrap();
}

fn embed_mods(base: &Path) {
    let manifest = "mods/bundled.txt";
    println!("cargo:rerun-if-changed={manifest}");
    let mut lines = Vec::new();
    let mut names = std::collections::BTreeSet::new();
    for name in std::fs::read_to_string(base.join(manifest)).expect("cannot read bundled mod list").lines() {
        let name = name.trim();
        if name.is_empty() || name.starts_with('#') { continue; }
        assert!(name.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'), "invalid bundled mod name: {name}");
        assert!(names.insert(name.to_owned()), "duplicate bundled mod: {name}");
        let folder = format!("mods/{name}");
        let root = base.join(&folder);
        assert!(root.join("main.js").is_file(), "bundled mod has no main.js: {name}");
        println!("cargo:rerun-if-changed={folder}");
        walk(&root, base, &root, name, &mut lines);
    }
    let code = format!("pub const DEFAULT_MODS: &[(&str, &[u8])] = &[\n{}\n];\n", lines.join("\n"));
    std::fs::write(Path::new(&std::env::var("OUT_DIR").unwrap()).join("default_mods.rs"), code).unwrap();
}

fn main() {
    let base = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    embed_mods(&base);
    embed(&base, "defaults/icons", "DEFAULT_ICONS", "default_icons.rs");
    embed(&base, "mods/frame", "FRAME_MODS", "frame_mods.rs");

    // Windows takes the window, taskbar and Start menu icon from the program file.
    #[cfg(windows)]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=assets/icons/herdr-app.ico");
        winresource::WindowsResource::new().set_icon("assets/icons/herdr-app.ico").compile().expect("cannot embed the icon");
    }
}
