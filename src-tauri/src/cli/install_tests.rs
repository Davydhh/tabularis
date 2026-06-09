use super::install::install_symlink;
use std::path::{Path, PathBuf};

fn fake_exe(dir: &Path) -> PathBuf {
    let exe = dir.join("tabularis-binary");
    std::fs::write(&exe, b"#!/bin/sh\n").unwrap();
    exe
}

#[test]
fn install_symlink_creates_link_to_exe() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let bin = tmp.path().join("bin");

    let link = install_symlink(&exe, &bin, false).unwrap();

    assert_eq!(link, bin.join("tabularis"));
    assert_eq!(std::fs::read_link(&link).unwrap(), exe);
}

#[test]
fn install_symlink_creates_missing_target_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let bin = tmp.path().join("nested/deeper/bin");

    install_symlink(&exe, &bin, false).unwrap();

    assert!(bin.join("tabularis").exists());
}

#[test]
fn install_symlink_is_idempotent_when_link_already_points_to_exe() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let bin = tmp.path().join("bin");

    install_symlink(&exe, &bin, false).unwrap();
    let link = install_symlink(&exe, &bin, false).unwrap();

    assert_eq!(std::fs::read_link(&link).unwrap(), exe);
}

#[test]
fn install_symlink_refuses_foreign_entry_without_force() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let bin = tmp.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("tabularis"), b"something else").unwrap();

    let err = install_symlink(&exe, &bin, false).unwrap_err();

    assert!(err.contains("--force"), "unexpected error: {}", err);
    // The foreign file must be untouched.
    assert_eq!(
        std::fs::read(bin.join("tabularis")).unwrap(),
        b"something else"
    );
}

#[test]
fn install_symlink_force_replaces_foreign_entry() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let bin = tmp.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::write(bin.join("tabularis"), b"something else").unwrap();

    let link = install_symlink(&exe, &bin, true).unwrap();

    assert_eq!(std::fs::read_link(&link).unwrap(), exe);
}

#[test]
fn install_symlink_force_replaces_stale_symlink() {
    let tmp = tempfile::tempdir().unwrap();
    let exe = fake_exe(tmp.path());
    let old_exe = fake_exe(&tmp.path().join("old").tap_create());
    let bin = tmp.path().join("bin");

    install_symlink(&old_exe, &bin, false).unwrap();
    let link = install_symlink(&exe, &bin, true).unwrap();

    assert_eq!(std::fs::read_link(&link).unwrap(), exe);
}

/// Tiny helper so the stale-symlink test can create a sibling dir inline.
trait TapCreate {
    fn tap_create(self) -> PathBuf;
}

impl TapCreate for PathBuf {
    fn tap_create(self) -> PathBuf {
        std::fs::create_dir_all(&self).unwrap();
        self
    }
}
