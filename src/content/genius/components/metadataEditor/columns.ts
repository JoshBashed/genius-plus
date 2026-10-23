/** One descriptor per editable column, which every cell and header reads. */

/** Which borrowed editor a column renders, in a cell or in a dialog. */
export type ColumnKind = "text" | "artists" | "tags" | "date" | "select";

interface BaseColumn {
    readonly width: string;
    /**
     * Whether one shared value across every row is meaningful, which is what
     * the header's fill menu offers. Titles and media links never are.
     */
    readonly fillable: boolean;
    /** The sticky class a pinned column paints itself with. */
    readonly className: string | null;
}

/** A column, narrowed so its field and its editor cannot disagree. */
export type ColumnSpec =
    | (BaseColumn & {
          readonly kind: "text";
          readonly field: "title" | "soundcloudUrl" | "youtubeUrl";
      })
    | (BaseColumn & {
          readonly kind: "artists";
          readonly field:
              | "primaryArtists"
              | "featuredArtists"
              | "writerArtists"
              | "producerArtists";
      })
    | (BaseColumn & { readonly kind: "tags"; readonly field: "tags" })
    | (BaseColumn & { readonly kind: "date"; readonly field: "releaseDate" })
    | (BaseColumn & {
          readonly kind: "select";
          readonly field: "language" | "primaryTagId";
      });

/** A column whose editor takes a list of chips; only artists are ordered. */
export type TagColumn = Extract<ColumnSpec, { kind: "artists" | "tags" }>;

/** In `DRAFT_FIELDS` order, which is the order the table paints them. */
export const COLUMNS: readonly ColumnSpec[] = [
    {
        className: "gp-pin-title",
        field: "title",
        fillable: false,
        kind: "text",
        width: "15rem",
    },
    {
        className: null,
        field: "primaryArtists",
        fillable: true,
        kind: "artists",
        width: "17rem",
    },
    {
        className: null,
        field: "featuredArtists",
        fillable: true,
        kind: "artists",
        width: "16rem",
    },
    {
        className: null,
        field: "writerArtists",
        fillable: true,
        kind: "artists",
        width: "17rem",
    },
    {
        className: null,
        field: "producerArtists",
        fillable: true,
        kind: "artists",
        width: "17rem",
    },
    {
        className: null,
        field: "releaseDate",
        fillable: true,
        kind: "date",
        width: "16rem",
    },
    {
        className: null,
        field: "language",
        fillable: true,
        kind: "select",
        width: "11rem",
    },
    {
        className: null,
        field: "primaryTagId",
        fillable: true,
        kind: "select",
        width: "11rem",
    },
    {
        className: null,
        field: "tags",
        fillable: true,
        kind: "tags",
        width: "17rem",
    },
    {
        className: null,
        field: "soundcloudUrl",
        fillable: false,
        kind: "text",
        width: "17rem",
    },
    {
        className: null,
        field: "youtubeUrl",
        fillable: false,
        kind: "text",
        width: "17rem",
    },
];

/** Whether the chips of a tag column may be reordered by hand. */
export const isSortable = (column: TagColumn): boolean =>
    column.kind === "artists";
