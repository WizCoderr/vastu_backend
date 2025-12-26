# Admin Authentication Routes

This document lists all API endpoints that require **Admin** privileges.

## Authentication Mechanism
Admin routes are protected by two middleware functions:
1.  **`requireAuth`**: Verifies that a valid JWT token is present in the `Authorization` header (`Bearer <token>`).
2.  **`requireAdmin`**: Verifies that the authenticated user has the role `admin`.

## Protected Routes

### Authentication
Base URL: `/auth`

| Method | Endpoint | Description | Body Params |
| :--- | :--- | :--- | :--- |
| `POST` | `/register` | Register a new user (Student or Admin) | `email`, `password`, `name`, `role` (optional: 'student' \| 'admin') |
| `POST` | `/login` | Login and receive JWT | `email`, `password` |

**Creating an Admin User:**
To register an admin, include `"role": "admin"` in the registration body.
```json
{
  "email": "admin@vastu.com",
  "password": "securepassword",
  "name": "Admin User",
  "role": "admin"
}
```

### Instructor API
Base URL: `/api/instructor`

| Method | Endpoint | Description | Auth Requirements |
| :--- | :--- | :--- | :--- |
| `POST` | `/courses` | Create a new course | `Bearer Token` + `Admin Role` |
| `POST` | `/courses/:courseId/sections` | Create a new section for a course | `Bearer Token` + `Admin Role` |
| `POST` | `/sections/:sectionId/lectures` | Create a new lecture and upload video | `Bearer Token` + `Admin Role` |

## Usage Example

**Headers:**
```json
{
  "Authorization": "Bearer <ADMIN_JWT_TOKEN>",
  "Content-Type": "application/json"
}
```

**Response Codes:**
- `200` / `201`: Success
- `401`: Unauthorized (Missing or invalid token)
- `403`: Forbidden (User is authenticated but not an admin)
