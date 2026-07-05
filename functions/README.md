# Manual licensing

Create license documents in Firestore at `licenses/{LICENSE-KEY}` with:

- `customerName`: string
- `plan`: `monthly` or `annual`
- `status`: `active`, `suspended`, or `expired`
- `expiresAt`: Firestore timestamp
- `maxDevices`: 2
- `graceDays`: 7
- `devices`: empty map
- `createdAt` and `updatedAt`: timestamps

Only Cloud Functions can read or modify these collections.
