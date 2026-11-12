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
| `imageSource` | Container image to copy the func binary from. Cannot be used with `binarySource` | empty (uses GitHub releases) |
| `imagePath` | Path of the binary inside `imageSource` | `/ko-app/func` |

## Binary from a container image

`imageSource` copies the binary out of an image with docker instead of
downloading it. The image must hold a binary for the runner's OS and arch, so
in practice this needs a Linux runner. For a private registry, log in first
(e.g. with `docker/login-action`).

```yaml
- uses: functions-dev/action@main
  with:
    imageSource: 'ghcr.io/knative/func/func:latest'  # built from main by ko
```
