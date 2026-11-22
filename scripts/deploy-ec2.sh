#!/usr/bin/env bash
set -euo pipefail

# Run from a terminal with SSH/network access after installing Docker on EC2.
: "${EC2_SSH_KEY:?Set EC2_SSH_KEY to the local path of the instance key pair}"
hotel_host="${EC2_HOST:-16.179.88.241}"
hotel_user="${EC2_USER:-ubuntu}"
hotel_remote_dir="${EC2_DEPLOY_DIR:-tripathe}"

[[ "$hotel_host" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid EC2_HOST' >&2; exit 1; }
[[ "$hotel_user" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid EC2_USER' >&2; exit 1; }
[[ "$hotel_remote_dir" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'EC2_DEPLOY_DIR must be a directory name' >&2; exit 1; }
[[ -f "$EC2_SSH_KEY" ]] || { echo 'SSH key file not found' >&2; exit 1; }

hotel_repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hotel_deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/tripathe-deploy.XXXXXX")"
trap 'rm -rf "$hotel_deploy_dir"' EXIT

# Deliberate file list: private env files, SSH keys and unrelated workspace
# artifacts are never included in the deployment bundle.
hotel_release_files=(
  .dockerignore .env.hotel.example package.json tsconfig.json tsconfig.build.json
  Dockerfile compose.yaml compose.ec2.yaml src deploy
)
if [[ -f "$hotel_repo_dir/package-lock.json" ]]; then hotel_release_files+=(package-lock.json); fi
tar -czf "$hotel_deploy_dir/release.tar.gz" -C "$hotel_repo_dir" "${hotel_release_files[@]}"

hotel_ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes -i "$EC2_SSH_KEY")
ssh "${hotel_ssh_options[@]}" "$hotel_user@$hotel_host" "mkdir -p '$hotel_remote_dir'"
scp "${hotel_ssh_options[@]}" "$hotel_deploy_dir/release.tar.gz" "$hotel_user@$hotel_host:$hotel_remote_dir/release.tar.gz"
ssh "${hotel_ssh_options[@]}" "$hotel_user@$hotel_host" bash -s -- "$hotel_remote_dir" <<'REMOTE'
set -euo pipefail
hotel_app_dir="$HOME/$1"
cd "$hotel_app_dir"
tar -xzf release.tar.gz
if [[ ! -f .env.hotel ]]; then cp .env.hotel.example .env.hotel; fi
sudo docker compose --env-file .env.hotel -f compose.yaml -f compose.ec2.yaml \
  up --build --detach --wait --wait-timeout 180
sudo docker compose --env-file .env.hotel -f compose.yaml -f compose.ec2.yaml ps
curl --fail --show-error --max-time 10 'http://127.0.0.1/health'
curl --fail --show-error --max-time 55 'http://127.0.0.1/api/hotels?city=delhi&minPrice=5000&maxPrice=6000'
REMOTE

printf '\nDeployment checks passed. Demo URL: http://%s/api/hotels?city=delhi\n' "$hotel_host"
