import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { trainingExerciseToSvg } from "@/lib/training-exercise-svg";
import type { AnalysisSlide, TrainingExerciseSlideContent, TrainingSessionDetails } from "@/types/slide";

const equals = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

type TrainingPlanRequest = {
  action?: "list" | "project";
  username?: string;
  workspaceName?: string;
  projectId?: string;
  session?: TrainingSessionDetails;
};

type TrainingExercisesProject = {
  id: string;
  name: string;
  data: unknown;
  updatedAt: Date;
};

function sessionFrom(project: TrainingExercisesProject) {
  return (project.data as { trainingSession?: TrainingSessionDetails }).trainingSession;
}

function validSession(session?: TrainingSessionDetails): session is TrainingSessionDetails {
  return Boolean(session?.date && session.season && session.microcycle && session.trainingUnit);
}

function planFrom(project: TrainingExercisesProject) {
  const data = project.data as { slides?: AnalysisSlide[] };
  const exercises = (data.slides ?? [])
    .filter((slide): slide is AnalysisSlide & { content: TrainingExerciseSlideContent } => slide.content.kind === "training-exercise")
    .slice(0, 40)
    .map((slide, index) => {
      const content = slide.content;
      return {
        number: index + 1,
        // The name shown in the plan is the name given to the exercise slide.
        name: slide.name || content.title || `Exercise ${index + 1}`,
        description: content.description || "",
        diagramSvg: trainingExerciseToSvg(content),
      };
    });

  return { id: project.id, name: project.name, session: sessionFrom(project), exercises };
}

export async function POST(request: Request) {
  const secret = process.env.TRAINING_PLAN_SYNC_SECRET;
  const authorization = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !equals(secret, authorization)) return Response.json({ error: "Unauthorized training plan request." }, { status: 401 });
  const body = await request.json() as TrainingPlanRequest;
  if (!body.username) return Response.json({ error: "Training account details are required." }, { status: 400 });

  const projects = await prisma.project.findMany({
    // Training Exercises and Live Training have independent workspace records.
    // Their shared boundary is the authenticated account, not the workspace label.
    where: { productVariant: "training-exercises", createdBy: { username: body.username } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, data: true, updatedAt: true },
  }) as TrainingExercisesProject[];

  if (body.action === "list") {
    const plans = projects
      .map((project) => ({ project, session: sessionFrom(project) }))
      .filter((entry): entry is { project: TrainingExercisesProject; session: TrainingSessionDetails } => validSession(entry.session))
      .map(({ project, session }) => ({
        id: project.id,
        name: project.name,
        session,
        updatedAt: project.updatedAt.toISOString(),
        exerciseCount: planFrom(project).exercises.length,
      }));
    return Response.json({ plans });
  }

  if (body.action === "project") {
    const project = projects.find((candidate) => candidate.id === body.projectId);
    if (!project) return Response.json({ error: "Training Exercises project not found." }, { status: 404 });
    if (!validSession(sessionFrom(project))) return Response.json({ error: "This project is missing its training session details." }, { status: 422 });
    return Response.json({ plan: planFrom(project) });
  }

  const session = body.session;
  if (!validSession(session)) return Response.json({ error: "Training session details are required." }, { status: 400 });
  const match = projects.find((project) => {
    const trainingSession = sessionFrom(project);
    return trainingSession?.date === session.date && trainingSession.season === session.season && trainingSession.microcycle === session.microcycle && trainingSession.trainingUnit === session.trainingUnit;
  });
  return Response.json({ plan: match ? planFrom(match) : null });
}
