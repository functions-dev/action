# Func Action

GitHub Action to download and setup the func CLI. Automatically detects OS and architecture.

## Usage

```yaml
- uses: functions-dev/action@main
  with:
    version: 'v1.20.0'  # optional - uses latest as default
```

## Requirements

The action runs on Node.js 24, so it needs GitHub Actions runner v2.327.1 or
newer. GitHub-hosted runners have it; self-hosted runners may need an update.

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `version` | Version to download (e.g. `v1.20.0`, `nightly`) | latest |
| `name` | Filename for downloaded binary | `func` |
| `binary` | Specific binary to download from GitHub release | auto-detected |
| `destination` | Download directory | cwd |
| `binarySource` | Full URL for the func binary, or for a tar.gz holding it | empty (uses GitHub releases) |
| `binarySubpath` | Path of the binary inside a tar.gz `binarySource` | empty |

## Binary from a tar.gz

When the download is a tar.gz, the action unpacks it and takes the binary at
`binarySubpath`. It tells a tar.gz by its content, not by the URL.

```yaml
- uses: functions-dev/action@main
  with:
    binarySource: 'https://example.com/func-linux-amd64.tar.gz'
    binarySubpath: 'bin/func'
```
