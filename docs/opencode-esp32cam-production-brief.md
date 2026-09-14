# OpenCode Brief — Official ESP32-CAM Production Firmware

## Context

The current file `firmware/esp32cam/esp32cam.ino` is a development/test baseline. It contains the current camera capture and upload structure, but it must not be treated as the final official production firmware.

The repository status currently records the ESP32-CAM firmware as **code exists, flashed unknown**. Production flashing, commissioning, and a complete end-to-end hardware test have not yet been verified.

Keep the current sketch as a reference until the production implementation has been tested. Do not delete or overwrite the baseline prematurely.

## Existing contracts

The current firmware uses these paths:

- `GET /config`
- `POST /core/photo`
- `POST /yolo-scan`
- `POST /yolo-scan/done`

The production firmware must remain compatible with the existing n8n workflow and webhook contracts unless a coordinated contract change is documented first.

The ESP32-CAM is the camera device. n8n is the orchestration layer. n8n cannot directly trigger the camera shutter, so fully automatic operation must be implemented in the firmware.

## Required final behavior

Implement a clearly named production firmware file, preferably:

```text
firmware/esp32cam/esp32cam_production.ino
```

The final firmware must:

1. Connect to Wi-Fi using local, gitignored secrets.
2. Synchronize time through NTP and use UTC for all timestamps.
3. Poll `GET /config` and use the returned configuration/schedule where available.
4. Automatically capture and upload daily photos through `POST /core/photo`.
5. Automatically perform the scheduled plant scan without requiring dashboard confirmation.
6. Upload scan images through `POST /yolo-scan`.
7. Send `POST /yolo-scan/done` after the scan upload completes.
8. Include the device ID, capture timestamp, and battery percentage in every applicable upload.
9. Support safe retry behavior for Wi-Fi, HTTP, and temporary server failures.
10. Prevent duplicate uploads after reboot or retry.
11. Handle missing or stale configuration safely.
12. Enter a low-power state where appropriate, while preserving the scheduled-capture behavior.
13. Never activate plant hardware directly; watering and heating remain controlled by the WROOM workflow and its safety guardrails.
14. Keep the camera statically mounted; do not add servo, pan/tilt, GT2, or camera-aiming logic.
15. Preserve a manual diagnostic/capture path if it is useful for commissioning, but it must not be required for normal autonomous operation.

## Autonomous scan design

The intended production flow is:

```text
n8n weekly scheduler
  -> creates an informational dashboard reminder only
  -> opens or marks the scan window automatically
  -> ESP32-CAM obtains schedule/configuration
  -> ESP32-CAM captures automatically
  -> POST /yolo-scan
  -> Vision Analyst + YOLO Analyst + Judge
  -> DiseaseScans row
  -> optional treatment and human verification steps
  -> POST /yolo-scan/done
  -> n8n closes the scan session
```

The dashboard notification must not be a blocking `Wait Camera Positioned` approval. The user may receive a reminder, but no response should be required to authorize the camera capture.

Human-in-the-loop remains appropriate for:

- verifying a possible disease verdict;
- correcting a wrong verdict;
- recording treatment outcome;
- other safety or learning feedback.

It must not be required for the camera to take a scheduled photo.

## Reliability requirements

Implement and document:

- connection timeout values;
- retry count and backoff;
- behavior when `GET /config` fails;
- behavior when an upload receives a non-2xx response;
- duplicate prevention after reboot;
- scan-day/session bookkeeping;
- NTP failure behavior;
- camera capture failure behavior;
- brownout or power-loss recovery;
- whether deep sleep is used and how the next wake time is calculated.

Use UTC internally. Do not hard-code production URLs or credentials. Read the base URL from `esp32camsecrets.h` or an equivalent gitignored configuration file.

## Required tests

Add or document tests for:

1. Camera initialization and JPEG capture.
2. NTP synchronization and UTC timestamp formatting.
3. Configuration retrieval from `/config`.
4. Daily photo upload to `/core/photo`.
5. Scheduled scan upload to `/yolo-scan`.
6. Scan completion upload to `/yolo-scan/done`.
7. Battery percentage inclusion.
8. Wi-Fi failure and recovery.
9. n8n timeout and retry behavior.
10. Server error response behavior.
11. Reboot during a pending upload.
12. Duplicate-capture prevention.
13. Missing/stale configuration fallback.
14. Full end-to-end test against the deployed n8n workflow.

A test is only considered complete when the received payload, HTTP response, and resulting n8n/Sheets behavior are recorded.

## Definition of done

The production firmware is ready only when:

- the final source file is clearly separated from the test baseline;
- secrets remain outside Git;
- the camera can capture automatically without dashboard approval;
- daily and scan uploads reach the correct webhook paths;
- `/yolo-scan/done` closes the scan session correctly;
- retries do not create duplicate event/scan rows;
- battery and UTC timestamps are present;
- the firmware has been flashed to the real ESP32-CAM;
- a real end-to-end run is verified in n8n, Google Drive, Google Sheets, and the dashboard;
- `STATUS.md` and the firmware documentation state exactly what was tested and what remains unknown.

## OpenCode working rules

Do not silently change the n8n contracts, Google Sheets schemas, or workflow semantics. If a contract change is necessary, document it and update the corresponding workflow, firmware, and docs together.

Do not claim the firmware is production-ready merely because it compiles or because a curl request works from the VPS. The physical camera must be flashed and tested.

Do not enable physical watering/heating as part of this task. Keep the existing dry-run and safety architecture intact.
