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
      await prisma.user.upsert({
        where: { id: u._id.toString() },
        update: {},
        create: {
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
      await prisma.category.upsert({
        where: { id: c._id.toString() },
        update: {},
        create: {
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
      await prisma.product.upsert({
        where: { id: p._id.toString() },
        update: {},
        create: {
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
      await prisma.course.upsert({
        where: { id: c._id.toString() },
        update: {},
        create: {
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
      await prisma.coursePaymentPlan.upsert({
        where: { id: plan._id.toString() },
        update: {},
        create: {
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
      await prisma.courseResource.upsert({
        where: { id: r._id.toString() },
        update: {},
        create: {
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
      await prisma.section.upsert({
        where: { id: s._id.toString() },
        update: {},
        create: {
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
      await prisma.lecture.upsert({
        where: { id: l._id.toString() },
        update: {},
        create: {
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
      await prisma.liveClass.upsert({
        where: { id: lc._id.toString() },
        update: {},
        create: {
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

  // Pre-fetch existing IDs for FK validation
  const existingUserIds = new Set((await prisma.user.findMany({ select: { id: true } })).map(u => u.id));
  const existingCourseIds = new Set((await prisma.course.findMany({ select: { id: true } })).map(c => c.id));
  const existingProductIds = new Set((await prisma.product.findMany({ select: { id: true } })).map(p => p.id));
  const existingLectureIds = new Set((await prisma.lecture.findMany({ select: { id: true } })).map(l => l.id));
  const existingPlanIds = new Set((await prisma.coursePaymentPlan.findMany({ select: { id: true } })).map(p => p.id));
  const existingOrderIds = new Set((await prisma.order.findMany({ select: { id: true } })).map(o => o.id));

  // 10. Enrollments
  console.log("Migrating Enrollments...");
  const enrollments = await db.collection('Enrollment').find().toArray();
  for (const e of enrollments) {
    try {
      if (!existingUserIds.has(e.userId)) { console.log(`Skipping Enrollment ${e._id} - user not found`); continue; }
      if (!existingCourseIds.has(e.courseId)) { console.log(`Skipping Enrollment ${e._id} - course not found`); continue; }
      await prisma.enrollment.upsert({
        where: { id: e._id.toString() },
        update: {},
        create: {
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
      if (!existingUserIds.has(o.userId)) { console.log(`Skipping Order ${o._id} - user not found`); continue; }
      await prisma.order.upsert({
        where: { id: o._id.toString() },
        update: {},
        create: {
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
  const updatedOrderIds = new Set((await prisma.order.findMany({ select: { id: true } })).map(o => o.id));
  for (const oi of orderItems) {
    try {
      if (!updatedOrderIds.has(oi.orderId)) { console.log(`Skipping OrderItem ${oi._id} - order not found`); continue; }
      if (!existingProductIds.has(oi.productId)) { console.log(`Skipping OrderItem ${oi._id} - product not found`); continue; }
      await prisma.orderItem.upsert({
        where: { id: oi._id.toString() },
        update: {},
        create: {
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
      if (!existingUserIds.has(p.userId)) { console.log(`Skipping Payment ${p._id} - user not found`); continue; }
      if (p.courseId && !existingCourseIds.has(p.courseId)) { console.log(`Skipping Payment ${p._id} - course not found`); continue; }
      if (p.orderId && !updatedOrderIds.has(p.orderId)) { console.log(`Skipping Payment ${p._id} - order not found`); continue; }
      await prisma.payment.upsert({
        where: { id: p._id.toString() },
        update: {},
        create: {
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
      if (!existingUserIds.has(sp.userId)) { console.log(`Skipping StudentPayment ${sp._id} - user not found`); continue; }
      if (sp.courseId && !existingCourseIds.has(sp.courseId)) { console.log(`Skipping StudentPayment ${sp._id} - course not found`); continue; }
      if (sp.planId && !existingPlanIds.has(sp.planId)) { console.log(`Skipping StudentPayment ${sp._id} - plan not found`); continue; }
      await prisma.studentPayment.upsert({
        where: { id: sp._id.toString() },
        update: {},
        create: {
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
      if (!existingUserIds.has(p.userId)) { console.log(`Skipping Progress ${p._id} - user not found`); continue; }
      if (!existingLectureIds.has(p.lectureId)) { console.log(`Skipping Progress ${p._id} - lecture not found`); continue; }
      await prisma.progress.upsert({
        where: { id: p._id.toString() },
        update: {},
        create: {
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
      if (!existingUserIds.has(dt.userId)) {
        console.log(`Skipping DeviceToken ${dt._id} - userId ${dt.userId} not found`);
        continue;
      }
      await prisma.deviceToken.upsert({
        where: { id: dt._id.toString() },
        update: {},
        create: {
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
      await prisma.notificationLog.upsert({
        where: { id: nl._id.toString() },
        update: {},
        create: {
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
      await prisma.cart.upsert({
        where: { id: c._id.toString() },
        update: {},
        create: {
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
      await prisma.cartItem.upsert({
        where: { id: ci._id.toString() },
        update: {},
        create: {
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
