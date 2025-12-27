# PDF Resource Upload Feature

## Goal Description
Add the ability for instructors to upload PDF resources for a course. PDFs are stored in AWS S3. Resources are of two types:
- **FREE** – accessible to any user.
- **PAID** – accessible only to students enrolled in the course.

## Proposed Changes
---
### Prisma Schema (`prisma/schema.prisma`)
#### [MODIFY] `schema.prisma`
```diff
@@
   model Course {
     id          String   @id @default(cuid())
     title       String
     // existing fields ...
   }
+
+enum ResourceType {
+  FREE
+  PAID
+}
+
+model CourseResource {
+  id          String       @id @default(cuid())
+  courseId    String
+  title       String
+  s3Key       String
+  s3Bucket    String
+  type        ResourceType
+  createdAt   DateTime     @default(now())
+  updatedAt   DateTime     @updatedAt
+  course      Course       @relation(fields: [courseId], references: [id])
+}
```
---
### API Route (`src/course/instructor.intent.ts`)
#### [MODIFY] `instructor.intent.ts`
```diff
@@
   static async getPresignedUrl(req: Request, res: Response) {
@@
   }
+
+  // Upload PDF resource (metadata only, client uploads to S3 using presigned URL)
+  static async uploadPdfResource(req: Request, res: Response) {
+    const schema = z.object({
+      courseId: z.string(),
+      title: z.string().min(1),
+      type: z.enum(['FREE', 'PAID']),
+      fileName: z.string(),
+      contentType: z.string()
+    });
+    try {
+      const data = schema.parse(req.body);
+      // Generate presigned upload URL
+      const folder = 'pdfs';
+      const key = `vastu-courses/${folder}/${Date.now()}-${data.fileName}`;
+      const { getPresignedUploadUrl } = await import('../core/s3Service');
+      const uploadData = await getPresignedUploadUrl(key, data.contentType);
+      // Save resource record
+      const resource = await prisma.courseResource.create({
+        data: {
+          courseId: data.courseId,
+          title: data.title,
+          s3Key: key,
+          s3Bucket: process.env.AWS_BUCKET_NAME!,
+          type: data.type as any
+        }
+      });
+      res.status(201).json({ resource, uploadUrl: uploadData.url, fields: uploadData.fields });
+    } catch (error: any) {
+      logger.error('Failed to upload PDF resource', { error });
+      res.status(400).json({ error: 'Invalid request', details: error instanceof z.ZodError ? error.errors : error.message });
+    }
+  }
*** End of File ***
```
---
### Course Detail Endpoint (`src/course/student.intent.ts` or similar)
#### [MODIFY] `student.intent.ts`
```diff
@@
   static async getCourseDetail(req: Request, res: Response) {
@@
-    const course = await prisma.course.findUnique({ where: { id: courseId } });
+    const course = await prisma.course.findUnique({
+      where: { id: courseId },
+      include: { resources: true }
+    });
+    // Filter resources based on enrollment and type
+    const userId = req.user?.id;
+    const isEnrolled = await prisma.enrollment.findFirst({ where: { studentId: userId, courseId } });
+    const filteredResources = course?.resources?.filter(r => {
+      if (r.type === 'FREE') return true;
+      return !!isEnrolled;
+    });
+    res.json({ ...course, resources: filteredResources });
*** End of File ***
```
---
### Middleware / Access Control (`src/middleware/auth.ts`)
Add helper to check enrollment for PAID resources when serving download URLs.
---
### Tests
- **Unit Test** for Prisma schema generation (snapshot of generated client types).
- **Integration Test** for `uploadPdfResource` endpoint: mock S3 service, verify DB record creation and returned presigned URL.
- **Integration Test** for course detail filtering: ensure PAID resources are hidden for non‑enrolled users.
---
## Verification Plan
### Automated Tests
- Run existing test suite with `npm run test` to ensure no regressions.
- Add new tests under `tests/course` and execute them.
### Manual Verification
1. Use Postman to call `POST /api/instructor/upload-pdf` with FREE type, upload a sample PDF to the returned URL, then fetch course details as a guest – PDF should appear.
2. Repeat with PAID type, fetch course details as a non‑enrolled user – PDF should be omitted.
3. Enroll a student, fetch course details – PAID PDF should now be visible.
4. Verify S3 objects exist via AWS console or SDK.
---
## User Review Required
- Confirm the enum values (`FREE`, `PAID`) and any naming conventions.
- Approve the addition of the new `CourseResource` model and related migrations.
- Validate the proposed API contract for `uploadPdfResource` (request body fields).
