// Prevents an extra console window from opening alongside the app on Windows
// release builds (debug keeps it so logs are visible).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fortuna_lib::run()
}
