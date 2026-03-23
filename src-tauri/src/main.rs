// Prevents additional console window on Windows in release, has no effect on macOS/Linux.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    codeos_lib::run()
}
