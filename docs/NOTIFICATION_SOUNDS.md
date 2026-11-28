# HIVE Elements notification sound map

Source: `upload/hive_commshub_sounds.zip` from the implementation request. The archive contains MP3 and WAV encodings and no mapping README. MP3 files were decoded successfully with FFmpeg; HIVE Elements serves these supplied MP3s from `public/audio/hive/`.

| Event | Source filename | Served path | Default |
| --- | --- | --- | --- |
| Weekly report ready | `hive_1_weekly_report_ready.mp3` | `/audio/hive/hive_1_weekly_report_ready.mp3` | Silent; optional in settings |
| Review required | `hive_2_review_required.mp3` | `/audio/hive/hive_2_review_required.mp3` | Enabled |
| Critical / service blocked | `hive_3_critical.mp3` | `/audio/hive/hive_3_critical.mp3` | Enabled |
| Resolved / confirmation | `hive_4_confirmation.mp3` | `/audio/hive/hive_4_confirmation.mp3` | Silent; optional in settings |

Settings use browser local storage, provide a master switch, per-event switches, volume, Test Sound and browser permission request. Only new events explicitly categorized `review_required`, `service_blocked`, `weekly_report_ready`, or `resolved`, or marked `details.requires_action`, are eligible. Routine activity stays silent. Audio errors are swallowed so the visible event remains available. Opening an event records a local acknowledgement without changing its technical status.

When AIMS Comms Hub is embedded in HIVE-UI, newly received actionable AIMS alerts are relayed to the HIVE parent and use this same browser notification permission. The bridge accepts only the AIMS origin and the embedded frame, and displays generic alert text rather than message subjects or bodies. HIVE must be open with the Communications page loaded to receive these relayed alerts; The separate opt-in background channel described below does not require the Communications page to be open.

The Operations page continues its existing 60-second refresh while an authenticated tab is hidden, subject to browser throttling. The first successful snapshot establishes the event baseline without replaying old alerts. The AIMS iframe explicitly delegates autoplay to its fixed trusted origin, but browser activation, device sound and notification preferences still apply. These foreground mechanisms do not themselves provide signed-out delivery.

On supported browsers a notification-only service worker displays generic persistent system alerts, with desktop constructor fallback. The worker does not intercept network requests, cache data, poll APIs or retain session credentials. Clicking an alert opens the corresponding authenticated HIVE workspace; OS notification settings determine system sound. Grant permission on a trusted device before expecting system alerts.


## Trusted-device background alerts

The HIVE gateway provides an independent, opt-in Web Push channel using its always-on Worker and a SQLite Durable Object. It reads only eligible alert IDs and timestamps from the existing HIVE and AIMS D1 stores, with AIMS restricted to the configured handoff actor plus the explicitly scoped legacy system inbox for the HIVE administrator. No backend service is woken by the dispatcher. No new secrets need to be provisioned manually: the object generates and persists its VAPID key pair.

Sign in, open the existing notification settings, select **Enable or renew on this device**, then **Send background test**. Confirm actual device delivery (provider acceptance alone is insufficient). Sign out, close the tab, and confirm a newly created, eligible alert is received on that device. Device settings and browser support govern OS sound and closed-browser delivery; custom MP3 playback is a foreground feature. In-app audio and background system alerts may both occur when the workspace is open. The independent background opt-in is not controlled by the foreground volume switch.

Registration lasts 90 days; up to five devices are supported. Disable the current device or revoke all devices while signed in. Registration begins at the current time, without replaying the historical inbox. The dispatcher checks every two minutes while devices are registered, coalesces qualifying events, uses a bounded 24-hour catch-up window and retries failed sends up to three times. Expired push endpoints are removed. It never transmits message content, credentials or account identifiers to a push provider. The notification opens HIVE and normal authentication still applies.

AIMS routes the reserved admin system-alert inbox (system, failure, handoff, callback, content review, SLA and escalation) to the verified delegated hive-owner administrator without changing record ownership, IDs or email delivery state. The push source applies that same scope only when HIVE_COMMS_ACTOR is hive-owner and HIVE_COMMS_ROLE is admin; other actors and private admin assignments or mentions remain excluded. Historical notifications are visible in the inbox, not replayed as new push alerts. Verify provider acceptance, actual notification display/sound, revocation, identity isolation, and absence of Koyeb wake-ups on real devices before production acceptance.
