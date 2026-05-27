use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstalledPluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
}

#[derive(Deserialize)]
struct InstalledPluginManifest {
    id: String,
    name: String,
    version: String,
    description: String,
}

pub fn get_plugins_dir() -> Result<PathBuf, String> {
    let plugins_dir = crate::paths::get_app_data_dir().join("plugins");
    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }
    Ok(plugins_dir)
}

/// Plugins directory used by builds before the project dirs were unified under
/// `tabularis` (the old `com.debba.tabularis` identifier). On Linux this equals
/// the current directory, so callers must guard against migrating onto itself.
fn legacy_plugins_dir() -> Option<PathBuf> {
    ProjectDirs::from("com", "debba", "tabularis").map(|pd| pd.data_dir().join("plugins"))
}

fn dir_has_entries(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false)
}

/// Move plugin folders from `legacy` into `target`. No-op when there is nothing
/// to move, when the paths are identical (Linux), or when `target` already holds
/// plugins (never clobber an existing install). Returns the number of folders
/// moved. Best-effort: per-entry failures are logged and skipped.
pub(crate) fn migrate_plugins_between(legacy: &Path, target: &Path) -> usize {
    if legacy == target || !legacy.is_dir() || dir_has_entries(target) {
        return 0;
    }

    let entries = match fs::read_dir(legacy) {
        Ok(entries) => entries,
        Err(e) => {
            log::error!("Plugin migration: failed to read {:?}: {}", legacy, e);
            return 0;
        }
    };
    if let Err(e) = fs::create_dir_all(target) {
        log::error!("Plugin migration: failed to create {:?}: {}", target, e);
        return 0;
    }

    let mut moved = 0;
    for entry in entries.flatten() {
        let dest = target.join(entry.file_name());
        if dest.exists() {
            continue;
        }
        match fs::rename(entry.path(), &dest) {
            Ok(()) => moved += 1,
            Err(e) => log::error!(
                "Plugin migration: failed to move {:?} -> {:?}: {}",
                entry.path(),
                dest,
                e
            ),
        }
    }
    // Best-effort cleanup of the now-empty legacy directory.
    let _ = fs::remove_dir(legacy);
    moved
}

/// One-time migration: relocate plugins from the legacy `com.debba.tabularis`
/// project dir into the unified `tabularis` data dir. Safe to call on every
/// startup — it only does work the first time after upgrading.
pub fn migrate_legacy_plugins_dir() {
    let Some(legacy) = legacy_plugins_dir() else {
        return;
    };
    let target = crate::paths::get_app_data_dir().join("plugins");
    let moved = migrate_plugins_between(&legacy, &target);
    if moved > 0 {
        log::info!(
            "Migrated {} plugin(s) from legacy directory {:?} to {:?}",
            moved,
            legacy,
            target
        );
    }
}

pub(crate) fn read_plugin_info_from_dir(path: &Path) -> Result<InstalledPluginInfo, String> {
    let manifest_path = path.join("manifest.json");
    let manifest_str = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read plugin manifest {:?}: {}", manifest_path, e))?;

    let manifest: InstalledPluginManifest = serde_json::from_str(&manifest_str)
        .map_err(|e| format!("Failed to parse plugin manifest {:?}: {}", manifest_path, e))?;

    Ok(InstalledPluginInfo {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
    })
}

pub fn read_installed_plugin(plugin_id: &str) -> Result<InstalledPluginInfo, String> {
    let plugins_dir = get_plugins_dir()?;
    read_plugin_info_from_dir(&plugins_dir.join(plugin_id))
}

pub async fn download_and_install(plugin_id: &str, download_url: &str) -> Result<(), String> {
    let plugins_dir = get_plugins_dir()?;
    let tmp_dir = plugins_dir.join(format!(".tmp-{}", plugin_id));
    let final_dir = plugins_dir.join(plugin_id);

    // Clean up any leftover temp dir
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("Failed to clean temp directory: {}", e))?;
    }

    // Download ZIP to memory
    log::info!("Downloading plugin '{}' from: {}", plugin_id, download_url);
    let response = reqwest::get(download_url)
        .await
        .map_err(|e| format!("Failed to download plugin: {}", e))?;

    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    log::info!(
        "Download response for '{}': HTTP {} (content-type: {})",
        plugin_id,
        status,
        content_type
    );

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let snippet = body.chars().take(200).collect::<String>();
        log::error!(
            "Plugin '{}' download failed — HTTP {}: {}",
            plugin_id,
            status,
            snippet
        );
        return Err(format!(
            "Failed to download plugin: server returned HTTP {} for URL: {}",
            status, download_url
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read plugin download: {}", e))?;

    log::info!(
        "Plugin '{}' downloaded {} bytes (content-type: {})",
        plugin_id,
        bytes.len(),
        content_type
    );

    // Extract to temp dir
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let cursor = std::io::Cursor::new(bytes.clone());
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| {
        log::error!(
            "Plugin '{}': failed to open ZIP archive ({} bytes, content-type: {}): {}",
            plugin_id,
            bytes.len(),
            content_type,
            e
        );
        format!(
            "Failed to open ZIP archive: {} (downloaded {} bytes from {})",
            e,
            bytes.len(),
            download_url
        )
    })?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry: {}", e))?;

        let out_path = match file.enclosed_name() {
            Some(path) => tmp_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
            }
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read ZIP file content: {}", e))?;
            fs::write(&out_path, &buf).map_err(|e| format!("Failed to write file: {}", e))?;

            // Set executable permissions on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    fs::set_permissions(&out_path, fs::Permissions::from_mode(mode))
                        .map_err(|e| format!("Failed to set permissions: {}", e))?;
                }
            }
        }
    }

    // Validate manifest.json exists
    let manifest_path = tmp_dir.join("manifest.json");
    if !manifest_path.exists() {
        fs::remove_dir_all(&tmp_dir).ok();
        return Err("Plugin archive does not contain manifest.json".to_string());
    }

    // Validate manifest.json parses correctly
    let manifest_str = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest.json: {}", e))?;
    serde_json::from_str::<serde_json::Value>(&manifest_str).map_err(|e| {
        fs::remove_dir_all(&tmp_dir).ok();
        format!("Invalid manifest.json: {}", e)
    })?;

    // Remove existing plugin dir if present
    if final_dir.exists() {
        fs::remove_dir_all(&final_dir)
            .map_err(|e| format!("Failed to remove existing plugin: {}", e))?;
    }

    // Rename temp to final
    fs::rename(&tmp_dir, &final_dir)
        .map_err(|e| format!("Failed to finalize plugin installation: {}", e))?;

    log::info!("Plugin '{}' installed successfully", plugin_id);
    Ok(())
}

pub fn uninstall(plugin_id: &str) -> Result<(), String> {
    let plugins_dir = get_plugins_dir()?;
    let plugin_dir = plugins_dir.join(plugin_id);

    if !plugin_dir.exists() {
        return Err(format!("Plugin '{}' is not installed", plugin_id));
    }

    fs::remove_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to remove plugin '{}': {}", plugin_id, e))?;

    log::info!("Plugin '{}' uninstalled successfully", plugin_id);
    Ok(())
}

pub fn list_installed() -> Result<Vec<InstalledPluginInfo>, String> {
    let plugins_dir = get_plugins_dir()?;
    let mut plugins = Vec::new();

    let entries = match fs::read_dir(&plugins_dir) {
        Ok(e) => e,
        Err(_) => return Ok(plugins),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        // Skip temp directories
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with(".tmp-") {
                continue;
            }
        }

        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        if let Ok(plugin) = read_plugin_info_from_dir(&path) {
            plugins.push(plugin);
        }
    }

    Ok(plugins)
}
