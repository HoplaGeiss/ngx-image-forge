/**
 * The result emitted after a successful crop operation.
 */
export interface NgxCroppedImage {
  /** The cropped image as a Blob, ready for upload. */
  blob: Blob;
  /** Base64 data URL of the cropped image, suitable for `<img src>`. */
  dataUrl: string;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Natural width of the original image in pixels. */
  originalWidth: number;
  /** Natural height of the original image in pixels. */
  originalHeight: number;
}

/** Supported output MIME format. */
export type NgxOutputFormat = 'jpeg' | 'png' | 'webp';

/** Aspect ratio constraint — a numeric ratio (w/h) or 'free' for unconstrained. */
export type NgxAspectRatio = number | 'free';

/**
 * Configuration object accepted by `NgxImageForgeService.open()` and the
 * `[ngxImageEditorTrigger]` directive. Every field mirrors an input on
 * `NgxImageEditorComponent`.
 */
export interface NgxImageForgeConfig {
  /** The image source — a `File` object or a publicly accessible URL. */
  image?: File | string;

  /**
   * Aspect ratio constraint for the crop rectangle.
   * Pass a number as width/height (e.g. `16/9`) or `'free'` (default).
   */
  aspectRatio?: NgxAspectRatio;

  /** Maximum output width in pixels. The crop is downscaled to this if it exceeds it. */
  maxWidth?: number;

  /** Maximum output height in pixels. */
  maxHeight?: number;

  /**
   * Encoding quality 0–1 for JPEG and WebP output.
   * @default 0.92
   */
  quality?: number;

  /**
   * Output MIME format.
   * @default 'jpeg'
   */
  outputFormat?: NgxOutputFormat;

  /**
   * When `true`, applies a circular clip mask to the crop output.
   * @default false
   */
  roundCrop?: boolean;

  /**
   * Minimum width in canvas pixels for the crop rectangle.
   * @default 50
   */
  minCropWidth?: number;

  /**
   * Minimum height in canvas pixels for the crop rectangle.
   * @default 50
   */
  minCropHeight?: number;

  // ── Visual / UX tunables ────────────────────────────────────────────────────

  /**
   * Side length in pixels of each resize handle square.
   * @default 10
   */
  handleSize?: number;

  /**
   * Hit-test radius in pixels around each handle center. Larger values make
   * handles easier to grab on touch devices.
   * @default 16
   */
  handleHitArea?: number;

  /**
   * Opacity (0–1) of the dark overlay drawn outside the crop rectangle.
   * @default 0.55
   */
  overlayOpacity?: number;

  /**
   * CSS colour string for the crop-rectangle border.
   * @default '#ffffff'
   */
  cropBorderColor?: string;

  /**
   * Width in pixels of the crop-rectangle border.
   * @default 1.5
   */
  cropBorderWidth?: number;

  /**
   * CSS colour string for the resize handle fill.
   * @default '#ffffff'
   */
  handleColor?: string;
}

// ── Internal geometry types (not exported from public-api) ──────────────────

/** Axis-aligned rectangle in canvas display space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 2-D point. */
export interface Point {
  x: number;
  y: number;
}

/** Canvas logical pixel dimensions. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Pre-computed metrics describing how the source image maps onto the canvas
 * after rotation and scale-to-fit.
 */
export interface ImageBounds {
  /** Canvas X of the image centre. */
  cx: number;
  /** Canvas Y of the image centre. */
  cy: number;
  /**
   * Width used when drawing the image with ctx.drawImage (before rotation
   * transform — i.e. at naturalWidth * scale).
   */
  drawWidth: number;
  /** Height used when drawing the image (naturalHeight * scale). */
  drawHeight: number;
  /** Left edge of the axis-aligned bounding box of the rotated image. */
  bboxX: number;
  /** Top edge of the axis-aligned bounding box of the rotated image. */
  bboxY: number;
  /** Width of the axis-aligned bounding box of the rotated image. */
  bboxWidth: number;
  /** Height of the axis-aligned bounding box of the rotated image. */
  bboxHeight: number;
  /** Uniform scale factor applied to the image to make it fit the canvas. */
  scale: number;
}

/**
 * The eight resize handle positions around the crop rectangle, plus 'move'
 * for the interior drag action.
 */
export type HandleType =
  | 'tl' | 'tc' | 'tr'
  | 'ml' | 'mr'
  | 'bl' | 'bc' | 'br'
  | 'move';

/** A handle entry returned by the handle-position helper. */
export interface HandleInfo {
  x: number;
  y: number;
  type: HandleType;
}
