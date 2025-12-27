# Frontend Integration Prompt: Admin Authentication & Instructor APIs

**Role:** Expert Frontend Developer
**Goal:** Integrate the Admin Authentication and Instructor APIs into the Vastu Frontend application.

## 1. Authentication Configuration

The backend provides JWT-based authentication with role-based access control (RBAC).

-   **Base URL:** `http://localhost:3000` (Update based on environment)
-   **Auth Header:** `Authorization: Bearer <token>`
-   **Roles:** `student`, `admin`

### Key Endpoints
| Feature | Endpoint | Method | Payload |
| :--- | :--- | :--- | :--- |
| **Login** | `/auth/login` | POST | `{ "email": "...", "password": "..." }` |
| **Register** | `/auth/register` | POST | `{ "email": "...", "password": "...", "name": "...", "role": "admin" }` |

**Requirements:**
1.  **Admin Login Page:** Create a login form. On success, store the `token` and `user` object (containing `role`).
2.  **Protected Route Wrapper:** Create a `ProtectedAdminRoute` component that checks:
    *   Is the user logged in?
    *   Is `user.role === 'admin'`?
    *   If not, redirect to `/login` or show "Access Denied".

## 2. Instructor Dashboard Features

The following APIs are protected and require the Admin role.

### API Reference
| Action | Endpoint | Method | Body / Details |
| :--- | :--- | :--- | :--- |
| **Create Course** | `/api/instructor/courses` | POST | `{ "title": "...", "price": "...", "instructorId": "..." }` |
| **Add Section** | `/api/instructor/courses/:id/sections` | POST | `{ "title": "..." }` |
| **Add Lecture** | `/api/instructor/sections/:id/lectures` | POST | `FormData`: `video` (File), `title` (Text) |
| **Upload Resource** | `/api/instructor/upload/pdf-resource` | POST | `{ "courseId": "...", "title": "...", "type": "FREE/PAID", "fileName": "...", "contentType": "..." }` |

**UI Requirements:**
1.  **Create Course Form:** Inputs for Title, Description, Price.
2.  **Course Management:** View to add Sections to a Course.
3.  **Upload Lecture:** Form within a Section to upload a video file. *Note: Use `FormData` for the video upload.*
4.  **Resource Upload:** Form to upload PDF resources.
    *   Select "Free" or "Paid".
    *   Upload file directly to S3 using the URL returned from the API.

## 3. Error Handling
-   Handle `401 Unauthorized`: Redirect to Login.
-   Handle `403 Forbidden`: Show "You do not have permission to access this area."
