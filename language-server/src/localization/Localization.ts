import { FluentBundle, FluentResource } from "@fluent/bundle";
import { translations } from "./translations/index.ts";

import type { FluentVariable } from "@fluent/bundle";
import type { SyntaxError } from "../parser/parse.ts";

const DEFAULT_LOCALE = "en-US";

const localizationCache: Map<string, Localization> = new Map();

export class Localization {
  locale: string;
  private bundle: FluentBundle;

  constructor(locale: string, bundle: FluentBundle) {
    this.locale = locale;
    this.bundle = bundle;
  }

  static forLocale(locale: string = DEFAULT_LOCALE): Localization {
    const supportedLocale = locale in translations ? locale : DEFAULT_LOCALE;

    let localization = localizationCache.get(supportedLocale);
    if (!localization) {
      const translation = translations[supportedLocale];
      const bundle = new FluentBundle(supportedLocale, { useIsolating: translation.direction === "rtl" });
      bundle.addResource(new FluentResource(translation.ftl));
      localization = new Localization(supportedLocale, bundle);
      localizationCache.set(supportedLocale, localization);
    }

    return localization;
  }

  private formatMessage(messageId: string, args: Record<string, FluentVariable>) {
    const message = this.bundle.getMessage(messageId);
    if (!message?.value) {
      return;
    }
    return this.bundle.formatPattern(message.value, args);
  }

  getMessage(messageId: string, args: Record<string, FluentVariable> = {}): string {
    return this.formatMessage(`${messageId}-message`, args) ?? messageId;
  }

  getSyntaxErrorMessage(error: SyntaxError): string {
    return this.formatMessage(`${error.code}-message`, error.data ?? {})
      ?? this.formatMessage("unknown-message", { code: error.code })
      ?? error.code;
  }
}
