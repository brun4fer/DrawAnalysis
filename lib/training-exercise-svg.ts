import type { TrainingExerciseSlideContent } from "@/types/slide";

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);

/** Server-side snapshot used by Live Training. It deliberately serialises the
 * same portable pitch coordinates as the exercise editor, so no browser image
 * upload is needed for an imported plan. */
export function trainingExerciseToSvg(content: TrainingExerciseSlideContent) {
  const objects = content.objects.map((object) => {
    const color = object.color || "#fff"; const label = escapeXml(object.label || "");
    if (object.type === "player") return `<g><circle cx="${object.x}" cy="${object.y}" r="${Math.max(1.7, object.width / 2)}" fill="${color}" stroke="#fff" stroke-width=".35"/><text x="${object.x}" y="${object.y + object.width / 2 + 2}" text-anchor="middle" fill="#fff" font-size="1.7" font-weight="700">${label}</text></g>`;
    if (object.type === "cone") return `<ellipse cx="${object.x}" cy="${object.y}" rx="${object.width / 2}" ry="${Math.max(.75, object.height / 2)}" fill="${color}"/><ellipse cx="${object.x}" cy="${object.y}" rx="${object.width * .2}" ry="${Math.max(.2, object.height * .18)}" fill="#2f922d"/>`;
    if (object.type === "pole") return `<path d="M${object.x} ${object.y + object.height / 2}V${object.y - object.height / 2}" stroke="${color}" stroke-width="${Math.max(.6, object.width * .3)}" stroke-linecap="round"/>`;
    if (object.type === "goal") return `<rect x="${object.x - object.width / 2}" y="${object.y - object.height / 2}" width="${object.width}" height="${object.height}" fill="none" stroke="${color}" stroke-width=".4"/>`;
    if (object.type === "ball") return `<circle cx="${object.x}" cy="${object.y}" r="${object.width / 2}" fill="#fff" stroke="#111" stroke-width=".2"/>`;
    if (object.type === "text") return `<text x="${object.x}" y="${object.y}" text-anchor="middle" fill="${color}" font-size="${object.fontSize || 3}" font-weight="700">${label}</text>`;
    const x1 = object.x - object.width / 2; const y1 = object.y + object.height / 2; const x2 = object.x + object.width / 2; const y2 = object.y - object.height / 2;
    return `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${object.strokeWidth || 1.3}" ${object.dashed ? 'stroke-dasharray="2 1.5"' : ""}/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 56.25"><rect width="100" height="56.25" fill="${content.pitchColor}"/><g fill="none" stroke="${content.pitchLineColor}" stroke-width=".25" opacity=".88"><rect x="3.5" y="3.5" width="93" height="49.25"/><path d="M50 3.5v49.25"/><circle cx="50" cy="28.125" r="7"/><rect x="3.5" y="15.1" width="11" height="26"/><rect x="85.5" y="15.1" width="11" height="26"/></g>${objects}</svg>`;
}
