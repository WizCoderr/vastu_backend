# API Routes Documentation


## 🎓 Student Routes
**Base URL**: `/api/student`
**Auth**: Requires Bearer Token (Student Role)

### 👤 Identity
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/logout` | Invalidate the current session. |
| `PUT` | `/profile` | Update user profile information. |
| `POST` | `/device-token` | Register a device token (FCM) for push notifications. |
| `DELETE` | `/device-token` | Remove a device token (e.g., on logout). |

### 📚 Courses & Content
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/courses` | List all available courses (catalogue). |
| `GET` | `/enrolled-courses` | List courses the student is currently subscribed to. |
| `GET` | `/courses/:id` | Get public details of a course. |
| `GET` | `/courses/:id/curriculum` | **(Enrolled Only)** Get full sections, lectures, and progress. |
| `GET` | `/lectures/:lectureId/stream-url` | **(Enrolled Only)** Get the video stream URL. Returns either a signed S3 URL or external URL. |
| `POST` | `/progress/update` | Update lecture completion progress. |

### 🔴 Live Classes
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/live-classes/today` | Get live sessions scheduled for today. |
| `GET` | `/live-classes/upcoming` | Get upcoming live sessions. |
| `GET` | `/course/:courseId/recordings` | Get past recordings for live sessions in a course. |
