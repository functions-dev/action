# Func Action

GitHub Action to download and setup the func CLI. Automatically detects OS and architecture.

## Usage

```yaml
- uses: functions-dev/action@main
  with:
    version: 'v1.20.0'  # optional
    name: 'func'        # optional
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `version` | Version to download (e.g. `v1.20.0`) | recent stable |
| `name` | Binary name | `func` |
| `binary` | Specific binary to download | auto-detected |
| `destination` | Download directory | cwd |
