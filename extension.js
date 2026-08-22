'use strict';

const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const util = require('util');

const execFile = util.promisify(cp.execFile);

const keys = {
  project: 'mauiWorkbench.project',
  platform: 'mauiWorkbench.platform',
  device: 'mauiWorkbench.device',
  configuration: 'mauiWorkbench.configuration'
};

class MauiWorkbench {
  constructor(context) {
    this.context = context;
    this.projects = [];
    this.devices = [];
    this.activeTask = undefined;
    this.projectItem = this.status('$(project) MAUI: no project', 'mauiWorkbench.selectProject', 104);
    this.platformItem = this.status('$(device-mobile) Platform', 'mauiWorkbench.selectPlatform', 103);
    this.deviceItem = this.status('$(server-environment) Device', 'mauiWorkbench.selectDevice', 102);
    this.configItem = this.status('$(settings-gear) Debug', 'mauiWorkbench.selectConfiguration', 101);
    this.runItem = this.status('$(play) Run', 'mauiWorkbench.run', 100);
  }

  status(text, command, priority) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    item.text = text;
    item.command = command;
    item.show();
    this.context.subscriptions.push(item);
    return item;
  }

  get selectedProject() {
    const saved = this.context.workspaceState.get(keys.project);
    return this.projects.find(project => project.uri.fsPath === saved) || this.projects[0];
  }

  get platform() {
    return this.context.workspaceState.get(keys.platform, 'ios');
  }

  get configuration() {
    return this.context.workspaceState.get(keys.configuration, 'Debug');
  }

  get device() {
    const id = this.context.workspaceState.get(keys.device);
    return this.devices.find(device => device.id === id);
  }

  async initialize() {
    await this.refresh(false);
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh(false)),
      vscode.tasks.onDidEndTask(event => {
        if (this.activeTask && event.execution === this.activeTask) {
          this.activeTask = undefined;
          vscode.commands.executeCommand('setContext', 'mauiWorkbench.taskRunning', false);
        }
      })
    );
  }

  async refresh(showMessage = true) {
    this.projects = await this.findProjects();
    await this.findDevices();
    await this.updateUi();
    if (showMessage) {
      vscode.window.showInformationMessage(`MAUI Command Deck found ${this.projects.length} project(s) and ${this.devices.length} device(s).`);
    }
  }

  async findProjects() {
    const uris = await vscode.workspace.findFiles('**/*.csproj', '**/{bin,obj,node_modules}/**');
    const projects = [];
    for (const uri of uris) {
      try {
        const content = await fs.readFile(uri.fsPath, 'utf8');
        if (!/<UseMaui>\s*true\s*<\/UseMaui>/i.test(content)) continue;
        const frameworks = [...content.matchAll(/<TargetFrameworks?>\s*([^<]+)\s*<\/TargetFrameworks?>/gi)]
          .flatMap(match => match[1].split(';').map(value => value.trim()));
        projects.push({
          uri,
          label: path.basename(uri.fsPath, '.csproj'),
          description: vscode.workspace.asRelativePath(uri),
          frameworks
        });
      } catch (error) {
        console.warn(`MAUI Command Deck could not inspect ${uri.fsPath}`, error);
      }
    }
    return projects.sort((a, b) => a.label.localeCompare(b.label));
  }

  async findDevices() {
    const devices = [];
    if (this.platform === 'ios') {
      try {
        const { stdout } = await execFile('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
        const parsed = JSON.parse(stdout);
        for (const [runtime, entries] of Object.entries(parsed.devices || {})) {
          if (!runtime.includes('iOS')) continue;
          for (const entry of entries) {
            devices.push({ id: entry.udid, label: entry.name, detail: runtime.split('.').pop(), kind: 'ios' });
          }
        }
      } catch (_) {
        // Xcode is optional until an Apple target is selected.
      }
    } else if (this.platform === 'android') {
      try {
        const { stdout } = await execFile('adb', ['devices', '-l']);
        for (const line of stdout.split(/\r?\n/).slice(1)) {
          const match = line.match(/^(\S+)\s+device\b(.*)$/);
          if (!match) continue;
          const model = /model:(\S+)/.exec(match[2]);
          devices.push({ id: match[1], label: model ? model[1].replaceAll('_', ' ') : match[1], detail: match[1], kind: 'android' });
        }
      } catch (_) {
        // Android tools are optional until an Android target is selected.
      }
    } else {
      devices.push({ id: 'local', label: 'This Mac', detail: 'Mac Catalyst', kind: 'maccatalyst' });
    }
    this.devices = devices;
  }

  async updateUi() {
    const project = this.selectedProject;
    this.projectItem.text = `$(project) ${project ? project.label : 'MAUI: no project'}`;
    this.projectItem.tooltip = project ? project.description : 'No .NET MAUI project found';
    this.platformItem.text = `$(device-mobile) ${this.platformLabel(this.platform)}`;
    this.configItem.text = `$(settings-gear) ${this.configuration}`;
    this.deviceItem.text = `$(server-environment) ${this.device ? this.device.label : 'Default device'}`;
    this.runItem.text = '$(play) Run';
    await vscode.commands.executeCommand('setContext', 'mauiWorkbench.hasProject', Boolean(project));
  }

  platformLabel(value) {
    return value === 'maccatalyst' ? 'Mac Catalyst' : value === 'ios' ? 'iOS' : 'Android';
  }

  async selectProject() {
    if (!this.projects.length) return vscode.window.showWarningMessage('No .NET MAUI projects were found in this workspace.');
    const selected = await vscode.window.showQuickPick(this.projects, { placeHolder: 'Select the startup project' });
    if (!selected) return;
    await this.context.workspaceState.update(keys.project, selected.uri.fsPath);
    await this.updateUi();
  }

  async selectPlatform() {
    const choices = [
      { label: '$(device-mobile) iOS', value: 'ios', description: 'Simulator or physical Apple device' },
      { label: '$(device-mobile) Android', value: 'android', description: 'Emulator or physical Android device' },
      { label: '$(desktop-download) Mac Catalyst', value: 'maccatalyst', description: 'Run locally on this Mac' }
    ];
    const selected = await vscode.window.showQuickPick(choices, { placeHolder: 'Select the target platform' });
    if (!selected) return;
    await this.context.workspaceState.update(keys.platform, selected.value);
    await this.context.workspaceState.update(keys.device, undefined);
    await this.findDevices();
    await this.updateUi();
  }

  async selectDevice() {
    await this.findDevices();
    if (!this.devices.length) {
      return vscode.window.showWarningMessage(`No available ${this.platformLabel(this.platform)} devices were found.`);
    }
    const selected = await vscode.window.showQuickPick(this.devices, { placeHolder: 'Select the deployment device' });
    if (!selected) return;
    await this.context.workspaceState.update(keys.device, selected.id);
    await this.updateUi();
  }

  async selectConfiguration() {
    const selected = await vscode.window.showQuickPick(['Debug', 'Release'], { placeHolder: 'Select the build configuration' });
    if (!selected) return;
    await this.context.workspaceState.update(keys.configuration, selected);
    await this.updateUi();
  }

  framework(project) {
    const marker = this.platform === 'maccatalyst' ? 'maccatalyst' : this.platform;
    return project.frameworks.find(value => value.toLowerCase().includes(marker));
  }

  commandArgs(action) {
    const project = this.selectedProject;
    if (!project) throw new Error('No .NET MAUI startup project is selected.');
    const args = [action, project.uri.fsPath, '-c', this.configuration];
    const framework = this.framework(project);
    if (framework) args.push('-f', framework);
    if (action === 'build' && this._runRequested) args.push('-t:Run');
    const device = this.device;
    if (device?.kind === 'ios') args.push(`-p:_DeviceName=:v2:udid=${device.id}`);
    if (device?.kind === 'android') args.push(`-p:AdbTarget=-s ${device.id}`);
    return args;
  }

  async execute(label, action, runRequested = false) {
    try {
      this._runRequested = runRequested;
      const dotnet = vscode.workspace.getConfiguration('mauiWorkbench').get('dotnetPath', 'dotnet');
      const args = this.commandArgs(action);
      const task = new vscode.Task(
        { type: 'maui-workbench', action: label.toLowerCase() },
        vscode.TaskScope.Workspace,
        `MAUI: ${label} ${this.selectedProject.label}`,
        'MAUI Command Deck',
        new vscode.ProcessExecution(dotnet, args),
        '$msCompile'
      );
      task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
      this.activeTask = await vscode.tasks.executeTask(task);
      await vscode.commands.executeCommand('setContext', 'mauiWorkbench.taskRunning', true);
    } catch (error) {
      vscode.window.showErrorMessage(`MAUI Command Deck: ${error.message}`);
    } finally {
      this._runRequested = false;
    }
  }

  build() { return this.execute('Build', 'build'); }
  run() { return this.execute('Run', 'build', true); }
  clean() { return this.execute('Clean', 'clean'); }

  async debug() {
    const project = this.selectedProject;
    if (!project) return vscode.window.showWarningMessage('Select a MAUI startup project first.');
    const framework = this.framework(project);
    const configuration = {
      type: 'maui',
      request: 'launch',
      name: `MAUI: ${project.label}`,
      projectPath: project.uri.fsPath,
      targetFramework: framework,
      configuration: this.configuration
    };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(project.uri), configuration);
    if (!started) {
      vscode.window.showErrorMessage('The MAUI debugger could not start. Ensure the official .NET MAUI extension is installed and select its startup device once.');
    }
  }

  async stop() {
    if (vscode.debug.activeDebugSession) await vscode.debug.stopDebugging();
    if (this.activeTask) {
      this.activeTask.terminate();
      this.activeTask = undefined;
      await vscode.commands.executeCommand('setContext', 'mauiWorkbench.taskRunning', false);
    }
  }
}

async function activate(context) {
  const workbench = new MauiWorkbench(context);
  const commands = {
    selectProject: () => workbench.selectProject(),
    selectPlatform: () => workbench.selectPlatform(),
    selectDevice: () => workbench.selectDevice(),
    selectConfiguration: () => workbench.selectConfiguration(),
    build: () => workbench.build(),
    run: () => workbench.run(),
    debug: () => workbench.debug(),
    stop: () => workbench.stop(),
    clean: () => workbench.clean(),
    refresh: () => workbench.refresh(true)
  };
  for (const [name, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(`mauiWorkbench.${name}`, handler));
  }
  await workbench.initialize();
}

function deactivate() {}

module.exports = { activate, deactivate };
