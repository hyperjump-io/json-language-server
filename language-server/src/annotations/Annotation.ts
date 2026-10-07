import { JsonSchemaAnnotation } from "./JsonSchemaAnnotation.ts";
import { VscodeAnnotation } from "../vocabularies/vscode.ts";

// The annotations one schema contributed to an instance location, with the
// accessors of every vocabulary. A vocabulary's mixin overrides the accessors of
// the ones it's applied to, so their order matters.
export class Annotation extends VscodeAnnotation(JsonSchemaAnnotation) {}
