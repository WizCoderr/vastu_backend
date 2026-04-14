import { MongoClient } from 'mongodb';

async function listCollections() {
  const uri = "mongodb+srv://vastu:vastu_arun@cluster0.oaqx6zl.mongodb.net/vastu_backend";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('vastu_backend');
    const collections = await db.listCollections().toArray();
    console.log(collections.map(c => c.name));
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

listCollections();
