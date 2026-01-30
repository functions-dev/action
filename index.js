const core = require('@actions/core');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');

// Using latest as default
const DEFAULT_FUNC_VERSION = 'latest';
const DEFAULT_BINARY_SOURCE = 'https://github.com/knative/func/releases/download';
const DEFAULT_LATEST_BINARY_SOURCE = 'https://github.com/knative/func/releases/latest/download';

// Returns the binary name for the current OS/arch from GitHub releases
function getOsBinName() {
    const osBinName = core.getInput('binary');
    if (osBinName !== "") {
        return osBinName;
    }

    const runnerOS = process.env.RUNNER_OS;
    const runnerArch = process.env.RUNNER_ARCH;

    if (runnerOS === 'Linux') {
        switch (runnerArch) {
            case 'X64': return 'func_linux_amd64';
            case 'ARM64': return 'func_linux_arm64';
            case 'PPC64LE': return 'func_linux_ppc64le';
            case 'S390X': return 'func_linux_s390x';
            default: throw new Error(`unknown runner: ${runnerArch}`);
        }
    } else if (runnerOS === 'macOS') {
        return runnerArch === 'X64' ? 'func_darwin_amd64' : 'func_darwin_arm64';
    } else if (runnerOS === 'Windows') {
        return 'func_windows_amd64.exe';
    } else {
        throw new Error(`unknown runner: ${runnerArch}`);
    }
}

function resolveFullPathBin() {
    const destination = core.getInput('destination') || process.cwd();
    let bin = core.getInput('name') || 'func';
    if (process.env.RUNNER_OS === 'Windows' && !bin.endsWith('.exe')) {
        bin += '.exe';
    }
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }
    return path.resolve(destination, bin);
}

// Normalizes version to release tag format: knative-vX.Y.Z
// Ex.: '1.16' or 'v1.16' will return 'knative-v1.16.0'
function smartVersionUpdate(version) {
    const versionRegex = /^(?<knprefix>knative-)?(?<prefix>v?)(?<major>\d+)\.(?<minor>\d+)(\.(?<patch>\d+))?$/;
    const match = version.match(versionRegex);
    if (!match) {
        throw new Error(`Invalid version format (${version}). Expected format: "1.16[.X]" or "v1.16[.X]"`);
    }
    const knprefix = 'knative-';
    const prefix = 'v';
    const patch = match.groups.patch ?? 0;
    return `${knprefix}${prefix}${match.groups.major}.${match.groups.minor}.${patch}`;
}

// Downloads binary from release URL and makes it executable
async function downloadFuncBinary(url, binPath) {
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
function addBinToPath(binPath) {
    const dir = path.dirname(binPath);
    fs.appendFileSync(process.env.GITHUB_PATH, `\n${dir}`);

    if (!process.env.PATH.split(path.delimiter).includes(dir)) {
        process.env.PATH = process.env.PATH + path.delimiter + dir;
        core.info(`${dir} added to PATH`);
    }
}

// Resolve download url based on given input
// binName: name of func binary when it is to be constructed for full URL
// (when not using binarySource)
function resolveDownloadUrl(binName) {
    const binarySource = core.getInput('binarySource');
    if (binarySource !== "") {
        core.info(`Using custom binary source: ${binarySource}`);
        return binarySource;
    }

    const versionInput = core.getInput('version') || DEFAULT_FUNC_VERSION;
    if (versionInput.toLowerCase().trim() === DEFAULT_FUNC_VERSION) {
        core.info("Using latest version...");
        return buildUrlString(DEFAULT_FUNC_VERSION);
    }
    const version = smartVersionUpdate(versionInput);
    core.info(`Using specific version ${version}`);
    return buildUrlString(version);

    function buildUrlString(version) {
        return version === DEFAULT_FUNC_VERSION
            ? `${DEFAULT_LATEST_BINARY_SOURCE}/${binName}`
            : `${DEFAULT_BINARY_SOURCE}/${version}/${binName}`;
    }
}

async function run() {
    let osBinName;
    try {
        osBinName = getOsBinName();
    } catch (error) {
        core.setFailed(error.message);
        return;
    }

    let url;
    try {
        url = resolveDownloadUrl(osBinName);
    } catch (error) {
        core.setFailed(`Failed to resolve url: ${error.message}`);
        return;
    }

    let fullPathBin;
    try {
        fullPathBin = resolveFullPathBin();
    } catch (error) {
        core.setFailed(error.message);
        return;
    }

    try {
        await downloadFuncBinary(url, fullPathBin);
    } catch (error) {
        core.setFailed(`Download failed: ${error.message}`);
        return;
    }

    try {
        addBinToPath(fullPathBin);
    } catch (error) {
        core.setFailed(error.message);
        return;
    }

    try {
        await exec.exec(fullPathBin, ['version']);
    } catch (error) {
        core.setFailed(error.message);
        return;
    }
}

run();
