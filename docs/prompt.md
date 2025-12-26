# Vastu Project Documentation

## Part 1: System Architecture (One-Page Context)

### Context
You are working on an **existing production backend** for an e-learning platform.

**Stack (already in use):**
* Runtime: Bun
* Framework: Express.js
* Language: TypeScript
* ORM: Prisma (PostgreSQL / MongoDB)
* Auth: JWT
* Validation: Zod
* Logging: Winston

**Decisions (FINAL):**
* Storage: **AWS S3** (all images & videos)
* Video streaming: **Mux** (HLS, signed playback)
* Payments: **Razorpay**

**Do NOT use:** Cloudinary, Firebase, Stripe.

### Objectives
1. Use **AWS S3 as the only storage layer**
2. Store **ONLY references** in DB (bucket + key), never public URLs
3. Stream videos **ONLY via Mux** with signed URLs
4. Process payments **ONLY via Razorpay**
5. Do not break existing routes or logic

### Hard Rules (Non‑Negotiable)
* ❌ Never store public S3 URLs in DB
* ❌ Never expose AWS keys to frontend
* ❌ Never stream videos directly from S3
* ❌ Never store files in DB
* ❌ Never change existing route names

### Required Architecture

**Upload Flow (Images & Videos)**
1. Frontend requests `POST /upload/presigned-url`
2. Backend returns S3 PUT presigned URL
3. Frontend uploads file directly to S3
4. Backend stores `{ bucket, key }` in DB

**Video Registration & Playback**
* Backend registers S3 video with Mux
* Save `muxPlaybackId` in DB
* Student playback returns **signed Mux HLS URL** (expires in minutes)

### Database Expectations

**Media (Image / Video)**
```json
{
  "s3": { "bucket": "...", "key": "..." },
  "mediaType": "image | video",
  "muxPlaybackId": "(videos only)"
}
```

**Payments**
```json
{
  "razorpayOrderId": "...",
  "razorpayPaymentId": "...",
  "razorpaySignature": "..."
}
```

---

## Part 2: Frontend Implementation Guide

**Goal**: Build a modern, robust Admin Panel for creating courses and uploading video lectures, integrating with the new AWS S3 Direct Upload and Mux Video flow.

### 1. Core Features to Implement

#### A. Course Management (Create/Edit)
1.  **Course Details Form**:
    *   Fields: Title, Description, Price, Instructor ID.
    *   **Thumbnail Upload**:
        *   Do NOT send the file to the backend directly.
        *   **Step 1**: On file selection, call `POST /api/instructor/upload/presigned-url` with `{ fileName, contentType, fileType: 'image' }`.
        *   **Step 2**: Use the returned `url` to upload the file directly to AWS S3 using a `PUT` request.
        *   **Step 3**: Receive `s3Key` and `s3Bucket` from the backend response/success state.
        *   **Step 4**: Call `POST /api/instructor/courses` with the course details AND `s3Key`, `s3Bucket`.

#### B. Curriculum Management (Sections & Lectures)
1.  **Section Management**:
    *   Ability to add sections to a course (`POST /api/instructor/courses/:id/sections`).
2.  **Lecture Upload (Video)**:
    *   Inside a section, add a "Upload Video" button.
    *   **Direct S3 Upload Flow**:
        *   **Step 1**: User selects a video file.
        *   **Step 2**: Call `POST /api/instructor/upload/presigned-url` with `{ fileName, contentType, fileType: 'video' }`.
        *   **Step 3**: Upload file to S3 via the returned pre-signed URL (show a progress bar!).
        *   **Step 4**: Once upload completes, call `POST /api/instructor/courses/:courseId/sections/:sectionId/lectures/register-s3-video`.
            *   Payload: `{ title, s3Key, s3Bucket }`.
    *   **Architecture Note**: The backend will handle the handoff to Mux for processing. The frontend should indicate "Processing" status for the new lecture.

### 2. API Reference (Updated Backend)

#### Base URL: `/api/instructor`

| Endpoint | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/upload/presigned-url` | POST | `{ fileName, contentType, fileType }` | Get S3 URL for direct upload |
| `/courses` | POST | `{ title, description, price, s3Key, ... }` | Create course with S3 thumbnail key |
| `.../register-s3-video` | POST | `{ title, s3Key, s3Bucket }` | Register uploaded video with Mux |

### 3. Example Code Snippet (Video Upload Logic)

```javascript
async function uploadVideo(file) {
  // 1. Get Presigned URL
  const { data: presign } = await api.post('/instructor/upload/presigned-url', {
    fileName: file.name,
    contentType: file.type,
    fileType: 'video'
  });

  // 2. Upload to S3
  await axios.put(presign.url, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (p) => {
      const percent = Math.round((p.loaded * 100) / p.total);
      console.log(`Upload Progress: ${percent}%`);
    }
  });

  // 3. Register with Backend
  await api.post(`/instructor/courses/${courseId}/sections/${sectionId}/lectures/register-s3-video`, {
    title: file.name,
    s3Key: presign.key,
    s3Bucket: presign.bucket
  });
}
```
