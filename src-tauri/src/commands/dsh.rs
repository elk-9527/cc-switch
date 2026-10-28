use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshInfo {
    home: std::path::PathBuf,
    default_home: std::path::PathBuf,
    profile: crate::settings::DshProfile,
    config_path: std::path::PathBuf,
    desktop: Option<crate::dsh_desktop::DesktopInstallation>,
}

#[tauri::command]
pub async fn get_dsh_info() -> Result<DshInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let target = crate::dsh_config::Target::current();
        DshInfo {
            config_path: target.config_path(),
            home: target.home,
            profile: target.profile,
            default_home: crate::dsh_config::default_data_dir(),
            desktop: crate::dsh_desktop::discover(),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_dsh_desktop(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::dsh_desktop::open(&action))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn list_dsh_backups() -> Result<Vec<crate::dsh_config::BackupInfo>, String> {
    crate::dsh_config::list_backups().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_dsh_backup(
    filename: String,
    state: tauri::State<'_, crate::store::AppState>,
) -> Result<(), String> {
    crate::dsh_config::restore_backup(&filename, || {
        crate::mcp::dsh::import(state.inner()).map(|_| ())
    })
    .map_err(|error| error.to_string())
}
