#!/bin/bash
# automated setup script for MongoDB backup system on VPS server
# Run as root.

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root."
  exit 1
fi

echo "Setting up MongoDB backup directories..."
mkdir -p /root/mongo_backups/daily
mkdir -p /root/mongo_backups/weekly
mkdir -p /root/bin

echo "Installing backup scripts..."
cp backup_mongo.sh /root/backup_mongo.sh
cp pre-op-safeguard.sh /root/bin/pre-op-safeguard.sh

echo "Making scripts executable..."
chmod +x /root/backup_mongo.sh
chmod +x /root/bin/pre-op-safeguard.sh

echo "Preparing credentials file (SEC-017: no password in the scripts)..."
mkdir -p /etc/codespectra
if [ ! -f /etc/codespectra/mongo-backup.env ]; then
  umask 077
  cat > /etc/codespectra/mongo-backup.env <<'ENVEOF'
# Fill in, then: chmod 600 /etc/codespectra/mongo-backup.env
# MONGO_BACKUP_URI="mongodb://<user>:<password>@localhost:27017/?authSource=admin"
ENVEOF
  echo "⚠️  Edit /etc/codespectra/mongo-backup.env and set MONGO_BACKUP_URI before the first run."
fi
chmod 600 /etc/codespectra/mongo-backup.env

echo "Initializing backup log file..."
touch /var/log/mongo_backup.log
chmod 640 /var/log/mongo_backup.log

echo "Configuring cron jobs..."
# Retrieve current crontab
crontab -l > /tmp/current_cron 2>/dev/null || touch /tmp/current_cron

# Remove duplicate entries if any
sed -i '/backup_mongo.sh/d' /tmp/current_cron

# Append new cron jobs
echo "0 2 * * * /root/backup_mongo.sh >> /var/log/mongo_backup.log 2>&1" >> /tmp/current_cron
echo "0 */6 * * * /root/backup_mongo.sh >> /var/log/mongo_backup.log 2>&1" >> /tmp/current_cron

# Load new crontab
crontab /tmp/current_cron
rm -f /tmp/current_cron

echo "========================================================================"
echo "✅ MongoDB backup system successfully configured!"
echo "========================================================================"
echo "Backup Script:        /root/backup_mongo.sh"
echo "Safeguard Script:     /root/bin/pre-op-safeguard.sh"
echo "Daily Crontab:        0 2 * * *"
echo "6-Hourly Crontab:     0 */6 * * *"
echo "Backup Log:           /var/log/mongo_backup.log"
echo "Backup Directory:     /root/mongo_backups/ (daily/ and weekly/)"
echo "========================================================================"
