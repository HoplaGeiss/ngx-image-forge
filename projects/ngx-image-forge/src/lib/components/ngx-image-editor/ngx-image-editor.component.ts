import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  HandleInfo,
  HandleType,
  ImageBounds,
  NgxAspectRatio,
  NgxCroppedImage,
  NgxImageForgeConfig,
  NgxOutputFormat,
  Point,
  Rect,
  Size,
} from '../../models/ngx-image-forge.models';

// ── Default values ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  handleSize: 10,
  handleHitArea: 16,
  overlayOpacity: 0.55,
  cropBorderColor: '#ffffff',
  cropBorderWidth: 1.5,
  handleColor: '#ffffff',
} as const;

// ── Pure geometry helpers (no Angular dependency) ────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getHandlePositions(cr: Rect): HandleInfo[] {
  const { x, y, width, height } = cr;
  return [
    { x, y, type: 'tl' },
    { x: x + width / 2, y, type: 'tc' },
    { x: x + width, y, type: 'tr' },
    { x, y: y + height / 2, type: 'ml' },
    { x: x + width, y: y + height / 2, type: 'mr' },
    { x, y: y + height, type: 'bl' },
    { x: x + width / 2, y: y + height, type: 'bc' },
    { x: x + width, y: y + height, type: 'br' },
  ];
}

function hitTestHandle(
  px: number,
  py: number,
  handles: HandleInfo[],
  hitArea: number,
): HandleType | null {
  const half = hitArea / 2;
  for (const h of handles) {
    if (Math.abs(px - h.x) <= half && Math.abs(py - h.y) <= half) {
      return h.type;
    }
  }
  return null;
}

function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

/**
 * Compute where to draw the image on the canvas and the bounding box of the
 * rotated image, both in canvas display-space pixels.
 */
function calcImageBounds(
  naturalWidth: number,
  naturalHeight: number,
  rotation: number,
  canvasW: number,
  canvasH: number,
): ImageBounds {
  const rad = (rotation * Math.PI) / 180;
  const sinA = Math.abs(Math.sin(rad));
  const cosA = Math.abs(Math.cos(rad));

  const bboxNW = naturalWidth * cosA + naturalHeight * sinA;
  const bboxNH = naturalWidth * sinA + naturalHeight * cosA;

  const scale = Math.min(canvasW / bboxNW, canvasH / bboxNH);

  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  const bboxWidth = bboxNW * scale;
  const bboxHeight = bboxNH * scale;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  return {
    cx,
    cy,
    drawWidth,
    drawHeight,
    bboxX: cx - bboxWidth / 2,
    bboxY: cy - bboxHeight / 2,
    bboxWidth,
    bboxHeight,
    scale,
  };
}

/**
 * Recalculate a crop rect after the image bounds have changed (e.g. rotation
 * or canvas resize). Maps the old rect proportionally into the new bounds.
 */
function remapCropRect(
  old: Rect,
  oldBounds: ImageBounds,
  newBounds: ImageBounds,
): Rect {
  const scaleX = newBounds.bboxWidth / oldBounds.bboxWidth;
  const scaleY = newBounds.bboxHeight / oldBounds.bboxHeight;
  return {
    x: newBounds.bboxX + (old.x - oldBounds.bboxX) * scaleX,
    y: newBounds.bboxY + (old.y - oldBounds.bboxY) * scaleY,
    width: old.width * scaleX,
    height: old.height * scaleY,
  };
}

/** Constrain a Rect so it cannot leave `bounds`. */
function clampRect(r: Rect, bounds: Rect): Rect {
  const x = clamp(r.x, bounds.x, bounds.x + bounds.width - r.width);
  const y = clamp(r.y, bounds.y, bounds.y + bounds.height - r.height);
  return { ...r, x, y };
}

/** Convert a base64 data-URL to a Blob synchronously. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const bstr = atob(data);
  const bytes = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The primary image-editing component. Drop it into a template, bind an image
 * source, and call `crop()` via a `viewChild` reference to get the result.
 *
 * @example
 * ```html
 * <ngx-image-editor [image]="file" aspectRatio="1" #editor />
 * <button (click)="editor.crop().then(onCrop)">Crop</button>
 * ```
 */
@Component({
  selector: 'ngx-image-editor',
  imports: [DecimalPipe],
  templateUrl: './ngx-image-editor.component.html',
  styleUrl: './ngx-image-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngx-image-editor',
    '[class.ngx-image-editor--loaded]': 'isLoaded()',
    '[class.ngx-image-editor--round]': 'roundCrop()',
  },
})
export class NgxImageEditorComponent implements OnInit {
  // ── Injected services ──────────────────────────────────────────────────────

  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  // ── Public inputs ──────────────────────────────────────────────────────────

  /** Source image — a File object or a URL string. */
  readonly image = input<File | string | null>(null);

  /** Aspect ratio for the crop rectangle (number = w/h, or 'free'). */
  readonly aspectRatio = input<NgxAspectRatio>('free');

  /** Maximum output width in pixels; the crop is downscaled to this. */
  readonly maxWidth = input<number>(0);

  /** Maximum output height in pixels. */
  readonly maxHeight = input<number>(0);

  /** JPEG/WebP encoding quality, 0–1. */
  readonly quality = input<number>(0.92);

  /** Output MIME type. */
  readonly outputFormat = input<NgxOutputFormat>('jpeg');

  /** Apply circular clip mask to the crop output and live preview. */
  readonly roundCrop = input<boolean>(false);

  /** Minimum crop-rectangle width in canvas pixels. */
  readonly minCropWidth = input<number>(50);

  /** Minimum crop-rectangle height in canvas pixels. */
  readonly minCropHeight = input<number>(50);

  // ── Visual config (mirrors NgxImageForgeConfig tunables) ──────────────────

  /** Side length in pixels of each resize handle square. */
  readonly handleSize = input<number>(DEFAULTS.handleSize);

  /** Hit-test radius in pixels around each handle; larger = easier to grab. */
  readonly handleHitArea = input<number>(DEFAULTS.handleHitArea);

  /** Opacity of the dark overlay drawn outside the crop rectangle. */
  readonly overlayOpacity = input<number>(DEFAULTS.overlayOpacity);

  /** CSS colour for the crop-rectangle border. */
  readonly cropBorderColor = input<string>(DEFAULTS.cropBorderColor);

  /** Width in pixels of the crop-rectangle border. */
  readonly cropBorderWidth = input<number>(DEFAULTS.cropBorderWidth);

  /** CSS colour for the resize handles. */
  readonly handleColor = input<string>(DEFAULTS.handleColor);

  // ── Outputs ────────────────────────────────────────────────────────────────

  /** Emitted when the image has finished loading and is ready for editing. */
  readonly imageLoaded = output<{ naturalWidth: number; naturalHeight: number }>();

  /** Emitted when the image fails to load. */
  readonly loadError = output<string | Event>();

  /** Emitted immediately after a successful `crop()` call. */
  readonly imageCropped = output<NgxCroppedImage>();

  // ── Canvas refs ────────────────────────────────────────────────────────────

  private readonly mainCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('mainCanvas');
  private readonly previewCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('previewCanvas');

  // ── Internal state ─────────────────────────────────────────────────────────

  /** The loaded HTMLImageElement (null while loading or no source). */
  private readonly loadedImage = signal<HTMLImageElement | null>(null);

  /** Total rotation angle in degrees (accumulates step + free-angle). */
  readonly rotation = signal<number>(0);

  /** Horizontal flip state. */
  readonly flipH = signal<boolean>(false);

  /** Vertical flip state. */
  readonly flipV = signal<boolean>(false);

  /** Crop rectangle in canvas display-space pixels. */
  private readonly cropRect = signal<Rect | null>(null);

  /** Logical pixel size of the main canvas (updated by ResizeObserver). */
  private readonly canvasSize = signal<Size>({ width: 0, height: 0 });

  /** Whether an image is currently loaded and ready. */
  readonly isLoaded = signal<boolean>(false);

  // ── Drag state (non-reactive plain fields — mutated inside zone.runOutsideAngular) ──

  private dragActive = false;
  private activeHandle: HandleType | null = null;
  private dragStart: Point = { x: 0, y: 0 };
  private cropAtDragStart: Rect | null = null;

  /** Object URL created for a File source — revoked when a new one is set. */
  private currentObjectUrl: string | null = null;

  /** Pre-computed bounds, reused across draw calls. */
  private currentBounds: ImageBounds | null = null;

  /** Cached handles list, recomputed when cropRect changes. */
  private currentHandles: HandleInfo[] = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Clean up resources when the component is destroyed.
    this.destroyRef.onDestroy(() => this.revokeObjectUrl());
  }

  constructor() {
    // React to image source changes.
    effect(() => {
      const src = this.image();
      this.isLoaded.set(false);
      this.cropRect.set(null);
      this.rotation.set(0);
      this.flipH.set(false);
      this.flipV.set(false);
      if (src) {
        this.loadImageSource(src);
      } else {
        this.loadedImage.set(null);
      }
    });

    // Main render effect — runs whenever any visual state changes.
    effect(() => {
      const canvas = this.mainCanvasRef()?.nativeElement;
      if (!canvas) return;

      // Declare all signal reads so Angular tracks them as dependencies.
      const img = this.loadedImage();
      const rotation = this.rotation();
      const flipH = this.flipH();
      const flipV = this.flipV();
      const cropRect = this.cropRect();
      const size = this.canvasSize();

      if (!img || !size.width || !size.height) {
        this.clearCanvas(canvas);
        return;
      }

      // Sync canvas pixel dimensions to container size.
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;

      const bounds = calcImageBounds(
        img.naturalWidth,
        img.naturalHeight,
        rotation,
        size.width,
        size.height,
      );

      // If image bounds changed (rotation or resize), remap the crop rect.
      if (cropRect) {
        const remapped =
          this.currentBounds && this.boundsChanged(this.currentBounds, bounds)
            ? remapCropRect(cropRect, this.currentBounds, bounds)
            : cropRect;
        this.currentBounds = bounds;
        const clamped = this.clampCropToImage(remapped, bounds);
        if (
          clamped.x !== cropRect.x ||
          clamped.y !== cropRect.y ||
          clamped.width !== cropRect.width ||
          clamped.height !== cropRect.height
        ) {
          this.cropRect.set(clamped);
          return; // The cropRect set triggers another render pass.
        }
      } else {
        this.currentBounds = bounds;
      }

      this.drawCanvas(canvas, img, rotation, flipH, flipV, cropRect, bounds);
      this.currentHandles = cropRect ? getHandlePositions(cropRect) : [];
      this.drawPreview(img, rotation, flipH, flipV, cropRect, bounds);
    });

    // Set up resize observation after the first render.
    afterNextRender(() => this.attachResizeObserver());
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Perform the crop and return the result synchronously.
   * Throws if no image has been loaded.
   */
  crop(): NgxCroppedImage {
    const img = this.loadedImage();
    const cr = this.cropRect();
    const bounds = this.currentBounds;
    const size = this.canvasSize();

    if (!img || !cr || !bounds) {
      throw new Error('[ngx-image-forge] Cannot crop: no image is loaded.');
    }

    const format = this.outputFormat();
    const quality = this.quality();
    const maxW = this.maxWidth();
    const maxH = this.maxHeight();

    // Render the transformed image to an offscreen canvas that mirrors the
    // display canvas exactly — no overlay, no handles.
    const offscreen = document.createElement('canvas');
    offscreen.width = size.width;
    offscreen.height = size.height;
    const offCtx = offscreen.getContext('2d')!;
    this.drawTransformedImage(
      offCtx,
      img,
      this.rotation(),
      this.flipH(),
      this.flipV(),
      bounds,
    );

    // Determine output dimensions (downscale if maxWidth/maxHeight apply).
    let outW = Math.round(cr.width);
    let outH = Math.round(cr.height);
    if (maxW > 0 && outW > maxW) {
      outH = Math.round((outH / outW) * maxW);
      outW = maxW;
    }
    if (maxH > 0 && outH > maxH) {
      outW = Math.round((outW / outH) * maxH);
      outH = maxH;
    }

    const output = document.createElement('canvas');
    output.width = outW;
    output.height = outH;
    const outCtx = output.getContext('2d')!;

    if (this.roundCrop()) {
      outCtx.save();
      outCtx.beginPath();
      outCtx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
      outCtx.clip();
    }

    outCtx.drawImage(
      offscreen,
      Math.round(cr.x), Math.round(cr.y),
      Math.round(cr.width), Math.round(cr.height),
      0, 0,
      outW, outH,
    );

    if (this.roundCrop()) outCtx.restore();

    const dataUrl = output.toDataURL(`image/${format}`, quality);
    const blob = dataUrlToBlob(dataUrl);

    const result: NgxCroppedImage = {
      blob,
      dataUrl,
      width: outW,
      height: outH,
      originalWidth: img.naturalWidth,
      originalHeight: img.naturalHeight,
    };

    this.imageCropped.emit(result);
    return result;
  }

  /** Restore the image to its initial state (rotation 0, no flip, full crop). */
  reset(): void {
    this.rotation.set(0);
    this.flipH.set(false);
    this.flipV.set(false);
    const bounds = this.currentBounds;
    if (bounds) {
      this.cropRect.set(this.fullImageCropRect(bounds));
    }
  }

  /**
   * Rotate the image by `degrees`. Use multiples of 90 for lossless steps;
   * any angle is accepted for the free-angle slider.
   */
  rotate(degrees: number): void {
    this.rotation.update(r => r + degrees);
  }

  /** Set the exact rotation angle in degrees. */
  setRotation(degrees: number): void {
    this.rotation.set(degrees);
  }

  /** Toggle horizontal flip. */
  flipHorizontal(): void {
    this.flipH.update(v => !v);
  }

  /** Toggle vertical flip. */
  flipVertical(): void {
    this.flipV.update(v => !v);
  }

  // ── Template event handlers ────────────────────────────────────────────────

  onSliderInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.rotation.set(Number(input.value));
  }

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startDrag(this.canvasPoint(event));
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.dragActive) return;
    this.updateDrag(this.canvasPoint(event));
  }

  onMouseUp(): void {
    this.endDrag();
  }

  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const t = event.touches[0];
    if (t) this.startDrag(this.canvasPoint(t));
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const t = event.touches[0];
    if (t && this.dragActive) this.updateDrag(this.canvasPoint(t));
  }

  onTouchEnd(): void {
    this.endDrag();
  }

  // ── Private: image loading ─────────────────────────────────────────────────

  private loadImageSource(source: File | string): void {
    this.revokeObjectUrl();
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      this.zone.run(() => {
        this.loadedImage.set(img);
        this.isLoaded.set(true);
        this.imageLoaded.emit({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
        // initialise crop rect once bounds are known
        const size = this.canvasSize();
        if (size.width && size.height) {
          const bounds = calcImageBounds(
            img.naturalWidth,
            img.naturalHeight,
            0,
            size.width,
            size.height,
          );
          this.currentBounds = bounds;
          this.cropRect.set(this.fullImageCropRect(bounds));
        }
      });
    };

    img.onerror = (e) => {
      this.zone.run(() => {
        this.loadError.emit(e);
        this.isLoaded.set(false);
      });
    };

    if (source instanceof File) {
      const url = URL.createObjectURL(source);
      this.currentObjectUrl = url;
      img.src = url;
    } else {
      img.src = source;
    }
  }

  private revokeObjectUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  // ── Private: ResizeObserver ────────────────────────────────────────────────

  private attachResizeObserver(): void {
    const wrapper = this.mainCanvasRef()?.nativeElement.parentElement;
    if (!wrapper) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      this.zone.run(() => {
        const newSize = { width: Math.round(width), height: Math.round(height) };
        const oldSize = this.canvasSize();
        if (newSize.width === oldSize.width && newSize.height === oldSize.height) return;
        this.canvasSize.set(newSize);

        // Initialise crop rect if image is already loaded (e.g. initial render).
        const img = this.loadedImage();
        if (img && !this.cropRect()) {
          const bounds = calcImageBounds(
            img.naturalWidth,
            img.naturalHeight,
            this.rotation(),
            newSize.width,
            newSize.height,
          );
          this.currentBounds = bounds;
          this.cropRect.set(this.fullImageCropRect(bounds));
        }
      });
    });

    ro.observe(wrapper);
    this.destroyRef.onDestroy(() => ro.disconnect());
  }

  // ── Private: canvas drawing ────────────────────────────────────────────────

  private drawCanvas(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    rotation: number,
    flipH: boolean,
    flipV: boolean,
    cropRect: Rect | null,
    bounds: ImageBounds,
  ): void {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawTransformedImage(ctx, img, rotation, flipH, flipV, bounds);
    if (!cropRect) return;
    this.drawOverlay(ctx, cropRect, canvas.width, canvas.height);
    this.drawCropBorder(ctx, cropRect);
    this.drawHandles(ctx, cropRect);
  }

  private drawTransformedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    rotation: number,
    flipH: boolean,
    flipV: boolean,
    bounds: ImageBounds,
  ): void {
    const { cx, cy, drawWidth, drawHeight } = bounds;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    cr: Rect,
    cw: number,
    ch: number,
  ): void {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${this.overlayOpacity()})`;

    if (this.roundCrop()) {
      // Draw overlay everywhere, then punch a circular hole over the crop area.
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.arc(
        cr.x + cr.width / 2,
        cr.y + cr.height / 2,
        Math.min(cr.width, cr.height) / 2,
        0,
        Math.PI * 2,
        true, // counter-clockwise = subtractive
      );
      ctx.fill('evenodd');
    } else {
      // Four rectangles surrounding the crop rect.
      ctx.fillRect(0, 0, cw, cr.y);
      ctx.fillRect(0, cr.y + cr.height, cw, ch - cr.y - cr.height);
      ctx.fillRect(0, cr.y, cr.x, cr.height);
      ctx.fillRect(cr.x + cr.width, cr.y, cw - cr.x - cr.width, cr.height);
    }

    ctx.restore();
  }

  private drawCropBorder(ctx: CanvasRenderingContext2D, cr: Rect): void {
    ctx.save();
    ctx.strokeStyle = this.cropBorderColor();
    ctx.lineWidth = this.cropBorderWidth();
    ctx.strokeRect(cr.x, cr.y, cr.width, cr.height);

    // Rule-of-thirds grid lines.
    const thirdW = cr.width / 3;
    const thirdH = cr.height / 3;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(cr.x + thirdW * i, cr.y);
      ctx.lineTo(cr.x + thirdW * i, cr.y + cr.height);
      ctx.moveTo(cr.x, cr.y + thirdH * i);
      ctx.lineTo(cr.x + cr.width, cr.y + thirdH * i);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawHandles(ctx: CanvasRenderingContext2D, cr: Rect): void {
    const size = this.handleSize();
    const half = size / 2;
    const color = this.handleColor();

    ctx.save();
    for (const h of getHandlePositions(cr)) {
      ctx.fillStyle = color;
      ctx.fillRect(h.x - half, h.y - half, size, size);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x - half, h.y - half, size, size);
    }
    ctx.restore();
  }

  private drawPreview(
    img: HTMLImageElement,
    rotation: number,
    flipH: boolean,
    flipV: boolean,
    cropRect: Rect | null,
    bounds: ImageBounds,
  ): void {
    const previewEl = this.previewCanvasRef()?.nativeElement;
    if (!previewEl || !cropRect) return;

    const pw = previewEl.width;
    const ph = previewEl.height;
    const ctx = previewEl.getContext('2d')!;
    ctx.clearRect(0, 0, pw, ph);

    // Render the transformed image to an offscreen canvas at display size.
    const offscreen = document.createElement('canvas');
    offscreen.width = this.canvasSize().width;
    offscreen.height = this.canvasSize().height;
    const offCtx = offscreen.getContext('2d')!;
    this.drawTransformedImage(offCtx, img, rotation, flipH, flipV, bounds);

    if (this.roundCrop()) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pw / 2, ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
      ctx.clip();
    }

    ctx.drawImage(
      offscreen,
      Math.round(cropRect.x), Math.round(cropRect.y),
      Math.round(cropRect.width), Math.round(cropRect.height),
      0, 0,
      pw, ph,
    );

    if (this.roundCrop()) ctx.restore();
  }

  private clearCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ── Private: drag interaction ──────────────────────────────────────────────

  private startDrag(pt: Point): void {
    const cr = this.cropRect();
    if (!cr) return;

    const handle = hitTestHandle(pt.x, pt.y, this.currentHandles, this.handleHitArea());
    if (handle) {
      this.activeHandle = handle;
    } else if (pointInRect(pt.x, pt.y, cr)) {
      this.activeHandle = 'move';
    } else {
      return; // click outside crop rect — no drag
    }

    this.dragActive = true;
    this.dragStart = { ...pt };
    this.cropAtDragStart = { ...cr };
  }

  private updateDrag(pt: Point): void {
    if (!this.dragActive || !this.activeHandle || !this.cropAtDragStart || !this.currentBounds) return;
    const newRect = this.calcNewCropRect(pt, this.activeHandle, this.cropAtDragStart, this.currentBounds);
    this.cropRect.set(newRect);
  }

  private endDrag(): void {
    this.dragActive = false;
    this.activeHandle = null;
    this.cropAtDragStart = null;
  }

  /**
   * Compute the new crop rect after a pointer move, applying aspect-ratio,
   * minimum-size, and image-bounds constraints.
   */
  private calcNewCropRect(
    ptr: Point,
    handle: HandleType,
    start: Rect,
    bounds: ImageBounds,
  ): Rect {
    const dx = ptr.x - this.dragStart.x;
    const dy = ptr.y - this.dragStart.y;
    const ar = this.aspectRatio();
    const minW = this.minCropWidth();
    const minH = this.minCropHeight();
    const b: Rect = { x: bounds.bboxX, y: bounds.bboxY, width: bounds.bboxWidth, height: bounds.bboxHeight };

    let { x, y, width, height } = start;
    const right = x + width;
    const bottom = y + height;

    switch (handle) {
      case 'move': {
        x = clamp(start.x + dx, b.x, b.x + b.width - width);
        y = clamp(start.y + dy, b.y, b.y + b.height - height);
        break;
      }
      case 'tl': {
        let nx = clamp(start.x + dx, b.x, right - minW);
        let ny = clamp(start.y + dy, b.y, bottom - minH);
        let nw = right - nx;
        let nh = bottom - ny;
        ({ x: nx, y: ny, width: nw, height: nh } = this.applyAspectRatio(
          nx, ny, nw, nh, ar, 'tl', right, bottom, b,
        ));
        x = nx; y = ny; width = nw; height = nh;
        break;
      }
      case 'tr': {
        let nw = clamp(start.width + dx, minW, b.x + b.width - x);
        let ny = clamp(start.y + dy, b.y, bottom - minH);
        let nh = bottom - ny;
        ({ y: ny, width: nw, height: nh } = this.applyAspectRatio(
          x, ny, nw, nh, ar, 'tr', x, bottom, b,
        ));
        y = ny; width = nw; height = nh;
        break;
      }
      case 'bl': {
        let nx = clamp(start.x + dx, b.x, right - minW);
        let nw = right - nx;
        let nh = clamp(start.height + dy, minH, b.y + b.height - y);
        ({ x: nx, width: nw, height: nh } = this.applyAspectRatio(
          nx, y, nw, nh, ar, 'bl', right, y, b,
        ));
        x = nx; width = nw; height = nh;
        break;
      }
      case 'br': {
        let nw = clamp(start.width + dx, minW, b.x + b.width - x);
        let nh = clamp(start.height + dy, minH, b.y + b.height - y);
        ({ width: nw, height: nh } = this.applyAspectRatio(
          x, y, nw, nh, ar, 'br', x, y, b,
        ));
        width = nw; height = nh;
        break;
      }
      case 'tc': {
        let ny = clamp(start.y + dy, b.y, bottom - minH);
        height = bottom - ny;
        y = ny;
        if (ar !== 'free') {
          const nw = clamp(height * (ar as number), minW, b.width);
          x = clamp(right - nw / 2 - nw / 2, b.x, b.x + b.width - nw);
          // Recentre horizontally.
          const cx = start.x + start.width / 2;
          x = clamp(cx - nw / 2, b.x, b.x + b.width - nw);
          width = nw;
        }
        break;
      }
      case 'bc': {
        height = clamp(start.height + dy, minH, b.y + b.height - y);
        if (ar !== 'free') {
          const nw = clamp(height * (ar as number), minW, b.width);
          const cx = start.x + start.width / 2;
          x = clamp(cx - nw / 2, b.x, b.x + b.width - nw);
          width = nw;
        }
        break;
      }
      case 'ml': {
        let nx = clamp(start.x + dx, b.x, right - minW);
        width = right - nx;
        x = nx;
        if (ar !== 'free') {
          const nh = clamp(width / (ar as number), minH, b.height);
          const cy = start.y + start.height / 2;
          y = clamp(cy - nh / 2, b.y, b.y + b.height - nh);
          height = nh;
        }
        break;
      }
      case 'mr': {
        width = clamp(start.width + dx, minW, b.x + b.width - x);
        if (ar !== 'free') {
          const nh = clamp(width / (ar as number), minH, b.height);
          const cy = start.y + start.height / 2;
          y = clamp(cy - nh / 2, b.y, b.y + b.height - nh);
          height = nh;
        }
        break;
      }
    }

    return clampRect({ x, y, width, height }, b);
  }

  /**
   * Apply aspect-ratio constraint when dragging a corner handle.
   * Chooses whichever dimension changed more as the "primary" axis.
   */
  private applyAspectRatio(
    nx: number, ny: number, nw: number, nh: number,
    ar: NgxAspectRatio,
    corner: 'tl' | 'tr' | 'bl' | 'br',
    fixedX: number, fixedY: number,
    b: Rect,
  ): { x: number; y: number; width: number; height: number } {
    if (ar === 'free') return { x: nx, y: ny, width: nw, height: nh };

    const ratio = ar as number;
    // Determine primary axis from which dimension changed more.
    const wDelta = Math.abs(nw - (fixedX - nx || nw));
    const hDelta = Math.abs(nh - (fixedY - ny || nh));
    const widthPrimary = wDelta >= hDelta;

    if (widthPrimary) {
      nh = nw / ratio;
    } else {
      nw = nh * ratio;
    }

    // Re-anchor from the fixed corner.
    if (corner === 'tl' || corner === 'bl') nx = fixedX - nw;
    if (corner === 'tl' || corner === 'tr') ny = fixedY - nh;

    // Clamp within bounds after adjustment.
    nw = clamp(nw, 0, b.width);
    nh = clamp(nh, 0, b.height);
    nx = clamp(nx, b.x, b.x + b.width - nw);
    ny = clamp(ny, b.y, b.y + b.height - nh);

    return { x: nx, y: ny, width: nw, height: nh };
  }

  // ── Private: crop rect helpers ─────────────────────────────────────────────

  private fullImageCropRect(bounds: ImageBounds): Rect {
    return {
      x: bounds.bboxX,
      y: bounds.bboxY,
      width: bounds.bboxWidth,
      height: bounds.bboxHeight,
    };
  }

  private clampCropToImage(cr: Rect, bounds: ImageBounds): Rect {
    const b: Rect = {
      x: bounds.bboxX,
      y: bounds.bboxY,
      width: bounds.bboxWidth,
      height: bounds.bboxHeight,
    };
    const width = clamp(cr.width, this.minCropWidth(), b.width);
    const height = clamp(cr.height, this.minCropHeight(), b.height);
    return clampRect({ ...cr, width, height }, b);
  }

  private boundsChanged(a: ImageBounds, b: ImageBounds): boolean {
    return (
      Math.abs(a.bboxWidth - b.bboxWidth) > 0.5 ||
      Math.abs(a.bboxHeight - b.bboxHeight) > 0.5 ||
      Math.abs(a.bboxX - b.bboxX) > 0.5 ||
      Math.abs(a.bboxY - b.bboxY) > 0.5
    );
  }

  // ── Private: pointer coordinate utility ───────────────────────────────────

  private canvasPoint(e: MouseEvent | Touch): Point {
    const canvas = this.mainCanvasRef()?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Account for any CSS scaling between logical and display pixels.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // ── Computed helpers exposed to template ───────────────────────────────────

  /** Rotation value normalised to the −180…180 range for the slider. */
  readonly sliderRotation = computed(() => {
    const r = ((this.rotation() % 360) + 360) % 360;
    return r > 180 ? r - 360 : r;
  });

  /** Config object snapshot (used by NgxImageForgeService to seed inputs). */
  static fromConfig(config: NgxImageForgeConfig): Partial<NgxImageForgeConfig> {
    return config;
  }
}
