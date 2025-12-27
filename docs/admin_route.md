# Admin / Instructor API Documentation

All routes under `/api/instructor` and `/api/admin` require **Admin Authentication** (valid JWT with admin role). Public routes under `/api/public` and `/api/student` have specific access rules.

## Base URL
`{{baseUrl}}`

---

## 1. Media Upload Flow (S3)
**Note:** The backend does **not** accept file uploads directly. You must use the S3 Pre-signed URL flow.

### Get Pre-signed URL
Generates a short-lived URL to upload a file directly to AWS S3.
- **Method:** `POST`
- **Endpoint:** `/api/instructor/upload/presigned-url`
- **Body:**
  ```json
  {
    "fileName": "my-image.jpg",
    "contentType": "image/jpeg",
    "fileType": "image" // or "video"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "url": "https://s3-bucket-url...", // PUT this URL with file content
    "key": "vastu-courses/images/...",  // Keep this KEY for registration
    "bucket": "vastu-media-prod"
  }
  ```

### Upload File (Frontend Action)
Use the `url` from Step 1 to upload the file.
- **Method:** `PUT`
- **URL:** The signed URL from Step 1.
- **Headers:** `Content-Type`: [Matches Step 1, e.g., image/jpeg]
- **Body:** Binary File Content

---

## 2. Course Management

### Create Course
Registers a new course using the uploaded image key.
- **Method:** `POST`
- **Endpoint:** `/api/instructor/courses`
- **Body:**
  ```json
  {
    "title": "Course Title",
    "description": "Description",
    "price": "500",
    "instructorId": "User ID",
    "s3Key": "vastu-courses/images/...", // From Step 1
    "s3Bucket": "vastu-media-prod"       // Optional
  }
  ```
- **Response:** `201 Created`

### List Courses (Instructor)
Retrieves all courses with signed S3 URLs for thumbnails.
- **Method:** `GET`
- **Endpoint:** `/api/instructor/courses`

### Delete Course
Deletes a course and all associated sections, lectures, resources, and S3 assets.
- **Method:** `DELETE`
- **Endpoint:** `/api/instructor/courses/:courseId`

---

## 3. Section & Lecture Management

### Create Section
- **Method:** `POST`
- **Endpoint:** `/api/instructor/courses/:courseId/sections`
- **Body:** `{ "title": "Section Name" }`

### Delete Section
- **Method:** `DELETE`
- **Endpoint:** `/api/instructor/courses/:courseId/sections/:sectionId`

### Register S3 Video (Create Lecture)
Registers a video lecture after the video has been uploaded to S3.
- **Method:** `POST`
- **Endpoint:** `/api/instructor/courses/:courseId/sections/:sectionId/lectures/register-s3-video`
- **Body:**
  ```json
  {
    "title": "Lecture Title",
    "s3Key": "vastu-courses/videos/...", // From Upload Step
    "s3Bucket": "vastu-media-prod"
  }
  ```
- **Response:** `200 OK`

---

## 4. Course Resources (PDFs)
Manage supplementary materials like PDF guides.

### Upload & Register PDF
Generates a presigned URL *and* creates the resource record in one step. You must perform the PUT upload to the returned `uploadUrl` immediately after.
- **Method:** `POST`
- **Endpoint:** `/api/instructor/upload/pdf-resource`
- **Body:**
  ```json
  {
    "courseId": "...",
    "title": "Cheatsheet",
    "type": "FREE", // "FREE" (Visible to all) or "PAID" (Visible only to enrolled)
    "fileName": "sheet.pdf",
    "contentType": "application/pdf"
  }
  ```
- **Response:**
  ```json
  {
     "resource": { ... },
     "uploadUrl": "https://s3..." // PUT file here
  }
  ```

### List Resources
Retrieves all resources for a specific course.
- **Method:** `GET`
- **Endpoint:** `/api/instructor/courses/:courseId/resources`
- **Response:** List of resources with signed `url` for download.

### Delete Resource
Deletes a resource record and the underlying S3 file.
- **Method:** `DELETE`
- **Endpoint:** `/api/instructor/resources/:resourceId`

---

## 5. Public & Student Access
Endpoints for the storefront and student portal.

### List All Courses (Public)
Lists all published courses with thumbnails. No login required.
- **Method:** `GET`
- **Endpoint:** `/api/public/courses`

### Get Course Details (Public/Optional Auth)
Retrieves full course details, including curriculum and resources.
- **Method:** `GET`
- **Endpoint:** `/api/public/courses/:id`
- **Headers:** `Authorization: Bearer <token>` (Optional)
- **Behavior:**
  - **No Token:** `isEnrolled` is false. Only `FREE` resources are returned. `PAID` resources are hidden.
  - **With Token:** Checks enrollment. If enrolled, `isEnrolled` is true, and `PAID` resources are returned.

---

## 6. Admin Management

### Enroll Student
Manually enrolls a student.
- **Method:** `POST`
- **Endpoint:** `/api/admin/enroll`
- **Body:** `{ "userId": "...", "courseId": "..." }`

### List Students
Retrieves all registered students.
- **Method:** `GET`
- **Endpoint:** `/api/admin/students`
