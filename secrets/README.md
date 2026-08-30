# Credentials

Nothing in this directory is committed. It holds the two files that make push
delivery possible:

- `firebase-service-account.json` — Firebase console → Project settings →
  Service accounts → **Generate new private key**. Used by
  `scripts/send-notifications.mjs` to authenticate with FCM.

The Android build also needs `apps/mobile/google-services.json`, downloaded from
the same project when you register the Android app. That one lives beside the app
rather than here, because the Expo build looks for it there.

Neither file should ever be pasted into a chat, a commit, or an issue.
