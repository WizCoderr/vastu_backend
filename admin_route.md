# Admin / Instructor Routes

All routes under `/api/instructor` and `/api/admin` require **Admin Authentication** (valid JWT with admin role).

## Base URL (Instructor)
`{{baseUrl}}/api/instructor`

## Courses

### Create Course
Creates a new course.
- **Method:** `POST`
- **Endpoint:** `/courses`
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `title`: Course Title (text)
  - `description`: Course Description (text)
  - `price`: Price (text)
  - `instructorId`: Instructor ID (text)
  - `image`: Course Thumbnail (file)
- **Response:** `201 Created` with the created course object.

### List Courses
Retrieves all courses (published and unpublished).
- **Method:** `GET`
- **Endpoint:** `/courses`
- **Response:** `200 OK` with an array of course objects.

## Sections

### Create Section
Creates a new section within a specific course.
- **Method:** `POST`
- **Endpoint:** `/courses/:courseId/sections`
- **Path Parameters:**
  - `courseId`: The ID of the course.
- **Body:**
  ```json
  {
    "title": "Section Title" // required, min 3 chars
  }
  ```
- **Response:** `201 Created` with the created section object.

## Lectures

### Create Lecture (Upload Video)
Creates a new lecture within a section and uploads a video file.
- **Method:** `POST`
- **Endpoint:** `/sections/:sectionId/lectures`
- **Path Parameters:**
  - `sectionId`: The ID of the section.
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `title`: Lecture Title (text)
  - `video`: Video File (file)
- **Response:** `201 Created` with the created lecture object.

## Admin Management

### Base URL
`{{baseUrl}}/api/admin`

### Enroll Student
Manually enrolls a student in a course.
- **Method:** `POST`
- **Endpoint:** `/enroll`
- **Body:**
  ```json
  {
    "userId": "User ID",
    "courseId": "Course ID"
  }
  ```
- **Response:** `200 OK` with enrollment details.

### List Students
Retrieves all registered students.
- **Method:** `GET`
- **Endpoint:** `/students`
- **Response:** `200 OK` with list of students.
