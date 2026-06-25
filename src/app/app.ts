import {
  ChangeDetectionStrategy,
  Component,
  afterEveryRender,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxImageEditorComponent, NgxCroppedImage, NgxAspectRatio } from 'ngx-image-forge';

interface AspectRatioOption {
  label: string;
  value: NgxAspectRatio;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, NgxImageEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly editorRef = viewChild<NgxImageEditorComponent>('editor');

  readonly imageSource = signal<File | string | null>('demo-image.svg');
  readonly aspectRatioValue = signal<NgxAspectRatio>('free');
  readonly roundCrop = signal(false);
  readonly quality = signal(0.92);
  readonly outputFormat = signal<'jpeg' | 'png' | 'webp'>('jpeg');

  readonly croppedResult = signal<NgxCroppedImage | null>(null);
  readonly imageMetadata = signal<{ naturalWidth: number; naturalHeight: number } | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly fileSizeKb = computed(() => {
    const r = this.croppedResult();
    if (!r) return null;
    return (r.blob.size / 1024).toFixed(1);
  });

  protected readonly String = String;

  readonly aspectRatioOptions: AspectRatioOption[] = [
    { label: 'Free', value: 'free' },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '16:9', value: 16 / 9 },
    { label: '3:2', value: 3 / 2 },
    { label: '9:16', value: 9 / 16 },
  ];

  constructor() {
    afterEveryRender(() => {
      const editor = this.editorRef();
      if (!editor?.isLoaded()) return;
      try {
        this.croppedResult.set(editor.crop());
      } catch { /* no-op */ }
    });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.croppedResult.set(null);
    this.errorMessage.set(null);
    // Fall back to the bundled demo image when nothing is chosen.
    this.imageSource.set(file ?? 'demo-image.svg');
  }

  onImageLoaded(meta: { naturalWidth: number; naturalHeight: number }): void {
    this.imageMetadata.set(meta);
    this.errorMessage.set(null);
  }

  onLoadError(): void {
    this.errorMessage.set('Failed to load image. Please try a different file.');
    this.imageSource.set(null);
    this.imageMetadata.set(null);
  }

  onAspectRatioChange(raw: string): void {
    const opt = this.aspectRatioOptions.find(o => String(o.value) === raw);
    if (opt) this.aspectRatioValue.set(opt.value);
  }

  download(): void {
    const result = this.croppedResult();
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = `cropped.${this.outputFormat()}`;
    a.click();
  }
}
