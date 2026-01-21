const core = require('@actions/core');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');

// Static version - update manually when new func releases are available
const DEFAULT_FUNC_VERSION = 'knative-v1.20.1';

// Returns the binary name for the current OS/arch from GitHub releases
function getOsBinName() {
  const runnerOS = process.env.RUNNER_OS;
  const runnerArch = process.env.RUNNER_ARCH;

  if (runnerOS === 'Linux') {
    switch (runnerArch) {
      case 'X64': return 'func_linux_amd64';
      case 'ARM64': return 'func_linux_arm64';
      case 'PPC64LE': return 'func_linux_ppc64le';
      case 'S390X': return 'func_linux_s390x';
      default: return 'unknown';
    }
  } else if (runnerOS === 'macOS') {
    return runnerArch === 'X64' ? 'func_darwin_amd64' : 'func_darwin_arm64';
  } else if (runnerOS === 'Windows') {
    return 'func_windows_amd64.exe';
  } else {
    return 'unknown';
  }
}

// Normalizes version to release tag format: knative-vX.Y.Z
// Ex.: '1.16' or 'v1.16' will return 'knative-v1.16.0'
function smartVersionUpdate(version) {
  const versionRegex = /^(?<knprefix>knative-)?(?<prefix>v?)(?<major>\d+)\.(?<minor>\d+)(.(?<patch>\d+))?$/;
  const match = version.match(versionRegex);
  if (!match) {
    throw new Error(`Invalid version format (${version}). Expected format: "1.16[.X]" or "v1.16[.X]"`);
  }
  const knprefix = 'knative-';
  const prefix = 'v';
  const patch = match.groups.patch ?? 0;
  return `${knprefix}${prefix}${match.groups.major}.${match.groups.minor}.${patch}`;
}

const DEFAULT_BINARY_SOURCE = 'https://github.com/knative/func/releases/download';

// Downloads binary from release URL and makes it executable
async function downloadFuncBinary(version, osBinName, binPath, binarySource) {
  const url = `${binarySource}/${version}/${osBinName}`;
  core.info(`Downloading from: ${url}`);

  await exec.exec('curl', ['-L', '--fail', '-o', binPath, url]);

  if (!fs.existsSync(binPath)) {
    throw new Error("Download failed, couldn't find the binary on disk");
  }

  if (process.env.RUNNER_OS !== 'Windows') {
    await exec.exec('chmod', ['+x', binPath]);
  }
}

// Adds binary directory to PATH for current and subsequent steps
async function addBinToPath(binPath) {
  const dir = path.dirname(binPath);
  fs.appendFileSync(process.env.GITHUB_PATH, `\n${dir}`);

  if (!process.env.PATH.includes(dir)) {
    process.env.PATH = process.env.PATH + path.delimiter + dir;
    core.info(`${dir} added to PATH`);
  }
}

async function run() {
  const osBinName = core.getInput('binary') || getOsBinName();
  if (osBinName === "unknown") {
    core.setFailed("Invalid os binary determination, try setting it specifically using 'binary'");
    return;
  }

  const versionInput = core.getInput('version') || DEFAULT_FUNC_VERSION;
  const destination = core.getInput('destination') || process.cwd();
  const binarySource = core.getInput('binarySource') || DEFAULT_BINARY_SOURCE;
  let bin = core.getInput('name') || 'func';
  if (process.env.RUNNER_OS === 'Windows' && !bin.endsWith('.exe')) {
    bin += '.exe';
  }

  let version;
  try {
    version = smartVersionUpdate(versionInput);
  } catch (error) {
    core.setFailed(error.message);
    return;
  }

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const fullPathBin = path.resolve(destination, bin);

  try {
    await downloadFuncBinary(version, osBinName, fullPathBin, binarySource);
  } catch (error) {
    core.setFailed(`Download failed: ${error.message}`);
    return;
  }

  await addBinToPath(fullPathBin);
  await exec.exec(fullPathBin, ['version']);
}

run();