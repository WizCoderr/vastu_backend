import { MongoClient } from 'mongodb';
import { prisma } from '../src/core/prisma.ts';

const uri = "mongodb+srv://vastu:vastu_arun@cluster0.oaqx6zl.mongodb.net/vastu_backend";

async function main() {
  console.log("Connecting to MongoDB...");
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('vastu_backend');
  
  // 1. Users
  console.log("Migrating Users...");
  const users = await db.collection('User').find().toArray();
  for (const u of users) {
    try {
      await prisma.user.create({
        data: {
          id: u._id.toString(),
          email: u.email,
          password: u.password,
          name: u.name,
          role: u.role || 'student',
          phoneNumber: u.phoneNumber || '',
          createdAt: u.createdAt,
          enrolledCourseIds: u.enrolledCourseIds || [],
        }
      });
    } catch(err: any) { console.error(`Error User ${u._id}: `, err.message); }
  }

  // 2. Categories
  console.log("Migrating Categories...");
  const categories = await db.collection('Category').find().toArray();
  for (const c of categories) {
    try {
      await prisma.category.create({
        data: {
          id: c._id.toString(),
          name: c.name,
          description: c.description,
          image: c.image,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error Category ${c._id}: `, err.message); }
  }

  // 3. Products
  console.log("Migrating Products...");
  const products = await db.collection('Product').find().toArray();
  for (const p of products) {
    try {
      await prisma.product.create({
        data: {
          id: p._id.toString(),
          name: p.name,
          description: p.description,
          image: p.image,
          price: p.price,
          stock: p.stock || 0,
          isActive: p.isActive ?? true,
          categoryId: p.categoryId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error Product ${p._id}: `, err.message); }
  }

  // 4. Courses
  console.log("Migrating Courses...");
  const courses = await db.collection('Course').find().toArray();
  for (const c of courses) {
    try {
      await prisma.course.create({
        data: {
          id: c._id.toString(),
          title: c.title,
          description: c.description,
          thumbnail: c.thumbnail,
          price: c.price,
          published: c.published ?? false,
          isVisible: c.isVisible ?? true,
          instructorId: c.instructorId,
          paymentMode: c.paymentMode ?? 'INSTALLMENT',
          startDate: c.startDate,
          endDate: c.endDate,
          accessDurationDays: c.accessDurationDays,
          s3Key: c.s3Key,
          s3Bucket: c.s3Bucket,
          mediaType: c.mediaType,
        }
      });
    } catch(err: any) { console.error(`Error Course ${c._id}: `, err.message); }
  }

  // 5. CoursePaymentPlans
  console.log("Migrating CoursePaymentPlans...");
  const cpp = await db.collection('CoursePaymentPlan').find().toArray();
  for (const plan of cpp) {
    try {
      await prisma.coursePaymentPlan.create({
        data: {
          id: plan._id.toString(),
          courseId: plan.courseId,
          stageName: plan.stageName,
          description: plan.description,
          amount: plan.amount,
          dueAfterDays: plan.dueAfterDays ?? 0,
          orderIndex: plan.orderIndex ?? 0,
          startDate: plan.startDate,
          endDate: plan.endDate,
        }
      });
    } catch(err: any) { console.error(`Error CoursePaymentPlan ${plan._id}: `, err.message); }
  }

  // 6. CourseResources
  console.log("Migrating CourseResources...");
  const cr = await db.collection('CourseResource').find().toArray();
  for (const r of cr) {
    try {
      await prisma.courseResource.create({
        data: {
          id: r._id.toString(),
          courseId: r.courseId,
          title: r.title,
          s3Key: r.s3Key,
          s3Bucket: r.s3Bucket,
          type: r.type,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error CourseResource ${r._id}: `, err.message); }
  }

  // 7. Sections
  console.log("Migrating Sections...");
  const sections = await db.collection('Section').find().toArray();
  for (const s of sections) {
    try {
      await prisma.section.create({
        data: {
          id: s._id.toString(),
          title: s.title,
          courseId: s.courseId,
        }
      });
    } catch(err: any) { console.error(`Error Section ${s._id}: `, err.message); }
  }

  // 8. Lectures
  console.log("Migrating Lectures...");
  const lectures = await db.collection('Lecture').find().toArray();
  for (const l of lectures) {
    try {
      await prisma.lecture.create({
        data: {
          id: l._id.toString(),
          title: l.title,
          videoUrl: l.videoUrl || "",
          sectionId: l.sectionId,
          videoProvider: l.videoProvider,
          muxAssetId: l.muxAssetId,
          muxPlaybackId: l.muxPlaybackId,
          muxReady: l.muxReady ?? false,
          s3Key: l.s3Key,
          s3Bucket: l.s3Bucket,
        }
      });
    } catch(err: any) { console.error(`Error Lecture ${l._id}: `, err.message); }
  }

  // 9. LiveClasses
  console.log("Migrating LiveClasses...");
  const liveclasses = await db.collection('LiveClass').find().toArray();
  for (const lc of liveclasses) {
    try {
      await prisma.liveClass.create({
        data: {
          id: lc._id.toString(),
          courseId: lc.courseId,
          sectionId: lc.sectionId,
          title: lc.title || "Untitled",
          description: lc.description,
          scheduledAt: lc.scheduledAt || new Date(),
          durationMinutes: lc.durationMinutes ?? 60,
          meetingUrl: lc.meetingUrl || "",
          recordingUrl: lc.recordingUrl,
          status: lc.status ?? 'SCHEDULED',
          notifySent: lc.notifySent ?? false,
          recordingNotifySent: lc.recordingNotifySent ?? false,
          createdAt: lc.createdAt,
          updatedAt: lc.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error LiveClass ${lc._id}: `, err.message); }
  }

  // 10. Enrollments
  console.log("Migrating Enrollments...");
  const enrollments = await db.collection('Enrollment').find().toArray();
  for (const e of enrollments) {
    try {
      await prisma.enrollment.create({
        data: {
          id: e._id.toString(),
          userId: e.userId,
          courseId: e.courseId,
          serialNumber: e.serialNumber,
          status: e.status ?? 'ACTIVE',
          createdAt: e.createdAt,
          expiresAt: e.expiresAt,
        }
      });
    } catch(err: any) { console.error(`Error Enrollment ${e._id}: `, err.message); }
  }

  // Orders, Payments, StudentPayments, Progress
  console.log("Migrating Orders...");
  const orders = await db.collection('Order').find().toArray();
  for (const o of orders) {
    try {
      await prisma.order.create({
        data: {
          id: o._id.toString(),
          userId: o.userId,
          totalAmount: o.totalAmount,
          status: o.status ?? 'PENDING',
          shippingName: o.shippingName || "Unknown",
          shippingPhone: o.shippingPhone || "Unknown",
          shippingAddress: o.shippingAddress || "Unknown",
          shippingCity: o.shippingCity || "Unknown",
          shippingState: o.shippingState || "Unknown",
          shippingPostal: o.shippingPostal || "Unknown",
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error Order ${o._id}: `, err.message); }
  }

  console.log("Migrating OrderItems...");
  const orderItems = await db.collection('OrderItem').find().toArray();
  for (const oi of orderItems) {
    try {
      await prisma.orderItem.create({
        data: {
          id: oi._id.toString(),
          orderId: oi.orderId,
          productId: oi.productId,
          quantity: oi.quantity || 1,
          price: oi.price || 0,
        }
      });
    } catch(err: any) { console.error(`Error OrderItem ${oi._id}: `, err.message); }
  }

  console.log("Migrating Payments...");
  const payments = await db.collection('Payment').find().toArray();
  for (const p of payments) {
    try {
      await prisma.payment.create({
        data: {
          id: p._id.toString(),
          userId: p.userId,
          type: p.type || 'COURSE',
          courseId: p.courseId,
          orderId: p.orderId,
          amount: p.amount || 0,
          currency: p.currency ?? 'INR',
          status: p.status ?? 'PENDING',
          provider: p.provider || 'RAZORPAY',
          providerOrderId: p.providerOrderId,
          providerPaymentId: p.providerPaymentId,
          providerSignature: p.providerSignature,
          failureReason: p.failureReason,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error Payment ${p._id}: `, err.message); }
  }

  console.log("Migrating StudentPayments...");
  const studentPayments = await db.collection('StudentPayment').find().toArray();
  for (const sp of studentPayments) {
    try {
      await prisma.studentPayment.create({
        data: {
          id: sp._id.toString(),
          userId: sp.userId,
          courseId: sp.courseId,
          planId: sp.planId,
          stageName: sp.stageName || 'Stage',
          amount: sp.amount || 0,
          razorpayOrderId: sp.razorpayOrderId,
          razorpayPaymentId: sp.razorpayPaymentId,
          status: sp.status ?? 'PENDING',
          dueDate: sp.dueDate,
          paidAt: sp.paidAt,
          createdAt: sp.createdAt,
          updatedAt: sp.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error StudentPayment ${sp._id}: `, err.message); }
  }

  console.log("Migrating Progress...");
  const progresses = await db.collection('Progress').find().toArray();
  for (const p of progresses) {
    try {
      await prisma.progress.create({
        data: {
          id: p._id.toString(),
          userId: p.userId,
          lectureId: p.lectureId,
          completed: p.completed ?? false,
        }
      });
    } catch(err: any) { console.error(`Error Progress ${p._id}: `, err.message); }
  }

  console.log("Migrating DeviceTokens...");
  const deviceTokens = await db.collection('DeviceToken').find().toArray();
  for (const dt of deviceTokens) {
    try {
      await prisma.deviceToken.create({
        data: {
          id: dt._id.toString(),
          userId: dt.userId,
          token: dt.token,
          platform: dt.platform ?? 'android',
          createdAt: dt.createdAt,
          updatedAt: dt.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error DeviceToken ${dt._id}: `, err.message); }
  }

  console.log("Migrating NotificationLogs...");
  const notificationLogs = await db.collection('NotificationLog').find().toArray();
  for (const nl of notificationLogs) {
    try {
      await prisma.notificationLog.create({
        data: {
          id: nl._id.toString(),
          userId: nl.userId,
          type: nl.type || 'FCM',
          title: nl.title || '',
          body: nl.body || '',
          data: nl.data || '',
          liveClassId: nl.liveClassId,
          sent: nl.sent ?? false,
          sentAt: nl.sentAt,
          error: nl.error,
          createdAt: nl.createdAt,
        }
      });
    } catch(err: any) { console.error(`Error NotificationLog ${nl._id}: `, err.message); }
  }

  console.log("Migrating Carts...");
  const carts = await db.collection('Cart').find().toArray();
  for (const c of carts) {
    try {
      await prisma.cart.create({
        data: {
          id: c._id.toString(),
          userId: c.userId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }
      });
    } catch(err: any) { console.error(`Error Cart ${c._id}: `, err.message); }
  }

  console.log("Migrating CartItems...");
  const cartItems = await db.collection('CartItem').find().toArray();
  for (const ci of cartItems) {
    try {
      await prisma.cartItem.create({
        data: {
          id: ci._id.toString(),
          cartId: ci.cartId,
          productId: ci.productId,
          quantity: ci.quantity ?? 1,
        }
      });
    } catch(err: any) { console.error(`Error CartItem ${ci._id}: `, err.message); }
  }

  console.log("Migration completed!");
  await client.close();
  // We cannot call prisma.$disconnect if process ends, pg pools clean up but let's be safe.
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
