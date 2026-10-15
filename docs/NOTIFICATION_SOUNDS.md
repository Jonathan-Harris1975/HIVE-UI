# HIVE Elements notification sound map

Source: `upload/hive_commshub_sounds.zip` from the implementation request. The archive contains MP3 and WAV encodings and no mapping README. MP3 files were decoded successfully with FFmpeg; HIVE Elements serves these supplied MP3s from `public/audio/hive/`.

| Event | Source filename | Served path | Default |
| --- | --- | --- | --- |
| Weekly report ready | `hive_1_weekly_report_ready.mp3` | `/audio/hive/hive_1_weekly_report_ready.mp3` | Silent; optional in settings |
| Review required | `hive_2_review_required.mp3` | `/audio/hive/hive_2_review_required.mp3` | Enabled |
| Critical / service blocked | `hive_3_critical.mp3` | `/audio/hive/hive_3_critical.mp3` | Enabled |
| Resolved / confirmation | `hive_4_confirmation.mp3` | `/audio/hive/hive_4_confirmation.mp3` | Silent; optional in settings |

Settings use browser local storage, provide a master switch, per-event switches, volume, Test Sound and browser permission request. Only new events explicitly categorized `review_required`, `service_blocked`, `weekly_report_ready`, or `resolved`, or marked `details.requires_action`, are eligible. Routine activity stays silent. Audio errors are swallowed so the visible event remains available. Opening an event records a local acknowledgement without changing its technical status.
