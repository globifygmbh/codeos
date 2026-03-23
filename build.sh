#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh – One-shot build script for CodeOS
#
# Run from the project root:
#   chmod +x build.sh && ./build.sh
#
# The script will:
#   1. Check / install all required dependencies
#   2. Generate app icons (if not present)
#   3. Install npm packages
#   4. Build the Tauri app (Rust + frontend)
#   5. Print the path to the resulting .app and .dmg
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[codeos]${NC} $*"; }
success() { echo -e "${GREEN}[codeos]${NC} $*"; }
warn()    { echo -e "${YELLOW}[codeos]${NC} $*"; }
die()     { echo -e "${RED}[codeos] ERROR:${NC} $*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || die "CodeOS only builds on macOS."
[[ $(uname -m) ]] && info "Architecture: $(uname -m)"

# ── 1. Homebrew ───────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew …"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
fi
success "Homebrew: $(brew --version | head -1)"

# ── 2. Xcode Command Line Tools ───────────────────────────────────────────────
if ! xcode-select -p &>/dev/null; then
  info "Installing Xcode Command Line Tools …"
  xcode-select --install
  echo "  → Please complete the Xcode CLT installation popup, then re-run this script."
  exit 0
fi
success "Xcode CLT: $(xcode-select -p)"

# ── 3. Rust + Cargo ───────────────────────────────────────────────────────────
if ! command -v rustc &>/dev/null; then
  info "Installing Rust via rustup …"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
fi

# Ensure we have the stable toolchain and required targets
rustup toolchain install stable --allow-downgrade
rustup default stable

# Add macOS universal / Apple Silicon targets if not present
rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null || true

RUST_VERSION=$(rustc --version)
success "Rust: $RUST_VERSION"

# ── 4. Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Installing Node.js via Homebrew …"
  brew install node
fi
NODE_VERSION=$(node --version)
success "Node.js: $NODE_VERSION"

# ── 5. Create app icons (if missing) ─────────────────────────────────────────
if [[ ! -f "src-tauri/icons/icon.icns" ]]; then
  info "Generating app icons …"
  chmod +x scripts/generate-icons.sh
  ./scripts/generate-icons.sh
else
  info "Icons already present – skipping generation."
fi

# ── 6. npm install ────────────────────────────────────────────────────────────
info "Installing npm dependencies …"
npm install

# ── 7. Build ──────────────────────────────────────────────────────────────────
info "Building CodeOS (this will take a few minutes on the first run) …"

# Determine target arch
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  TARGET_FLAG="--target aarch64-apple-darwin"
else
  TARGET_FLAG="--target x86_64-apple-darwin"
fi

npm run tauri build -- $TARGET_FLAG

# ── 8. Print output locations ─────────────────────────────────────────────────
echo ""
success "╔══════════════════════════════════════════════════════════╗"
success "║              Build complete!                             ║"
success "╚══════════════════════════════════════════════════════════╝"
echo ""

APP_PATH=$(find src-tauri/target -name "CodeOS.app" -maxdepth 6 2>/dev/null | head -1)
DMG_PATH=$(find src-tauri/target -name "*.dmg" -maxdepth 6 2>/dev/null | head -1)

if [[ -n "$APP_PATH" ]]; then
  success ".app  →  $APP_PATH"
fi
if [[ -n "$DMG_PATH" ]]; then
  success ".dmg  →  $DMG_PATH"
  echo ""
  info "To install: open the DMG and drag CodeOS to /Applications"
  info "Or copy directly:"
  echo "  cp -R \"$APP_PATH\" /Applications/"
fi
echo ""
