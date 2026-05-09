# Find My Mouse - GNOME Shell Extension

Replicates Microsoft PowerToys "Find My Mouse" feature for GNOME Wayland/X11.

## Features
- **Spotlight effect** around mouse cursor (configurable radius, colors, zoom)
- **Shake-to-activate** gesture detection with sensitivity settings
- **Dynamic logging system** with real-time level adjustments (ERROR, WARN, INFO, DEBUG)
- Multi-monitor support with per-monitor DPI awareness
- Customizable activation methods (keyboard shortcut, double-ctrl, shake)

## Installation
```bash
# Clone and install
git clone https://github.com/herve-brun/find-my-mouse-example.com.git
cd find-my-mouse-example.com
make install
```

2. Compile the GSettings schemas:
   ```bash
   glib-compile-schemas schemas/
   ```

3. Create the extension directory:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

4. Copy the files:
   ```bash
   cp -r * ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io/
   ```

5. Restart GNOME Shell:
   - Press `Alt+F2`, type `r`, then press `Enter`
   - Or log out and log back in

6. Enable the extension:
   - Open GNOME Extensions app (`gnome-extensions-app`)
   - Find "Find My Mouse" and toggle it on

## Usage

### Default Activation

- **Keyboard Shortcut**: Press `<Ctrl><Alt>f` (configurable)
- **Mouse Shake**: Quickly move the mouse back and forth
- **Mouse Click**: Click the configured mouse button

### Configuration

1. Open GNOME Extensions app
2. Click on "Find My Mouse" settings (gear icon)
3. Configure your preferred options:
   - **Activation Method**: Choose how to activate the spotlight
   - **Keyboard Shortcut**: Set your preferred shortcut
   - **Click Button**: Select which mouse button activates the spotlight
   - **Colors**: Customize background and spotlight colors
   - **Size**: Adjust spotlight radius and zoom
   - **Timing**: Configure idle timeout and animation duration
   - **Multi-Monitor**: Enable to show spotlight on all monitors

## Screenshots

| Feature | Screenshot |
|---------|-----------|
| Spotlight Effect | ![Spotlight Effect](https://raw.githubusercontent.com/herve-brun/find-my-mouse-example.com/main/screenshots/spotlight.png) |
| Preferences | ![Preferences](https://raw.githubusercontent.com/herve-brun/find-my-mouse-example.com/main/screenshots/preferences.png) |

## Development

### Prerequisites

- GNOME Shell 46 or later
- GNOME Builder or VS Code with GJS language support
- Development tools: `git`, `meson`, `sassc`, `gettext`

### Setting Up Development Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/herve-brun/find-my-mouse-example.com.git
   cd find-my-mouse-example.com
   ```

2. Create a symlink for development:
   ```bash
   ln -s $(pwd) ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
   ```

3. Compile schemas:
   ```bash
   glib-compile-schemas schemas/
   ```

### Testing

Test in a nested Wayland session:
```bash
# For GNOME Shell 49+, use the devkit mode for better debugging
# For older versions, use the nested mode with backtrace warnings
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi
```

Test in a nested X11 session (requires Xephyr):
```bash
# Install Xephyr first:
#   Ubuntu/Debian: sudo apt install xserver-xephyr
#   Fedora/RHEL:   sudo dnf install xorg-x11-server-Xephyr
#   Arch:          sudo pacman -S xorg-server-xephyr
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell
```

View logs:
```bash
journalctl --user -f | grep "Find My Mouse"
```

### Debugging
### Viewing Logs
View extension logs in real-time:
```bash
journalctl --user -f | grep "Find My Mouse"
```

### Log Levels
The extension supports **dynamic log levels** that can be changed without restarting:

| Level | Value | Description                          |
|-------|-------|--------------------------------------|
| ERROR | 0     | Critical errors only                |
| WARN  | 1     | Warnings and errors                 |
| INFO  | 2     | General information (default)       |
| DEBUG | 3     | Detailed debugging information       |

**To change the log level**:
1. Open extension preferences
2. Navigate to **General > Logging > Log Level**
3. Select desired level (changes apply immediately)

### Testing Log Output
After changing the log level, trigger the spotlight (shake mouse or use shortcut) and observe the logs:
- **DEBUG** level shows detailed mouse coordinates and animation parameters
- **INFO** level shows key events (activation, visibility changes)
- **WARN/ERROR** levels show only issues

### Development Debugging
- Extension logs appear in `journalctl --user -f`
- Look for messages prefixed with "Find My Mouse:"
- Use `console.log()` in the code for debugging
- View full extension logs with: `journalctl --user --no-pager | grep "Find My Mouse"`

## Troubleshooting

### Extension Not Loading

1. Check if the extension is enabled:
   ```bash
   gnome-extensions list
   ```

2. Check for errors in the logs:
   ```bash
   journalctl --user -f | grep -i "find my mouse"
   ```

3. Verify GNOME Shell version compatibility:
   ```bash
   gnome-shell --version
   ```

### Spotlight Not Showing

1. Make sure the activation method is configured correctly
2. Check that the keyboard shortcut doesn't conflict with other shortcuts
3. Try the "Always Visible" mode to test if the extension is working

### Multi-Monitor Issues

1. Ensure "Show on All Monitors" is enabled if you want the spotlight on all screens
2. The extension uses the current monitor by default
3. For Wayland, multi-monitor support may have limitations

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Code Style

- Follow the existing code style
- Use descriptive variable and function names
- Add comments for complex logic
- Keep commits atomic and focused

## License

This project is licensed under the **GPL-3.0 License** - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [Microsoft PowerToys Find My Mouse](https://learn.microsoft.com/en-us/windows/powertoys/find-my-mouse)
- Built using GNOME Shell extension APIs
- Thanks to the GNOME community for their excellent documentation

## Support

- **Issues**: [GitHub Issues](https://github.com/herve-brun/find-my-mouse-example.com/issues)
- **Discussions**: [GitHub Discussions](https://github.com/herve-brun/find-my-mouse-example.com/discussions)

---

**Note**: This extension is designed for GNOME Shell on Wayland. Some features may not work correctly on X11 sessions.
