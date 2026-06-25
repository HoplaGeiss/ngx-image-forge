/*
 * Public API surface of ngx-image-forge
 */

// ── Components ─────────────────────────────────────────────────────────────────
export { NgxImageEditorComponent } from './lib/components/ngx-image-editor/ngx-image-editor.component';

// ── Directives ─────────────────────────────────────────────────────────────────
export { NgxImageEditorTriggerDirective } from './lib/directives/ngx-image-editor-trigger.directive';

// ── Services ───────────────────────────────────────────────────────────────────
export { NgxImageForgeService } from './lib/services/ngx-image-forge.service';

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  NgxCroppedImage,
  NgxImageForgeConfig,
  NgxOutputFormat,
  NgxAspectRatio,
} from './lib/models/ngx-image-forge.models';
