# Willow Settings Reference

All settings are stored in `settings.json` in the app config directory (`%APPDATA%/willow/`). The file is a flat JSON object with `willow-` prefixed keys. Willow watches this file for external changes and applies them in real-time.

## Quick Start

Edit `settings.json` with any text editor while Willow is running. Changes are applied immediately — no restart required.

```json
{
	"willow-dock-enabled": "true",
	"willow-dock-mode": "smart",
	"willow-theme-mode": "dark",
	"willow-scale": "1.0"
}
```

## Settings Keys

### Dock

| Key                             | Type                             | Default   | Description                                                                                                                                                                      |
| ------------------------------- | -------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `willow-dock-enabled`            | `"true"` / `"false"`             | `"true"`  | Show or hide the Willow Dock (taskbar replacement).                                                                                                                               |
| `willow-dock-mode`               | `"fixed"` / `"smart"` / `"peek"` | `"fixed"` | Dock visibility behavior. **fixed** = always visible as AppBar. **smart** = auto-hide when overlapped by fullscreen apps. **peek** = hidden until cursor approaches bottom edge. |
| `willow-dock-preview-enabled`    | `"true"` / `"false"`             | `"true"`  | Show window thumbnail previews when hovering dock icons.                                                                                                                         |
| `willow-dock-icon-only`          | `"true"` / `"false"`             | `"false"` | Minimal icon-only style (no background/padding around icons).                                                                                                                    |
| `willow-dock-adaptive`           | `"true"` / `"false"`             | `"false"` | Fixed dock only. Stretch the dock to full width like a traditional taskbar while a window is maximized, and contract back when it's restored.                                    |
| `willow-dock-win-number-enabled` | `"true"` / `"false"`             | `"true"`  | When the taskbar is replaced, Win+1 through Win+9 activate the matching pinned dock app (focus/minimize if running, launch otherwise) instead of the native taskbar slots.       |

### Notch

| Key                | Type                             | Default   | Description                                                                                                                  |
| ------------------ | -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `willow-notch-mode` | `"fixed"` / `"smart"` / `"peek"` | `"fixed"` | Notch (top bar) visibility behavior. Same modes as dock. **peek** shows the notch briefly on media events and notifications. |

### Weather

| Key                              | Type                         | Default     | Description                                                                        |
| -------------------------------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `willow-weather-enabled`          | `"true"` / `"false"`         | `"true"`    | Show weather widget in the notch status bar.                                       |
| `willow-weather-city`             | string                       | `""`        | Manually set city name for weather. Empty string = auto-detect via IP geolocation. |
| `willow-weather-lat`              | number string                | (auto)      | Latitude coordinate for weather. Set automatically when a city is selected.        |
| `willow-weather-lon`              | number string                | (auto)      | Longitude coordinate for weather. Set automatically when a city is selected.       |
| `willow-weather-cached-temp`      | number string                | (none)      | Cached temperature value shown before next API fetch.                              |
| `willow-weather-cached-condition` | string                       | (none)      | Cached weather condition text (e.g. "Partly Cloudy").                              |
| `willow-temp-unit`                | `"celsius"` / `"fahrenheit"` | `"celsius"` | Temperature display unit.                                                          |

### Modules

| Key                         | Type                 | Default  | Description                                                           |
| --------------------------- | -------------------- | -------- | --------------------------------------------------------------------- |
| `willow-calendar-enabled`    | `"true"` / `"false"` | `"true"` | Enable calendar/timer mode in the notch.                              |
| `willow-music-mode-enabled`  | `"true"` / `"false"` | `"true"` | Enable interactive music media widget.                                |
| `willow-music-compact-notch` | `"true"` / `"false"` | `"true"` | Show compact music display (visualizer + artwork) in collapsed notch. |

### Music Appearance

| Key                                | Type                      | Default     | Description                                                                                     |
| ---------------------------------- | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `willow-media-layout`               | `"classic"` / `"compact"` | `"classic"` | Expanded player style. **classic** = large album art. **compact** = small thumbnail + controls. |
| `willow-media-ambience-enabled`     | `"true"` / `"false"`      | `"true"`    | Colored ambient glow behind expanded album art.                                                 |
| `willow-media-compact-glow-enabled` | `"true"` / `"false"`      | `"true"`    | Glow effect around the collapsed compact thumbnail.                                             |
| `willow-media-visualizer-enabled`   | `"true"` / `"false"`      | `"true"`    | Audio visualizer bars in music mode. Also accepts `willow-visualizer-enabled` (legacy alias).    |
| `willow-media-album-art-enabled`    | `"true"` / `"false"`      | `"true"`    | Show album artwork in the notch music display.                                                  |

### Overlays

| Key                                | Type                 | Default  | Description                                                              |
| ---------------------------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| `willow-volume-overlay-enabled`     | `"true"` / `"false"` | `"true"` | Show Willow volume HUD when volume changes (replaces native Windows OSD). |
| `willow-volume-edge-enabled`        | `"true"` / `"false"` | `"true"` | Trigger volume HUD by hovering the left screen edge.                     |
| `willow-brightness-overlay-enabled` | `"true"` / `"false"` | `"true"` | Show Willow brightness HUD when brightness changes.                       |
| `willow-brightness-edge-enabled`    | `"true"` / `"false"` | `"true"` | Trigger brightness HUD by hovering the right screen edge.                |

### Appearance

| Key                      | Type                                             | Default     | Description                                                                                                                                                 |
| ------------------------ | ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `willow-theme-mode`       | `"dark"` / `"light"` / `"custom"` / `"adaptive"` | `"dark"`    | Theme mode. **dark** = dark translucent. **light** = light translucent. **custom** = user-picked color. **adaptive** = follows Windows system accent color. |
| `willow-theme-color`      | hex string                                       | `"#007aff"` | Custom theme color (used in `custom` and `adaptive` modes).                                                                                                 |
| `willow-theme-opacity`    | float string                                     | `"0.80"`    | Background opacity (0.1 to 1.0).                                                                                                                            |
| `willow-theme-saturation` | float string                                     | `"0.50"`    | Color saturation for custom/adaptive themes (0.0 to 1.0).                                                                                                   |
| `willow-theme-brightness` | float string                                     | `"0.15"`    | Background brightness for custom/adaptive themes (0.0 to 1.0).                                                                                              |
| `willow-corners-enabled`  | `"true"` / `"false"`                             | `"false"`   | Render rounded screen corner overlays on top edges.                                                                                                         |

### Status Widgets

| Key                    | Type        | Default                                    | Description                                                                                                 |
| ---------------------- | ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `willow-status-widgets` | JSON string | `{"left":["weather"],"right":["battery"]}` | Widget layout in collapsed notch. Available: `"weather"`, `"battery"`, `"cpu"`, `"ram"`, `"disk"`, `"net"`. |

Example:

```json
{
	"willow-status-widgets": "{\"left\":[\"cpu\",\"ram\"],\"right\":[\"battery\",\"net\"]}"
}
```

### System

| Key                           | Type                 | Default   | Description                                                                                          |
| ----------------------------- | -------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `willow-scale`                 | float string         | `"1.0"`   | UI scale factor (0.8 to 1.3). Changing this re-registers AppBars to resize the reserved screen area. |
| `willow-low-battery-threshold` | integer string       | `"20"`    | Battery percentage that triggers the low-battery alert pulse (5 to 50, step 5).                      |
| `willow-auto-update`           | `"true"` / `"false"` | `"false"` | Check for and download updates automatically on startup.                                             |
| `willow-show-update-indicator` | `"true"` / `"false"` | `"true"`  | Show a green dot on the notch when an update is available.                                           |
| `willow-time-format-24h`       | `"true"` / `"false"` | `"false"` | Use 24-hour clock format in the notch. When `"false"`, displays 12-hour format with AM/PM.           |

### Internal (Do Not Edit Manually)

| Key                 | Type     | Description                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------------- |
| `willow-first-run`   | sentinel | Set to `"done"` after first launch. Triggers splash screen if absent.                 |
| `willow-app-version` | string   | Last known app version. If it differs from current, splash screen is shown on update. |

## Event System

Willow uses two Tauri events for settings synchronization:

### `settings-changed`

- **Emitted by:** `save_setting` command (frontend or backend)
- **Payload:** `{ "key": "willow-...", "value": ... }`
- **Purpose:** Broadcasts changes made through the Willow UI to all windows
- **Key format:** Willow-prefixed keys as-is (e.g. `"willow-dock-mode"`)

### `settings-external-changed`

- **Emitted by:** File watcher (detects external edits to `settings.json`)
- **Payload:** `{ "key": "willow-...", "value": ... }` or `{ "key": "willow-...", "value": null }` for removed keys
- **Purpose:** Broadcasts changes made by external editors (VS Code, notepad, scripts)
- **Key format:** Willow-prefixed keys as-is
- **Behavior:** Also syncs values to `localStorage` for instant frontend reads

### Flow

```
External editor saves settings.json
    ↓
File watcher detects change (ReadDirectoryChangesW)
    ↓
Diffs against SETTINGS_CACHE
    ↓
Emits settings-external-changed for each changed/removed key
    ↓
useSettingsSync hook updates React state + localStorage
    ↓
useSettingsSync hook updates React state
    ↓
UI re-renders with new values
```

## Example: Changing Dock Mode via Script

```powershell
# PowerShell: switch dock to smart mode
$json = Get-Content "$env:APPDATA\willow\settings.json" | ConvertFrom-Json
$json.'willow-dock-mode' = 'smart'
$json | ConvertTo-Json | Set-Content "$env:APPDATA\willow\settings.json"
```

```python
# Python: disable dock
import json, os
path = os.path.join(os.environ['APPDATA'], 'willow', 'settings.json')
with open(path) as f: settings = json.load(f)
settings['willow-dock-enabled'] = 'false'
with open(path, 'w') as f: json.dump(settings, f)
```

## Notes

- All boolean values are strings (`"true"` / `"false"`) for consistency with `localStorage`.
- The `useSettingsSync` hook auto-converts `"true"` / `"false"` strings to booleans.
- `auto-hide` mode values in `willow-dock-mode` and `willow-notch-mode` are legacy aliases for `smart` — they are mapped automatically.
- Changing `willow-scale` triggers AppBar re-registration to adjust reserved screen space.
- Theme changes (`willow-theme-*`) are applied by reading all theme values from `localStorage` and calling `applyTheme()` — the theme system depends on all five theme keys being in sync.
