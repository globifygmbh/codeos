# CodeOS – Installations- & Build-Anleitung

## Übersicht

CodeOS ist eine native macOS-Desktop-App (Tauri 2 + Rust). Du baust sie einmalig
lokal und erhältst eine `.app` sowie ein `.dmg` zur Installation.

---

## Voraussetzungen auf einen Blick

| Tool | Mindestversion | Wozu |
|---|---|---|
| macOS | 12 Monterey | Unterstützte Plattform |
| Xcode CLT | aktuell | C/C++ Compiler (für Rust & native deps) |
| Homebrew | aktuell | Paketverwaltung für Node, Apache, MySQL, PHP |
| Rust + Cargo | 1.77+ | Backend (Tauri = Rust) |
| Node.js | 18+ | Frontend-Build (Vite + React) |
| npm | 9+ | JS-Pakete |

Alles davon installiert das Build-Skript **automatisch**, falls noch nicht vorhanden.

---

## Schnellstart – Ein Befehl genügt

```bash
git clone <REPO_URL> codeos
cd codeos
chmod +x build.sh
./build.sh
```

Das Skript erledigt automatisch:
1. Homebrew installieren (falls nicht vorhanden)
2. Xcode Command Line Tools prüfen
3. Rust + Cargo via `rustup` installieren
4. Node.js installieren
5. App-Icons generieren
6. `npm install` ausführen
7. `npm run tauri build` starten
8. Pfad zum fertigen `.app` und `.dmg` ausgeben

---

## Schritt-für-Schritt (manuell)

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

Einen Dialog bestätigen, fertig. Prüfen:
```bash
xcode-select -p   # → /Library/Developer/CommandLineTools
```

---

### 2. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Apple Silicon (M1/M2/M3/M4):** danach einmalig ausführen:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

**Intel Mac:** Homebrew liegt in `/usr/local/bin/brew`, kein extra Schritt nötig.

---

### 3. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"   # oder Terminal neu starten

# Targets für universale Builds (optional, aber empfohlen):
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Prüfen:
```bash
rustc --version   # rustc 1.77+ erwartet
cargo --version
```

---

### 4. Node.js

```bash
brew install node
```

Prüfen:
```bash
node --version   # v18+ oder v20+ erwartet
npm --version
```

---

### 5. Projekt-Abhängigkeiten installieren

```bash
cd codeos
npm install
```

Rust-Abhängigkeiten werden automatisch beim ersten `cargo build` geladen (dauert
beim allerersten Mal 3–5 Minuten, da alle Crates kompiliert werden).

---

### 6. App-Icons generieren

```bash
./scripts/generate-icons.sh
# Optional: eigenes Icon übergeben (1024×1024 PNG)
./scripts/generate-icons.sh /pfad/zu/meinem-icon.png
```

Das Skript erzeugt in `src-tauri/icons/`:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS App-Bundle-Icon)
- `icon.ico` (Fallback für Windows)

---

### 7. App bauen

```bash
# Apple Silicon (M1/M2/M3/M4):
npm run tauri build -- --target aarch64-apple-darwin

# Intel Mac:
npm run tauri build -- --target x86_64-apple-darwin

# Universal Binary (läuft nativ auf beiden, größere Datei):
npm run tauri build -- --target universal-apple-darwin
```

Der erste Build dauert **5–15 Minuten** (Rust kompiliert alle Abhängigkeiten).
Folgebuilds sind deutlich schneller (~1–2 Min).

---

### 8. App installieren

Nach dem Build befinden sich die Ausgaben in:

```
src-tauri/target/<target-triple>/release/bundle/
├── macos/
│   └── CodeOS.app          ← direkt nutzbar, nach /Applications ziehen
└── dmg/
    └── CodeOS_0.2.0_*.dmg  ← DMG zum Weitergeben
```

**Via DMG (empfohlen):**
```bash
open src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/CodeOS_*.dmg
# → Im Finder öffnet sich das Fenster → CodeOS in /Applications ziehen
```

**Direkt kopieren:**
```bash
cp -R src-tauri/target/aarch64-apple-darwin/release/bundle/macos/CodeOS.app /Applications/
```

**Beim ersten Start – Gatekeeper-Warnung umgehen:**
Da die App nicht von Apple signiert ist, zeigt macOS einen Sicherheitsdialog.
Einmalig freischalten:
```bash
xattr -cr /Applications/CodeOS.app
```
Alternativ: Systemeinstellungen → Datenschutz & Sicherheit → "Trotzdem öffnen"

---

## Runtime-Abhängigkeiten (Homebrew-Dienste)

CodeOS steuert diese Dienste – sie müssen auf dem Mac installiert sein.
Der Setup-Wizard zeigt beim ersten Start an, was fehlt:

```bash
# Apache (httpd)
brew install httpd

# MySQL
brew install mysql
mysql_secure_installation   # Ersteinrichtung (Root-Passwort setzen)
brew services start mysql

# PHP (Version je nach Bedarf)
brew install php
# oder: brew install php@8.3

# Git (meistens schon via Xcode CLT vorhanden)
git --version
```

---

## Claude AI Chatfenster einrichten

1. API-Key holen: https://console.anthropic.com/ → API Keys → Create Key
2. In CodeOS: **Settings → Claude API Key → Schlüssel eingeben → Save**
   Der Key wird sicher im macOS Keychain gespeichert (nie auf die Festplatte geschrieben).
3. Im Chat-Fenster Modell wählen:
   - **claude-sonnet-4-6** – beste Balance (empfohlen)
   - **claude-opus-4-6** – stärkste Reasoning-Qualität
   - **claude-haiku-4-5** – schnellstes, günstigstes Modell

---

## GitHub-Token (optional)

Nur nötig für private Repositories oder bei API Rate-Limit-Problemen:

1. https://github.com/settings/tokens → "Generate new token (classic)"
2. Benötigte Scopes: `repo`, `read:org`
3. In CodeOS: **Settings → GitHub Personal Access Token → Save**

---

## MySQL-Manager einrichten (pro Projekt)

1. In der linken Sidebar auf **MySQL** klicken
2. Projekt aus dem Dropdown wählen
3. **Configure** → Host/Port/User/Passwort/Datenbank eingeben
4. **Test** klicken (speichert & testet die Verbindung)
5. Danach: Tabellen-Liste laden, SQL-Queries ausführen, Dump exportieren

Das Passwort wird im macOS Keychain gespeichert (nicht in der Config-Datei).

---

## Dev-Modus (für Entwicklung / Debugging)

```bash
npm run tauri dev
```

Öffnet die App mit DevTools und Hot-Reload für das Frontend.
Rust-Code-Änderungen triggern automatisch einen Neustart des Backends.

---

## Fehlerbehebung

### "App kann nicht geöffnet werden, weil Apple den Entwickler nicht überprüfen kann"
```bash
xattr -cr /Applications/CodeOS.app
```

### Rust-Build schlägt fehl: `linker 'cc' not found`
```bash
xcode-select --install
```

### npm install schlägt fehl: Node-Version zu alt
```bash
brew upgrade node
# Falls nvm verwendet wird:
nvm install 20 && nvm use 20
```

### `brew services` gibt Fehler oder Dienste starten nicht
```bash
brew services list        # Status aller Dienste prüfen
brew doctor               # Homebrew-Diagnose
```

### Rust kompiliert sehr langsam
Beim ersten Build normal (alle Crates werden kompiliert). `sccache` beschleunigt
Folgebuilds erheblich:
```bash
brew install sccache
export RUSTC_WRAPPER=sccache
# Dauerhaft in ~/.zprofile eintragen
```

### Port 80/443 belegt
Apache via Homebrew läuft standardmäßig auf Port **8080** (nicht 80).
Prüfen mit:
```bash
brew services list
lsof -i :8080
```

### Icons fehlen beim Build
```bash
./scripts/generate-icons.sh
```

### `error: failed to run custom build command for 'openssl-sys'`
```bash
brew install openssl
export PKG_CONFIG_PATH="$(brew --prefix openssl)/lib/pkgconfig"
```

---

## Konfigurationsdateien

Alle App-Daten liegen unter:
```
~/Library/Application Support/dev.codeos.manager/
├── config.json     ← Projekte, Service-Namen, Einstellungen
└── logs/           ← interne App-Logs
```

Im Finder öffnen: **Settings → Config Location → Ordner-Icon** klicken.

Keychain-Einträge (Passwörter, API-Keys) sind im macOS Keychain unter dem
Service-Namen `dev.codeos.manager` gespeichert. Einsehen in:
Finder → Programme → Dienstprogramme → Schlüsselbundverwaltung

---

## Deinstallation

```bash
# App entfernen
rm -rf /Applications/CodeOS.app

# App-Daten entfernen (löscht alle Projekte und Einstellungen!)
rm -rf ~/Library/Application\ Support/dev.codeos.manager

# Keychain-Einträge entfernen
security delete-generic-password -s "dev.codeos.manager" -a "github-token" 2>/dev/null || true
security delete-generic-password -s "dev.codeos.manager" -a "claude-api-key" 2>/dev/null || true
```
