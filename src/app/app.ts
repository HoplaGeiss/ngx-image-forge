import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PlaygroundComponent } from './playground/playground.component';
import { ProfileEditorComponent } from './profile-editor/profile-editor.component';

@Component({
  selector: 'app-root',
  imports: [PlaygroundComponent, ProfileEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly activeTab = signal<'playground' | 'profile'>('playground');
}
