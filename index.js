const core = require('@actions/core');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Using latest as default
const DEFAULT_VERSION = 'latest';
const NIGHTLY_VERSION = 'nightly';
const DEFAULT_BINARY_SOURCE = 'https://github.com/knative/func/releases/download';
const DEFAULT_LATEST_BINARY_SOURCE = 'https://github.com/knative/func/releases/latest/download';
const DEFAULT_NIGHTLY_BINARY_SOURCE = 'https://storage.googleapis.com/knative-nightly/func/latest';

function getOsBinName() {
    const osBinName = core.getInput('binary');
    if (osBinName) {
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
            default: throw new Error(`unknown runner arch: ${runnerArch}`);
        }
    } else if (runnerOS === 'macOS') {
        return runnerArch === 'X64' ? 'func_darwin_amd64' : 'func_darwin_arm64';
    } else if (runnerOS === 'Windows') {
        return 'func_windows_amd64.exe';
    } else {
        throw new Error(`unknown runner os: ${runnerOS}`);
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

function smartVersionUpdate(version) {
    const match = version.match(/^(?:knative-)?v?(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error(`Invalid version format (${version}). Expected format: "1.16[.X]" or "v1.16[.X]"`);
    return `knative-v${match[1]}.${match[2]}.${match[3] ?? 0}`;
}

function resolveVersion() {
    const version = core.getInput('version') || DEFAULT_VERSION;
    if (version.toLowerCase().trim() === DEFAULT_VERSION) return DEFAULT_VERSION;
    if (version.toLowerCase().trim() === NIGHTLY_VERSION) return NIGHTLY_VERSION;
    return smartVersionUpdate(version);
}

function resolveDownloadUrl(version, binName) {
    const binarySource = core.getInput('binarySource');
    if (binarySource) {
        core.info(`Using custom binary source: ${binarySource}`);
        return binarySource;
    }

    if (version === NIGHTLY_VERSION) {
        core.info('Using nightly version...');
        return `${DEFAULT_NIGHTLY_BINARY_SOURCE}/${binName}`;
    }
    if (version === DEFAULT_VERSION) {
        core.info('Using latest version...');
        return `${DEFAULT_LATEST_BINARY_SOURCE}/${binName}`;
    }
    core.info(`Using specific version ${version}`);
    return `${DEFAULT_BINARY_SOURCE}/${version}/${binName}`;
}

async function downloadFuncBinary(url, binPath) {
    core.info(`Downloading from: ${url}`);
    // Work in a temp folder, so that only the binary ever lands at binPath.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'func-'));
    try {
        await exec.exec('curl', ['-L', '--fail', '-o', 'download', url], { cwd: dir });
        if (!fs.existsSync(path.join(dir, 'download'))) {
            throw new Error("Download failed, couldn't find the binary on disk");
        }
        fs.copyFileSync(await binaryInDownload(dir), binPath);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    if (process.env.RUNNER_OS !== 'Windows') {
        await exec.exec('chmod', ['+x', binPath]);
    }
}

// A tar.gz starts with the gzip magic bytes; no func binary (ELF, Mach-O, PE) does.
function isGzip(file) {
    const fd = fs.openSync(file, 'r');
    try {
        const magic = Buffer.alloc(2);
        fs.readSync(fd, magic, 0, 2, 0);
        return magic[0] === 0x1f && magic[1] === 0x8b;
    } finally {
        fs.closeSync(fd);
    }
}

// Returns the path of the binary in dir/download: the download itself, or
// the file at binarySubpath when the download is a tar.gz.
async function binaryInDownload(dir) {
    const download = path.join(dir, 'download');
    const subpath = core.getInput('binarySubpath');
    if (!isGzip(download)) {
        if (subpath) {
            throw new Error('binarySubpath is set, but the download is not a tar.gz archive');
        }
        return download;
    }
    if (!subpath) {
        throw new Error('The download is a tar.gz archive. Set binarySubpath to the path of the binary inside it');
    }

    core.info(`Extracting ${subpath} from the tar.gz archive`);
    const archive = path.join(dir, 'archive');
    fs.mkdirSync(archive);
    // Relative names only, so a GNU tar on Windows never reads the "C:"
    // of a path as a remote host.
    await exec.exec('tar', ['-xzf', 'download', '-C', 'archive'], { cwd: dir });
    // path.join resolves "..", so a subpath that leaves the archive ends up
    // outside this folder.
    const bin = path.join(archive, subpath);
    if (!bin.startsWith(archive + path.sep) || !fs.statSync(bin, { throwIfNoEntry: false })?.isFile()) {
        throw new Error(`Couldn't find a file at ${subpath} in the tar.gz archive`);
    }
    return bin;
}

function addBinToPath(binPath) {
    const dir = path.dirname(binPath);
    fs.appendFileSync(process.env.GITHUB_PATH, `\n${dir}`);
    if (!process.env.PATH.split(path.delimiter).includes(dir)) {
        process.env.PATH += path.delimiter + dir;
        core.info(`${dir} added to PATH`);
    }
}

async function warnStaleVersion(version) {
    // Skip version check for 'latest' or custom binary source
    if (version === DEFAULT_VERSION || core.getInput('binarySource')) {
        return;
    }

    let res;
    try {
        res = await fetch('https://github.com/knative/func/releases/latest', {
            method: 'HEAD',
            redirect: 'manual',
        });
    } catch (error) {
        core.warning(`Failed to fetch latest version: ${error.message}`);
        core.debug('Skipping stale version check');
        return;
    }

    const loc = res.headers.get('location');
    if (!loc) {
        core.warning('Could not determine latest version: no redirect location');
        core.debug('Skipping stale version check');
        return;
    }

    const latest = loc.split('/').pop();
    // Convert version string "vX.Y" to number (X*100 + Y) for comparison,
    // e.g. "v1.21" → 121.
    // Returns null if no match, otherwise multiplies major by 100 and adds minor
    // (+ coerces string to number).
    const toNum = (v) => { const m = v.match(/(\d+)\.(\d+)/); return m && m[1] * 100 + +m[2]; };
    const latestNum = toNum(latest);
    const versionNum = toNum(version);
    if (versionNum == null || latestNum == null) {
        core.debug('could not parse version numbers to compare');
        return;
    }
    const diff = latestNum - versionNum;
    if (diff >= 3) {
        core.warning(`You are using func ${version}, which is ${diff} minor versions behind the latest (${latest}). Upgrading is recommended.`);
    }
}

async function run() {
    const osBinName = getOsBinName();
    const version = resolveVersion();
    await warnStaleVersion(version);

    const url = resolveDownloadUrl(version, osBinName);
    const fullPathBin = resolveFullPathBin();

    await downloadFuncBinary(url, fullPathBin);
    addBinToPath(fullPathBin);

    await exec.exec(fullPathBin, ['version']);
}

run().catch(error => core.setFailed(error.message));

