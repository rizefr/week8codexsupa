# How To Use The Workout Tracker Safely

Live app: https://week8codexsupa.netlify.app

This app saves your workout data two ways:

- **Local save:** saves immediately on the phone/browser you are using with IndexedDB/localStorage.
- **Cloud Sync:** saves to Supabase after you sign in with the email one-time login link.

The safest setup is to use Cloud Sync on your phone. Local save still works if you are not signed in or if your connection is bad.

## First-Time Phone Setup

1. Open https://week8codexsupa.netlify.app on your phone.
2. Go to **Settings**.
3. Find **Cloud sync**.
4. Enter your email.
5. Tap **Send magic link**.
6. Open the email on the same phone.
7. Tap the magic link.
8. Confirm you return to the workout tracker.
9. Go back to **Settings** and check that it says **Signed in** with your email.
10. Tap **Sync now** once.

Supabase may call this OTP, one-time password, or magic link. In this app, the normal flow is the email magic link. You do not need to remember a password.

## Daily Use Checklist

Before starting:

1. Open the live app on your phone.
2. Look at the save indicator.
3. If signed in, the app should eventually show **Saved to cloud** after edits.
4. If it says **Not signed in to cloud sync**, your data can still save locally, but it will not sync to other devices yet.

During a workout:

1. Open **Today** or tap **Start Today**.
2. Enter weight, reps or seconds, RIR, and set completion.
3. The app auto-saves after changes.
4. Watch the save indicator after editing sets.
5. Complete the workout when finished.

Before closing the browser:

1. Wait for the save indicator to stop saying **Saving...**.
2. Best state: **Saved to cloud**.
3. Also acceptable: **Saved locally** or **Offline, saved locally**.
4. If it says **Sync issue: tap to retry**, tap it once while online.
5. If the issue remains, do not delete the log. It is still saved locally, and you can export a backup from Settings.

## What The Save Messages Mean

| Message | Meaning | What to do |
|---|---|---|
| **Saved to cloud** | Your latest change saved to Supabase. | Safe to close. |
| **Saved locally** | Your latest change saved on this device. | Safe on this phone/browser. Sign in or sync for cloud backup. |
| **Saving...** | A save is currently running. | Wait before closing. |
| **Offline, saved locally** | The phone is offline or unstable, but local save worked. | Keep using it. Sync later when online. |
| **Sync issue: tap to retry** | Local save worked, cloud save failed or is pending. | Tap the indicator or go to Settings > Sync now. |
| **Not signed in to cloud sync** | Local save works, cloud sync is not active. | Sign in from Settings if you want phone/computer sync. |

## Logging Body Weight

1. Go to **Weight**.
2. Enter date, body weight, and optional note.
3. Save the entry.
4. Wait for **Saved to cloud** or **Saved locally**.
5. Close and reopen the app to confirm the entry appears in the list/chart.

## If You Log Before Signing In

This is okay.

1. The app saves the workout/body-weight entries locally.
2. Later, go to **Settings** and sign in with the magic link.
3. After sign-in, the app loads cloud data and merges it with local data.
4. Tap **Sync now**.
5. Local entries should remain visible and also upload to cloud.

The app is designed to avoid replacing real cloud data with empty local data or replacing real local data with empty cloud data.

## If Your Phone Has Bad Connection

Keep logging normally.

- Edits save locally first.
- Failed cloud saves are queued.
- When the phone comes back online, the app tries to sync automatically.
- You can also tap **Sync now** in Settings.

## Editing Old Workouts

1. Go to **History**.
2. Search/filter if needed.
3. Open the workout.
4. Edit sets, notes, cardio, or completion.
5. Wait for the save indicator.

Progress reports use the latest saved version of each workout log.

## Program Weeks And Cycles

The app does not stop after week 8.

- **Program Week 1-8** = Cycle 1.
- **Program Week 9-16** = Cycle 2.
- **Program Week 17-24** = Cycle 3.
- The weekly workout schedule repeats until you pause, complete, reset, or start a new cycle.

If no start date is set, the first workout you start becomes the program start date.

## Changing Settings Without Losing Data

You can safely change:

- Program start date
- Pause/resume status
- Mark complete
- Start new cycle
- Cloud Sync sign-in state

Changing the start date recalculates program week/cycle labels for existing logs. It does not delete workout logs or body-weight entries.

## Making Changes To The Website Code

Your workout logs are not stored in the website code.

Deploying a new version of the site should not erase your logs because:

- Cloud logs live in Supabase.
- Local logs live in your browser storage.
- Netlify deploys only replace the app files, not the Supabase database.

Before making bigger site changes, use **Settings > Export JSON** as a backup. After deploying, open the live app and confirm:

1. You are still signed in or can sign in again.
2. Settings still shows the correct email.
3. Workout history still appears.
4. Body weight entries still appear.
5. The save indicator can reach **Saved to cloud** after a small edit.

## Backup And Restore

To create a backup:

1. Go to **Settings**.
2. Tap **Export JSON**.
3. Keep the downloaded file somewhere safe.

To restore:

1. Go to **Settings**.
2. Tap **Import JSON**.
3. Choose the backup file.
4. Confirm the import.
5. Tap **Sync now** if signed in.

Import replaces the data currently loaded in that browser, so export a fresh backup first if you are unsure.

## Quick Troubleshooting

If a workout disappears:

1. Check **History** filters.
2. Check whether you are signed in under **Settings**.
3. Tap **Sync now**.
4. Reopen the same browser on the same phone; local data is browser-specific.
5. If needed, restore from JSON backup.

If the magic link does not return to the app:

1. Open the latest email only.
2. Use the link on the same phone/browser when possible.
3. Go back to https://week8codexsupa.netlify.app.
4. Check **Settings** for signed-in status.
5. Send the magic link again if needed.

If you see **Sync issue**:

1. Make sure the phone has internet.
2. Tap the sync status indicator.
3. Or go to **Settings > Sync now**.
4. If it still fails, export JSON and keep logging. Local save should still preserve your data.

## Best Habit

After each workout, wait until you see **Saved to cloud** before closing the tab. If you cannot get cloud sync at that moment, **Saved locally** is still enough to keep the data on that phone until you sync later.
