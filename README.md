# SCEI Encrypted Backups

All files in this branch are AES-256-CBC encrypted.
Decrypt: openssl enc -d -aes-256-cbc -pbkdf2 -in <file> -out <file.dec>
Passphrase is on the VPS at /root/.scei-backup-passphrase (root only).

Schedule: daily at 03:30 UTC. Branch: backups-encrypted.
