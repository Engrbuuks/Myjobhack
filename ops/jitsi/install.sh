#!/usr/bin/env bash
# ============================================================
# MyJobHack interview rooms: install Jitsi on an Oracle Always Free server.
#
# Run on a fresh Ubuntu 24.04 server, as the ubuntu user:
#
#   DOMAIN=meet.myjobhack.co EMAIL=you@example.com bash install.sh
#
# What it does, in order:
#   1. installs Docker
#   2. opens the three ports Jitsi needs in the server's own firewall
#   3. downloads the official Jitsi Docker release
#   4. configures it so NOBODY can enter a room without a pass signed by
#      MyJobHack (no guests, no open rooms), with a free HTTPS certificate
#   5. starts it, and prints the three values to put in Vercel
#
# Safe to run again: it keeps the existing signing secret, so links already
# sent keep working.
# ============================================================
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, for example DOMAIN=meet.myjobhack.co}"
EMAIL="${EMAIL:?Set EMAIL, the address for the HTTPS certificate notices}"
APP_ID="${APP_ID:-myjobhack}"
DIR="$HOME/jitsi"
CFG="$HOME/.jitsi-meet-cfg"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1 of 5  Installing Docker"
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-v2 curl tar netfilter-persistent iptables-persistent
sudo systemctl enable --now docker

say "2 of 5  Opening ports 80, 443 (web) and 10000 UDP (video)"
# Oracle's Ubuntu images block everything not explicitly allowed, in the
# server itself as well as in the cloud console. Both must be opened; the
# console side is in README.md step 3.
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 10000"; do
  # shellcheck disable=SC2086
  if ! sudo iptables -C INPUT $rule -j ACCEPT 2>/dev/null; then
    # Just above the image's catch all REJECT, or at the end if there is none.
    n=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    # shellcheck disable=SC2086
    if [ -n "$n" ]; then sudo iptables -I INPUT "$n" $rule -j ACCEPT; else sudo iptables -A INPUT $rule -j ACCEPT; fi
  fi
done
sudo netfilter-persistent save

say "3 of 5  Downloading the official Jitsi Docker release"
if [ ! -d "$DIR" ]; then
  url=$(curl -fsSL https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest \
        | grep -m1 '"tarball_url"' | cut -d'"' -f4)
  mkdir -p "$DIR"
  curl -fsSL "$url" | tar -xz -C "$DIR" --strip-components=1
fi
cd "$DIR"

say "4 of 5  Configuring private, pass only rooms"
if [ ! -f .env ]; then
  cp env.example .env
  ./gen-passwords.sh
fi

# Remove every copy of a setting, commented or not, then write it once, so
# the example file's commented samples can never leave two values behind.
setenv() {
  sed -i -E "/^#?[[:space:]]*$1=/d" .env
  echo "$1=$2" >> .env
}

# Keep the secret across reruns: changing it would break every link already sent.
SECRET=$(grep -E '^JWT_APP_SECRET=' .env | head -n1 | cut -d= -f2- || true)
if [ -z "$SECRET" ]; then SECRET=$(openssl rand -hex 32); fi

PUBLIC_IP=$(curl -fsS https://ifconfig.me || curl -fsS https://api.ipify.org)

setenv CONFIG "$CFG"
setenv TZ "Africa/Lagos"
setenv HTTP_PORT 80
setenv HTTPS_PORT 443
setenv PUBLIC_URL "https://$DOMAIN"
setenv ENABLE_HTTP_REDIRECT 1
setenv ENABLE_LETSENCRYPT 1
setenv LETSENCRYPT_DOMAIN "$DOMAIN"
setenv LETSENCRYPT_EMAIL "$EMAIL"
# Nobody in without a pass from MyJobHack.
setenv ENABLE_AUTH 1
setenv AUTH_TYPE jwt
setenv ENABLE_GUESTS 0
setenv JWT_APP_ID "$APP_ID"
setenv JWT_APP_SECRET "$SECRET"
setenv JWT_ACCEPTED_ISSUERS "$APP_ID"
setenv JWT_ACCEPTED_AUDIENCES jitsi
# Tell the video bridge its public address, or calls connect but show no video.
setenv JVB_ADVERTISE_IPS "$PUBLIC_IP"
setenv DOCKER_HOST_ADDRESS "$PUBLIC_IP"

mkdir -p "$CFG"/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}

say "5 of 5  Starting Jitsi"
sudo docker compose up -d

cat <<EOF

============================================================
 Done. In a minute or two, https://$DOMAIN should show Jitsi.

 Put these three in Vercel (Project, Settings, Environment
 Variables), then redeploy MyJobHack:

   JITSI_DOMAIN      $DOMAIN
   JITSI_APP_ID      $APP_ID
   JITSI_APP_SECRET  $SECRET

 Keep the secret private, like a password. It is also saved
 in $DIR/.env on this server.

 Then in MyJobHack: Settings, Video rooms, Check the server,
 then Switch on.
============================================================
EOF
