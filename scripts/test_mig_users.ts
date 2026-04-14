import { MongoClient } from 'mongodb';
import { prisma } from '../src/core/prisma';

const uri = "mongodb+srv://vastu:vastu_arun@cluster0.oaqx6zl.mongodb.net/vastu_backend";

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('vastu_backend');
  
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
      console.log('Inserted user:', u.email);
    } catch(err: any) { 
        console.error(`Error User ${u._id}: `, err); 
    }
  }
}
main();
