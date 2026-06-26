import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgxImageForgeService } from 'ngx-image-forge';

@Component({
  selector: 'app-profile-editor',
  templateUrl: './profile-editor.component.html',
  styleUrl: './profile-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditorComponent {
  private readonly forge = inject(NgxImageForgeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly profileImage = signal<string | null>(null);

  openPicker(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.forge
      .open({ image: file, aspectRatio: 1, roundCrop: true, outputFormat: 'png', quality: 0.95 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) this.profileImage.set(result.dataUrl);
        input.value = '';
      });
  }
}
