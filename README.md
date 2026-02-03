# Func Action

GitHub Action to download and setup the func CLI. Automatically detects OS and architecture.

## Usage

```yaml
- uses: functions-dev/action@main
  with:
    version: 'v1.20.0'  # optional - uses latest as default
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `version` | Version to download (e.g. `v1.20.0`, `nightly`) | latest |
| `name` | Filename for downloaded binary | `func` |
| `binary` | Specific binary to download from GitHub release | auto-detected |
| `destination` | Download directory | cwd |
| `binarySource` | Full URL for the func binary | empty (uses GitHub releases) |
