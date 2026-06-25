import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { NgxImageEditorComponent } from '../ngx-image-editor/ngx-image-editor.component';
import { NgxCroppedImage, NgxImageForgeConfig } from '../../models/ngx-image-forge.models';

/**
 * Full-screen modal overlay that wraps `NgxImageEditorComponent`.
 * Instantiated dynamically by `NgxImageForgeService`; not intended for
 * direct template use.
 */
@Component({
  selector: 'ngx-image-overlay',
  imports: [NgxImageEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngx-image-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Image editor',
    '(keydown.escape)': 'onEscape()',
    '(click)': 'onBackdropClick($event)',
  },
  styles: [`
    :host.ngx-image-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      padding: 16px;
      box-sizing: border-box;
      animation: ngx-overlay-in 0.2s ease;
    }

    @keyframes ngx-overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .ngx-image-overlay__dialog {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 900px;
      max-height: 100%;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    }

    .ngx-image-overlay__editor {
      flex: 1;
      min-height: 400px;
    }

    .ngx-image-overlay__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      background: #1a1a1a;
      border-top: 1px solid #333;
    }

    .ngx-image-overlay__btn {
      padding: 8px 20px;
      border-radius: 6px;
      border: 1px solid #444;
      font-size: 14px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
      transition: background 0.15s;

      &:focus-visible {
        outline: 2px solid #6ea8fe;
        outline-offset: 2px;
      }
    }

    .ngx-image-overlay__btn--cancel {
      background: #2a2a2a;
      color: #aaa;

      &:hover { background: #3a3a3a; }
    }

    .ngx-image-overlay__btn--confirm {
      background: #0d6efd;
      color: #fff;
      border-color: #0d6efd;

      &:hover { background: #0b5ed7; }
    }
  `],
  template: `
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
  `,
})
export class NgxImageOverlayComponent {
  /** Configuration forwarded from the service or directive. */
  readonly config = input.required<NgxImageForgeConfig>();

  /** Emits the result when the user confirms the crop. */
  readonly confirmed = output<NgxCroppedImage>();

  /** Emits when the user cancels. */
  readonly cancelled = output<void>();

  private readonly editorRef = viewChild<NgxImageEditorComponent>('editor');

  protected onEscape(): void {
    this.cancel();
  }

  protected onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement) === e.currentTarget) {
      this.cancel();
    }
  }

  protected confirm(): void {
    const editor = this.editorRef();
    if (!editor) return;
    try {
      const result = editor.crop();
      this.confirmed.emit(result);
    } catch (e) {
      // No image loaded — silently ignore.
    }
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected onLoadError(e: string | Event): void {
    // Surface the error to the caller by cancelling — the service consumer
    // receives null and can check their image source.
    this.cancelled.emit();
  }
}
