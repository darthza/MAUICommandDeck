# MAUI Command Deck

MAUI Command Deck adds persistent, Visual Studio-style controls to VS Code while staying entirely inside the supported extension API.

## Controls

The left side of the status bar contains:

`Startup project | Platform | Device | Configuration | Run`

Build, Run, Debug, and Stop actions also appear at the top-right of editor groups. All actions are available through the Command Palette under **MAUI**.

## Requirements

- VS Code 1.95 or newer
- .NET SDK with the relevant MAUI workloads
- Microsoft's **.NET MAUI** VS Code extension for debugging and Hot Reload
- Xcode for iOS and Mac Catalyst targets
- Android SDK platform tools (`adb`) for Android device discovery

## Run locally

1. Open this directory in VS Code.
2. Run `npm install`.
3. Run `npm run compile`.
4. Press `F5` to launch an Extension Development Host.
5. In the new window, open a folder containing one or more MAUI projects.

Run `npm test` to compile and execute the unit tests for project discovery, target selection, device parsing, and CLI arguments.

Workspace selections are remembered independently for every VS Code workspace.

The Command Deck stays hidden when the workspace has no .NET MAUI project. It appears automatically when a MAUI `.csproj` is created or opened.

## Current limitations

- VS Code does not expose an API for a general-purpose top workbench toolbar. Action buttons therefore use the supported editor-title toolbar; selectors use the status bar.
- Debug sessions are delegated to Microsoft's MAUI debug adapter. Device selection may need to be initialized once through the official MAUI extension, depending on its version.
- Android and Apple CLI deployment flags can vary between MAUI workload versions. Build output remains visible in a dedicated task terminal for diagnosis.
