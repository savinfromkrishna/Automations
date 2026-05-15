import { prisma } from "../prisma";
import { runYoutubeProjectPipeline, createProjectFromIdea } from "./orchestrator";

let _ytWorkerRunning = false;

export async function runYoutubeWorker(): Promise<void> {
  if (_ytWorkerRunning) return;
  _ytWorkerRunning = true;

  try {
    const now = new Date();

    // Find due automation tasks
    const dueTasks = await prisma.youtubeAutomationTask.findMany({
      where: {
        isActive: true,
        OR: [
          { nextRun: null },
          { nextRun: { lte: now } },
        ],
      },
      include: { channel: true },
      take: 5,
    });

    for (const task of dueTasks) {
      if (!task.channel.isActive) continue;

      try {
        console.log(`[YT Worker] Running automation task ${task.id} for channel "${task.channel.name}"`);

        // Check if there's already a project in progress
        const inProgress = await prisma.youtubeProject.findFirst({
          where: {
            channelId: task.channelId,
            status: {
              in: ["RESEARCHING", "SCRIPTING", "STORYBOARDING", "GENERATING_VISUALS", "GENERATING_AUDIO", "SEO_OPTIMIZATION", "QUALITY_CHECK", "THUMBNAIL_CREATION"],
            },
          },
        });

        if (inProgress) {
          console.log(`[YT Worker] Channel ${task.channelId} already has a project in progress, skipping.`);
          continue;
        }

        // Create a new project and run the pipeline
        const projectId = await createProjectFromIdea(task.channelId, {});

        // Run pipeline non-blocking
        runYoutubeProjectPipeline(projectId).catch(err => {
          console.error(`[YT Worker] Pipeline failed for project ${projectId}:`, err.message);
        });

        // Update task schedule
        const nextRun = calculateNextRun(task.frequency, task.scheduleTime ?? undefined, task.daysOfWeek ?? undefined);
        await prisma.youtubeAutomationTask.update({
          where: { id: task.id },
          data: { lastRun: now, nextRun },
        });

        console.log(`[YT Worker] Task ${task.id} fired. Project ${projectId} started. Next run: ${nextRun}`);
      } catch (err: any) {
        console.error(`[YT Worker] Task ${task.id} error:`, err.message);
      }
    }

    // Resume stalled projects (status FAILED, allow retry after 30min)
    const stalled = await prisma.youtubeProject.findMany({
      where: {
        status: "FAILED",
        updatedAt: { lte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      take: 2,
    });

    for (const project of stalled) {
      if (project.errorMessage?.includes("NO_PROVIDER") || project.errorMessage?.includes("NO_TOKEN")) continue;
      console.log(`[YT Worker] Retrying stalled project ${project.id}`);
      runYoutubeProjectPipeline(project.id).catch(err => {
        console.error(`[YT Worker] Retry failed for ${project.id}:`, err.message);
      });
    }
  } finally {
    _ytWorkerRunning = false;
  }
}

function calculateNextRun(frequency: string, scheduleTime?: string, daysOfWeek?: string): Date {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      if (scheduleTime) {
        const [h, m] = scheduleTime.split(":").map(Number);
        next.setHours(h, m, 0, 0);
      }
      break;
    case "TWICE_WEEKLY":
      next.setDate(next.getDate() + 3);
      break;
    case "WEEKLY":
    default:
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
  }

  return next;
}

export function startYoutubeWorker(): void {
  console.log("[YT Worker] Starting YouTube automation worker...");
  setTimeout(() => {
    runYoutubeWorker().catch(console.error);
    setInterval(() => {
      runYoutubeWorker().catch(console.error);
    }, 10 * 60 * 1000); // Every 10 minutes
  }, 15000); // 15s startup delay
}
