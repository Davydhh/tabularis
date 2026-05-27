use directories::ProjectDirs;
use std::path::{Path, PathBuf};

fn project_dirs() -> Option<ProjectDirs> {
    ProjectDirs::from("", "", "tabularis")
}

/// On Windows the `directories` crate nests a `config`/`data` leaf under
/// `%APPDATA%\tabularis`; strip it so every kind of app data shares a single
/// `tabularis` folder. On other platforms the path is returned unchanged.
/// Pure on its inputs so it stays unit-testable on any host.
pub(crate) fn unnested_app_dir(dir: &Path, strip_leaf: bool) -> PathBuf {
    if strip_leaf {
        dir.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| dir.to_path_buf())
    } else {
        dir.to_path_buf()
    }
}

/// Directory for app configuration (settings, themes, AI activity, ...).
pub fn get_app_config_dir() -> PathBuf {
    match project_dirs() {
        Some(proj_dirs) => unnested_app_dir(proj_dirs.config_dir(), cfg!(target_os = "windows")),
        // Fallback for weird environments
        None => PathBuf::from(".config/tabularis"),
    }
}

/// Directory for app data (installed plugins, ...). On Linux this resolves to
/// `~/.local/share/tabularis`; on macOS/Windows it shares the same `tabularis`
/// folder used by [`get_app_config_dir`].
pub fn get_app_data_dir() -> PathBuf {
    match project_dirs() {
        Some(proj_dirs) => unnested_app_dir(proj_dirs.data_dir(), cfg!(target_os = "windows")),
        // Fallback for weird environments
        None => PathBuf::from(".local/share/tabularis"),
    }
}
