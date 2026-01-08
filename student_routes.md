# Live Classes - Student API Routes

## Base URL
```
/api/student
```

## Authentication
All routes require **Student authentication** via JWT Bearer token.

```
Authorization: Bearer <student_token>
```

---

## Endpoints

### 1. Get Today's Live Classes

```http
GET /api/student/live-classes/today
```

Get all live classes scheduled for today for the student's enrolled courses.

**Response:** `200 OK`
```json
[
  {
    "id": "695d9f76e55dc5198fe5ec11",
    "courseId": "695d9f75338db7c0697100e4",
    "courseName": "Vastu Course",
    "batchId": null,
    "title": "Introduction to Vastu Shastra",
    "description": "Learn the fundamentals of Vastu",
    "scheduledAt": "2026-01-07T10:00:00.000Z",
    "durationMinutes": 90,
    "status": "SCHEDULED",
    "meetingUrl": null,
    "canJoin": false,
    "startsIn": 120
  },
  {
    "id": "695d9f76e55dc5198fe5ec12",
    "courseId": "695d9f75338db7c0697100e4",
    "courseName": "Vastu Course",
    "title": "Advanced Techniques",
    "scheduledAt": "2026-01-07T14:00:00.000Z",
    "status": "LIVE",
    "meetingUrl": "https://zoom.us/j/1234567890",
    "canJoin": true,
    "startsIn": 0
  }
]
```

---

### 2. Get Upcoming Live Classes

```http
GET /api/student/live-classes/upcoming
```

Get all future live classes for enrolled courses.

**Response:** `200 OK`
```json
[
  {
    "id": "695d9f76e55dc5198fe5ec11",
    "courseId": "695d9f75338db7c0697100e4",
    "courseName": "Vastu Course",
    "title": "Introduction to Vastu Shastra",
    "scheduledAt": "2026-01-15T10:00:00.000Z",
    "durationMinutes": 90,
    "status": "SCHEDULED",
    "meetingUrl": null,
    "canJoin": false,
    "startsIn": 11520
  }
]
```

---

### 3. Get Course Recordings

```http
GET /api/student/course/:courseId/recordings
```

Get all available recordings for a specific course. Student must be enrolled.

**Response:** `200 OK`
```json
[
  {
    "id": "695d9f76e55dc5198fe5ec11",
    "title": "Introduction to Vastu Shastra",
    "description": "Learn the fundamentals of Vastu",
    "scheduledAt": "2026-01-07T10:00:00.000Z",
    "durationMinutes": 90,
    "recordingUrl": "https://example.com/recordings/intro-vastu.mp4"
  },
  {
    "id": "695d9f76e55dc5198fe5ec12",
    "title": "Advanced Techniques",
    "description": "Deep dive into advanced concepts",
    "scheduledAt": "2026-01-08T10:00:00.000Z",
    "durationMinutes": 120,
    "recordingUrl": "https://example.com/recordings/advanced-vastu.mp4"
  }
]
```

**Error (Not Enrolled):** `403 Forbidden`
```json
{
  "error": "You are not enrolled in this course"
}
```

---

### 4. Register Device Token

```http
POST /api/student/device-token
```

Register FCM device token for push notifications.

**Request Body:**
```json
{
  "token": "fcm_device_token_string",
  "platform": "android"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | FCM device token |
| platform | string | No | `android`, `ios`, or `web` (default: `android`) |

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Device token registered"
}
```

---

### 5. Remove Device Token

```http
DELETE /api/student/device-token
```

Remove FCM device token (call on logout).

**Request Body:**
```json
{
  "token": "fcm_device_token_string"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Device token removed"
}
```

---

## Response Fields Explained

### Live Class Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique live class ID |
| `courseId` | string | Associated course ID |
| `courseName` | string | Course title |
| `batchId` | string \| null | Optional batch identifier |
| `title` | string | Live class title |
| `description` | string \| null | Class description |
| `scheduledAt` | string | ISO 8601 scheduled start time |
| `durationMinutes` | number | Duration in minutes |
| `status` | string | `SCHEDULED`, `LIVE`, or `COMPLETED` |
| `meetingUrl` | string \| null | Meeting link (only when `canJoin=true`) |
| `canJoin` | boolean | Whether student can join now |
| `startsIn` | number | Minutes until class starts (0 if started) |

---

## Meeting URL Access Rules

The `meetingUrl` is only visible when:

1. **Class is LIVE** - `status === "LIVE"`
2. **Within time window** - Current time is within **15 minutes before** scheduled start to **end of class**

Outside these conditions:
- `meetingUrl` returns `null`
- `canJoin` returns `false`

---

## Push Notifications

### Notification Types

**1. Live Class Starting (30 min before)**
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

**2. Recording Available**
```json
{
  "notification": {
    "title": "📹 Recording Available!",
    "body": "The recording for \"Introduction to Vastu\" is now available"
  },
  "data": {
    "type": "RECORDING_AVAILABLE",
    "classId": "695d9f76e55dc5198fe5ec11",
    "courseId": "695d9f75338db7c0697100e4",
    "recordingUrl": "https://example.com/recordings/intro.mp4"
  }
}
```

---

## Error Responses

**400 Bad Request:**
```json
{
  "error": "FCM token is required"
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
  "error": "You are not enrolled in this course"
}
```

---

## Client Integration Example

### Android/iOS - Handling Notifications

```javascript
// When notification received
onNotificationReceived(notification) {
  const { type, classId, meetingUrl, recordingUrl } = notification.data;

  if (type === 'LIVE_CLASS') {
    // Open meeting URL or navigate to live class screen
    openUrl(meetingUrl);
  } else if (type === 'RECORDING_AVAILABLE') {
    // Navigate to recordings screen
    navigateTo('/recordings', { classId });
  }
}
```

### Registering Token on App Start

```javascript
async function registerForNotifications() {
  const token = await getFCMToken();

  await fetch('/api/student/device-token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: token,
      platform: Platform.OS // 'android' or 'ios'
    })
  });
}
```

### Removing Token on Logout

```javascript
async function logout() {
  const token = await getFCMToken();

  await fetch('/api/student/device-token', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });

  // Continue with logout...
}
```
