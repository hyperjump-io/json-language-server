import { JsonSchemaAnnotation } from "./JsonSchemaAnnotation.ts";
import { VscodeAnnotation } from "./VscodeAnnotation.ts";

// The annotations one schema contributed to an instance location, with the
// accessors of every vocabulary. A vocabulary's mixin overrides the accessors of
// the ones it's applied to, so their order matters.
export class Annotation extends VscodeAnnotation(JsonSchemaAnnotation) {}

// The annotation that deprecates a location or value, preferring one that
// says why. Undefined if none of them deprecate it.
export const findDeprecated = (annotations: Annotation[]): Annotation | undefined => {
  const deprecated = annotations.filter((annotation) => annotation.deprecated());
  return deprecated.find((annotation) => annotation.markdownDeprecationMessage() !== undefined) ?? deprecated[0];
};
