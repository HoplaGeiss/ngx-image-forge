import {
  ApplicationRef,
  ComponentRef,
  EnvironmentInjector,
  Injectable,
  createComponent,
  inject,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { NgxImageOverlayComponent } from '../components/ngx-image-overlay/ngx-image-overlay.component';
import { NgxCroppedImage, NgxImageForgeConfig } from '../models/ngx-image-forge.models';

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
@Injectable({ providedIn: 'root' })
export class NgxImageForgeService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  /**
   * Open the image editor overlay with the supplied configuration.
   * Returns an `Observable` that emits once:
   * - The `NgxCroppedImage` when the user confirms the crop.
   * - `null` when the user cancels or dismisses.
   *
   * The observable completes immediately after emitting.
   */
  open(config: NgxImageForgeConfig): Observable<NgxCroppedImage | null> {
    const subject = new Subject<NgxCroppedImage | null>();

    const ref: ComponentRef<NgxImageOverlayComponent> = createComponent(NgxImageOverlayComponent, {
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
    (ref.location.nativeElement as HTMLElement).setAttribute('tabindex', '-1');
    requestAnimationFrame(() => (ref.location.nativeElement as HTMLElement).focus());

    return subject.asObservable();
  }

  private destroy(ref: ComponentRef<NgxImageOverlayComponent>): void {
    this.appRef.detachView(ref.hostView);
    ref.destroy();
  }
}
