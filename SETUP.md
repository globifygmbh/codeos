# CodeOS – Setup, Build & Distribution Guide

## A. Architecture Decision

**Stack: Tauri 2 + Rust + React + TypeScript + Tailwind CSS**

| Criterion | Choice | Reason |
|---|---|---|
| macOS-native desktop app | Tauri 2 | Produces `.app` + DMG, uses system WebView (WKWebView), ~8 MB binary |
| Local process/service control | Rust `std::process::Command` | Parametrised, no shell injection, synchronous + async |
| Homebrew service management | `brew services` CLI | Manages LaunchAgents without sudo, idiomatic macOS |
| Git operations | `git` CLI | Stable, no native deps, handles auth cleanly |
| Auto-update | `tauri-plugin-updater` | Ed25519-signed GitHub Releases, delta updates |
| UI | React + Tailwind CSS | Type-safe, fast iteration, macOS-style dark theme |
| Secure token storage | macOS `security` CLI → Keychain | Native, no extra crates, no plaintext secrets |

XAMPP is **not** used. The app detects and controls existing Homebrew installations only.

---

## B. Project Structure

```
codeos/
├── src/                          # React/TypeScript frontend
│   ├── App.tsx                   # Root component + routing
│   ├── main.tsx
│   ├── types/index.ts            # All shared TS types
│   ├── stores/store.ts           # Zustand state + Tauri invoke calls
│   ├── styles/index.css
│   └── components/
│       ├── Sidebar.tsx
│       ├── Dashboard.tsx         # Overview: services + projects + logs
│       ├── SetupWizard.tsx       # First-run wizard
│       ├── ServiceStatus.tsx     # Service cards with start/stop/restart
│       ├── ProjectList.tsx       # Project browser
│       ├── ProjectCard.tsx       # Per-project detail + Git summary
│       ├── GitPanel.tsx          # Git status, fetch, pull, push, clone
│       ├── AddProjectModal.tsx   # Add project form
│       ├── LogViewer.tsx         # Filterable log viewer
│       └── Settings.tsx          # App settings + GitHub token
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json           # App config, bundle settings, updater
│   ├── capabilities/main.json   # Tauri 2 permission declarations
│   ├── icons/                    # App icons (see section D)
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Tauri builder + plugin registration
│       ├── models.rs             # Serde data models
│       ├── config.rs             # Config I/O + macOS Keychain helpers
│       ├── log_store.rs          # Shared in-memory log buffer (Tauri State)
│       ├── updater.rs            # check_for_updates / install_update commands
│       └── commands/
│           ├── mod.rs
│           ├── system.rs         # system_check, complete_setup, open_in_browser
│           ├── services.rs       # start/stop/restart Homebrew services
│           ├── git.rs            # clone, fetch, pull, push, status
│           ├── projects.rs       # CRUD + VHost generation
│           └── settings.rs       # config r/w, log access
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── index.html
```

Config is stored at: `~/Library/Application Support/dev.codeos.manager/config.json`
GitHub token: macOS Keychain, service `dev.codeos.manager`

---

## D. macOS Setup

### Prerequisites

```bash
# 1. Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# 2. Node.js (via Homebrew or nvm)
brew install node

# 3. Tauri CLI
cargo install tauri-cli --version "^2" --locked

# 4. Xcode Command Line Tools
xcode-select --install

# 5. Homebrew (for your local Apache/MySQL/PHP)
brew install httpd mysql php
```

### Icon generation

```bash
# Install tauri icon generator
cargo tauri icon src-tauri/icons/icon.png   # requires 1024x1024 PNG source
```

This fills `src-tauri/icons/` with all required sizes.

### Development run

```bash
cd codeos
npm install
cargo tauri dev
```

---

## E. Build (production `.app`)

```bash
# Universal binary (Apple Silicon + Intel in one)
cargo tauri build --target universal-apple-darwin

# Apple Silicon only
cargo tauri build --target aarch64-apple-darwin

# Intel only
cargo tauri build --target x86_64-apple-darwin
```

Output:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── dmg/CodeOS_0.1.0_universal.dmg
└── macos/CodeOS.app
```

---

## F. DMG Creation

Tauri builds the DMG automatically. For a custom background / layout:

```bash
# Install create-dmg
brew install create-dmg

# Example custom DMG
create-dmg \
  --volname "CodeOS" \
  --background ./assets/dmg-background.png \
  --window-size 660 400 \
  --icon-size 128 \
  --icon "CodeOS.app" 160 185 \
  --app-drop-link 500 185 \
  "CodeOS-0.1.0.dmg" \
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/"
```

---

## G. Auto-Update Setup

The updater uses Ed25519 signing via `tauri-plugin-updater`.

### 1. Generate key pair (once)

```bash
cargo tauri signer generate -w ~/.tauri/codeos.key
# Output:
#   Public key: dW50cnVzdGVkIGNvbW1lbnQ6 ...
#   Private key written to ~/.tauri/codeos.key
```

### 2. Configure `tauri.conf.json`

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<paste public key here>",
      "endpoints": [
        "https://github.com/YOUR_ORG/codeos/releases/latest/download/update-manifest.json"
      ]
    }
  }
}
```

### 3. Sign release assets (CI / GitHub Actions)

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/codeos.key) \
  cargo tauri build --target universal-apple-darwin
```

### 4. Generate update manifest

```bash
# After building, sign the DMG:
cargo tauri signer sign \
  -k ~/.tauri/codeos.key \
  src-tauri/target/universal-apple-darwin/release/bundle/dmg/CodeOS_0.2.0_universal.dmg
```

Publish `update-manifest.json` to the endpoint URL:

```json
{
  "version": "0.2.0",
  "notes": "What changed in this release",
  "pub_date": "2025-06-01T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<sig from signer>",
      "url": "https://github.com/YOUR_ORG/codeos/releases/download/v0.2.0/CodeOS_0.2.0_aarch64.dmg.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<sig>",
      "url": "https://github.com/YOUR_ORG/codeos/releases/download/v0.2.0/CodeOS_0.2.0_x86_64.dmg.tar.gz"
    }
  }
}
```

The frontend can trigger a check via:

```typescript
import { invoke } from "@tauri-apps/api/core";
const status = await invoke("check_for_updates");
```

---

## H. Known Limits / To-Dos

| Area | Status | Notes |
|---|---|---|
| Code signing / Notarization | Not configured | Requires paid Apple Developer account. Without it, Gatekeeper shows a warning on first launch. |
| VHost management | Implemented but opt-in | User must manually add `Include .../sites-enabled/*.conf` to `httpd.conf` once |
| Multi-PHP version switching | Not implemented | Possible via `brew link --force php@8.x` but requires careful httpd.conf edits |
| git push auth (SSH) | Not implemented | SSH key auth works if the user has SSH agent configured; HTTPS token is covered |
| Background git polling | Plumbing ready | `auto_check_git_updates` flag is in config; a Tauri background interval is not yet wired |
| MySQL GUI | Out of scope | App is a control centre, not a DB client |
| Windows / Linux support | Not planned | App uses macOS-specific APIs (Keychain `security` CLI, `open` command, `brew`) |
| App icon | Placeholder | Replace `src-tauri/icons/icon.png` with your own 1024×1024 PNG, then run `cargo tauri icon` |
| Unit tests | Not included | Add `#[cfg(test)]` modules to Rust commands; use Vitest for frontend |
| HTTPS localhost | Not implemented | Add `mkcert` integration to generate a local CA cert for `*.localhost` |
