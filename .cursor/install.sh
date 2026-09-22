#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Whisper repository.
# Creates a project virtualenv and installs Whisper (editable) with dev deps.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# System dependencies:
#   - ffmpeg       : required at runtime to read/decode audio files
#   - python3-venv : provides `ensurepip` so we can create a virtualenv
# Install any that are missing. `rust`/`cargo` ship in the base image and are
# only needed if a prebuilt `tokenizers` wheel is unavailable.
PY_VENV_PKG="python$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')-venv"
NEED_APT=()
command -v ffmpeg >/dev/null 2>&1 || NEED_APT+=("ffmpeg")
python3 -c "import ensurepip" >/dev/null 2>&1 || NEED_APT+=("$PY_VENV_PKG")

if [ "${#NEED_APT[@]}" -gt 0 ]; then
  echo "Installing system packages: ${NEED_APT[*]}"
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends "${NEED_APT[@]}"
fi

VENV_DIR="$REPO_ROOT/.venv"
if [ ! -x "$VENV_DIR/bin/python" ]; then
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# setup.py imports `pkg_resources` at build time, which setuptools removed in
# v81+. Pin a compatible setuptools that still ships it, then build without
# isolation so this pinned version is used to build the package.
python -m pip install --upgrade pip
python -m pip install "setuptools<81" wheel

# This VM has no GPU, so install the CPU-only torch build (mirrors the project's
# CI, which uses cpuonly PyTorch). Doing this first means the editable install
# below sees torch already satisfied and skips the large CUDA wheels.
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Editable install so source edits are picked up immediately; the "dev" extra
# pulls in pytest for the test suite.
pip install -e ".[dev]" --no-build-isolation

# requirements.txt only lower-bounds transformers (>=4.19.0), which resolves to
# the 5.x line. Whisper's tokenizer relies on the `additional_special_tokens`
# API that transformers removed in 5.0, so constrain it to the 4.x line.
pip install "transformers<5"

echo "Whisper environment ready. Activate with: source .venv/bin/activate"
