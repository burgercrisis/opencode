fn main() {
    // Force a delay to allow file handles to settle on Windows
    #[cfg(windows)]
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    tauri_build::build()
}
