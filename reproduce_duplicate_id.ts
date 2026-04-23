
import { prisma } from './src/core/prisma';
import { InstructorIntent } from './src/course/instructor.intent';

async function reproduceDuplicateId() {
    console.log('--- Reproduction Duplicate ID Start ---');

    // 1. Create a course
    const course = await prisma.course.create({
        data: {
            title: 'Reproduction Course Duplicate ID',
            price: '100',
            instructorId: 'inst-1',
        }
    });
    console.log('Created course:', course.id);

    // 2. Bulk add section and lectures with SAME ID
    const req1 = {
        body: {
            sections: [
                {
                    title: 'Section 1',
                    lectures: [
                        { id: 'temp-123', title: 'Part 1', videoUrl: 'https://www.youtube.com/watch?v=v1' },
                        { id: 'temp-123', title: 'Part 2', videoUrl: 'https://www.youtube.com/watch?v=v2' }
                    ]
                }
            ]
        },
        params: { courseId: course.id }
    } as any;
    const res1 = {
        json: (data: any) => console.log('Updated Course:', data.success),
        status: (code: number) => ({ json: (data: any) => console.log('Error 1:', code, data) })
    } as any;
    await InstructorIntent.updateCourse(req1, res1);

    // 3. Check DB
    const lectures = await prisma.lecture.findMany({
        where: { section: { courseId: course.id } },
        orderBy: { title: 'asc' }
    });
    console.log('Lectures in DB:', lectures.length);
    lectures.forEach(l => console.log(`- ${l.title}: ${l.videoUrl} (ID: ${l.id})`));

    // 4. Cleanup
    await prisma.course.delete({ where: { id: course.id } });
    console.log('--- Reproduction Duplicate ID End ---');
}

reproduceDuplicateId().catch(console.error);
