/**
 * Minimal ambient declarations for the Foundry VTT v14 API surface this system
 * uses. No community v14 types exist yet (fvtt-types is still on v13), so we
 * declare exactly what we consume — accurately typed at our boundary, loose
 * (`unknown`) where Foundry internals don't concern us.
 *
 * Verified against the v14 API docs (build 14.365): TypeDataModel,
 * foundry.data.fields, ApplicationV2/DocumentSheetV2 + HandlebarsApplicationMixin,
 * foundry.documents.collections.*.registerSheet, foundry.dice.Roll.
 */

export {};

declare global {
  // ---------------------------------------------------------------- Documents

  interface FoundryDocument {
    readonly id: string;
    readonly uuid: string;
    name: string;
    img: string;
    readonly type: string;
    /** Ownership at the OWNER level — gates secret blocks in enriched text. */
    readonly isOwner: boolean;
    update(data: Record<string, unknown>): Promise<unknown>;
    delete(): Promise<unknown>;
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    unsetFlag(scope: string, key: string): Promise<unknown>;
    sheet: { render(force?: boolean): unknown };
  }

  /**
   * Scenes carry the ambient weather and radiation zone (pg 121-124) in a
   * system flag. Probed on 14.365: `game.scenes.viewed`, `.current`, `.active`
   * and `canvas.scene` all resolve, and flags round-trip through unsetFlag.
   */
  interface FoundryScene extends FoundryDocument {
    readonly active: boolean;
  }

  /**
   * v14 ActiveEffect: a typed document whose changes live in `system.changes`
   * as `{key, type, value, phase, priority}` — the numeric `mode` of earlier
   * versions is gone, and `phase` selects whether the change lands before
   * ("initial") or after ("final") prepareDerivedData.
   */
  interface FoundryActiveEffect extends FoundryDocument {
    readonly disabled: boolean;
    readonly active: boolean;
    readonly isTemporary: boolean;
    readonly duration: {
      value: number | null;
      units: string;
      remaining?: number | null;
      label?: string;
      expired?: boolean;
    };
  }

  interface FoundryActor extends FoundryDocument {
    system: object;
    readonly hasPlayerOwner: boolean;
    /**
      * Status effect ids on this actor. Optional because it is not verified to
      * be populated on the first data-preparation pass, so readers guard it.
      */
    readonly statuses?: Set<string>;
    /**
     * Whether this actor is a combatant in the *active* combat encounter.
     *
     * Probed on 14.365 rather than assumed: it is a plain boolean, and it is
     * false for an actor in a combat that exists but is not the active one,
     * which is exactly the distinction the AP pool needs. Outside combat there
     * is no turn to refill a pool at, so nothing may drain one.
     */
    readonly inCombat: boolean;
    readonly items: FoundryCollection<FoundryItem>;
    readonly itemTypes: Record<string, FoundryItem[]>;
    readonly effects: FoundryCollection<FoundryActiveEffect>;
    createEmbeddedDocuments(embeddedName: "Item", data: object[]): Promise<FoundryItem[]>;
    createEmbeddedDocuments(
      embeddedName: "ActiveEffect",
      data: object[],
    ): Promise<FoundryActiveEffect[]>;
    deleteEmbeddedDocuments(embeddedName: "Item" | "ActiveEffect", ids: string[]): Promise<unknown>;
    updateEmbeddedDocuments(
      embeddedName: "Item" | "ActiveEffect",
      updates: object[],
    ): Promise<unknown>;
    /** Own effects plus the transferring effects of owned items (v14). */
    allApplicableEffects(): Iterable<FoundryActiveEffect>;
    toggleStatusEffect(statusId: string, options?: { active?: boolean }): Promise<unknown>;
  }

  interface FoundryItem extends FoundryDocument {
    system: object;
    readonly actor: FoundryActor | null;
    readonly effects: FoundryCollection<FoundryActiveEffect>;
    createEmbeddedDocuments(
      embeddedName: "ActiveEffect",
      data: object[],
    ): Promise<FoundryActiveEffect[]>;
    deleteEmbeddedDocuments(embeddedName: "ActiveEffect", ids: string[]): Promise<unknown>;
    updateEmbeddedDocuments(embeddedName: "ActiveEffect", updates: object[]): Promise<unknown>;
  }

  interface FoundryCollection<T> extends Iterable<T> {
    get(id: string): T | undefined;
    filter(predicate: (value: T) => boolean): T[];
    readonly contents: T[];
  }

  interface ChatSpeakerData {
    actor?: string | null;
    alias?: string;
  }

  // ------------------------------------------------------------------- Hooks

  const Hooks: {
    once(hook: "init" | "ready", fn: () => void): number;
    on(hook: string, fn: (...args: unknown[]) => unknown): number;
  };

  // ---------------------------------------------------------------------- UI

  const ui: {
    notifications: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
    };
  };

  // -------------------------------------------------------------------- Game

  /** A compendium pack, narrowed to what this system reads. */
  interface CompendiumPack {
    readonly metadata: { readonly id: string; readonly label: string };
    getIndex(): Promise<FoundryCollection<{ readonly _id: string; readonly name: string }>>;
    getDocument(id: string): Promise<FoundryDocument | null>;
    getDocuments(): Promise<FoundryItem[]>;
  }

  const game: {
    readonly i18n: {
      /** v14: format() was merged into localize(). */
      localize(key: string, data?: Record<string, string | number>): string;
    };
    readonly user: {
      readonly isGM: boolean;
      readonly id: string;
      readonly targets: Set<{ readonly actor: FoundryActor | null; readonly name: string }>;
    };
    /** `activeGM` is the single GM Foundry nominates for world housekeeping. */
    readonly users?: { readonly activeGM?: { readonly id: string } | null };
    readonly actors: FoundryCollection<FoundryActor>;
    readonly items: FoundryCollection<FoundryItem>;
    /**
     * Compendium packs. Only the slice this system uses is declared, and
     * deliberately so — the shipped compendia are read for their documents and
     * their index, never written. `getIndex`'s projection argument is left off
     * because it has not been probed on 14.365, and the working agreement is
     * not to build on a v14 API sight-unseen.
     */
    readonly packs: {
      get(id: string): CompendiumPack | undefined;
    };
    readonly scenes?: FoundryCollection<FoundryScene> & {
      /** The scene the user is looking at; falls back to the active one. */
      readonly viewed?: FoundryScene | null;
      readonly current?: FoundryScene | null;
      readonly active?: FoundryScene | null;
    };
    readonly time: { readonly worldTime: number; advance(seconds: number): Promise<unknown> };
    readonly settings: {
      register(
        namespace: string,
        key: string,
        data: {
          name: string;
          hint?: string;
          scope: "client" | "world" | "user";
          config: boolean;
          type: unknown;
          default: unknown;
          choices?: Record<string, string>;
          onChange?: (value: unknown) => void;
        },
      ): void;
      /** Renders a button in Configure Settings that opens (or in our case runs) an Application. */
      registerMenu(
        namespace: string,
        key: string,
        data: {
          name: string;
          hint?: string;
          label: string;
          icon?: string;
          type: unknown;
          restricted?: boolean;
        },
      ): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
  };

  // ------------------------------------------------------------------ CONFIG

  const CONFIG: {
    Actor: {
      dataModels: Record<string, unknown>;
      trackableAttributes: Record<string, { bar: string[]; value: string[] }>;
    };
    Item: { dataModels: Record<string, unknown> };
    Combat: { initiative: { formula: string; decimals: number } };
  };

  // ----------------------------------------------------------------- foundry

  namespace foundry {
    namespace abstract {
      class TypeDataModel {
        constructor(...args: unknown[]);
        static defineSchema(): Record<string, unknown>;
        /** The document that owns this system-data model. */
        readonly parent: FoundryActor & FoundryItem;
        prepareBaseData(): void;
        prepareDerivedData(): void;
        toObject(): Record<string, unknown>;
      }
    }

    namespace data {
      namespace fields {
        interface NumberFieldOptions {
          required?: boolean;
          nullable?: boolean;
          integer?: boolean;
          initial?: number | null;
          min?: number;
          max?: number;
          choices?: readonly number[];
          label?: string;
        }
        interface StringFieldOptions {
          required?: boolean;
          nullable?: boolean;
          blank?: boolean;
          initial?: string;
          choices?: readonly string[] | Record<string, string>;
          label?: string;
        }
        class DataField {
          constructor(options?: object);
        }
        class SchemaField extends DataField {
          constructor(fields: Record<string, DataField>, options?: object);
        }
        class StringField extends DataField {
          constructor(options?: StringFieldOptions);
        }
        class HTMLField extends StringField {}
        class NumberField extends DataField {
          constructor(options?: NumberFieldOptions);
        }
        class BooleanField extends DataField {
          constructor(options?: { required?: boolean; initial?: boolean; label?: string });
        }
        class ArrayField extends DataField {
          constructor(
            element: DataField,
            options?: { required?: boolean; initial?: unknown[]; label?: string },
          );
        }
      }
    }

    namespace dice {
      class Roll {
        constructor(formula: string, data?: Record<string, unknown>);
        evaluate(): Promise<this>;
        readonly total: number;
        readonly formula: string;
        readonly dice: { results: { result: number; active: boolean }[]; total: number }[];
        toMessage(messageData?: {
          speaker?: ChatSpeakerData;
          flavor?: string;
          flags?: Record<string, unknown>;
        }): Promise<unknown>;
      }
    }

    namespace documents {
      class ChatMessage {
        static getSpeaker(options?: { actor?: FoundryActor }): ChatSpeakerData;
        static create(data: Record<string, unknown>): Promise<unknown>;
      }
      namespace collections {
        const Actors: {
          registerSheet(
            scope: string,
            sheetClass: unknown,
            options?: { types?: string[]; makeDefault?: boolean; label?: string },
          ): void;
          unregisterSheet(scope: string, sheetClass: unknown, options?: { types?: string[] }): void;
        };
        const Items: {
          registerSheet(
            scope: string,
            sheetClass: unknown,
            options?: { types?: string[]; makeDefault?: boolean; label?: string },
          ): void;
          unregisterSheet(scope: string, sheetClass: unknown, options?: { types?: string[] }): void;
        };
      }
    }

    namespace appv1 {
      namespace sheets {
        const ActorSheet: unknown;
        const ItemSheet: unknown;
      }
    }

    namespace applications {
      namespace api {
        interface ApplicationRenderOptions {
          isFirstRender?: boolean;
        }
        interface ApplicationConfiguration {
          classes?: string[];
          position?: { width?: number; height?: number | "auto"; top?: number; left?: number };
          window?: { title?: string; resizable?: boolean; icon?: string };
          form?: { submitOnChange?: boolean; closeOnSubmit?: boolean };
          actions?: Record<
            string,
            (this: unknown, event: PointerEvent, target: HTMLElement) => void | Promise<void>
          >;
          tag?: string;
        }
        class ApplicationV2 {
          constructor(options?: object);
          static DEFAULT_OPTIONS: ApplicationConfiguration;
          readonly element: HTMLElement;
          render(options?: { force?: boolean }): Promise<this>;
          close(): Promise<this>;
          protected _prepareContext(
            options: ApplicationRenderOptions,
          ): Promise<Record<string, unknown>>;
          protected _onRender(
            context: Record<string, unknown>,
            options: ApplicationRenderOptions,
          ): Promise<void>;
        }
        class DocumentSheetV2 extends ApplicationV2 {
          readonly document: FoundryActor & FoundryItem;
          readonly isEditable: boolean;
        }
        class DialogV2 {
          static wait(config: {
            window?: { title?: string };
            content?: string;
            modal?: boolean;
            rejectClose?: boolean;
            buttons: {
              action: string;
              label: string;
              icon?: string;
              default?: boolean;
              callback?: (
                event: Event,
                button: HTMLButtonElement,
                dialog: unknown,
              ) => unknown;
            }[];
          }): Promise<unknown>;
        }
        /** Adds PARTS-based Handlebars rendering to an ApplicationV2 class. */
        function HandlebarsApplicationMixin<
          T extends abstract new (...args: never[]) => ApplicationV2,
        >(
          base: T,
        ): T & {
          PARTS: Record<string, { template: string; scrollable?: string[] }>;
        };
      }
      namespace sheets {
        class ActorSheetV2 extends api.DocumentSheetV2 {
          readonly actor: FoundryActor;
        }
        class ItemSheetV2 extends api.DocumentSheetV2 {
          readonly item: FoundryItem;
        }
      }
      namespace apps {
        /** v13+ moved FilePicker here; `implementation` is the active subclass. */
        const FilePicker: {
          implementation: {
            browse(
              source: "data" | "public" | "s3",
              target: string,
              options?: { extensions?: string[] },
            ): Promise<{ target: string; dirs: string[]; files: string[] }>;
          };
        };
      }
      namespace handlebars {
        function loadTemplates(paths: string[]): Promise<unknown>;
      }
      namespace ux {
        /** v13+ moved TextEditor here; `implementation` is the active subclass. */
        const TextEditor: {
          implementation: {
            enrichHTML(
              content: string,
              options?: { secrets?: boolean; relativeTo?: unknown; rollData?: object },
            ): Promise<string>;
          };
          enrichHTML(content: string, options?: object): Promise<string>;
        };
      }
    }
  }
}
