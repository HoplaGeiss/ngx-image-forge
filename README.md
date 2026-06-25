# ngx-image-forge

A signals-native, dependency-free Angular image editing library using the Canvas API.

[![CI](https://github.com/HoplaGeiss/ngx-image-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/HoplaGeiss/ngx-image-forge/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ngx-image-forge)](https://www.npmjs.com/package/ngx-image-forge)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**[Live demo →](https://hoplageiss.github.io/ngx-image-forge/)**

---

## Features

- **Signals-first** — internal state is pure signals, OnPush throughout
- **Zoneless-compatible** — works with `provideExperimentalZonelessChangeDetection()`
- **Zero runtime dependencies** — pure Canvas API, no third-party image libraries
- **Three usage patterns** — embedded component, trigger directive, or programmatic service
- **Non-destructive transforms** — rotate, flip, and crop are composed on export, never on the original
- **Aspect ratio constraints** — free, fixed numeric ratio (e.g. `16/9`), or `1` for square
- **Circular crop** — circular clip mask applied at export time
- **Output control** — JPEG, PNG, or WebP with configurable quality and max dimensions
- **Touch support** — drag and resize handles work on mobile
- **Accessible** — keyboard-navigable overlay, focus management on open/close

---

## Requirements

- Angular **19+**

---

## Installation

```bash
npm install ngx-image-forge
# or
pnpm add ngx-image-forge
```

---

## Usage

There are three ways to use ngx-image-forge. Pick the one that fits your workflow.

---

### 1. Embedded component

Drop `<ngx-image-editor>` directly into your template and control it via a `viewChild` reference. Best for dedicated editing pages.

```ts
import { NgxImageEditorComponent, NgxCroppedImage } from 'ngx-image-forge';

@Component({
  imports: [NgxImageEditorComponent],
  template: `
    <ngx-image-editor [image]="file" [aspectRatio]="1" #editor style="height: 500px" />
    <button (click)="crop(editor)">Crop</button>
  `,
})
export class MyComponent {
  file: File | null = null;

  crop(editor: NgxImageEditorComponent): void {
    const result: NgxCroppedImage = editor.crop();
    console.log(result.dataUrl, result.blob);
  }
}
```

---

### 2. Trigger directive

Attach `ngxImageEditorTrigger` to any clickable element. Clicking it opens a full-screen overlay; the result is emitted via `(forgeResult)`. Best for inline "edit" buttons next to images.

```ts
import { NgxImageEditorTriggerDirective, NgxCroppedImage } from 'ngx-image-forge';

@Component({
  imports: [NgxImageEditorTriggerDirective],
  template: `
    <button
      ngxImageEditorTrigger
      [triggerImage]="file"
      [triggerAspectRatio]="16 / 9"
      (forgeResult)="onResult($event)"
    >
      Edit image
    </button>
  `,
})
export class MyComponent {
  file: File | null = null;

  onResult(result: NgxCroppedImage | null): void {
    if (result) console.log('Cropped!', result.dataUrl);
  }
}
```

---

### 3. Programmatic service

Inject `NgxImageForgeService` and call `open()` anywhere. Returns an `Observable` that emits once with the result (or `null` on cancel). Best for flows where the editor is opened from a service or complex logic.

```ts
import { NgxImageForgeService, NgxCroppedImage } from 'ngx-image-forge';

@Component({ ... })
export class MyComponent {
  private readonly forge = inject(NgxImageForgeService);

  openEditor(file: File): void {
    this.forge.open({ image: file, aspectRatio: 1, roundCrop: true }).subscribe(result => {
      if (result) console.log('Cropped!', result.dataUrl);
    });
  }
}
```

---

## `NgxImageEditorComponent` inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `image` | `File \| string \| null` | `null` | Source image — a `File` object or a URL string |
| `aspectRatio` | `number \| 'free'` | `'free'` | Crop constraint — a ratio (e.g. `16/9`) or `'free'` |
| `maxWidth` | `number` | `0` | Maximum output width in px; `0` = unconstrained |
| `maxHeight` | `number` | `0` | Maximum output height in px; `0` = unconstrained |
| `quality` | `number` | `0.92` | JPEG/WebP encoding quality, 0–1 |
| `outputFormat` | `'jpeg' \| 'png' \| 'webp'` | `'jpeg'` | Output MIME type |
| `roundCrop` | `boolean` | `false` | Apply circular clip mask to the crop output |
| `minCropWidth` | `number` | `50` | Minimum crop rectangle width in canvas px |
| `minCropHeight` | `number` | `50` | Minimum crop rectangle height in canvas px |
| `handleSize` | `number` | `10` | Side length in px of each resize handle square |
| `handleHitArea` | `number` | `16` | Hit-test radius in px around each handle (increase for touch) |
| `overlayOpacity` | `number` | `0.55` | Opacity of the dark overlay outside the crop rectangle |
| `cropBorderColor` | `string` | `'#ffffff'` | CSS colour of the crop rectangle border |
| `cropBorderWidth` | `number` | `1.5` | Width in px of the crop rectangle border |
| `handleColor` | `string` | `'#ffffff'` | CSS colour of the resize handles |

## `NgxImageEditorComponent` outputs

| Output | Payload | Description |
|---|---|---|
| `imageLoaded` | `{ naturalWidth: number; naturalHeight: number }` | Fires when the image has loaded and is ready for editing |
| `loadError` | `string \| Event` | Fires when the image fails to load |
| `imageCropped` | `NgxCroppedImage` | Fires immediately after a successful `crop()` call |

## `NgxImageEditorComponent` methods

| Method | Description |
|---|---|
| `crop()` | Performs the crop synchronously and returns an `NgxCroppedImage`. Throws if no image is loaded. |
| `reset()` | Restores rotation, flip, and crop rectangle to their initial state. |
| `rotate(degrees)` | Rotates the image by the given angle. Use multiples of 90 for lossless steps. |
| `setRotation(degrees)` | Sets the exact rotation angle in degrees. |
| `flipHorizontal()` | Toggles horizontal flip. |
| `flipVertical()` | Toggles vertical flip. |

---

## `[ngxImageEditorTrigger]` directive inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `triggerImage` | `File \| string \| null` | `null` | Source image |
| `triggerAspectRatio` | `number \| 'free'` | `'free'` | Aspect ratio constraint |
| `triggerMaxWidth` | `number` | `0` | Maximum output width in px |
| `triggerMaxHeight` | `number` | `0` | Maximum output height in px |
| `triggerQuality` | `number` | `0.92` | JPEG/WebP encoding quality |
| `triggerOutputFormat` | `'jpeg' \| 'png' \| 'webp'` | `'jpeg'` | Output MIME type |
| `triggerRoundCrop` | `boolean` | `false` | Apply circular clip mask |

**Output:** `(forgeResult)` — emits `NgxCroppedImage` on confirm, `null` on cancel.

---

## `NgxCroppedImage`

The object returned by `crop()` and emitted by all result outputs.

| Field | Type | Description |
|---|---|---|
| `blob` | `Blob` | Cropped image as a Blob, ready for upload |
| `dataUrl` | `string` | Base64 data URL, suitable for `<img src>` |
| `width` | `number` | Output width in px |
| `height` | `number` | Output height in px |
| `originalWidth` | `number` | Natural width of the source image in px |
| `originalHeight` | `number` | Natural height of the source image in px |

---

## Contributing

Pull requests are welcome. For significant changes please open an issue first.

```bash
git clone https://github.com/HoplaGeiss/ngx-image-forge.git
cd ngx-image-forge
pnpm install
ng serve   # starts the demo app at localhost:4200
```

---

## License

[MIT](LICENSE)
