import { DecimalPipe } from '@angular/common';
import * as i0 from '@angular/core';
import { inject, DestroyRef, NgZone, input, output, viewChild, signal, effect, afterNextRender, computed, ChangeDetectionStrategy, Component, ApplicationRef, EnvironmentInjector, createComponent, Injectable, Directive } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';

// ── Default values ─────────────────────────────────────────────────────────────
const DEFAULTS = {
    handleSize: 10,
    handleHitArea: 16,
    overlayOpacity: 0.55,
    cropBorderColor: '#ffffff',
    cropBorderWidth: 1.5,
    handleColor: '#ffffff',
};
// ── Pure geometry helpers (no Angular dependency) ────────────────────────────
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function getHandlePositions(cr) {
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
function hitTestHandle(px, py, handles, hitArea) {
    const half = hitArea / 2;
    for (const h of handles) {
        if (Math.abs(px - h.x) <= half && Math.abs(py - h.y) <= half) {
            return h.type;
        }
    }
    return null;
}
function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}
/**
 * Compute where to draw the image on the canvas and the bounding box of the
 * rotated image, both in canvas display-space pixels.
 */
function calcImageBounds(naturalWidth, naturalHeight, rotation, canvasW, canvasH) {
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
function remapCropRect(old, oldBounds, newBounds) {
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
function clampRect(r, bounds) {
    const x = clamp(r.x, bounds.x, bounds.x + bounds.width - r.width);
    const y = clamp(r.y, bounds.y, bounds.y + bounds.height - r.height);
    return { ...r, x, y };
}
/** Convert a base64 data-URL to a Blob synchronously. */
function dataUrlToBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const bstr = atob(data);
    const bytes = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++)
        bytes[i] = bstr.charCodeAt(i);
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
class NgxImageEditorComponent {
    // ── Injected services ──────────────────────────────────────────────────────
    destroyRef = inject(DestroyRef);
    zone = inject(NgZone);
    // ── Public inputs ──────────────────────────────────────────────────────────
    /** Source image — a File object or a URL string. */
    image = input(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "image" }] : /* istanbul ignore next */ []));
    /** Aspect ratio for the crop rectangle (number = w/h, or 'free'). */
    aspectRatio = input('free', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "aspectRatio" }] : /* istanbul ignore next */ []));
    /** Maximum output width in pixels; the crop is downscaled to this. */
    maxWidth = input(0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "maxWidth" }] : /* istanbul ignore next */ []));
    /** Maximum output height in pixels. */
    maxHeight = input(0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "maxHeight" }] : /* istanbul ignore next */ []));
    /** JPEG/WebP encoding quality, 0–1. */
    quality = input(0.92, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "quality" }] : /* istanbul ignore next */ []));
    /** Output MIME type. */
    outputFormat = input('jpeg', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "outputFormat" }] : /* istanbul ignore next */ []));
    /** Apply circular clip mask to the crop output and live preview. */
    roundCrop = input(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "roundCrop" }] : /* istanbul ignore next */ []));
    /** Minimum crop-rectangle width in canvas pixels. */
    minCropWidth = input(50, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "minCropWidth" }] : /* istanbul ignore next */ []));
    /** Minimum crop-rectangle height in canvas pixels. */
    minCropHeight = input(50, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "minCropHeight" }] : /* istanbul ignore next */ []));
    // ── Visual config (mirrors NgxImageForgeConfig tunables) ──────────────────
    /** Side length in pixels of each resize handle square. */
    handleSize = input(DEFAULTS.handleSize, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "handleSize" }] : /* istanbul ignore next */ []));
    /** Hit-test radius in pixels around each handle; larger = easier to grab. */
    handleHitArea = input(DEFAULTS.handleHitArea, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "handleHitArea" }] : /* istanbul ignore next */ []));
    /** Opacity of the dark overlay drawn outside the crop rectangle. */
    overlayOpacity = input(DEFAULTS.overlayOpacity, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "overlayOpacity" }] : /* istanbul ignore next */ []));
    /** CSS colour for the crop-rectangle border. */
    cropBorderColor = input(DEFAULTS.cropBorderColor, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "cropBorderColor" }] : /* istanbul ignore next */ []));
    /** Width in pixels of the crop-rectangle border. */
    cropBorderWidth = input(DEFAULTS.cropBorderWidth, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "cropBorderWidth" }] : /* istanbul ignore next */ []));
    /** CSS colour for the resize handles. */
    handleColor = input(DEFAULTS.handleColor, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "handleColor" }] : /* istanbul ignore next */ []));
    // ── Outputs ────────────────────────────────────────────────────────────────
    /** Emitted when the image has finished loading and is ready for editing. */
    imageLoaded = output();
    /** Emitted when the image fails to load. */
    loadError = output();
    /** Emitted immediately after a successful `crop()` call. */
    imageCropped = output();
    // ── Canvas refs ────────────────────────────────────────────────────────────
    mainCanvasRef = viewChild('mainCanvas', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "mainCanvasRef" }] : /* istanbul ignore next */ []));
    previewCanvasRef = viewChild('previewCanvas', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "previewCanvasRef" }] : /* istanbul ignore next */ []));
    // ── Internal state ─────────────────────────────────────────────────────────
    /** The loaded HTMLImageElement (null while loading or no source). */
    loadedImage = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "loadedImage" }] : /* istanbul ignore next */ []));
    /** Total rotation angle in degrees (accumulates step + free-angle). */
    rotation = signal(0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "rotation" }] : /* istanbul ignore next */ []));
    /** Horizontal flip state. */
    flipH = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "flipH" }] : /* istanbul ignore next */ []));
    /** Vertical flip state. */
    flipV = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "flipV" }] : /* istanbul ignore next */ []));
    /** Crop rectangle in canvas display-space pixels. */
    cropRect = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "cropRect" }] : /* istanbul ignore next */ []));
    /** Logical pixel size of the main canvas (updated by ResizeObserver). */
    canvasSize = signal({ width: 0, height: 0 }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "canvasSize" }] : /* istanbul ignore next */ []));
    /** Whether an image is currently loaded and ready. */
    isLoaded = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isLoaded" }] : /* istanbul ignore next */ []));
    // ── Drag state (non-reactive plain fields — mutated inside zone.runOutsideAngular) ──
    dragActive = false;
    activeHandle = null;
    dragStart = { x: 0, y: 0 };
    cropAtDragStart = null;
    /** Object URL created for a File source — revoked when a new one is set. */
    currentObjectUrl = null;
    /** Pre-computed bounds, reused across draw calls. */
    currentBounds = null;
    /** Cached handles list, recomputed when cropRect changes. */
    currentHandles = [];
    // ── Lifecycle ──────────────────────────────────────────────────────────────
    ngOnInit() {
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
            }
            else {
                this.loadedImage.set(null);
            }
        });
        // Main render effect — runs whenever any visual state changes.
        effect(() => {
            const canvas = this.mainCanvasRef()?.nativeElement;
            if (!canvas)
                return;
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
            if (canvas.width !== size.width)
                canvas.width = size.width;
            if (canvas.height !== size.height)
                canvas.height = size.height;
            const bounds = calcImageBounds(img.naturalWidth, img.naturalHeight, rotation, size.width, size.height);
            // If image bounds changed (rotation or resize), remap the crop rect.
            if (cropRect) {
                const remapped = this.currentBounds && this.boundsChanged(this.currentBounds, bounds)
                    ? remapCropRect(cropRect, this.currentBounds, bounds)
                    : cropRect;
                this.currentBounds = bounds;
                const clamped = this.clampCropToImage(remapped, bounds);
                if (clamped.x !== cropRect.x ||
                    clamped.y !== cropRect.y ||
                    clamped.width !== cropRect.width ||
                    clamped.height !== cropRect.height) {
                    this.cropRect.set(clamped);
                    return; // The cropRect set triggers another render pass.
                }
            }
            else {
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
    crop() {
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
        const offCtx = offscreen.getContext('2d');
        this.drawTransformedImage(offCtx, img, this.rotation(), this.flipH(), this.flipV(), bounds);
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
        const outCtx = output.getContext('2d');
        if (this.roundCrop()) {
            outCtx.save();
            outCtx.beginPath();
            outCtx.arc(outW / 2, outH / 2, Math.min(outW, outH) / 2, 0, Math.PI * 2);
            outCtx.clip();
        }
        outCtx.drawImage(offscreen, Math.round(cr.x), Math.round(cr.y), Math.round(cr.width), Math.round(cr.height), 0, 0, outW, outH);
        if (this.roundCrop())
            outCtx.restore();
        const dataUrl = output.toDataURL(`image/${format}`, quality);
        const blob = dataUrlToBlob(dataUrl);
        const result = {
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
    reset() {
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
    rotate(degrees) {
        this.rotation.update(r => r + degrees);
    }
    /** Set the exact rotation angle in degrees. */
    setRotation(degrees) {
        this.rotation.set(degrees);
    }
    /** Toggle horizontal flip. */
    flipHorizontal() {
        this.flipH.update(v => !v);
    }
    /** Toggle vertical flip. */
    flipVertical() {
        this.flipV.update(v => !v);
    }
    // ── Template event handlers ────────────────────────────────────────────────
    onSliderInput(event) {
        const input = event.target;
        this.rotation.set(Number(input.value));
    }
    onMouseDown(event) {
        event.preventDefault();
        this.startDrag(this.canvasPoint(event));
    }
    onMouseMove(event) {
        if (!this.dragActive)
            return;
        this.updateDrag(this.canvasPoint(event));
    }
    onMouseUp() {
        this.endDrag();
    }
    onTouchStart(event) {
        event.preventDefault();
        const t = event.touches[0];
        if (t)
            this.startDrag(this.canvasPoint(t));
    }
    onTouchMove(event) {
        event.preventDefault();
        const t = event.touches[0];
        if (t && this.dragActive)
            this.updateDrag(this.canvasPoint(t));
    }
    onTouchEnd() {
        this.endDrag();
    }
    // ── Private: image loading ─────────────────────────────────────────────────
    loadImageSource(source) {
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
                    const bounds = calcImageBounds(img.naturalWidth, img.naturalHeight, 0, size.width, size.height);
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
        }
        else {
            img.src = source;
        }
    }
    revokeObjectUrl() {
        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
        }
    }
    // ── Private: ResizeObserver ────────────────────────────────────────────────
    attachResizeObserver() {
        const wrapper = this.mainCanvasRef()?.nativeElement.parentElement;
        if (!wrapper)
            return;
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry)
                return;
            const { width, height } = entry.contentRect;
            this.zone.run(() => {
                const newSize = { width: Math.round(width), height: Math.round(height) };
                const oldSize = this.canvasSize();
                if (newSize.width === oldSize.width && newSize.height === oldSize.height)
                    return;
                this.canvasSize.set(newSize);
                // Initialise crop rect if image is already loaded (e.g. initial render).
                const img = this.loadedImage();
                if (img && !this.cropRect()) {
                    const bounds = calcImageBounds(img.naturalWidth, img.naturalHeight, this.rotation(), newSize.width, newSize.height);
                    this.currentBounds = bounds;
                    this.cropRect.set(this.fullImageCropRect(bounds));
                }
            });
        });
        ro.observe(wrapper);
        this.destroyRef.onDestroy(() => ro.disconnect());
    }
    // ── Private: canvas drawing ────────────────────────────────────────────────
    drawCanvas(canvas, img, rotation, flipH, flipV, cropRect, bounds) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawTransformedImage(ctx, img, rotation, flipH, flipV, bounds);
        if (!cropRect)
            return;
        this.drawOverlay(ctx, cropRect, canvas.width, canvas.height);
        this.drawCropBorder(ctx, cropRect);
        this.drawHandles(ctx, cropRect);
    }
    drawTransformedImage(ctx, img, rotation, flipH, flipV, bounds) {
        const { cx, cy, drawWidth, drawHeight } = bounds;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
    }
    drawOverlay(ctx, cr, cw, ch) {
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${this.overlayOpacity()})`;
        if (this.roundCrop()) {
            // Draw overlay everywhere, then punch a circular hole over the crop area.
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.arc(cr.x + cr.width / 2, cr.y + cr.height / 2, Math.min(cr.width, cr.height) / 2, 0, Math.PI * 2, true);
            ctx.fill('evenodd');
        }
        else {
            // Four rectangles surrounding the crop rect.
            ctx.fillRect(0, 0, cw, cr.y);
            ctx.fillRect(0, cr.y + cr.height, cw, ch - cr.y - cr.height);
            ctx.fillRect(0, cr.y, cr.x, cr.height);
            ctx.fillRect(cr.x + cr.width, cr.y, cw - cr.x - cr.width, cr.height);
        }
        ctx.restore();
    }
    drawCropBorder(ctx, cr) {
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
    drawHandles(ctx, cr) {
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
    drawPreview(img, rotation, flipH, flipV, cropRect, bounds) {
        const previewEl = this.previewCanvasRef()?.nativeElement;
        if (!previewEl || !cropRect)
            return;
        const pw = previewEl.width;
        const ph = previewEl.height;
        const ctx = previewEl.getContext('2d');
        ctx.clearRect(0, 0, pw, ph);
        // Render the transformed image to an offscreen canvas at display size.
        const offscreen = document.createElement('canvas');
        offscreen.width = this.canvasSize().width;
        offscreen.height = this.canvasSize().height;
        const offCtx = offscreen.getContext('2d');
        this.drawTransformedImage(offCtx, img, rotation, flipH, flipV, bounds);
        if (this.roundCrop()) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(pw / 2, ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
            ctx.clip();
        }
        ctx.drawImage(offscreen, Math.round(cropRect.x), Math.round(cropRect.y), Math.round(cropRect.width), Math.round(cropRect.height), 0, 0, pw, ph);
        if (this.roundCrop())
            ctx.restore();
    }
    clearCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    // ── Private: drag interaction ──────────────────────────────────────────────
    startDrag(pt) {
        const cr = this.cropRect();
        if (!cr)
            return;
        const handle = hitTestHandle(pt.x, pt.y, this.currentHandles, this.handleHitArea());
        if (handle) {
            this.activeHandle = handle;
        }
        else if (pointInRect(pt.x, pt.y, cr)) {
            this.activeHandle = 'move';
        }
        else {
            return; // click outside crop rect — no drag
        }
        this.dragActive = true;
        this.dragStart = { ...pt };
        this.cropAtDragStart = { ...cr };
    }
    updateDrag(pt) {
        if (!this.dragActive || !this.activeHandle || !this.cropAtDragStart || !this.currentBounds)
            return;
        const newRect = this.calcNewCropRect(pt, this.activeHandle, this.cropAtDragStart, this.currentBounds);
        this.cropRect.set(newRect);
    }
    endDrag() {
        this.dragActive = false;
        this.activeHandle = null;
        this.cropAtDragStart = null;
    }
    /**
     * Compute the new crop rect after a pointer move, applying aspect-ratio,
     * minimum-size, and image-bounds constraints.
     */
    calcNewCropRect(ptr, handle, start, bounds) {
        const dx = ptr.x - this.dragStart.x;
        const dy = ptr.y - this.dragStart.y;
        const ar = this.aspectRatio();
        const minW = this.minCropWidth();
        const minH = this.minCropHeight();
        const b = { x: bounds.bboxX, y: bounds.bboxY, width: bounds.bboxWidth, height: bounds.bboxHeight };
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
                ({ x: nx, y: ny, width: nw, height: nh } = this.applyAspectRatio(nx, ny, nw, nh, ar, 'tl', right, bottom, b));
                x = nx;
                y = ny;
                width = nw;
                height = nh;
                break;
            }
            case 'tr': {
                let nw = clamp(start.width + dx, minW, b.x + b.width - x);
                let ny = clamp(start.y + dy, b.y, bottom - minH);
                let nh = bottom - ny;
                ({ y: ny, width: nw, height: nh } = this.applyAspectRatio(x, ny, nw, nh, ar, 'tr', x, bottom, b));
                y = ny;
                width = nw;
                height = nh;
                break;
            }
            case 'bl': {
                let nx = clamp(start.x + dx, b.x, right - minW);
                let nw = right - nx;
                let nh = clamp(start.height + dy, minH, b.y + b.height - y);
                ({ x: nx, width: nw, height: nh } = this.applyAspectRatio(nx, y, nw, nh, ar, 'bl', right, y, b));
                x = nx;
                width = nw;
                height = nh;
                break;
            }
            case 'br': {
                let nw = clamp(start.width + dx, minW, b.x + b.width - x);
                let nh = clamp(start.height + dy, minH, b.y + b.height - y);
                ({ width: nw, height: nh } = this.applyAspectRatio(x, y, nw, nh, ar, 'br', x, y, b));
                width = nw;
                height = nh;
                break;
            }
            case 'tc': {
                let ny = clamp(start.y + dy, b.y, bottom - minH);
                height = bottom - ny;
                y = ny;
                if (ar !== 'free') {
                    const nw = clamp(height * ar, minW, b.width);
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
                    const nw = clamp(height * ar, minW, b.width);
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
                    const nh = clamp(width / ar, minH, b.height);
                    const cy = start.y + start.height / 2;
                    y = clamp(cy - nh / 2, b.y, b.y + b.height - nh);
                    height = nh;
                }
                break;
            }
            case 'mr': {
                width = clamp(start.width + dx, minW, b.x + b.width - x);
                if (ar !== 'free') {
                    const nh = clamp(width / ar, minH, b.height);
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
    applyAspectRatio(nx, ny, nw, nh, ar, corner, fixedX, fixedY, b) {
        if (ar === 'free')
            return { x: nx, y: ny, width: nw, height: nh };
        const ratio = ar;
        // Determine primary axis from which dimension changed more.
        const wDelta = Math.abs(nw - (fixedX - nx || nw));
        const hDelta = Math.abs(nh - (fixedY - ny || nh));
        const widthPrimary = wDelta >= hDelta;
        if (widthPrimary) {
            nh = nw / ratio;
        }
        else {
            nw = nh * ratio;
        }
        // Re-anchor from the fixed corner.
        if (corner === 'tl' || corner === 'bl')
            nx = fixedX - nw;
        if (corner === 'tl' || corner === 'tr')
            ny = fixedY - nh;
        // Clamp within bounds after adjustment.
        nw = clamp(nw, 0, b.width);
        nh = clamp(nh, 0, b.height);
        nx = clamp(nx, b.x, b.x + b.width - nw);
        ny = clamp(ny, b.y, b.y + b.height - nh);
        return { x: nx, y: ny, width: nw, height: nh };
    }
    // ── Private: crop rect helpers ─────────────────────────────────────────────
    fullImageCropRect(bounds) {
        return {
            x: bounds.bboxX,
            y: bounds.bboxY,
            width: bounds.bboxWidth,
            height: bounds.bboxHeight,
        };
    }
    clampCropToImage(cr, bounds) {
        const b = {
            x: bounds.bboxX,
            y: bounds.bboxY,
            width: bounds.bboxWidth,
            height: bounds.bboxHeight,
        };
        const width = clamp(cr.width, this.minCropWidth(), b.width);
        const height = clamp(cr.height, this.minCropHeight(), b.height);
        return clampRect({ ...cr, width, height }, b);
    }
    boundsChanged(a, b) {
        return (Math.abs(a.bboxWidth - b.bboxWidth) > 0.5 ||
            Math.abs(a.bboxHeight - b.bboxHeight) > 0.5 ||
            Math.abs(a.bboxX - b.bboxX) > 0.5 ||
            Math.abs(a.bboxY - b.bboxY) > 0.5);
    }
    // ── Private: pointer coordinate utility ───────────────────────────────────
    canvasPoint(e) {
        const canvas = this.mainCanvasRef()?.nativeElement;
        if (!canvas)
            return { x: 0, y: 0 };
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
    sliderRotation = computed(() => {
        const r = ((this.rotation() % 360) + 360) % 360;
        return r > 180 ? r - 360 : r;
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "sliderRotation" }] : /* istanbul ignore next */ []));
    /** Config object snapshot (used by NgxImageForgeService to seed inputs). */
    static fromConfig(config) {
        return config;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageEditorComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.0.0", version: "22.0.3", type: NgxImageEditorComponent, isStandalone: true, selector: "ngx-image-editor", inputs: { image: { classPropertyName: "image", publicName: "image", isSignal: true, isRequired: false, transformFunction: null }, aspectRatio: { classPropertyName: "aspectRatio", publicName: "aspectRatio", isSignal: true, isRequired: false, transformFunction: null }, maxWidth: { classPropertyName: "maxWidth", publicName: "maxWidth", isSignal: true, isRequired: false, transformFunction: null }, maxHeight: { classPropertyName: "maxHeight", publicName: "maxHeight", isSignal: true, isRequired: false, transformFunction: null }, quality: { classPropertyName: "quality", publicName: "quality", isSignal: true, isRequired: false, transformFunction: null }, outputFormat: { classPropertyName: "outputFormat", publicName: "outputFormat", isSignal: true, isRequired: false, transformFunction: null }, roundCrop: { classPropertyName: "roundCrop", publicName: "roundCrop", isSignal: true, isRequired: false, transformFunction: null }, minCropWidth: { classPropertyName: "minCropWidth", publicName: "minCropWidth", isSignal: true, isRequired: false, transformFunction: null }, minCropHeight: { classPropertyName: "minCropHeight", publicName: "minCropHeight", isSignal: true, isRequired: false, transformFunction: null }, handleSize: { classPropertyName: "handleSize", publicName: "handleSize", isSignal: true, isRequired: false, transformFunction: null }, handleHitArea: { classPropertyName: "handleHitArea", publicName: "handleHitArea", isSignal: true, isRequired: false, transformFunction: null }, overlayOpacity: { classPropertyName: "overlayOpacity", publicName: "overlayOpacity", isSignal: true, isRequired: false, transformFunction: null }, cropBorderColor: { classPropertyName: "cropBorderColor", publicName: "cropBorderColor", isSignal: true, isRequired: false, transformFunction: null }, cropBorderWidth: { classPropertyName: "cropBorderWidth", publicName: "cropBorderWidth", isSignal: true, isRequired: false, transformFunction: null }, handleColor: { classPropertyName: "handleColor", publicName: "handleColor", isSignal: true, isRequired: false, transformFunction: null } }, outputs: { imageLoaded: "imageLoaded", loadError: "loadError", imageCropped: "imageCropped" }, host: { properties: { "class.ngx-image-editor--loaded": "isLoaded()", "class.ngx-image-editor--round": "roundCrop()" }, classAttribute: "ngx-image-editor" }, viewQueries: [{ propertyName: "mainCanvasRef", first: true, predicate: ["mainCanvas"], descendants: true, isSignal: true }, { propertyName: "previewCanvasRef", first: true, predicate: ["previewCanvas"], descendants: true, isSignal: true }], ngImport: i0, template: "<div class=\"ngx-image-editor__workspace\">\n  <canvas\n    #mainCanvas\n    class=\"ngx-image-editor__canvas\"\n    role=\"img\"\n    aria-label=\"Image editor canvas\"\n    (mousedown)=\"onMouseDown($event)\"\n    (mousemove)=\"onMouseMove($event)\"\n    (mouseup)=\"onMouseUp()\"\n    (mouseleave)=\"onMouseUp()\"\n    (touchstart)=\"onTouchStart($event)\"\n    (touchmove)=\"onTouchMove($event)\"\n    (touchend)=\"onTouchEnd()\"\n  ></canvas>\n\n  @if (!isLoaded()) {\n    <div class=\"ngx-image-editor__placeholder\" aria-live=\"polite\">\n      <span class=\"ngx-image-editor__placeholder-icon\" aria-hidden=\"true\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" width=\"48\" height=\"48\">\n          <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/>\n          <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/>\n          <path d=\"M21 15l-5-5L5 21\"/>\n        </svg>\n      </span>\n      <p>No image loaded</p>\n    </div>\n  }\n</div>\n\n<div class=\"ngx-image-editor__preview-panel\" aria-label=\"Crop preview\">\n  <div class=\"ngx-image-editor__preview-label\">Preview</div>\n  <canvas\n    #previewCanvas\n    class=\"ngx-image-editor__preview-canvas\"\n    [class.ngx-image-editor__preview-canvas--round]=\"roundCrop()\"\n    width=\"120\"\n    height=\"120\"\n    aria-hidden=\"true\"\n  ></canvas>\n</div>\n\n<div class=\"ngx-image-editor__toolbar\" role=\"toolbar\" aria-label=\"Image editing controls\">\n  <div class=\"ngx-image-editor__toolbar-group\" role=\"group\" aria-label=\"Rotate\">\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"rotate(-90)\"\n      title=\"Rotate 90\u00B0 counter-clockwise\"\n      aria-label=\"Rotate 90\u00B0 counter-clockwise\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/>\n        <path d=\"M3 3v5h5\"/>\n      </svg>\n    </button>\n\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"rotate(90)\"\n      title=\"Rotate 90\u00B0 clockwise\"\n      aria-label=\"Rotate 90\u00B0 clockwise\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/>\n        <path d=\"M21 3v5h-5\"/>\n      </svg>\n    </button>\n  </div>\n\n  <div class=\"ngx-image-editor__toolbar-group\" role=\"group\" aria-label=\"Flip\">\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"flipHorizontal()\"\n      title=\"Flip horizontal\"\n      aria-label=\"Flip horizontal\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M12 3v18M3 9l9-6 9 6M3 15l9 6 9-6\" opacity=\".4\"/>\n        <line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"21\"/>\n        <polyline points=\"6 9 12 3 18 9\"/>\n      </svg>\n    </button>\n\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"flipVertical()\"\n      title=\"Flip vertical\"\n      aria-label=\"Flip vertical\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M3 12h18M9 3l6 9-6 9M15 3l-6 9 6 9\" opacity=\".4\"/>\n        <line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"/>\n        <polyline points=\"9 6 3 12 9 18\"/>\n      </svg>\n    </button>\n  </div>\n\n  <div class=\"ngx-image-editor__rotation-group\" role=\"group\" aria-label=\"Free rotation\">\n    <label for=\"ngx-rotation-slider\" class=\"ngx-image-editor__rotation-label\">\n      {{ sliderRotation() | number:'1.0-1' }}\u00B0\n    </label>\n    <input\n      id=\"ngx-rotation-slider\"\n      type=\"range\"\n      class=\"ngx-image-editor__slider\"\n      min=\"-180\"\n      max=\"180\"\n      step=\"0.5\"\n      [value]=\"sliderRotation()\"\n      (input)=\"onSliderInput($event)\"\n      aria-label=\"Rotation angle\"\n      [attr.aria-valuenow]=\"sliderRotation()\"\n      aria-valuemin=\"-180\"\n      aria-valuemax=\"180\"\n    />\n  </div>\n\n  <button\n    type=\"button\"\n    class=\"ngx-image-editor__btn ngx-image-editor__btn--reset\"\n    (click)=\"reset()\"\n    title=\"Reset to original\"\n    aria-label=\"Reset image to original state\"\n  >\n    Reset\n  </button>\n</div>\n", styles: [":host.ngx-image-editor{display:flex;flex-direction:column;gap:12px;background:#1a1a1a;border-radius:8px;overflow:hidden;font-family:system-ui,sans-serif;color:#e0e0e0;-webkit-user-select:none;user-select:none}.ngx-image-editor__workspace{position:relative;flex:1;min-height:0;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden}.ngx-image-editor__canvas{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none}.ngx-image-editor__placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#555;pointer-events:none}.ngx-image-editor__placeholder p{margin:0;font-size:14px}.ngx-image-editor__preview-panel{display:flex;align-items:center;gap:12px;padding:0 16px}.ngx-image-editor__preview-label{font-size:12px;color:#888;white-space:nowrap}.ngx-image-editor__preview-canvas{border:1px solid #333;border-radius:4px;background:#111;flex-shrink:0}.ngx-image-editor__preview-canvas--round{border-radius:50%}.ngx-image-editor__toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px 16px;flex-wrap:wrap}.ngx-image-editor__toolbar-group{display:flex;gap:4px}.ngx-image-editor__btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#e0e0e0;cursor:pointer;font-size:13px;transition:background .15s,border-color .15s;min-width:36px;min-height:36px}.ngx-image-editor__btn:hover{background:#3a3a3a;border-color:#666}.ngx-image-editor__btn:focus-visible{outline:2px solid #6ea8fe;outline-offset:2px}.ngx-image-editor__btn--reset{margin-left:auto;font-size:12px;color:#aaa}.ngx-image-editor__rotation-group{display:flex;align-items:center;gap:8px;flex:1;min-width:120px}.ngx-image-editor__rotation-label{font-size:12px;color:#aaa;width:44px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.ngx-image-editor__slider{flex:1;accent-color:#6ea8fe;cursor:pointer;height:4px}.ngx-image-editor__slider:focus-visible{outline:2px solid #6ea8fe;outline-offset:4px;border-radius:2px}\n"], dependencies: [{ kind: "pipe", type: DecimalPipe, name: "number" }], changeDetection: i0.ChangeDetectionStrategy.OnPush });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageEditorComponent, decorators: [{
            type: Component,
            args: [{ selector: 'ngx-image-editor', imports: [DecimalPipe], changeDetection: ChangeDetectionStrategy.OnPush, host: {
                        class: 'ngx-image-editor',
                        '[class.ngx-image-editor--loaded]': 'isLoaded()',
                        '[class.ngx-image-editor--round]': 'roundCrop()',
                    }, template: "<div class=\"ngx-image-editor__workspace\">\n  <canvas\n    #mainCanvas\n    class=\"ngx-image-editor__canvas\"\n    role=\"img\"\n    aria-label=\"Image editor canvas\"\n    (mousedown)=\"onMouseDown($event)\"\n    (mousemove)=\"onMouseMove($event)\"\n    (mouseup)=\"onMouseUp()\"\n    (mouseleave)=\"onMouseUp()\"\n    (touchstart)=\"onTouchStart($event)\"\n    (touchmove)=\"onTouchMove($event)\"\n    (touchend)=\"onTouchEnd()\"\n  ></canvas>\n\n  @if (!isLoaded()) {\n    <div class=\"ngx-image-editor__placeholder\" aria-live=\"polite\">\n      <span class=\"ngx-image-editor__placeholder-icon\" aria-hidden=\"true\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" width=\"48\" height=\"48\">\n          <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/>\n          <circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/>\n          <path d=\"M21 15l-5-5L5 21\"/>\n        </svg>\n      </span>\n      <p>No image loaded</p>\n    </div>\n  }\n</div>\n\n<div class=\"ngx-image-editor__preview-panel\" aria-label=\"Crop preview\">\n  <div class=\"ngx-image-editor__preview-label\">Preview</div>\n  <canvas\n    #previewCanvas\n    class=\"ngx-image-editor__preview-canvas\"\n    [class.ngx-image-editor__preview-canvas--round]=\"roundCrop()\"\n    width=\"120\"\n    height=\"120\"\n    aria-hidden=\"true\"\n  ></canvas>\n</div>\n\n<div class=\"ngx-image-editor__toolbar\" role=\"toolbar\" aria-label=\"Image editing controls\">\n  <div class=\"ngx-image-editor__toolbar-group\" role=\"group\" aria-label=\"Rotate\">\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"rotate(-90)\"\n      title=\"Rotate 90\u00B0 counter-clockwise\"\n      aria-label=\"Rotate 90\u00B0 counter-clockwise\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/>\n        <path d=\"M3 3v5h5\"/>\n      </svg>\n    </button>\n\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"rotate(90)\"\n      title=\"Rotate 90\u00B0 clockwise\"\n      aria-label=\"Rotate 90\u00B0 clockwise\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/>\n        <path d=\"M21 3v5h-5\"/>\n      </svg>\n    </button>\n  </div>\n\n  <div class=\"ngx-image-editor__toolbar-group\" role=\"group\" aria-label=\"Flip\">\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"flipHorizontal()\"\n      title=\"Flip horizontal\"\n      aria-label=\"Flip horizontal\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M12 3v18M3 9l9-6 9 6M3 15l9 6 9-6\" opacity=\".4\"/>\n        <line x1=\"12\" y1=\"3\" x2=\"12\" y2=\"21\"/>\n        <polyline points=\"6 9 12 3 18 9\"/>\n      </svg>\n    </button>\n\n    <button\n      type=\"button\"\n      class=\"ngx-image-editor__btn\"\n      (click)=\"flipVertical()\"\n      title=\"Flip vertical\"\n      aria-label=\"Flip vertical\"\n    >\n      <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"20\" height=\"20\" aria-hidden=\"true\">\n        <path d=\"M3 12h18M9 3l6 9-6 9M15 3l-6 9 6 9\" opacity=\".4\"/>\n        <line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"/>\n        <polyline points=\"9 6 3 12 9 18\"/>\n      </svg>\n    </button>\n  </div>\n\n  <div class=\"ngx-image-editor__rotation-group\" role=\"group\" aria-label=\"Free rotation\">\n    <label for=\"ngx-rotation-slider\" class=\"ngx-image-editor__rotation-label\">\n      {{ sliderRotation() | number:'1.0-1' }}\u00B0\n    </label>\n    <input\n      id=\"ngx-rotation-slider\"\n      type=\"range\"\n      class=\"ngx-image-editor__slider\"\n      min=\"-180\"\n      max=\"180\"\n      step=\"0.5\"\n      [value]=\"sliderRotation()\"\n      (input)=\"onSliderInput($event)\"\n      aria-label=\"Rotation angle\"\n      [attr.aria-valuenow]=\"sliderRotation()\"\n      aria-valuemin=\"-180\"\n      aria-valuemax=\"180\"\n    />\n  </div>\n\n  <button\n    type=\"button\"\n    class=\"ngx-image-editor__btn ngx-image-editor__btn--reset\"\n    (click)=\"reset()\"\n    title=\"Reset to original\"\n    aria-label=\"Reset image to original state\"\n  >\n    Reset\n  </button>\n</div>\n", styles: [":host.ngx-image-editor{display:flex;flex-direction:column;gap:12px;background:#1a1a1a;border-radius:8px;overflow:hidden;font-family:system-ui,sans-serif;color:#e0e0e0;-webkit-user-select:none;user-select:none}.ngx-image-editor__workspace{position:relative;flex:1;min-height:0;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden}.ngx-image-editor__canvas{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none}.ngx-image-editor__placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#555;pointer-events:none}.ngx-image-editor__placeholder p{margin:0;font-size:14px}.ngx-image-editor__preview-panel{display:flex;align-items:center;gap:12px;padding:0 16px}.ngx-image-editor__preview-label{font-size:12px;color:#888;white-space:nowrap}.ngx-image-editor__preview-canvas{border:1px solid #333;border-radius:4px;background:#111;flex-shrink:0}.ngx-image-editor__preview-canvas--round{border-radius:50%}.ngx-image-editor__toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px 16px;flex-wrap:wrap}.ngx-image-editor__toolbar-group{display:flex;gap:4px}.ngx-image-editor__btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#e0e0e0;cursor:pointer;font-size:13px;transition:background .15s,border-color .15s;min-width:36px;min-height:36px}.ngx-image-editor__btn:hover{background:#3a3a3a;border-color:#666}.ngx-image-editor__btn:focus-visible{outline:2px solid #6ea8fe;outline-offset:2px}.ngx-image-editor__btn--reset{margin-left:auto;font-size:12px;color:#aaa}.ngx-image-editor__rotation-group{display:flex;align-items:center;gap:8px;flex:1;min-width:120px}.ngx-image-editor__rotation-label{font-size:12px;color:#aaa;width:44px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.ngx-image-editor__slider{flex:1;accent-color:#6ea8fe;cursor:pointer;height:4px}.ngx-image-editor__slider:focus-visible{outline:2px solid #6ea8fe;outline-offset:4px;border-radius:2px}\n"] }]
        }], ctorParameters: () => [], propDecorators: { image: [{ type: i0.Input, args: [{ isSignal: true, alias: "image", required: false }] }], aspectRatio: [{ type: i0.Input, args: [{ isSignal: true, alias: "aspectRatio", required: false }] }], maxWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "maxWidth", required: false }] }], maxHeight: [{ type: i0.Input, args: [{ isSignal: true, alias: "maxHeight", required: false }] }], quality: [{ type: i0.Input, args: [{ isSignal: true, alias: "quality", required: false }] }], outputFormat: [{ type: i0.Input, args: [{ isSignal: true, alias: "outputFormat", required: false }] }], roundCrop: [{ type: i0.Input, args: [{ isSignal: true, alias: "roundCrop", required: false }] }], minCropWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "minCropWidth", required: false }] }], minCropHeight: [{ type: i0.Input, args: [{ isSignal: true, alias: "minCropHeight", required: false }] }], handleSize: [{ type: i0.Input, args: [{ isSignal: true, alias: "handleSize", required: false }] }], handleHitArea: [{ type: i0.Input, args: [{ isSignal: true, alias: "handleHitArea", required: false }] }], overlayOpacity: [{ type: i0.Input, args: [{ isSignal: true, alias: "overlayOpacity", required: false }] }], cropBorderColor: [{ type: i0.Input, args: [{ isSignal: true, alias: "cropBorderColor", required: false }] }], cropBorderWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "cropBorderWidth", required: false }] }], handleColor: [{ type: i0.Input, args: [{ isSignal: true, alias: "handleColor", required: false }] }], imageLoaded: [{ type: i0.Output, args: ["imageLoaded"] }], loadError: [{ type: i0.Output, args: ["loadError"] }], imageCropped: [{ type: i0.Output, args: ["imageCropped"] }], mainCanvasRef: [{ type: i0.ViewChild, args: ['mainCanvas', { isSignal: true }] }], previewCanvasRef: [{ type: i0.ViewChild, args: ['previewCanvas', { isSignal: true }] }] } });

/**
 * Full-screen modal overlay that wraps `NgxImageEditorComponent`.
 * Instantiated dynamically by `NgxImageForgeService`; not intended for
 * direct template use.
 */
class NgxImageOverlayComponent {
    /** Configuration forwarded from the service or directive. */
    config = input.required(/* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "config" }] : /* istanbul ignore next */ []));
    /** Emits the result when the user confirms the crop. */
    confirmed = output();
    /** Emits when the user cancels. */
    cancelled = output();
    editorRef = viewChild('editor', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "editorRef" }] : /* istanbul ignore next */ []));
    onEscape() {
        this.cancel();
    }
    onBackdropClick(e) {
        if (e.target === e.currentTarget) {
            this.cancel();
        }
    }
    confirm() {
        const editor = this.editorRef();
        if (!editor)
            return;
        try {
            const result = editor.crop();
            this.confirmed.emit(result);
        }
        catch (e) {
            // No image loaded — silently ignore.
        }
    }
    cancel() {
        this.cancelled.emit();
    }
    onLoadError(e) {
        // Surface the error to the caller by cancelling — the service consumer
        // receives null and can check their image source.
        this.cancelled.emit();
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageOverlayComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "17.2.0", version: "22.0.3", type: NgxImageOverlayComponent, isStandalone: true, selector: "ngx-image-overlay", inputs: { config: { classPropertyName: "config", publicName: "config", isSignal: true, isRequired: true, transformFunction: null } }, outputs: { confirmed: "confirmed", cancelled: "cancelled" }, host: { attributes: { "role": "dialog", "aria-modal": "true", "aria-label": "Image editor" }, listeners: { "keydown.escape": "onEscape()", "click": "onBackdropClick($event)" }, classAttribute: "ngx-image-overlay" }, viewQueries: [{ propertyName: "editorRef", first: true, predicate: ["editor"], descendants: true, isSignal: true }], ngImport: i0, template: `
    <div class="ngx-image-overlay__dialog">
      <ngx-image-editor
        #editor
        class="ngx-image-overlay__editor"
        [image]="config().image ?? null"
        [aspectRatio]="config().aspectRatio ?? 'free'"
        [maxWidth]="config().maxWidth ?? 0"
        [maxHeight]="config().maxHeight ?? 0"
        [quality]="config().quality ?? 0.92"
        [outputFormat]="config().outputFormat ?? 'jpeg'"
        [roundCrop]="config().roundCrop ?? false"
        [minCropWidth]="config().minCropWidth ?? 50"
        [minCropHeight]="config().minCropHeight ?? 50"
        [handleSize]="config().handleSize ?? 10"
        [handleHitArea]="config().handleHitArea ?? 16"
        [overlayOpacity]="config().overlayOpacity ?? 0.55"
        [cropBorderColor]="config().cropBorderColor ?? '#ffffff'"
        [cropBorderWidth]="config().cropBorderWidth ?? 1.5"
        [handleColor]="config().handleColor ?? '#ffffff'"
        (loadError)="onLoadError($event)"
      />

      <div class="ngx-image-overlay__actions">
        <button
          type="button"
          class="ngx-image-overlay__btn ngx-image-overlay__btn--cancel"
          (click)="cancel()"
          aria-label="Cancel and close editor"
        >
          Cancel
        </button>
        <button
          type="button"
          class="ngx-image-overlay__btn ngx-image-overlay__btn--confirm"
          (click)="confirm()"
          aria-label="Confirm crop"
        >
          Crop
        </button>
      </div>
    </div>
  `, isInline: true, styles: [":host.ngx-image-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#000000bf;padding:16px;box-sizing:border-box;animation:ngx-overlay-in .2s ease}@keyframes ngx-overlay-in{0%{opacity:0}to{opacity:1}}.ngx-image-overlay__dialog{display:flex;flex-direction:column;width:100%;max-width:900px;max-height:100%;border-radius:12px;overflow:hidden;box-shadow:0 24px 48px #00000080}.ngx-image-overlay__editor{flex:1;min-height:400px}.ngx-image-overlay__actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background:#1a1a1a;border-top:1px solid #333}.ngx-image-overlay__btn{padding:8px 20px;border-radius:6px;border:1px solid #444;font-size:14px;cursor:pointer;font-family:system-ui,sans-serif;transition:background .15s}.ngx-image-overlay__btn:focus-visible{outline:2px solid #6ea8fe;outline-offset:2px}.ngx-image-overlay__btn--cancel{background:#2a2a2a;color:#aaa}.ngx-image-overlay__btn--cancel:hover{background:#3a3a3a}.ngx-image-overlay__btn--confirm{background:#0d6efd;color:#fff;border-color:#0d6efd}.ngx-image-overlay__btn--confirm:hover{background:#0b5ed7}\n"], dependencies: [{ kind: "component", type: NgxImageEditorComponent, selector: "ngx-image-editor", inputs: ["image", "aspectRatio", "maxWidth", "maxHeight", "quality", "outputFormat", "roundCrop", "minCropWidth", "minCropHeight", "handleSize", "handleHitArea", "overlayOpacity", "cropBorderColor", "cropBorderWidth", "handleColor"], outputs: ["imageLoaded", "loadError", "imageCropped"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageOverlayComponent, decorators: [{
            type: Component,
            args: [{ selector: 'ngx-image-overlay', imports: [NgxImageEditorComponent], changeDetection: ChangeDetectionStrategy.OnPush, host: {
                        class: 'ngx-image-overlay',
                        role: 'dialog',
                        'aria-modal': 'true',
                        'aria-label': 'Image editor',
                        '(keydown.escape)': 'onEscape()',
                        '(click)': 'onBackdropClick($event)',
                    }, template: `
    <div class="ngx-image-overlay__dialog">
      <ngx-image-editor
        #editor
        class="ngx-image-overlay__editor"
        [image]="config().image ?? null"
        [aspectRatio]="config().aspectRatio ?? 'free'"
        [maxWidth]="config().maxWidth ?? 0"
        [maxHeight]="config().maxHeight ?? 0"
        [quality]="config().quality ?? 0.92"
        [outputFormat]="config().outputFormat ?? 'jpeg'"
        [roundCrop]="config().roundCrop ?? false"
        [minCropWidth]="config().minCropWidth ?? 50"
        [minCropHeight]="config().minCropHeight ?? 50"
        [handleSize]="config().handleSize ?? 10"
        [handleHitArea]="config().handleHitArea ?? 16"
        [overlayOpacity]="config().overlayOpacity ?? 0.55"
        [cropBorderColor]="config().cropBorderColor ?? '#ffffff'"
        [cropBorderWidth]="config().cropBorderWidth ?? 1.5"
        [handleColor]="config().handleColor ?? '#ffffff'"
        (loadError)="onLoadError($event)"
      />

      <div class="ngx-image-overlay__actions">
        <button
          type="button"
          class="ngx-image-overlay__btn ngx-image-overlay__btn--cancel"
          (click)="cancel()"
          aria-label="Cancel and close editor"
        >
          Cancel
        </button>
        <button
          type="button"
          class="ngx-image-overlay__btn ngx-image-overlay__btn--confirm"
          (click)="confirm()"
          aria-label="Confirm crop"
        >
          Crop
        </button>
      </div>
    </div>
  `, styles: [":host.ngx-image-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#000000bf;padding:16px;box-sizing:border-box;animation:ngx-overlay-in .2s ease}@keyframes ngx-overlay-in{0%{opacity:0}to{opacity:1}}.ngx-image-overlay__dialog{display:flex;flex-direction:column;width:100%;max-width:900px;max-height:100%;border-radius:12px;overflow:hidden;box-shadow:0 24px 48px #00000080}.ngx-image-overlay__editor{flex:1;min-height:400px}.ngx-image-overlay__actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background:#1a1a1a;border-top:1px solid #333}.ngx-image-overlay__btn{padding:8px 20px;border-radius:6px;border:1px solid #444;font-size:14px;cursor:pointer;font-family:system-ui,sans-serif;transition:background .15s}.ngx-image-overlay__btn:focus-visible{outline:2px solid #6ea8fe;outline-offset:2px}.ngx-image-overlay__btn--cancel{background:#2a2a2a;color:#aaa}.ngx-image-overlay__btn--cancel:hover{background:#3a3a3a}.ngx-image-overlay__btn--confirm{background:#0d6efd;color:#fff;border-color:#0d6efd}.ngx-image-overlay__btn--confirm:hover{background:#0b5ed7}\n"] }]
        }], propDecorators: { config: [{ type: i0.Input, args: [{ isSignal: true, alias: "config", required: true }] }], confirmed: [{ type: i0.Output, args: ["confirmed"] }], cancelled: [{ type: i0.Output, args: ["cancelled"] }], editorRef: [{ type: i0.ViewChild, args: ['editor', { isSignal: true }] }] } });

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
class NgxImageForgeService {
    appRef = inject(ApplicationRef);
    injector = inject(EnvironmentInjector);
    /**
     * Open the image editor overlay with the supplied configuration.
     * Returns an `Observable` that emits once:
     * - The `NgxCroppedImage` when the user confirms the crop.
     * - `null` when the user cancels or dismisses.
     *
     * The observable completes immediately after emitting.
     */
    open(config) {
        const subject = new Subject();
        const ref = createComponent(NgxImageOverlayComponent, {
            environmentInjector: this.injector,
        });
        // Bind the required input.
        ref.setInput('config', config);
        // Wire outputs before attaching to the DOM so no events are missed.
        ref.instance.confirmed.subscribe((result) => {
            subject.next(result);
            subject.complete();
            this.destroy(ref);
        });
        ref.instance.cancelled.subscribe(() => {
            subject.next(null);
            subject.complete();
            this.destroy(ref);
        });
        // Attach change detection and append to the document body.
        this.appRef.attachView(ref.hostView);
        document.body.appendChild(ref.location.nativeElement);
        // Focus the overlay for keyboard accessibility.
        ref.location.nativeElement.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => ref.location.nativeElement.focus());
        return subject.asObservable();
    }
    destroy(ref) {
        this.appRef.detachView(ref.hostView);
        ref.destroy();
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageForgeService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageForgeService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageForgeService, decorators: [{
            type: Injectable,
            args: [{ providedIn: 'root' }]
        }] });

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
class NgxImageEditorTriggerDirective {
    forge = inject(NgxImageForgeService);
    destroyRef = inject(DestroyRef);
    // ── Inputs (mirror NgxImageEditorComponent inputs) ─────────────────────────
    /** Image source (File or URL). */
    triggerImage = input(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerImage" }] : /* istanbul ignore next */ []));
    /** Aspect ratio constraint. */
    triggerAspectRatio = input('free', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerAspectRatio" }] : /* istanbul ignore next */ []));
    /** Maximum output width in pixels. */
    triggerMaxWidth = input(0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerMaxWidth" }] : /* istanbul ignore next */ []));
    /** Maximum output height in pixels. */
    triggerMaxHeight = input(0, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerMaxHeight" }] : /* istanbul ignore next */ []));
    /** JPEG/WebP encoding quality 0–1. */
    triggerQuality = input(0.92, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerQuality" }] : /* istanbul ignore next */ []));
    /** Output MIME type. */
    triggerOutputFormat = input('jpeg', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerOutputFormat" }] : /* istanbul ignore next */ []));
    /** Apply circular crop mask. */
    triggerRoundCrop = input(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "triggerRoundCrop" }] : /* istanbul ignore next */ []));
    // ── Outputs ────────────────────────────────────────────────────────────────
    /** Emits the cropped image when the user confirms, or `null` on cancel. */
    forgeResult = output();
    // ── Public method ──────────────────────────────────────────────────────────
    /** Called by the host `(click)` binding; also callable programmatically. */
    openEditor() {
        this.forge
            .open({
            image: this.triggerImage() ?? undefined,
            aspectRatio: this.triggerAspectRatio(),
            maxWidth: this.triggerMaxWidth(),
            maxHeight: this.triggerMaxHeight(),
            quality: this.triggerQuality(),
            outputFormat: this.triggerOutputFormat(),
            roundCrop: this.triggerRoundCrop(),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => this.forgeResult.emit(result));
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageEditorTriggerDirective, deps: [], target: i0.ɵɵFactoryTarget.Directive });
    static ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "17.1.0", version: "22.0.3", type: NgxImageEditorTriggerDirective, isStandalone: true, selector: "[ngxImageEditorTrigger]", inputs: { triggerImage: { classPropertyName: "triggerImage", publicName: "triggerImage", isSignal: true, isRequired: false, transformFunction: null }, triggerAspectRatio: { classPropertyName: "triggerAspectRatio", publicName: "triggerAspectRatio", isSignal: true, isRequired: false, transformFunction: null }, triggerMaxWidth: { classPropertyName: "triggerMaxWidth", publicName: "triggerMaxWidth", isSignal: true, isRequired: false, transformFunction: null }, triggerMaxHeight: { classPropertyName: "triggerMaxHeight", publicName: "triggerMaxHeight", isSignal: true, isRequired: false, transformFunction: null }, triggerQuality: { classPropertyName: "triggerQuality", publicName: "triggerQuality", isSignal: true, isRequired: false, transformFunction: null }, triggerOutputFormat: { classPropertyName: "triggerOutputFormat", publicName: "triggerOutputFormat", isSignal: true, isRequired: false, transformFunction: null }, triggerRoundCrop: { classPropertyName: "triggerRoundCrop", publicName: "triggerRoundCrop", isSignal: true, isRequired: false, transformFunction: null } }, outputs: { forgeResult: "forgeResult" }, host: { listeners: { "click": "openEditor()" } }, ngImport: i0 });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "22.0.3", ngImport: i0, type: NgxImageEditorTriggerDirective, decorators: [{
            type: Directive,
            args: [{
                    selector: '[ngxImageEditorTrigger]',
                    host: {
                        '(click)': 'openEditor()',
                    },
                }]
        }], propDecorators: { triggerImage: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerImage", required: false }] }], triggerAspectRatio: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerAspectRatio", required: false }] }], triggerMaxWidth: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerMaxWidth", required: false }] }], triggerMaxHeight: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerMaxHeight", required: false }] }], triggerQuality: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerQuality", required: false }] }], triggerOutputFormat: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerOutputFormat", required: false }] }], triggerRoundCrop: [{ type: i0.Input, args: [{ isSignal: true, alias: "triggerRoundCrop", required: false }] }], forgeResult: [{ type: i0.Output, args: ["forgeResult"] }] } });

/*
 * Public API surface of ngx-image-forge
 */
// ── Components ─────────────────────────────────────────────────────────────────

/**
 * Generated bundle index. Do not edit.
 */

export { NgxImageEditorComponent, NgxImageEditorTriggerDirective, NgxImageForgeService };
//# sourceMappingURL=ngx-image-forge.mjs.map
