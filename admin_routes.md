# Live Classes - Admin API Routes

## Base URL
```
/api/admin/live-classes
```

## Authentication
All routes require **Admin authentication** via JWT Bearer token.

```
Authorization: Bearer <admin_token>
```

---

## Endpoints

### 1. Create Live Class

```http
POST /api/admin/live-classes
```

Create a new live class for a course.

**Request Body:**
```json
{
  "courseId": "string (required)",
  "title": "string (required, max 200 chars)",
  "description": "string (optional, max 2000 chars)",
  "scheduledAt": "ISO 8601 datetime (required)",
  "durationMinutes": "number (5-480, default: 60)",
  "meetingUrl": "string URL (required)",
  "batchId": "string (optional)"
}
```

**Example Request:**
```json
{
  "courseId": "695d9f75338db7c0697100e4",
  "title": "Introduction to Vastu Shastra",
  "description": "Learn the fundamentals of Vastu",
  "scheduledAt": "2026-01-15T10:00:00.000Z",
  "durationMinutes": 90,
  "meetingUrl": "https://zoom.us/j/1234567890"
}
```

**Response:** `201 Created`
```json
{
  "id": "695d9f76e55dc5198fe5ec11",
  "courseId": "695d9f75338db7c0697100e4",
  "batchId": null,
  "title": "Introduction to Vastu Shastra",
  "description": "Learn the fundamentals of Vastu",
  "scheduledAt": "2026-01-15T10:00:00.000Z",
  "durationMinutes": 90,
  "meetingUrl": "https://zoom.us/j/1234567890",
  "recordingUrl": null,
  "status": "SCHEDULED",
  "notifySent": false,
  "recordingNotifySent": false,
  "createdAt": "2026-01-06T23:49:10.459Z",
  "updatedAt": "2026-01-06T23:49:10.459Z",
  "course": {
    "id": "695d9f75338db7c0697100e4",
    "title": "Vastu Course"
  }
}
```

---

### 2. Get Live Class by ID

```http
GET /api/admin/live-classes/:id
```

**Response:** `200 OK`
```json
{
  "id": "695d9f76e55dc5198fe5ec11",
  "courseId": "695d9f75338db7c0697100e4",
  "title": "Introduction to Vastu Shastra",
  "status": "SCHEDULED",
  ...
}
```

---

### 3. Get All Live Classes for a Course

```http
GET /api/admin/live-classes/course/:courseId
```

**Response:** `200 OK`
```json
[
  {
    "id": "695d9f76e55dc5198fe5ec11",
    "title": "Introduction to Vastu Shastra",
    "scheduledAt": "2026-01-15T10:00:00.000Z",
    "status": "SCHEDULED",
    ...
  },
  {
    "id": "695d9f76e55dc5198fe5ec12",
    "title": "Advanced Vastu Techniques",
    "scheduledAt": "2026-01-20T10:00:00.000Z",
    "status": "COMPLETED",
    ...
  }
]
```

---

### 4. Update Live Class

```http
PATCH /api/admin/live-classes/:id
```

Update live class details. All fields are optional.

**Request Body:**
```json
{
  "title": "string (optional)",
  "description": "string (optional)",
  "scheduledAt": "ISO 8601 datetime (optional)",
  "durationMinutes": "number (optional)",
  "meetingUrl": "string URL (optional)",
  "batchId": "string (optional)"
}
```

**Response:** `200 OK`

---

### 5. Mark as Live

```http
POST /api/admin/live-classes/:id/live
```

Mark a scheduled class as currently live.

**Status Change:** `SCHEDULED` → `LIVE`

**Response:** `200 OK`
```json
{
  "id": "695d9f76e55dc5198fe5ec11",
  "status": "LIVE",
  ...
}
```

---

### 6. Mark as Completed

```http
PATCH /api/admin/live-classes/:id/complete
```

Mark a live class as completed.

**Status Change:** `LIVE` or `SCHEDULED` → `COMPLETED`

**Response:** `200 OK`
```json
{
  "id": "695d9f76e55dc5198fe5ec11",
  "status": "COMPLETED",
  ...
}
```

---

### 7. Upload Recording

```http
POST /api/admin/live-classes/:id/recording
```

Set recording URL for a completed class.

**Request Body:**
```json
{
  "recordingUrl": "https://example.com/recordings/class-recording.mp4"
}
```

**Response:** `200 OK`
```json
{
  "id": "695d9f76e55dc5198fe5ec11",
  "recordingUrl": "https://example.com/recordings/class-recording.mp4",
  "status": "COMPLETED",
  ...
}
```

---

### 8. Trigger Notification

```http
POST /api/admin/live-classes/:id/notify
```

Manually send push notification to all enrolled students.

**Response:** `200 OK`
```json
{
  "message": "Notification sent successfully"
}
```

**Notification Payload (sent to FCM):**
```json
{
  "notification": {
    "title": "🔴 Live Class Starting Soon!",
    "body": "Introduction to Vastu - Vastu Course is starting in 30 minutes"
  },
  "data": {
    "type": "LIVE_CLASS",
    "classId": "695d9f76e55dc5198fe5ec11",
    "courseId": "695d9f75338db7c0697100e4",
    "meetingUrl": "https://zoom.us/j/1234567890"
  }
}
```

---

### 9. Delete Live Class

```http
DELETE /api/admin/live-classes/:id
```

**Response:** `200 OK`
```json
{
  "message": "Live class deleted successfully"
}
```

---

## Status Values

| Status | Description |
|--------|-------------|
| `SCHEDULED` | Class is scheduled for future |
| `LIVE` | Class is currently in progress |
| `COMPLETED` | Class has ended |

---

## Error Responses

**400 Bad Request:**
```json
{
  "error": "Scheduled time must be in the future"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**403 Forbidden:**
```json
{
  "error": "Admin access required"
}
```

**404 Not Found:**
```json
{
  "error": "Live class not found"
}
```

---

## Automatic Features

### Notification Worker
- Runs every **5 minutes**
- Sends notifications **30 minutes** before scheduled time
- Auto-updates status: `SCHEDULED` → `LIVE` → `COMPLETED`

### Recording Notifications
- When recording URL is set, notification is automatically queued
- Sent to all enrolled students with registered device tokens
