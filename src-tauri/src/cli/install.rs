//! `tabularis install-cli` — make the `tabularis` command available in the
//! user's PATH via a symlink in a bin directory pointing at the running
//! binary (which on macOS lives inside the .app bundle).
//!
//! First run is done with the full path, e.g.:
//! `/Applications/tabularis.app/Contents/MacOS/tabularis install-cli`

use std::path::{Path, PathBuf};

/// Candidate bin directories, in order of preference. `/usr/local/bin` is
/// already in PATH on macOS but usually needs elevated permissions;
/// `~/.local/bin` always works but may need a PATH addition.
fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/usr/local/bin")];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(Path::new(&home).join(".local/bin"));
    }
    dirs
}

/// Returns whether `dir` is listed in the current `$PATH`.
fn dir_in_path(dir: &Path) -> bool {
    std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).any(|p| p == dir))
        .unwrap_or(false)
}

#[cfg(unix)]
pub fn run_install(dir: Option<PathBuf>, force: bool) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Could not determine the running binary path: {}", e))?;

    let dirs = match dir {
        Some(d) => vec![d],
        None => candidate_dirs(),
    };

    let mut last_error = String::from("no candidate bin directory available");
    for dir in &dirs {
        match install_symlink(&exe, dir, force) {
            Ok(link) => {
                println!("Installed: {} -> {}", link.display(), exe.display());
                if !dir_in_path(dir) {
                    println!(
                        "Note: {} is not in your PATH. Add it with:\n  export PATH=\"{}:$PATH\"",
                        dir.display(),
                        dir.display()
                    );
                }
                println!("You can now run 'tabularis' from your terminal.");
                return Ok(());
            }
            Err(e) => last_error = e,
        }
    }
    Err(format!(
        "Could not install the CLI shortcut: {}\nTry: sudo {} install-cli",
        last_error,
        exe.display()
    ))
}

#[cfg(unix)]
pub(crate) fn install_symlink(exe: &Path, dir: &Path, force: bool) -> Result<PathBuf, String> {
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("could not create {}: {}", dir.display(), e))?;
    }

    let link = dir.join("tabularis");
    if let Ok(meta) = std::fs::symlink_metadata(&link) {
        let already_ours = meta.file_type().is_symlink()
            && std::fs::read_link(&link).map(|t| t == exe).unwrap_or(false);
        if already_ours {
            return Ok(link);
        }
        if !force {
            return Err(format!(
                "{} already exists (use --force to replace it)",
                link.display()
            ));
        }
        std::fs::remove_file(&link)
            .map_err(|e| format!("could not replace {}: {}", link.display(), e))?;
    }

    std::os::unix::fs::symlink(exe, &link)
        .map_err(|e| format!("could not create {}: {}", link.display(), e))?;
    Ok(link)
}

#[cfg(not(unix))]
pub fn run_install(_dir: Option<PathBuf>, _force: bool) -> Result<(), String> {
    Err("install-cli is not supported on this platform. \
         Add the directory containing tabularis.exe to your PATH instead."
        .to_string())
}
