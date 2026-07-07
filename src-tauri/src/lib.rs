// Fortuna is a pure front-end app (all simulation runs in the WebView), so the
// Rust side only stands up the window and Tauri runtime. Kept in lib.rs so a
// mobile entry point can hook in later without restructuring.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Fortuna");
}
