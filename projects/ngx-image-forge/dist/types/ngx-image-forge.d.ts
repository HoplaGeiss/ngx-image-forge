import * as _angular_core from '@angular/core';
import { OnInit } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * The result emitted after a successful crop operation.
 */
interface NgxCroppedImage {
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
type NgxOutputFormat = 'jpeg' | 'png' | 'webp';
/** Aspect ratio constraint — a numeric ratio (w/h) or 'free' for unconstrained. */
type NgxAspectRatio = number | 'free';
/**
 * Configuration object accepted by `NgxImageForgeService.open()` and the
 * `[ngxImageEditorTrigger]` directive. Every field mirrors an input on
 * `NgxImageEditorComponent`.
 */
interface NgxImageForgeConfig {
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
declare class NgxImageEditorComponent implements OnInit {
    private readonly destroyRef;
    private readonly zone;
    /** Source image — a File object or a URL string. */
    readonly image: _angular_core.InputSignal<string | File | null>;
    /** Aspect ratio for the crop rectangle (number = w/h, or 'free'). */
    readonly aspectRatio: _angular_core.InputSignal<NgxAspectRatio>;
    /** Maximum output width in pixels; the crop is downscaled to this. */
    readonly maxWidth: _angular_core.InputSignal<number>;
    /** Maximum output height in pixels. */
    readonly maxHeight: _angular_core.InputSignal<number>;
    /** JPEG/WebP encoding quality, 0–1. */
    readonly quality: _angular_core.InputSignal<number>;
    /** Output MIME type. */
    readonly outputFormat: _angular_core.InputSignal<NgxOutputFormat>;
    /** Apply circular clip mask to the crop output and live preview. */
    readonly roundCrop: _angular_core.InputSignal<boolean>;
    /** Minimum crop-rectangle width in canvas pixels. */
    readonly minCropWidth: _angular_core.InputSignal<number>;
    /** Minimum crop-rectangle height in canvas pixels. */
    readonly minCropHeight: _angular_core.InputSignal<number>;
    /** Side length in pixels of each resize handle square. */
    readonly handleSize: _angular_core.InputSignal<number>;
    /** Hit-test radius in pixels around each handle; larger = easier to grab. */
    readonly handleHitArea: _angular_core.InputSignal<number>;
    /** Opacity of the dark overlay drawn outside the crop rectangle. */
    readonly overlayOpacity: _angular_core.InputSignal<number>;
    /** CSS colour for the crop-rectangle border. */
    readonly cropBorderColor: _angular_core.InputSignal<string>;
    /** Width in pixels of the crop-rectangle border. */
    readonly cropBorderWidth: _angular_core.InputSignal<number>;
    /** CSS colour for the resize handles. */
    readonly handleColor: _angular_core.InputSignal<string>;
    /** Emitted when the image has finished loading and is ready for editing. */
    readonly imageLoaded: _angular_core.OutputEmitterRef<{
        naturalWidth: number;
        naturalHeight: number;
    }>;
    /** Emitted when the image fails to load. */
    readonly loadError: _angular_core.OutputEmitterRef<string | Event>;
    /** Emitted immediately after a successful `crop()` call. */
    readonly imageCropped: _angular_core.OutputEmitterRef<NgxCroppedImage>;
    private readonly mainCanvasRef;
    private readonly previewCanvasRef;
    /** The loaded HTMLImageElement (null while loading or no source). */
    private readonly loadedImage;
    /** Total rotation angle in degrees (accumulates step + free-angle). */
    readonly rotation: _angular_core.WritableSignal<number>;
    /** Horizontal flip state. */
    readonly flipH: _angular_core.WritableSignal<boolean>;
    /** Vertical flip state. */
    readonly flipV: _angular_core.WritableSignal<boolean>;
    /** Crop rectangle in canvas display-space pixels. */
    private readonly cropRect;
    /** Logical pixel size of the main canvas (updated by ResizeObserver). */
    private readonly canvasSize;
    /** Whether an image is currently loaded and ready. */
    readonly isLoaded: _angular_core.WritableSignal<boolean>;
    private dragActive;
    private activeHandle;
    private dragStart;
    private cropAtDragStart;
    /** Object URL created for a File source — revoked when a new one is set. */
    private currentObjectUrl;
    /** Pre-computed bounds, reused across draw calls. */
    private currentBounds;
    /** Cached handles list, recomputed when cropRect changes. */
    private currentHandles;
    ngOnInit(): void;
    constructor();
    /**
     * Perform the crop and return the result synchronously.
     * Throws if no image has been loaded.
     */
    crop(): NgxCroppedImage;
    /** Restore the image to its initial state (rotation 0, no flip, full crop). */
    reset(): void;
    /**
     * Rotate the image by `degrees`. Use multiples of 90 for lossless steps;
     * any angle is accepted for the free-angle slider.
     */
    rotate(degrees: number): void;
    /** Set the exact rotation angle in degrees. */
    setRotation(degrees: number): void;
    /** Toggle horizontal flip. */
    flipHorizontal(): void;
    /** Toggle vertical flip. */
    flipVertical(): void;
    onSliderInput(event: Event): void;
    onMouseDown(event: MouseEvent): void;
    onMouseMove(event: MouseEvent): void;
    onMouseUp(): void;
    onTouchStart(event: TouchEvent): void;
    onTouchMove(event: TouchEvent): void;
    onTouchEnd(): void;
    private loadImageSource;
    private revokeObjectUrl;
    private attachResizeObserver;
    private drawCanvas;
    private drawTransformedImage;
    private drawOverlay;
    private drawCropBorder;
    private drawHandles;
    private drawPreview;
    private clearCanvas;
    private startDrag;
    private updateDrag;
    private endDrag;
    /**
     * Compute the new crop rect after a pointer move, applying aspect-ratio,
     * minimum-size, and image-bounds constraints.
     */
    private calcNewCropRect;
    /**
     * Apply aspect-ratio constraint when dragging a corner handle.
     * Chooses whichever dimension changed more as the "primary" axis.
     */
    private applyAspectRatio;
    private fullImageCropRect;
    private clampCropToImage;
    private boundsChanged;
    private canvasPoint;
    /** Rotation value normalised to the −180…180 range for the slider. */
    readonly sliderRotation: _angular_core.Signal<number>;
    /** Config object snapshot (used by NgxImageForgeService to seed inputs). */
    static fromConfig(config: NgxImageForgeConfig): Partial<NgxImageForgeConfig>;
    static ɵfac: _angular_core.ɵɵFactoryDeclaration<NgxImageEditorComponent, never>;
    static ɵcmp: _angular_core.ɵɵComponentDeclaration<NgxImageEditorComponent, "ngx-image-editor", never, { "image": { "alias": "image"; "required": false; "isSignal": true; }; "aspectRatio": { "alias": "aspectRatio"; "required": false; "isSignal": true; }; "maxWidth": { "alias": "maxWidth"; "required": false; "isSignal": true; }; "maxHeight": { "alias": "maxHeight"; "required": false; "isSignal": true; }; "quality": { "alias": "quality"; "required": false; "isSignal": true; }; "outputFormat": { "alias": "outputFormat"; "required": false; "isSignal": true; }; "roundCrop": { "alias": "roundCrop"; "required": false; "isSignal": true; }; "minCropWidth": { "alias": "minCropWidth"; "required": false; "isSignal": true; }; "minCropHeight": { "alias": "minCropHeight"; "required": false; "isSignal": true; }; "handleSize": { "alias": "handleSize"; "required": false; "isSignal": true; }; "handleHitArea": { "alias": "handleHitArea"; "required": false; "isSignal": true; }; "overlayOpacity": { "alias": "overlayOpacity"; "required": false; "isSignal": true; }; "cropBorderColor": { "alias": "cropBorderColor"; "required": false; "isSignal": true; }; "cropBorderWidth": { "alias": "cropBorderWidth"; "required": false; "isSignal": true; }; "handleColor": { "alias": "handleColor"; "required": false; "isSignal": true; }; }, { "imageLoaded": "imageLoaded"; "loadError": "loadError"; "imageCropped": "imageCropped"; }, never, never, true, never>;
}

/**
 * Attach this directive to any clickable element to open the image editor
 * overlay on click. Outputs the crop result (or `null` on cancel).
 *
 * @example
 * ```html
 * <button
 *   ngxImageEditorTrigger
 *   [triggerImage]="myFile"
 *   [triggerAspectRatio]="16/9"
 *   (forgeResult)="onResult($event)"
 * >
 *   Edit image
 * </button>
 * ```
 */
declare class NgxImageEditorTriggerDirective {
    private readonly forge;
    private readonly destroyRef;
    /** Image source (File or URL). */
    readonly triggerImage: _angular_core.InputSignal<string | File | null>;
    /** Aspect ratio constraint. */
    readonly triggerAspectRatio: _angular_core.InputSignal<NgxAspectRatio>;
    /** Maximum output width in pixels. */
    readonly triggerMaxWidth: _angular_core.InputSignal<number>;
    /** Maximum output height in pixels. */
    readonly triggerMaxHeight: _angular_core.InputSignal<number>;
    /** JPEG/WebP encoding quality 0–1. */
    readonly triggerQuality: _angular_core.InputSignal<number>;
    /** Output MIME type. */
    readonly triggerOutputFormat: _angular_core.InputSignal<NgxOutputFormat>;
    /** Apply circular crop mask. */
    readonly triggerRoundCrop: _angular_core.InputSignal<boolean>;
    /** Emits the cropped image when the user confirms, or `null` on cancel. */
    readonly forgeResult: _angular_core.OutputEmitterRef<NgxCroppedImage | null>;
    /** Called by the host `(click)` binding; also callable programmatically. */
    openEditor(): void;
    static ɵfac: _angular_core.ɵɵFactoryDeclaration<NgxImageEditorTriggerDirective, never>;
    static ɵdir: _angular_core.ɵɵDirectiveDeclaration<NgxImageEditorTriggerDirective, "[ngxImageEditorTrigger]", never, { "triggerImage": { "alias": "triggerImage"; "required": false; "isSignal": true; }; "triggerAspectRatio": { "alias": "triggerAspectRatio"; "required": false; "isSignal": true; }; "triggerMaxWidth": { "alias": "triggerMaxWidth"; "required": false; "isSignal": true; }; "triggerMaxHeight": { "alias": "triggerMaxHeight"; "required": false; "isSignal": true; }; "triggerQuality": { "alias": "triggerQuality"; "required": false; "isSignal": true; }; "triggerOutputFormat": { "alias": "triggerOutputFormat"; "required": false; "isSignal": true; }; "triggerRoundCrop": { "alias": "triggerRoundCrop"; "required": false; "isSignal": true; }; }, { "forgeResult": "forgeResult"; }, never, never, true, never>;
}

/**
 * Programmatic API for opening the image editor as a full-screen overlay.
 *
 * @example
 * ```ts
 * constructor(private forge: NgxImageForgeService) {}
 *
 * openEditor(file: File): void {
 *   this.forge.open({ image: file, aspectRatio: 1 }).subscribe(result => {
 *     if (result) console.log('Cropped!', result.dataUrl);
 *   });
 * }
 * ```
 */
declare class NgxImageForgeService {
    private readonly appRef;
    private readonly injector;
    /**
     * Open the image editor overlay with the supplied configuration.
     * Returns an `Observable` that emits once:
     * - The `NgxCroppedImage` when the user confirms the crop.
     * - `null` when the user cancels or dismisses.
     *
     * The observable completes immediately after emitting.
     */
    open(config: NgxImageForgeConfig): Observable<NgxCroppedImage | null>;
    private destroy;
    static ɵfac: _angular_core.ɵɵFactoryDeclaration<NgxImageForgeService, never>;
    static ɵprov: _angular_core.ɵɵInjectableDeclaration<NgxImageForgeService>;
}

export { NgxImageEditorComponent, NgxImageEditorTriggerDirective, NgxImageForgeService };
export type { NgxAspectRatio, NgxCroppedImage, NgxImageForgeConfig, NgxOutputFormat };
