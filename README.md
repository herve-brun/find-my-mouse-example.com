# 🖱️ Find My Mouse - GNOME Shell Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GNOME Shell](https://img.shields.io/badge/GNOME-Shell-46+-blueviolet)](https://www.gnome.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/test.yml?branch=main&label=CI)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/release.yml?branch=main&label=Release)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/release.yml)
[![GitHub Issues](https://img.shields.io/github/issues/herve-brun/find-my-mouse-example.com)](https://github.com/herve-brun/find-my-mouse-example.com/issues)
[![GitHub Stars](https://img.shields.io/github/stars/herve-brun/find-my-mouse-example.com?style=social)](https://github.com/herve-brun/find-my-mouse-example.com/stargazers)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-Yes-green.svg)](https://github.com/herve-brun/find-my-mouse-example.com/commits/main)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red)](https://opensource.org/)

**Never lose your cursor again!** ⭐ A GNOME Shell extension that replicates Microsoft PowerToys' "Find My Mouse" feature, helping users locate their cursor with a customizable spotlight effect.

## 🌟 Features

- **🎯 Spotlight Effect**: Highlights the mouse cursor with customizable radius, color, and zoom.
- **🤲 Shake Activation**: Activate the spotlight by quickly shaking the mouse (sensitivity configurable).
- **📝 Dynamic Logging**: Real-time log level adjustments (ERROR, WARN, INFO, DEBUG) without restarting.
- **🖥️ Multi-Monitor Support**: Works across multiple monitors with DPI awareness.
- **⚙️ Shake Activation**: Configurable sensitivity and distance threshold.

## 🛠️ Installation

### 📋 Prerequisites

- GNOME Shell 46 or later
- Git
- Node.js 22+ (for TypeScript compilation)
- npm

### 🚀 Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   cd find-my-mouse-example.com
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension** (compiles TypeScript from `src/` to `dist/`):
   ```bash
   npm run build
   ```

4. **Compile schemas**:
   ```bash
   glib-compile-schemas schemas/
   ```

5. **Create extension directory**:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

6. **Copy built files**:
   ```bash
   cp -r dist/* schemas/ metadata.json ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io/
   ```

7. **Restart GNOME Shell**:
   - Press `Alt+F2`, type `r`, then press `Enter`
   - Or log out and log back in

8. **Enable the extension**:
   - Open **GNOME Extensions** app (`gnome-extensions-app`)
   - Find **"Find My Mouse"** and enable it

## 🎮 Usage

### 🔑 Activation Methods

| Method          | Description                       |
|-----------------|-----------------------------------|
| **Mouse Shake** | Quickly move mouse back and forth |

### ⚙️ Configuration

1. Open **GNOME Extensions** app
2. Click the **⚙️ gear icon** for "Find My Mouse" settings
3. Customize:
   - **Shake sensitivity and distance threshold**
   - **Spotlight colors**, size, and zoom
   - **Animation timing** and idle timeout
   - **Multi-monitor behavior**

## 📸 Screenshots

| Feature            | Screenshot                                                                                     |
|--------------------|-----------------------------------------------------------------------------------------------|
| **Spotlight Effect** | ![Spotlight Effect](https://raw.githubusercontent.com/herve-brun/find-my-mouse-example.com/main/screenshots/spotlight.png) |
| **Preferences**      | ![Preferences](https://raw.githubusercontent.com/herve-brun/find-my-mouse-example.com/main/screenshots/preferences.png) |

## 💻 Development

### 📋 Prerequisites

- GNOME Shell 46+
- GNOME Builder or VS Code with GJS support
- Node.js 22+ and npm
- Tools: `git`, `meson`, `sassc`, `gettext`

### 🚀 Setting Up

1. **Clone the repository**:
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   cd find-my-mouse-example.com
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create symlink**:
   ```bash
   ln -s $(pwd) ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

4. **Compile schemas**:
   ```bash
   glib-compile-schemas schemas/
   ```

5. **Build TypeScript sources** (compiles `src/*.ts` to `dist/*.js`):
   ```bash
   npm run build
   ```

### 📦 Available npm Scripts

| Script             | Description                                                     |
|--------------------|-----------------------------------------------------------------|
| `npm run check`    | Type-check all TypeScript sources without emitting output       |
| `npm run build`    | Clean the `dist/` directory and compile TypeScript to `dist/`  |
| `npm run build:dist` | Full build + create a distributable ZIP for EGO upload        |
| `npm run build:schemas` | Compile the GSettings XML schema to binary form            |

### TypeScript Architecture

Source files are written in TypeScript under `src/` and compiled to JavaScript in `dist/`:

```
src/
  extension.ts        →  dist/extension.js        (Core logic)
  prefs.ts            →  dist/prefs.js            (Preferences UI)
  settings.ts         →  dist/settings.js         (GSettings wrapper)
  spotlight.ts        →  dist/spotlight.js        (Spotlight rendering)
  mouseTracking.ts    →  dist/mouseTracking.js    (Mouse tracking)
  gamemodeClient.ts   →  dist/gamemodeClient.js   (Game mode integration)
  utils.ts            →  dist/utils.js            (Shared utilities)
```

- Edit **only** the `.ts` files in `src/` — the `dist/` directory is auto-generated and gitignored.
- Root `.js` files have been removed — all development is in TypeScript.

### 🧪 Testing

**Wayland Session** (recommended):
```bash
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland  # Best for debugging
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi
```

**X11 Session** (requires Xephyr):
```bash
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell
```

**View logs**:
```bash
journalctl --user -f | grep "Find My Mouse"
```

### 🐛 Debugging

#### 📜 Log Levels

| Level | Value | Description                          |
|-------|-------|--------------------------------------|
| ERROR | 0     | Critical errors only                |
| WARN  | 1     | Warnings and errors                 |
| INFO  | 2     | General information (default)       |
| DEBUG | 3     | Detailed debugging info (coordinates, animations) |

**Change log level**:
1. Open **Preferences > General > Logging > Log Level**
2. Select level (applies **immediately**)

**Test logs**:
- **DEBUG**: Shows mouse coordinates & animation details
- **INFO**: Key events (activation, visibility)
- **WARN/ERROR**: Critical issues only

## ❓ Troubleshooting

### ⚠️ Extension Not Loading
1. Check if enabled:
   ```bash
   gnome-extensions list
   ```
2. Check logs:
   ```bash
   journalctl --user -f | grep -i "find my mouse"
   ```
3. Verify GNOME Shell version:
   ```bash
   gnome-shell --version
   ```

### 🖱️ Spotlight Not Showing
1. Check shake sensitivity in settings
2. Ensure sufficient mouse movement for shake detection
3. Test with **"Always Visible"** mode

### 🖥️ Multi-Monitor Issues
1. Enable **"Show on All Monitors"**
2. Default: Uses current monitor
3. Wayland may have limitations

## 🤝 Contributing

We **❤️ contributions**! Follow these steps:

1. **Fork** the repository
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature
   ```
3. **Make your changes** — edit TypeScript files in `src/`, then build:
   ```bash
   npm run build
   ```
4. **Commit changes** using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):
   ```bash
   git commit -am 'feat: add amazing feature'
   ```
   > A local **commitlint** hook is configured via `commitlint.config.cjs` and enforces allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

5. **Push to branch**:
   ```bash
   git push origin feature/your-feature
   ```
6. **Open a Pull Request** — PR titles are validated by CI (`lint-pr.yml`) to follow Conventional Commits.

### 📜 Code Style Guidelines

- Follow existing patterns
- Use **descriptive names** for variables/functions
- **Comment complex logic**
- Keep commits **atomic & focused**
- **Conventional Commits**: All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification

## 📄 License

🔗 [MIT License](LICENSE.md)

> **Note**: This project uses a **custom MIT License** that includes an additional non-endorsement clause:
> The name "Hervé Brun" cannot be used to promote or advertise derived works without prior written authorization.

## 🙏 Acknowledgments

- Inspired by [Microsoft PowerToys Find My Mouse](https://learn.microsoft.com/en-us/windows/powertoys/find-my-mouse)
- Built with **GNOME Shell extension APIs**
- Thanks to the **GNOME community** for their documentation

## 🆘 Support

- **🐛 Issues**: [GitHub Issues](https://github.com/herve-brun/find-my-mouse-example.com/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/herve-brun/find-my-mouse-example.com/discussions)

---

> **⚠️ Note**: Designed for **GNOME Shell on Wayland**. X11 support may be limited.
