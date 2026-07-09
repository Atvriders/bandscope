// BandScope entry point. `?smoke=1` runs the GL-only waterfall smoke; otherwise
// the full app mounts (mock radios in the browser dev tier; native radios in the
// APK arrive in Milestone 2).
import { App } from './ui/App';
import { runSmoke } from './render/smoke';

const params = new URLSearchParams(location.search);
if (params.get('smoke') === '1') {
  runSmoke(document.getElementById('waterfall') as HTMLCanvasElement);
} else {
  new App().start();
}
