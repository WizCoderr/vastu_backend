
import { prisma } from './src/core/prisma';
import { InstructorIntent } from './src/course/instructor.intent';

async function reproduceS3Override() {
    console.log('--- Reproduction S3 Override Start ---');

    // 1. Create a course
    const course = await prisma.course.create({
        data: {
            title: 'Reproduction S3 Override',
            price: '100',
            instructorId: 'inst-1',
        }
    });
    console.log('Created course:', course.id);

    // 2. Create a section and an S3 lecture
    const section = await prisma.section.create({
        data: { title: 'Section 1', courseId: course.id }
    });
    const lecture = await prisma.lecture.create({
        data: {
            title: 'Part 1',
            videoUrl: 's3://bucket/old-video',
            videoProvider: 's3',
            s3Key: 'old-video',
            s3Bucket: 'bucket',
            sectionId: section.id
        }
    });
    console.log('Created S3 lecture:', lecture.id, lecture.videoUrl);

    // 3. Update the course, changing the lecture to YouTube but NOT sending s3Key
    const req1 = {
        body: {
            sections: [
                {
                    id: section.id,
                    title: 'Section 1',
                    lectures: [
                        { id: lecture.id, title: 'Part 1', videoUrl: 'https://www.youtube.com/watch?v=youtube-video' }
                    ]
                }
            ]
        },
        params: { courseId: course.id }
    } as any;
    const res1 = {
        json: (data: any) => console.log('Updated Course Success:', data.success),
        status: (code: number) => ({ json: (data: any) => console.log('Error 1:', code, data) })
    } as any;
    await InstructorIntent.updateCourse(req1, res1);

    // 4. Check DB
    const updatedLecture = await prisma.lecture.findUnique({
        where: { id: lecture.id }
    });
    console.log('Lecture in DB after update:');
    console.log('- videoUrl:', updatedLecture?.videoUrl);
    console.log('- s3Key:', updatedLecture?.s3Key);

    // 5. Simulate fetching curriculum (which signs URLs)
    const { CourseReducer } = await import('./src/course/course.reducer');
    const curriculumResult = await CourseReducer.getCurriculum(course.id, 'some-user');
    // We need an enrollment to test getCurriculum... let's use getCourseDetail instead which also signs
    const detailResult = await CourseReducer.getCourseDetail(course.id);
    const resultVideoUrl = (detailResult as any).data.sections[0].lectures[0].videoUrl;
    console.log('Fetched videoUrl (signed):', resultVideoUrl);

    if (resultVideoUrl.includes('amazon') || resultVideoUrl.includes('cloudfront')) {
        console.log('BUG CONFIRMED: S3 URL overrode YouTube URL!');
    } else {
        console.log('YouTube URL preserved.');
    }

    // 6. Cleanup
    await prisma.course.delete({ where: { id: course.id } });
    console.log('--- Reproduction S3 Override End ---');
}

reproduceS3Override().catch(console.error);
