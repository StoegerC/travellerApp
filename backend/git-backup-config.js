/**
 * Gemeinsame Konfiguration für backup-to-git.js (täglicher Snapshot-Push) und
 * routes/admin.js (Snapshot-Liste + gezielter Rollback) - beide arbeiten auf
 * demselben lokalen Klon desselben privaten Backup-Repos.
 */
require('dotenv').config();
const path = require('path');
const os   = require('os');

const REPO_URL  = process.env.BACKUP_REPO_URL || 'git@github.com:StoegerC/TravellerServerBackup.git';
const SSH_KEY   = process.env.BACKUP_SSH_KEY   || path.join(os.homedir(), '.ssh', 'traveller_backup_deploy');
const CLONE_DIR = process.env.BACKUP_DIR       || path.join(__dirname, 'data', 'git-backup');

const GIT_ENV = {
  ...process.env,
  GIT_SSH_COMMAND: `ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
};

module.exports = { REPO_URL, SSH_KEY, CLONE_DIR, GIT_ENV };
