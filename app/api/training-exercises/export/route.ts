import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { trainingExerciseToSvg } from "@/lib/training-exercise-svg";
import type { AnalysisSlide, TrainingExerciseSlideContent, TrainingSessionDetails } from "@/types/slide";

const equals = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const secret = process.env.TRAINING_PLAN_SYNC_SECRET;
  const authorization = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !equals(secret, authorization)) return Response.json({ error: "Unauthorized training plan request." }, { status: 401 });
  const body = await request.json() as { username?: string; workspaceName?: string; session?: TrainingSessionDetails };
  const session = body.session;
  if (!body.username || !body.workspaceName || !session?.date || !session.season || !session.microcycle || !session.trainingUnit) return Response.json({ error: "Training session details are required." }, { status: 400 });
  const projects = await prisma.project.findMany({ where: { productVariant: "training-exercises", createdBy: { username: body.username }, workspace: { name: body.workspaceName } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, data: true, updatedAt: true } });
  const match = projects.find((project) => {
    const data = project.data as { trainingSession?: TrainingSessionDetails };
    return data.trainingSession?.date === session.date && data.trainingSession.season === session.season && data.trainingSession.microcycle === session.microcycle && data.trainingSession.trainingUnit === session.trainingUnit;
  });
  if (!match) return Response.json({ plan: null });
  const data = match.data as { slides?: AnalysisSlide[] };
  const exercises = (data.slides ?? []).filter((slide): slide is AnalysisSlide & { content: TrainingExerciseSlideContent } => slide.content.kind === "training-exercise").slice(0, 40).map((slide, index) => {
    const content = slide.content;
    return { number: index + 1, name: content.title || slide.name || `Exercise ${index + 1}`, description: content.description || "", diagramSvg: trainingExerciseToSvg(content) };
  });
  return Response.json({ plan: { id: match.id, name: match.name, exercises } });
}
