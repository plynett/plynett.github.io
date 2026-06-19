# `scripts/create_user.py`

Creates or updates local testing users for the lightweight CelerisAgent access gate.

Use this script after manually approving a request from the admin panel. It writes password hashes to `workspace/auth/users.json`; it does not store plaintext passwords.

Example:

```bash
python CelerisAgent/scripts/create_user.py user@example.com "User Name" --password temporary-password
```

Add `--admin` only for users who should see access requests.
