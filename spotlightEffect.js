// spotlightEffect.js
// Minimal GLSL spotlight overlay via Shell.GLSLEffect
// The shader generates a circular spotlight effect with glass morphism:
//   - Inside spotlight: blurred desktop (frosted glass effect)
//   - At spotlight edge: smooth transition
//   - Outside spotlight: semi-transparent overlay
// No Cairo dependency in this mode.

import Shell from "gi://Shell";
import Meta from "gi://Meta";
import GObject from "gi://GObject";
import { debugLog, LogLevel } from "./utils.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";


export const SpotlightGLSLEffect = GObject.registerClass(
  { GTypeName: "RWCSpotlightGLSLEffect" },
  class SpotlightGLSLEffect extends Shell.GLSLEffect {
    constructor(actor, settings) {
      super(actor);
      this._settings = settings;
      this._mouseX = 0;
      this._mouseY = 0;
      this._visible = false;
      this._monitorGeometry = null;
      this._refreshRate = 60;
      this._frameInterval = 1 / 60;
      this._refreshRateMonitorIndex = -1;
    }

    /**
     * Detect the refresh rate (Hz) of the monitor the mouse cursor is on.
     * Cached per monitor — re-detects only when the mouse moves to a different monitor.
     * Falls back through multiple GNOME Shell/Mutter API versions.
     */
    _updateRefreshRate() {
      try {
        const [mx, my] = global.get_pointer();

        // Find monitor index at mouse cursor position
        let monitorIndex = -1;
        try {
          // GNOME 46+ API
          monitorIndex = global.display.get_monitor_index_for_rect({
            x: mx,
            y: my,
            width: 1,
            height: 1,
          });
        } catch {
          // Fallback: manual geometry search
          for (let i = 0; i < global.display.get_n_monitors(); i++) {
            const g = global.display.get_monitor_geometry(i);
            if (
              mx >= g.x &&
              mx < g.x + g.width &&
              my >= g.y &&
              my < g.y + g.height
            ) {
              monitorIndex = i;
              break;
            }
          }
        }
        if (monitorIndex < 0) return;
        if (monitorIndex === this._refreshRateMonitorIndex) return;
        this._refreshRateMonitorIndex = monitorIndex;

        // Try multiple APIs to get the refresh rate
        let refreshRate = 0;

        // Try Main.layoutManager.monitors first (GNOME 3.32+)
        let monitors =
          (Main.layoutManager && Main.layoutManager.monitors) ||
          (global.display &&
            typeof global.display.get_monitors === "function" &&
            global.display.get_monitors()) ||
          (global.screen &&
            typeof global.screen.get_monitors === "function" &&
            global.screen.get_monitors()) ||
          null;

        if (!monitors) {
          log("No monitor list API found.");
          return;
        }

        for (let i = 0; i < monitors.length; i++) {
          let m = monitors[i];

          // Different runtimes expose refresh information differently.
          // Try common locations in order of likelihood:

          // 1) Meta.Monitor objects (some versions expose a `refresh_rate` or `refresh_rate_millihertz`)
          if (m.refresh_rate) {
            log(`Monitor ${i}: ${m.width}x${m.height} @ ${m.refresh_rate} Hz`);
            continue;
          }
          if (m.refresh_rate_millihertz) {
            log(
              `Monitor ${i}: ${m.width}x${m.height} @ ${m.refresh_rate_millihertz / 1000} Hz`,
            );
            continue;
          }

          // 2) Mutter/Clutter output info via global.display (returns Meta.Monitor in some versions)
          try {
            if (
              global.display &&
              typeof global.display.get_n_monitors === "function"
            ) {
              // Some globals provide get_monitor or get_monitor_info variants
              let info = global.display.get_monitor(i);
              if (info && info.refresh_rate) {
                log(
                  `Monitor ${i}: ${info.width}x${info.height} @ ${info.refresh_rate} Hz`,
                );
                continue;
              }
            }
          } catch (e) {
            /* ignore */
          }

          // 3) Try using Meta.Output/MonitorManager (newer Mutter)
          try {
            if (Meta && Meta.Output) {
              // Some versions expose outputs via global.display.get_monitors()
              // or Main.layoutManager.primaryMonitor/monitors containing `.refreshRate`
              if (m.refreshRate) {
                log(
                  `Monitor ${i}: ${m.width}x${m.height} @ ${m.refreshRate} Hz`,
                );
                continue;
              }
            }
          } catch (e) {
            /* ignore */
          }

          // 4) Fallback: no refresh available — print geometry only
          log(
            `Monitor ${i}: ${m.width}x${m.height} at ${m.x},${m.y} — refresh unknown`,
          );
        }

        // Method 1: global.display.get_monitor(index) — GNOME 46+
        try {
          debugLog(
            "get refresh rate - Method 1: global.display.get_monitor(index) — GNOME 46+",
            LogLevel.DEBUG,
          );
          debugLog(`global.display==${global.display}`);
          const mon = global.display.get_monitor(monitorIndex);
          if (mon) {
            const mode = mon.get_current_mode();
            if (mode) refreshRate = mode.refresh_rate;
          }
        } catch (e) {
          debugLog(`Refresh rate detection error: ${e}`, LogLevel.DEBUG);
        }

        // Method 2: Meta.MonitorManager backend API
        if (!refreshRate) {
          try {
            debugLog(
              "get refresh rate - // Method 2: Meta.MonitorManager backend API",
              LogLevel.DEBUG,
            );
            const mgr = global.backend.get_monitor_manager();
            const mode = mgr.get_monitors()[monitorIndex]?.get_current_mode();
            if (mode) refreshRate = mode.refresh_rate;
          } catch (e) {
            debugLog(`Refresh rate detection error: ${e}`, LogLevel.DEBUG);
          }
        }

        // Method 3: static Meta.MonitorManager.get()
        if (!refreshRate) {
          try {
            // Method 3: static Meta.MonitorManager.get()
            debugLog(
              "get refresh rate - Method 3: static Meta.MonitorManager.get()",
              LogLevel.DEBUG,
            );
            const mgr = Meta.MonitorManager.get();
            const mode = mgr.get_monitors()[monitorIndex]?.get_current_mode();
            if (mode) refreshRate = mode.refresh_rate;
          } catch (e) {
            debugLog(`Refresh rate detection error: ${e}`, LogLevel.DEBUG);
          }
        }

        if (refreshRate > 0) {
          this._refreshRate = refreshRate;
          this._frameInterval = 1.0 / this._refreshRate;
          debugLog(
            `Monitor ${monitorIndex} refresh rate: ${this._refreshRate} Hz`,
            LogLevel.INFO,
          );
        } else {
          debugLog(
            `Could not detect refresh rate for monitor ${monitorIndex}`,
            LogLevel.DEBUG,
          );
        }
      } catch (e) {
        debugLog(`Refresh rate detection error: ${e}`, LogLevel.DEBUG);
      }
    }

    setMousePosition(x, y) {
      this._mouseX = x;
      this._mouseY = y;
      // Detect refresh rate on mouse move (cached per monitor)
      this._updateRefreshRate();
      this.queue_repaint();
    }

    setMonitorGeometry(geometry) {
      this._monitorGeometry = geometry;
      this._updateRefreshRate();
    }

    show() {
      this._visible = true;
      if (this.actor) {
        this.actor.opacity = 255;
        this.actor.show();
      }
    }

    hide() {
      this._visible = false;
      if (this.actor) {
        this.actor.opacity = 0;
      }
    }

      vfunc_build_pipeline() {
        // Glass morphism shader with multi-scale blur, glass tint, noise, and exponential glow
        this.add_glsl_snippet(
          Shell.SnippetHook.FRAGMENT,
          `uniform sampler2D cogl_texture0;
           uniform vec4 spotlightCenter;
           uniform float spotlightRadius;
           uniform vec4 bgColor;
           uniform vec4 spotlightColor;
           uniform float aspectRatio;
           uniform float blurRadius;
           uniform float glassOpacity;
           uniform vec4 glowColor;
           uniform vec4 glassTint;
            uniform float glassMorphismEnabled;
            uniform float ringHalfWidth;`,
          `vec2 coord = cogl_tex_coord0_in.xy;
           coord.y *= aspectRatio;
           vec2 center = spotlightCenter.xy;
           center.y *= aspectRatio;
           float dist = distance(coord, center);

           if (dist < spotlightRadius) {
               if (glassMorphismEnabled > 0.5) {
               // 5x5 Gaussian blur kernel (sigma=1.0)
               vec2 ts = vec2(1.0/1920.0, 1.0/1080.0) * blurRadius;
               vec4 s = vec4(0.0);

               s += texture2D(cogl_texture0, coord + ts*vec2(-2,-2)) * 0.003765;
               s += texture2D(cogl_texture0, coord + ts*vec2(-1,-2)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2( 0,-2)) * 0.023792;
               s += texture2D(cogl_texture0, coord + ts*vec2( 1,-2)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2( 2,-2)) * 0.003765;

               s += texture2D(cogl_texture0, coord + ts*vec2(-2,-1)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2(-1,-1)) * 0.059912;
               s += texture2D(cogl_texture0, coord + ts*vec2( 0,-1)) * 0.094907;
               s += texture2D(cogl_texture0, coord + ts*vec2( 1,-1)) * 0.059912;
               s += texture2D(cogl_texture0, coord + ts*vec2( 2,-1)) * 0.015019;

               s += texture2D(cogl_texture0, coord + ts*vec2(-2, 0)) * 0.023792;
               s += texture2D(cogl_texture0, coord + ts*vec2(-1, 0)) * 0.094907;
               s += texture2D(cogl_texture0, coord + ts*vec2( 0, 0)) * 0.150342;
               s += texture2D(cogl_texture0, coord + ts*vec2( 1, 0)) * 0.094907;
               s += texture2D(cogl_texture0, coord + ts*vec2( 2, 0)) * 0.023792;

               s += texture2D(cogl_texture0, coord + ts*vec2(-2, 1)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2(-1, 1)) * 0.059912;
               s += texture2D(cogl_texture0, coord + ts*vec2( 0, 1)) * 0.094907;
               s += texture2D(cogl_texture0, coord + ts*vec2( 1, 1)) * 0.059912;
               s += texture2D(cogl_texture0, coord + ts*vec2( 2, 1)) * 0.015019;

               s += texture2D(cogl_texture0, coord + ts*vec2(-2, 2)) * 0.003765;
               s += texture2D(cogl_texture0, coord + ts*vec2(-1, 2)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2( 0, 2)) * 0.023792;
               s += texture2D(cogl_texture0, coord + ts*vec2( 1, 2)) * 0.015019;
               s += texture2D(cogl_texture0, coord + ts*vec2( 2, 2)) * 0.003765;

               // Subtle noise for frosted texture
               float n = fract(sin(dot(coord*100.0, vec2(12.9898, 78.233)))*43758.5453)*0.02;
               s.rgb += n;

               cogl_color_out = vec4(s.rgb, glassOpacity);
               } else {
                   cogl_color_out = vec4(0.0, 0.0, 0.0, 0.0);
               }
           } else {
               vec3 tintedBg = mix(bgColor.rgb, glassTint.rgb, glassTint.a);
               cogl_color_out = vec4(tintedBg, bgColor.a * 0.7);
           }

           // Spotlight ring at edge (thin circle outline)
           float rd = dist - spotlightRadius;
           if (rd > -ringHalfWidth && rd < ringHalfWidth) {
               float t = 1.0 - abs(rd) / ringHalfWidth;
               cogl_color_out = mix(cogl_color_out, spotlightColor, t * spotlightColor.a);
           }

           // Exponential glow outside spotlight (only when glass morphism enabled)
           if (glassMorphismEnabled > 0.5) {
           float gd = max(dist - spotlightRadius, 0.0) / max(1.0 - spotlightRadius, 0.001);
           float ga = exp(-gd * 8.0) * glowColor.a;
           cogl_color_out.rgb = mix(cogl_color_out.rgb, glowColor.rgb, ga);
           }
        `,
      false
    );
    }

      vfunc_paint_target(node, paintContext) {
       if (!this._visible || !this._monitorGeometry) return;

       const w = this._monitorGeometry.width;
       const h = this._monitorGeometry.height;

       // Mouse position in normalized coordinates [0,1]
       const centerX = (this._mouseX - this._monitorGeometry.x) / w;
       const centerY = (this._mouseY - this._monitorGeometry.y) / h;

       // Aspect ratio for round-spotlight correction.
       // dist = sqrt(dx² + (dy · h/w)²) — y-delta scaled by h/w so that
       // a unit step in x (w px) covers the same pixel distance as a unit
       // in scaled y (w px).  Radius = R / w.
       const aspectRatio = h > 0 ? h / w : 1.0;

       // Update uniforms (only what we need for minimal shader)
        // Get only the uniform locations we need
        const centerLoc = this.get_uniform_location("spotlightCenter");
        const radiusLoc = this.get_uniform_location("spotlightRadius");
        const bgColorLoc = this.get_uniform_location("bgColor");
        const aspectLoc = this.get_uniform_location("aspectRatio");

         // Set uniforms for spotlight shader with glass effect
         this.set_uniform_float(centerLoc, 4, [centerX, centerY, 0.0, 0.0]);
         this.set_uniform_float(radiusLoc, 1, [this._settings.cachedRadius / w]);
         this.set_uniform_float(bgColorLoc, 4, this._settings.cachedBgColorNormalized);
         this.set_uniform_float(this.get_uniform_location("spotlightColor"), 4, this._settings.cachedSpotlightColorNormalized);
         this.set_uniform_float(aspectLoc, 1, [aspectRatio]);
         this.set_uniform_float(this.get_uniform_location("blurRadius"), 1, [this._settings.cachedBlurRadius]);
          this.set_uniform_float(this.get_uniform_location("glassOpacity"), 1, [this._settings.cachedGlassOpacity]);
          this.set_uniform_float(this.get_uniform_location("glowColor"), 4, this._settings.cachedGlowColorNormalized);
          this.set_uniform_float(this.get_uniform_location("glassTint"), 4, this._settings.cachedGlassTintNormalized);
          this.set_uniform_float(this.get_uniform_location("glassMorphismEnabled"), 1, [this._settings.cachedGlassMorphismEnabled ? 1.0 : 0.0]);
          this.set_uniform_float(this.get_uniform_location("ringHalfWidth"), 1, [(this._settings.cachedRingWidth / 2.0) / w]);

        super.vfunc_paint_target(node, paintContext);
     }
   },
);
