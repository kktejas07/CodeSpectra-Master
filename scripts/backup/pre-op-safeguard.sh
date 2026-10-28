#!/bin/bash
# Pre-operation safeguard backup script
# Requirement: Takes immediate mongodump before destructive operations, saves to pre_op_<timestamp>.tar.gz, and prints the restore command.

LOG_FILE="/var/log/mongo_backup.log"
BACKUP_DIR="/root/mongo_backups"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

log_msg() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") [INFO] [SAFEGUARD] $1" >> "$LOG_FILE"
}

log_err() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") [ERROR] [SAFEGUARD] $1" >> "$LOG_FILE" >&2
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

log_msg "Initiating immediate pre-operation safeguard backup..."

# Find MongoDB container using docker ps format by name pattern
CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep -E "codespectra-mongo" | head -n 1)

if [ -z "$CONTAINER_NAME" ]; then
    log_err "MongoDB container not found by name pattern. Aborting pre-operation safeguard."
    exit 1
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TEMP_DUMP_DIR="/tmp/mongodump_$TIMESTAMP"
SAFEGUARD_FILE="$BACKUP_DIR/pre_op_$TIMESTAMP.tar.gz"

# Run mongodump inside container
docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
if ! run_mongodump "$CONTAINER_NAME" >> "$LOG_FILE" 2>&1; then
    log_err "Pre-operation mongodump failed."
    exit 1
fi

# Copy dump out of container
if ! docker cp "$CONTAINER_NAME":/tmp/mongodump "$TEMP_DUMP_DIR" >> "$LOG_FILE" 2>&1; then
    log_err "Failed to copy safeguard files out of container."
    docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
    exit 1
fi

# Compress to safeguard destination
if ! tar -czf "$SAFEGUARD_FILE" -C "$TEMP_DUMP_DIR" . >> "$LOG_FILE" 2>&1; then
    log_err "Failed to compress safeguard archive."
    rm -rf "$TEMP_DUMP_DIR"
    docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
    exit 1
fi

# Clean up temp
docker exec "$CONTAINER_NAME" rm -rf /tmp/mongodump
rm -rf "$TEMP_DUMP_DIR"

log_msg "Pre-operation safeguard backup completed. Saved to: $SAFEGUARD_FILE"

# Print restore command to stdout for the operator
echo "========================================================================"
echo "🛡️  PRE-OPERATION SAFEGUARD BACKUP COMPLETED"
echo "========================================================================"
echo "Backup File: $SAFEGUARD_FILE"
echo ""
echo "To RESTORE this backup immediately, run the following commands:"
echo ""
echo "1. docker exec -it $CONTAINER_NAME rm -rf /tmp/restore_extract"
echo "2. docker cp $SAFEGUARD_FILE $CONTAINER_NAME:/tmp/restore.tar.gz"
echo "3. docker exec -it $CONTAINER_NAME mkdir -p /tmp/restore_extract"
echo "4. docker exec -it $CONTAINER_NAME tar -xzf /tmp/restore.tar.gz -C /tmp/restore_extract"
echo "5. docker exec -it $CONTAINER_NAME mongorestore --gzip --drop /tmp/restore_extract"
echo "========================================================================"
