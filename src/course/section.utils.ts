export const sectionOrderBy = { orderIndex: 'asc' as const };

export function extractClassNumberFromTitle(title: string): number | null {
    const match = title.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

export function sortSectionsByOrder<T extends { orderIndex?: number; title: string }>(sections: T[]): T[] {
    return [...sections].sort((a, b) => {
        const orderDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        if (orderDiff !== 0) return orderDiff;

        const classA = extractClassNumberFromTitle(a.title);
        const classB = extractClassNumberFromTitle(b.title);
        if (classA !== null && classB !== null && classA !== classB) {
            return classA - classB;
        }

        return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    });
}

export function withSectionIndex<T>(section: T, oneBasedIndex: number) {
    return {
        ...section,
        index: oneBasedIndex,
        classNumber: oneBasedIndex,
        orderIndex: oneBasedIndex,
    };
}

type SectionWithRelations = {
    id: string;
    title: string;
    orderIndex?: number;
    lectures: Array<{ id: string; title: string; videoUrl: string; videoProvider?: string | null; s3Key?: string | null; s3Bucket?: string | null }>;
    liveClasses?: Array<{
        id: string;
        title: string;
        description: string | null;
        scheduledAt: Date;
        durationMinutes: number;
        status: string;
        meetingUrl: string | null;
        sectionId?: string | null;
    }>;
};

export async function mapCourseSections(
    sections: SectionWithRelations[],
    signVideoUrl: (lecture: SectionWithRelations['lectures'][number]) => Promise<string>
) {
    return Promise.all(
        sortSectionsByOrder(sections).map(async (section, i) => {
            const oneBasedIndex = i + 1;
            const lectures = await Promise.all(section.lectures.map(async (l) => ({
                id: l.id,
                title: l.title,
                videoUrl: l.s3Key ? await signVideoUrl(l).catch(() => l.videoUrl) : l.videoUrl,
                videoProvider: l.videoProvider,
            })));

            const liveClasses = section.liveClasses?.map((lc) => ({
                id: lc.id,
                title: lc.title,
                description: lc.description,
                scheduledAt: lc.scheduledAt,
                durationMinutes: lc.durationMinutes,
                status: lc.status,
                meetingUrl: lc.meetingUrl,
                sectionId: lc.sectionId,
            }));

            return withSectionIndex({
                id: section.id,
                title: section.title,
                lectures,
                ...(liveClasses ? { liveClasses } : {}),
            }, oneBasedIndex);
        })
    );
}
