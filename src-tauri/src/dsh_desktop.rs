//! Desktop discovery never executes the Electron application with `--version`.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInstallation {
    pub path: PathBuf,
    pub version: Option<String>,
}

fn candidate(root: &Path) -> Option<PathBuf> {
    let executable = root.join(if cfg!(windows) {
        "DeepSeek Harness.exe"
    } else {
        "deepseek-harness"
    });
    executable.is_file().then_some(executable)
}

#[cfg(any(windows, test))]
fn desktop_display_name(name: &str) -> bool {
    name == "DeepSeek Harness"
        || name
            .strip_prefix("DeepSeek Harness ")
            .is_some_and(|version| {
                version.as_bytes().first().is_some_and(u8::is_ascii_digit)
                    && version.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+')
                    })
            })
}

pub fn discover() -> Option<DesktopInstallation> {
    let mut roots = Vec::new();
    #[cfg(windows)]
    {
        use winreg::{enums::*, RegKey};
        for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            for key in [
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            ] {
                let Ok(uninstall) = RegKey::predef(hive).open_subkey(key) else {
                    continue;
                };
                for name in uninstall.enum_keys().flatten() {
                    let Ok(entry) = uninstall.open_subkey(name) else {
                        continue;
                    };
                    if !entry
                        .get_value::<String, _>("DisplayName")
                        .ok()
                        .is_some_and(|name| desktop_display_name(&name))
                    {
                        continue;
                    }
                    if let Ok(location) = entry.get_value::<String, _>("InstallLocation") {
                        roots.push(PathBuf::from(location));
                    }
                    for field in ["DisplayIcon", "UninstallString"] {
                        if let Ok(value) = entry.get_value::<String, _>(field) {
                            let raw = value.trim();
                            let path = if let Some(quoted) = raw.strip_prefix('"') {
                                quoted.split('"').next().unwrap_or("")
                            } else {
                                raw.split(',').next().unwrap_or("")
                            };
                            if let Some(parent) = Path::new(path).parent() {
                                roots.push(parent.to_path_buf());
                            }
                        }
                    }
                }
            }
        }
        for variable in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(base) = std::env::var_os(variable) {
                let base = PathBuf::from(base);
                roots.push(base.join("DeepSeek Harness"));
                roots.push(base.join("Programs/DeepSeek Harness"));
            }
        }
    }
    #[cfg(target_os = "linux")]
    roots.extend([
        PathBuf::from("/opt/DeepSeek Harness"),
        PathBuf::from("/opt/deepseek-harness"),
    ]);
    #[cfg(target_os = "macos")]
    roots.extend([
        PathBuf::from("/Applications/DeepSeek Harness.app/Contents/MacOS"),
        crate::config::get_home_dir().join("Applications/DeepSeek Harness.app/Contents/MacOS"),
    ]);
    roots
        .into_iter()
        .find_map(|root| candidate(&root))
        .map(|path| {
            let version = desktop_version(&path);
            DesktopInstallation { path, version }
        })
}

fn desktop_version(path: &Path) -> Option<String> {
    if let Some(root) = path.parent() {
        let metadata = root.join("resources/runtime/primary-runtime/runtime.json");
        if let Ok(bytes) = std::fs::read(metadata) {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(version) = value["desktopVersion"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                {
                    return Some(version.to_owned());
                }
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let escaped = path.to_string_lossy().replace('\'', "''");
        let output = std::process::Command::new("powershell.exe")
            .creation_flags(0x08000000)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("(Get-Item -LiteralPath '{escaped}').VersionInfo.ProductVersion"),
            ])
            .output()
            .ok()?;
        let version = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        (output.status.success() && !version.is_empty()).then_some(version)
    }
    #[cfg(not(windows))]
    {
        let root = path.parent()?;
        let metadata = root.join("../Resources/app/package.json");
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(metadata).ok()?).ok()?;
        value["version"].as_str().map(str::to_owned)
    }
}

pub fn open(action: &str) -> Result<(), String> {
    let install = discover().ok_or("DeepSeek Harness Desktop is not installed")?;
    let path = match action {
        "open" => install.path,
        "uninstall" if cfg!(windows) => install
            .path
            .parent()
            .ok_or("Invalid desktop path")?
            .join("Uninstall DeepSeek Harness.exe"),
        _ => return Err("Unsupported DeepSeek Harness Desktop action".into()),
    };
    if !path.is_file() {
        return Err("The native desktop entry is unavailable".into());
    }
    std::process::Command::new(path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dsh_desktop_recognizes_the_versioned_nsis_display_name() {
        assert!(desktop_display_name("DeepSeek Harness"));
        assert!(desktop_display_name("DeepSeek Harness 0.2.1-rc.3"));
        assert!(!desktop_display_name("DeepSeek Harness Helper"));
        assert!(!desktop_display_name("DeepSeek Chat"));
    }
    #[test]
    fn dsh_desktop_candidate_requires_the_real_executable() {
        let root = tempfile::tempdir().unwrap();
        assert!(candidate(root.path()).is_none());
        let name = if cfg!(windows) {
            "DeepSeek Harness.exe"
        } else {
            "deepseek-harness"
        };
        std::fs::write(root.path().join(name), b"fixture").unwrap();
        assert_eq!(candidate(root.path()), Some(root.path().join(name)));
    }

    #[test]
    fn dsh_desktop_version_preserves_the_native_prerelease_label() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("DeepSeek Harness.exe");
        std::fs::write(&path, b"fixture").unwrap();
        let metadata = root
            .path()
            .join("resources/runtime/primary-runtime/runtime.json");
        std::fs::create_dir_all(metadata.parent().unwrap()).unwrap();
        std::fs::write(metadata, br#"{"desktopVersion":"0.2.1-rc.3"}"#).unwrap();
        assert_eq!(desktop_version(&path).as_deref(), Some("0.2.1-rc.3"));
    }
}
