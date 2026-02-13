fn main() {
    // Force a delay to allow file handles to settle on Windows
    #[cfg(windows)]
    std::thread::sleep(std::time::Duration::from_millis(500));

    if let Ok(git_ref) = std::env::var("GITHUB_REF") {
        let branch = git_ref.strip_prefix("refs/heads/").unwrap_or(&git_ref);
        if branch == "beta" {
            println!("cargo:rustc-env=OPENCODE_SQLITE=1");
        }
    }

    tauri_build::build()
}
