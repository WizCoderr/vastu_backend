
## 🛡️ Admin Routes
**Base URL**: `/api/admin`
**Auth**: Requires Bearer Token (Admin Role)

### 👥 Student Management
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/enroll` | Enroll a student in a course manually. Body: `{ userId, courseId }` |
| `GET` | `/students` | Get a list of all registered students with enrollment details. |

### 🎥 Video & Storage
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/videos` | Get video library statistics and assets. Includes both S3 and External video URLs. |
| `GET` | `/storage` | List files in the S3 bucket (paginated). |
| `DELETE` | `/storage` | Delete a file from S3. Query: `?key=...` |

### 💰 Finance
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/payments` | Get payment volume, stats, and recent transaction history. |

### 📡 Live Classes
**Base URL**: `/api/admin/live-classes`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/` | Create a new live class session. |
| `GET` | `/course/:courseId` | Get all live classes for a specific course. |
| `GET` | `/:id` | Get details of a specific live class. |
| `PATCH` | `/:id` | Update live class details. |
| `DELETE` | `/:id` | Delete a live class. |
| `POST` | `/:id/live` | Mark a class as LIVE and set the meeting URL. |
| `PATCH` | `/:id/complete` | Mark a class as COMPLETED. |
| `POST` | `/:id/recording` | Register/Upload a recording for a completed class. |
| `POST` | `/:id/notify` | Manually trigger a notification for the class. |

---