# Custom Theme Persistence in OpenCode

Custom themes are now stored persistently using a dual-storage approach that ensures themes survive browser sessions and work across different devices.

## Storage Locations

### 1. **File-Based Storage (Tauri/Desktop App)**
When using the desktop version of OpenCode, custom themes are saved to:

```
<project-directory>/.opencode/custom-gui-themes.json
```

**Fallback Location:**
```
<user-config-directory>/themes/custom-gui-themes.json
```

**Examples:**
- **Windows:** `C:\Users\<User>\.config\opencode\themes\custom-gui-themes.json`
- **macOS:** `/Users/<User>/.config/opencode/themes/custom-gui-themes.json` 
- **Linux:** `/home/<User>/.config/opencode/themes/custom-gui-themes.json`

### 2. **Local Storage (Web Version)**
For the web version, themes are stored in:
```
localStorage['opencode-custom-themes']
```

## How It Works

### **Automatic Storage Hierarchy:**
1. **Project Directory First** - Tries to save themes in the current project's `.opencode/themes/` directory
2. **User Config Fallback** - Falls back to the global user config directory
3. **LocalStorage Web Fallback** - For web version when file access isn't available

### **Theme Persistence Features:**
- ✅ **Cross-Session Persistence** - Themes survive app restarts
- ✅ **Project Sharing** - Themes saved in project directory can be shared with team
- ✅ **User Global Themes** - Personal themes available across all projects
- ✅ **Automatic Sync** - Changes are immediately persisted to storage
- ✅ **Error Handling** - Graceful fallbacks when storage isn't available
- ✅ **Import/Export** - Manual theme sharing via JSON files

### **Storage Format:**
Themes are stored as JSON in the following format:

```json
[
  {
    "id": "my-custom-theme",
    "name": "My Custom Theme",
    "description": "A beautiful custom theme",
    "colors": {
      "primary": "#3b82f6",
      "secondary": "#64748b",
      "accent": "#f59e0b",
      "background": "#ffffff",
      "surface": "#f8fafc",
      "text": "#0f172a",
      "textWeak": "#64748b",
      "border": "#e2e8f0",
      "success": "#10b981",
      "warning": "#f59e0b",
      "error": "#ef4444",
      "info": "#3b82f6"
    }
  }
]
```

### **File Structure Integration:**
Custom themes integrate seamlessly with OpenCode's existing configuration system:
- **`.opencode/`** - Project-specific configuration directory
- **`themes/`** - Custom themes subdirectory
- **`custom-gui-themes.json`** - GUI themes file (distinct from TUI themes)

### **Advantages:**
1. **No Manual Reloading** - Themes automatically load when app starts
2. **Project Portability** - Themes travel with your project
3. **User Preferences** - Personal themes available everywhere
4. **Team Collaboration** - Share themes via version control
5. **Backup Friendly** - Themes are just JSON files
6. **Web Compatibility** - Works in browser with localStorage
7. **Desktop Integration** - Uses file system when available

This dual approach ensures that custom themes are truly persistent and work across different usage scenarios while maintaining the simplicity of the JSON file format.