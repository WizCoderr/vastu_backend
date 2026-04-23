
import { prisma } from './src/core/prisma';
import { InstructorIntent } from './src/course/instructor.intent';

async function reproduceUpdate() {
    console.log('--- Reproduction Update Start ---');

    // 1. Create a course
    const course = await prisma.course.create({
        data: {
            title: 'Reproduction Course Update',
            price: '100',
            instructorId: 'inst-1',
        }
    });
    console.log('Created course:', course.id);

    // 2. Bulk add section and lectures via updateCourse
    const req1 = {
        body: {
            sections: [
                {
                    title: 'Section 1',
                    lectures: [
                        { title: 'Part 1', videoUrl: 'https://www.youtube.com/watch?v=v1' },
                        { title: 'Part 2', videoUrl: 'https://www.youtube.com/watch?v=v2' }
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

    // 4. Update them again (simulated auto-save or second edit)
    // Sending them WITH IDs this time
    const req2 = {
        body: {
            sections: [
                {
                    id: lectures[0].sectionId,
                    title: 'Section 1 Updated',
                    lectures: [
                        { id: lectures[0].id, title: 'Part 1', videoUrl: 'https://www.youtube.com/watch?v=v1-new' },
                        { id: lectures[1].id, title: 'Part 2', videoUrl: 'https://www.youtube.com/watch?v=v2-new' }
                    ]
                }
            ]
        },
        params: { courseId: course.id }
    } as any;
    await InstructorIntent.updateCourse(req2, res1);

    // 5. Check DB again
    const lectures2 = await prisma.lecture.findMany({
        where: { section: { courseId: course.id } },
        orderBy: { title: 'asc' }
    });
    console.log('Lectures in DB after second update:', lectures2.length);
    lectures2.forEach(l => console.log(`- ${l.title}: ${l.videoUrl} (ID: ${l.id})`));

    // 6. Cleanup
    await prisma.course.delete({ where: { id: course.id } });
    console.log('--- Reproduction Update End ---');
}

reproduceUpdate().catch(console.error);
