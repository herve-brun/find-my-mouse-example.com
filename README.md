# 🖱️ Find My Mouse - GNOME Shell Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GNOME Shell](https://img.shields.io/badge/GNOME-Shell-46+-blueviolet)](https://www.gnome.org/)
[![GitHub Issues](https://img.shields.io/github/issues/herve-brun/find-my-mouse-example.com)](https://github.com/herve-brun/find-my-mouse-example.com/issues)
[![GitHub Stars](https://img.shields.io/github/stars/herve-brun/find-my-mouse-example.com?style=social)](https://github.com/herve-brun/find-my-mouse-example.com/stargazers)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/close-linear-issues.yml?branch=main&label=CI)](https://github.com/herve-brun/find-my-mouse-example.com/actions)
[![Maintenance](https://img.shields.io/badge/Maintained%3F-Yes-green.svg)](https://github.com/herve-brun/find-my-mouse-example.com/commits/main)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red)](https://opensource.org/)

**Never lose your cursor again!** ⭐ A GNOME Shell extension that replicates Microsoft PowerToys' "Find My Mouse" feature, helping users locate their cursor with a customizable spotlight effect.

## 🌟 Features

- **🎯 Spotlight Effect**: Highlights the mouse cursor with customizable radius, color, and zoom.
- **🤲 Shake Activation**: Activate the spotlight by quickly shaking the mouse (sensitivity configurable).
- **📝 Dynamic Logging**: Real-time log level adjustments (ERROR, WARN, INFO, DEBUG) without restarting.
- **🖥️ Multi-Monitor Support**: Works across multiple monitors with DPI awareness.
- **⚙️ Customizable Activation**: Keyboard shortcut, mouse click, or shake gesture.

## 🛠️ Installation

### 📋 Prerequisites

- GNOME Shell 46 or later
- Git
- Meson, SassC, and gettext (for development)

### 🚀 Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   cd find-my-mouse-example.com
   ```

2. **Compile schemas**:
   ```bash
   glib-compile-schemas schemas/
   ```

3. **Create extension directory**:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

4. **Copy files**:
   ```bash
   cp -r * ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io/
   ```

5. **Restart GNOME Shell**:
   - Press `Alt+F2`, type `r`, then press `Enter`
   - Or log out and log back in

6. **Enable the extension**:
   - Open **GNOME Extensions** app (`gnome-extensions-app`)
   - Find **"Find My Mouse"** and enable it

## 🎮 Usage

### 🔑 Activation Methods

| Method               | Description                                  |
|----------------------|----------------------------------------------|
| **Keyboard Shortcut** | Default: `<Ctrl><Alt>f` (configurable)        |
| **Mouse Shake**      | Quickly move mouse back and forth             |
| **Mouse Click**      | Click configured button (left/middle/right)  |

### ⚙️ Configuration

1. Open **GNOME Extensions** app
2. Click the **⚙️ gear icon** for "Find My Mouse" settings
3. Customize:
   - **Activation method** (shortcut, shake, or click)
   - **Keyboard shortcut**
   - **Mouse button** for click activation
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
- Tools: `git`, `meson`, `sassc`, `gettext`

### 🚀 Setting Up

1. **Clone the repository**:
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   ```

2. **Create symlink**:
   ```bash
   ln -s $(pwd) ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

3. **Compile schemas**:
   ```bash
   glib-compile-schemas schemas/
   ```

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
1. Check activation method in settings
2. Ensure no shortcut conflicts
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
3. **Commit changes**:
    ```bash
    git commit -am 'feat: add amazing feature'
    ```
4. **Push to branch**:
   ```bash
   git push origin feature/your-feature
   ```
5. **Open a Pull Request**

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
