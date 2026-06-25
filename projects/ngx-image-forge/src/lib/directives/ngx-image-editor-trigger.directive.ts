import {
  DestroyRef,
  Directive,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { NgxImageForgeService } from '../services/ngx-image-forge.service';
import {
  NgxAspectRatio,
  NgxCroppedImage,
  NgxOutputFormat,
} from '../models/ngx-image-forge.models';

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
@Directive({
  selector: '[ngxImageEditorTrigger]',
  host: {
    '(click)': 'openEditor()',
  },
})
export class NgxImageEditorTriggerDirective {
  private readonly forge = inject(NgxImageForgeService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs (mirror NgxImageEditorComponent inputs) ─────────────────────────

  /** Image source (File or URL). */
  readonly triggerImage = input<File | string | null>(null);

  /** Aspect ratio constraint. */
  readonly triggerAspectRatio = input<NgxAspectRatio>('free');

  /** Maximum output width in pixels. */
  readonly triggerMaxWidth = input<number>(0);

  /** Maximum output height in pixels. */
  readonly triggerMaxHeight = input<number>(0);

  /** JPEG/WebP encoding quality 0–1. */
  readonly triggerQuality = input<number>(0.92);

  /** Output MIME type. */
  readonly triggerOutputFormat = input<NgxOutputFormat>('jpeg');

  /** Apply circular crop mask. */
  readonly triggerRoundCrop = input<boolean>(false);

  // ── Outputs ────────────────────────────────────────────────────────────────

  /** Emits the cropped image when the user confirms, or `null` on cancel. */
  readonly forgeResult = output<NgxCroppedImage | null>();

  // ── Public method ──────────────────────────────────────────────────────────

  /** Called by the host `(click)` binding; also callable programmatically. */
  openEditor(): void {
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
}
