import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dotnetArguments,
  frameworkForPlatform,
  isMauiProject,
  parseAdbDevices,
  parseSimctlDevices,
  targetFrameworks
} from '../src/core';

test('recognizes MAUI projects without being sensitive to whitespace or case', () => {
  assert.equal(isMauiProject('<UseMaui> true </UseMaui>'), true);
  assert.equal(isMauiProject('<UseMaui>true</UseMaui>'), true);
  assert.equal(isMauiProject('<UseMaui>false</UseMaui>'), false);
});

test('extracts single and multi-target frameworks', () => {
  const project = '<TargetFrameworks>net10.0-android;net10.0-ios; net10.0-maccatalyst </TargetFrameworks>';
  assert.deepEqual(targetFrameworks(project), ['net10.0-android', 'net10.0-ios', 'net10.0-maccatalyst']);
});

test('selects the framework matching each MAUI platform', () => {
  const frameworks = ['net10.0-android', 'net10.0-ios', 'net10.0-maccatalyst'];
  assert.equal(frameworkForPlatform(frameworks, 'android'), 'net10.0-android');
  assert.equal(frameworkForPlatform(frameworks, 'ios'), 'net10.0-ios');
  assert.equal(frameworkForPlatform(frameworks, 'maccatalyst'), 'net10.0-maccatalyst');
  assert.equal(frameworkForPlatform(['net10.0'], 'ios'), undefined);
});

test('parses available iOS simulators and ignores non-iOS runtimes', () => {
  const json = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [{ udid: 'ios-1', name: 'iPhone Test' }],
      'com.apple.CoreSimulator.SimRuntime.tvOS-18-0': [{ udid: 'tv-1', name: 'Apple TV' }]
    }
  });
  assert.deepEqual(parseSimctlDevices(json), [{
    id: 'ios-1', label: 'iPhone Test', detail: 'iOS-18-0', platform: 'ios'
  }]);
});

test('parses connected Android devices and ignores offline entries', () => {
  const output = 'List of devices attached\nemulator-5554\tdevice product:sdk model:Pixel_8 device:husky\noffline-1\toffline\n';
  assert.deepEqual(parseAdbDevices(output), [{
    id: 'emulator-5554', label: 'Pixel 8', detail: 'emulator-5554', platform: 'android'
  }]);
});

test('builds a run command for a selected iOS simulator', () => {
  assert.deepEqual(dotnetArguments({
    action: 'build', projectPath: '/tmp/App.csproj', configuration: 'Debug',
    framework: 'net10.0-ios', runRequested: true,
    device: { id: 'ios-1', label: 'iPhone Test', detail: 'iOS-18-0', platform: 'ios' }
  }), [
    'build', '/tmp/App.csproj', '-c', 'Debug', '-f', 'net10.0-ios', '-t:Run',
    '-p:_DeviceName=:v2:udid=ios-1'
  ]);
});

test('builds an Android command without run flags for a normal build', () => {
  assert.deepEqual(dotnetArguments({
    action: 'build', projectPath: '/tmp/App.csproj', configuration: 'Release',
    framework: 'net10.0-android',
    device: { id: 'emulator-5554', label: 'Pixel 8', detail: 'emulator-5554', platform: 'android' }
  }), [
    'build', '/tmp/App.csproj', '-c', 'Release', '-f', 'net10.0-android',
    '-p:AdbTarget=-s emulator-5554'
  ]);
});

test('cleans without framework or device arguments when none are selected', () => {
  assert.deepEqual(dotnetArguments({
    action: 'clean', projectPath: '/tmp/App.csproj', configuration: 'Debug'
  }), ['clean', '/tmp/App.csproj', '-c', 'Debug']);
});
