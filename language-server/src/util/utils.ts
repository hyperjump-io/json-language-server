import type { Annotation } from "../evaluation/Annotation.ts";

export const describeAnnotations = (annotations: Annotation[]) => {
  const lines: string[] = [];
  for (const annotation of annotations) {
    const title = annotation.title();
    if (title) {
      lines.push(`**${title}**`);
    }
    const description = annotation.description();
    if (description) {
      lines.push(description);
    }
  }

  return lines;
};

export const abbreviateUri = (uri: string) => {
  if (!uri.startsWith("file://")) {
    return uri;
  }

  const path = uri.slice("file://".length);
  const segments = path.split("/");
  const basename = segments.pop()!;

  const abbreviated = segments.map((segment) => segment[0]);
  abbreviated.push(basename);

  return abbreviated.join("/");
};
