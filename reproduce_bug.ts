
import { prisma } from './src/core/prisma';
import { InstructorIntent } from './src/course/instructor.intent';

async function reproduce() {
    console.log('--- Reproduction Start ---');

    // 1. Create a course
    const course = await prisma.course.create({
        data: {
            title: 'Reproduction Course',
            price: '100',
            instructorId: 'inst-1',
        }
    });
    console.log('Created course:', course.id);

    // 2. Create a section
    const section = await prisma.section.create({
        data: {
            title: 'Section 1',
            courseId: course.id
        }
    });
    console.log('Created section:', section.id);

    // 3. Register first lecture via registerLecture (simulated)
    const req1 = {
        body: { title: 'Part 1', videoUrl: 'https://www.youtube.com/watch?v=video1' },
        params: { courseId: course.id, sectionId: section.id }
    } as any;
    const res1 = {
        json: (data: any) => console.log('Registered Lecture 1:', data.lecture.id, data.lecture.videoUrl),
        status: (code: number) => ({ json: (data: any) => console.log('Error 1:', code, data) })
    } as any;
    await InstructorIntent.registerLecture(req1, res1);

    // 4. Register second lecture via registerLecture (simulated)
    const req2 = {
        body: { title: 'Part 2', videoUrl: 'https://www.youtube.com/watch?v=video2' },
        params: { courseId: course.id, sectionId: section.id }
    } as any;
    const res2 = {
        json: (data: any) => console.log('Registered Lecture 2:', data.lecture.id, data.lecture.videoUrl),
        status: (code: number) => ({ json: (data: any) => console.log('Error 2:', code, data) })
    } as any;
    await InstructorIntent.registerLecture(req2, res2);

    // 5. Check DB
    const lectures = await prisma.lecture.findMany({
        where: { sectionId: section.id }
    });
    console.log('Lectures in DB:', lectures.length);
    lectures.forEach(l => console.log(`- ${l.title}: ${l.videoUrl}`));

    // 6. Cleanup
    await prisma.course.delete({ where: { id: course.id } });
    console.log('--- Reproduction End ---');
}

reproduce().catch(console.error);
