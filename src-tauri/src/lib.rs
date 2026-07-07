// Fortuna is a pure front-end app (all simulation runs in the WebView), so the
// Rust side only stands up the window and Tauri runtime. Kept in lib.rs so a
// mobile entry point can hook in later without restructuring.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Native save/open dialogs + scoped file writes for scenario export/import
        // (WebView2 does not honor <a download> blob links inside the shell).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Fortuna");
}
