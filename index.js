const core = require('@actions/core');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');

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

function smartVersionUpdate(version) {
    const match = version.match(/^(?:knative-)?v?(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error(`Invalid version format (${version}). Expected format: "1.16[.X]" or "v1.16[.X]"`);
    return `knative-v${match[1]}.${match[2]}.${match[3] ?? 0}`;
}

function resolveVersion() {
    if (core.getInput('binarySource')) return null;
    const version = core.getInput('version') || 'latest';
    if (version.toLowerCase().trim() === 'latest') return null;
    return smartVersionUpdate(version);
}

function resolveDownloadUrl(version, binName) {
    const binarySource = core.getInput('binarySource');
    if (binarySource) {
        core.info(`Using custom binary source: ${binarySource}`);
        return binarySource;
    }

    if (!version) {
        core.info('Using latest version...');
        return `https://github.com/knative/func/releases/latest/download/${binName}`;
    }
    core.info(`Using specific version ${version}`);
    return `https://github.com/knative/func/releases/download/${version}/${binName}`;
}

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

function addBinToPath(binPath) {
    const dir = path.dirname(binPath);
    fs.appendFileSync(process.env.GITHUB_PATH, `\n${dir}`);
    if (!process.env.PATH.split(path.delimiter).includes(dir)) {
        process.env.PATH += path.delimiter + dir;
        core.info(`${dir} added to PATH`);
    }
}

async function warnStaleVersion(version) {
    try {
        const res = await fetch('https://github.com/knative/func/releases/latest', {
            method: 'HEAD',
            redirect: 'manual',
        });
        const loc = res.headers.get('location');
        if (!loc) return;

        const latest = loc.split('/').pop();
        const toNum = (v) => { const m = v.match(/(\d+)\.(\d+)/); return m && m[1] * 100 + +m[2]; };
        const diff = toNum(latest) - toNum(version);

        if (diff >= 3) {
            core.warning(`You are using func ${version}, which is ${diff} minor versions behind the latest (${latest}). Upgrading is recommended.`);
        }
    } catch {
        core.debug('Skipping stale version check');
    }
}

async function run() {
    try {
        const osBinName = getOsBinName();
        const version = resolveVersion();
        const url = resolveDownloadUrl(version, osBinName);
        const fullPathBin = resolveFullPathBin();

        await downloadFuncBinary(url, fullPathBin);
        addBinToPath(fullPathBin);

        if (version) await warnStaleVersion(version);
        await exec.exec(fullPathBin, ['version']);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
