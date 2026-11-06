import { SPLASH_COLOR } from "@/lib/pwa/splash";

// Shown once per session, from the page's very first paint, before any of the app's code has run.
const splashScript = `(function(){try{var s=document.getElementById('splash');if(sessionStorage.getItem('steadyset:splashed')){s.hidden=true;return}sessionStorage.setItem('steadyset:splashed','1');document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content','${SPLASH_COLOR}')})}catch(e){}})();`;

const VIEW = "0 0 512 512";

/**
 * The loading screen: the logo assembles itself and opens up onto the app. The ring's two arcs and
 * the dumbbell are separate layers that only rotate, scale and fade, which the browser animates
 * off the main thread, so it stays smooth while the app is starting up underneath.
 */
export function Splash() {
  return (
    <>
      <div id="splash" className="splash" aria-hidden="true" suppressHydrationWarning>
        <div className="splash-mark">
          <div className="splash-glow" />
          <svg viewBox={VIEW} className="splash-arc splash-arc-blue" fill="none" strokeWidth="28" strokeLinecap="round">
            <path d="M279.4 89.6A168 168 0 1 1 89.6 279.4" stroke="#9cc9f0" />
          </svg>
          <svg viewBox={VIEW} className="splash-arc splash-arc-green" fill="none" strokeWidth="28" strokeLinecap="round">
            <path d="M89.6 232.6A168 168 0 0 1 232.6 89.6" stroke="#7fa883" />
          </svg>
          <svg viewBox={VIEW} className="splash-bell" fill="#ffffff">
            <g transform="translate(256 256) scale(0.86) rotate(-45)">
              <rect x="-74" y="-11" width="148" height="22" rx="11" />
              <rect x="-108" y="-76" width="36" height="152" rx="13" />
              <rect x="72" y="-76" width="36" height="152" rx="13" />
              <rect x="-142" y="-52" width="26" height="104" rx="11" />
              <rect x="116" y="-52" width="26" height="104" rx="11" />
            </g>
          </svg>
        </div>
        <p className="splash-word brand">Steadyset</p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: splashScript }} />
    </>
  );
}
