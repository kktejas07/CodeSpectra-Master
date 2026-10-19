#!/bin/bash
# MongoDB automated backup script
# Requirement: Connects to the MongoDB container, runs mongodump --gzip, packages it, manages retention, and logs results.

LOG_FILE="/var/log/mongo_backup.log"
BACKUP_DIR="/root/mongo_backups"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"

# Ensure directories exist
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

log_msg() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") [INFO] $1" >> "$LOG_FILE"
}

log_err() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") [ERROR] $1" >> "$LOG_FILE" >&2
}

# ── Credentials (SEC-017) ────────────────────────────────────────────────────
# Never hard-code the DB password here. The password that used to be committed
# here MUST be rotated and purged from git history (git filter-repo / BFG) —
# see docs/devops/06-Reverse-Proxy.md "Database backup credentials". Provide MONGO_BACKUP_URI (preferred) or
# MONGO_BACKUP_USER + MONGO_BACKUP_PASSWORD via the environment, or put them in
# /etc/codespectra/mongo-backup.env (root-owned, chmod 600). The URI is handed
# to mongodump through a 0600 --config file, so it never shows up in `ps`.
MONGO_BACKUP_ENV_FILE="${MONGO_BACKUP_ENV_FILE:-/etc/codespectra/mongo-backup.env}"
if [ -z "$MONGO_BACKUP_URI" ] && [ -f "$MONGO_BACKUP_ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$MONGO_BACKUP_ENV_FILE"; set +a
fi
if [ -z "$MONGO_BACKUP_URI" ] && [ -n "$MONGO_BACKUP_PASSWORD" ]; then
    MONGO_BACKUP_URI="mongodb://${MONGO_BACKUP_USER:-mongo}:${MONGO_BACKUP_PASSWORD}@localhost:27017/?authSource=admin"
fi
if [ -z "$MONGO_BACKUP_URI" ]; then
    log_err "MONGO_BACKUP_URI (or MONGO_BACKUP_PASSWORD) is not set — see $MONGO_BACKUP_ENV_FILE. Aborting."
    exit 1
fi

# run_mongodump <container>: writes the URI to a private config file inside the
# container, runs mongodump with --config, and always removes the file.
run_mongodump() {
    local c="$1"
    printf 'uri: "%s"\n' "$MONGO_BACKUP_URI" | docker exec -i "$c" sh -c 'umask 077; cat > /tmp/.mongodump.yml' || return 1
    docker exec "$c" mongodump --config=/tmp/.mongodump.yml --gzip --out=/tmp/mongodump
    local rc=$?
    docker exec "$c" rm -f /tmp/.mongodump.yml
    return $rc
}

log_msg "Starting MongoDB backup process..."

# Find MongoDB container using docker ps format by name pattern
CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep -E "codespectra-mongo" | head -n 1)

if [ -z "$CONTAINER_NAME" ]; then
    log_err "MongoDB container not found by name pattern. Aborting backup."
    exit 1
fi

log_msg "Found MongoDB container: $CONTAINER_NAME"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TEMP_DUMP_DIR="/tmp/mongodump_$TIMESTAMP"
TEMP_ARCHIVE="/tmp/mongo_backup_$TIMESTAMP.tar.gz"

# Run mongodump inside container
log_msg "Executing mongodump inside container..."
docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
if ! run_mongodump "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1; then
    log_err "mongodump execution failed."
    exit 1
fi

# Copy dump out of container
log_msg "Copying dump out of container..."
if ! docker cp "$CONTAINER_NAME":/tmp/mongodump "$TEMP_DUMP_DIR" >> "$LOG_FILE" 2>&1; then
    log_err "Failed to copy backup files out of container."
    docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
    exit 1
fi

# Compress to .tar.gz file
log_msg "Creating tar.gz archive..."
if ! tar -czf "$TEMP_ARCHIVE" -C "$TEMP_DUMP_DIR" . >> "$LOG_FILE" 2>&1; then
    log_err "Failed to create compressed archive."
    rm -rf "$TEMP_DUMP_DIR"
    docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
    exit 1
fi

# Verify archive integrity with tar -tzf
log_msg "Verifying archive integrity..."
if ! tar -tzf "$TEMP_ARCHIVE" > /dev/null 2>&1; then
    log_err "Archive integrity verification failed."
    rm -rf "$TEMP_DUMP_DIR" "$TEMP_ARCHIVE"
    docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
    exit 1
fi

# Store daily backup
log_msg "Saving to daily backup directory..."
cp "$TEMP_ARCHIVE" "$DAILY_DIR/backup_$TIMESTAMP.tar.gz"

# On Mondays, also copy to weekly
DAY_OF_WEEK=$(date +"%u")
if [ "$DAY_OF_WEEK" -eq 1 ]; then
    log_msg "Today is Monday, copying to weekly backup directory..."
    cp "$TEMP_ARCHIVE" "$WEEKLY_DIR/backup_$TIMESTAMP.tar.gz"
fi

# Retention management
log_msg "Enforcing retention policies (30 days daily, 90 days weekly)..."
find "$DAILY_DIR" -name "backup_*.tar.gz" -mtime +30 -exec log_msg "Deleting daily backup: {}" \; -exec rm -f {} \;
find "$WEEKLY_DIR" -name "backup_*.tar.gz" -mtime +90 -exec log_msg "Deleting weekly backup: {}" \; -exec rm -f {} \;

# Cleanup temporary files
log_msg "Cleaning up temporary files..."
docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
rm -rf "$TEMP_DUMP_DIR" "$TEMP_ARCHIVE"

log_msg "MongoDB backup completed successfully."
