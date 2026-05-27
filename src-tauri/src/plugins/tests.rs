use std::fs;

use tempfile::tempdir;

use super::installer::{migrate_plugins_between, read_plugin_info_from_dir};

#[test]
fn reads_installed_plugin_info_from_manifest() {
    let dir = tempdir().expect("temp dir");
    let manifest_path = dir.path().join("manifest.json");
    fs::write(
        &manifest_path,
        r#"{
  "id": "google-sheets",
  "name": "Google Sheets",
  "version": "0.2.0",
  "description": "Query Sheets"
}"#,
    )
    .expect("write manifest");

    let plugin = read_plugin_info_from_dir(dir.path()).expect("read manifest");

    assert_eq!(plugin.id, "google-sheets");
    assert_eq!(plugin.name, "Google Sheets");
    assert_eq!(plugin.version, "0.2.0");
    assert_eq!(plugin.description, "Query Sheets");
}

#[test]
fn returns_error_for_invalid_manifest() {
    let dir = tempdir().expect("temp dir");
    let manifest_path = dir.path().join("manifest.json");
    fs::write(&manifest_path, "{ invalid json").expect("write manifest");

    let error = read_plugin_info_from_dir(dir.path()).expect_err("invalid manifest");

    assert!(error.contains("Failed to parse plugin manifest"));
}

#[test]
fn migrates_plugin_folders_into_empty_target() {
    let root = tempdir().expect("temp dir");
    let legacy = root.path().join("legacy/plugins");
    let target = root.path().join("new/plugins");
    fs::create_dir_all(legacy.join("my-plugin")).expect("legacy plugin dir");
    fs::write(legacy.join("my-plugin/manifest.json"), "{}").expect("manifest");

    let moved = migrate_plugins_between(&legacy, &target);

    assert_eq!(moved, 1);
    assert!(target.join("my-plugin/manifest.json").exists());
    assert!(!legacy.exists(), "empty legacy dir should be removed");
}

#[test]
fn skips_migration_when_target_already_populated() {
    let root = tempdir().expect("temp dir");
    let legacy = root.path().join("legacy/plugins");
    let target = root.path().join("new/plugins");
    fs::create_dir_all(legacy.join("old")).expect("legacy");
    fs::create_dir_all(target.join("already-there")).expect("target");

    let moved = migrate_plugins_between(&legacy, &target);

    assert_eq!(moved, 0);
    assert!(legacy.join("old").exists(), "legacy left untouched");
    assert!(!target.join("old").exists());
}

#[test]
fn migration_is_a_no_op_when_legacy_equals_target() {
    let root = tempdir().expect("temp dir");
    let same = root.path().join("plugins");
    fs::create_dir_all(same.join("p")).expect("dir");

    let moved = migrate_plugins_between(&same, &same);

    assert_eq!(moved, 0);
    assert!(same.join("p").exists());
}

#[test]
fn migration_is_a_no_op_when_legacy_missing() {
    let root = tempdir().expect("temp dir");
    let legacy = root.path().join("does-not-exist");
    let target = root.path().join("new");

    assert_eq!(migrate_plugins_between(&legacy, &target), 0);
    assert!(
        !target.exists(),
        "target not created when nothing to migrate"
    );
}
