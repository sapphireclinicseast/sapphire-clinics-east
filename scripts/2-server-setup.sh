#!/bin/bash
# ============================================================
# SAPPHIRE Marketing Hub — Step 2: Server Setup
# ============================================================
# Run this ONCE on the VPS after uploading the code.
# Installs Docker, Docker Compose, sets up firewall.
# ============================================================

set -e

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SAPPHIRE Marketing Hub — Server Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Update system ─────────────────────────────────────────
echo "→ Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────
echo "→ Installing Docker..."
if ! command -v docker &> /dev/null; then
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  # Detect OS (Ubuntu vs Debian)
  OS_ID=$(. /etc/os-release && echo "$ID")
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "✅  Docker installed."
else
  echo "✅  Docker already installed."
fi

# ── 3. Set up directories ────────────────────────────────────
echo "→ Creating app directories..."
mkdir -p /opt/sapphire/uploads
mkdir -p /opt/sapphire/docker
chmod 755 /opt/sapphire/uploads
echo "✅  Directories created."

# ── 4. Set up firewall ───────────────────────────────────────
echo "→ Configuring firewall (UFW)..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "✅  Firewall configured (SSH, HTTP, HTTPS allowed)."

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅  Server setup complete!"
echo ""
echo "  Next step — create your .env file:"
echo ""
echo "  cp /opt/sapphire/docker/.env.production.example \\"
echo "     /opt/sapphire/docker/.env.production"
echo ""
echo "  nano /opt/sapphire/docker/.env.production"
echo ""
echo "  (Edit: change POSTGRES_PASSWORD and NEXTAUTH_SECRET)"
echo ""
echo "  Then run:"
echo "  bash /opt/sapphire/scripts/3-start-app.sh"
echo "═══════════════════════════════════════════════════════"
echo ""
