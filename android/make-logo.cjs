// Writes the logo's drawables from its geometry (the same numbers as public/icons/icon-source.svg),
// and the old-style launcher icon. Only needs re-running if the logo changes: node android/make-logo.cjs
const fs = require("fs");
const path = require("path");

const res = path.join(__dirname, "res");
const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const rect = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const BLUE = "M279.4 89.6A168 168 0 1 1 89.6 279.4";
const GREEN = "M89.6 232.6A168 168 0 0 1 232.6 89.6";
const BELL = [rect(-74, -11, 148, 22, 11), rect(-108, -76, 36, 152, 13), rect(72, -76, 36, 152, 13), rect(-142, -52, 26, 104, 11), rect(116, -52, 26, 104, 11)].join("");

const arc = (d, color) => `<path android:pathData="${d}" android:strokeColor="${color}" android:strokeWidth="28" android:strokeLineCap="round" />`;
const bell = (color = "#FFFFFF") => `<group android:translateX="256" android:translateY="256" android:scaleX="0.86" android:scaleY="0.86" android:rotation="-45"><path android:pathData="${BELL}" android:fillColor="${color}" /></group>`;
const vector = (dp, body) => `<?xml version="1.0" encoding="utf-8"?>\n<vector ${NS} android:width="${dp}dp" android:height="${dp}dp" android:viewportWidth="512" android:viewportHeight="512">${body}</vector>\n`;
const write = (name, text) => fs.writeFileSync(path.join(res, "drawable", name), text);

// the loading screen's separate layers
write("logo_arc_blue.xml", vector(190, arc(BLUE, "#9CC9F0")));
write("logo_arc_green.xml", vector(190, arc(GREEN, "#7FA883")));
write("logo_dumbbell.xml", vector(190, bell()));
// the launcher icon's foreground: Android shows only the middle of this layer, and masks it to a shape
write("ic_launcher_foreground.xml", vector(108, `<group android:pivotX="256" android:pivotY="256" android:scaleX="0.82" android:scaleY="0.82">${arc(BLUE, "#9CC9F0")}${arc(GREEN, "#7FA883")}${bell()}</group>`));
// notification icons are a single colour
write("ic_notification.xml", vector(24, bell()));

fs.mkdirSync(path.join(res, "mipmap-xxxhdpi"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "..", "public", "icons", "icon-192.png"), path.join(res, "mipmap-xxxhdpi", "ic_launcher.png"));
console.log("ok");
