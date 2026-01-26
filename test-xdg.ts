import { xdgState } from "xdg-basedir";
import path from "path";
console.log("xdgState:", xdgState);
try {
  console.log("path.join(xdgState, 'test'):", path.join(xdgState!, "test"));
} catch (e) {
  console.log("Caught error:", e.message);
}
