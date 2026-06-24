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
