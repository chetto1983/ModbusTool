import { afterEach, describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import { currentLocale, initialLocale, languageName, locales, setLanguage } from "./i18n.svelte";
import { encode } from "./datatypes";

afterEach(() => {
  setLanguage("en");
});

describe("initialLocale", () => {
  it("prefers the saved language", () => {
    expect(initialLocale("it", ["en-US"])).toBe("it");
  });

  it("falls back to the first system language available, by its language subtag", () => {
    expect(initialLocale(null, ["fr-FR", "it-IT", "en"])).toBe("it");
    expect(initialLocale("xx", ["EN-gb"])).toBe("en");
  });

  it("ends at the base language", () => {
    expect(initialLocale(null, ["fr", "de-DE"])).toBe("en");
    expect(initialLocale(null, [])).toBe("en");
  });
});

describe("setLanguage", () => {
  it("switches the messages without a reload, and remembers the choice", () => {
    expect(m.common_add()).toBe("+ Add");
    setLanguage("it");
    expect(currentLocale()).toBe("it");
    expect(m.common_add()).toBe("+ Aggiungi");
    expect(m.master_updated_ago({ seconds: "5" })).toBe("aggiornato 5 s fa");
    expect(document.documentElement.lang).toBe("it");
    expect(localStorage.getItem("locale")).toBe("it");
  });

  it("translates validation errors created after the switch", () => {
    setLanguage("it");
    expect(() => encode("abc", "uint16")).toThrow('"abc" non è un intero');
  });
});

describe("languageName", () => {
  it("names every language in itself, capitalised", () => {
    expect(locales.map(languageName)).toEqual(["English", "Italiano"]);
  });
});
