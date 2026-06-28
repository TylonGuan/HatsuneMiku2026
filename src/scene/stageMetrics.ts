// ─── Stage projection metrics — one source of truth ─────────────────────────
//
// The theatre's backdrop planes (Theater), curtains (Curtains), and settled
// lyric layout (Lyrics) are all sized against a FIXED reference projection, not
// the live camera. That's deliberate: user zoom then reveals *more art* instead
// of rescaling it, and a window resize doesn't re-wrap the lyrics. For that to
// hold, every one of those modules must size against the SAME numbers — so they
// live here once rather than being hand-copied (and silently drifting) per file.

/**
 * Reference vertical field of view (degrees). Plane/lyric sizing uses this
 * constant instead of the live camera FOV, so zooming the camera changes how
 * much of the painted set you see rather than the size of the set itself. Also
 * the camera's initial FOV (App) and CameraRig's plane-fit reference.
 */
export const REFERENCE_FOV_DEG = 55;

/**
 * Reference camera distance used to size the backdrop/curtain planes.
 *
 * NOTE: this is a *sizing reference*, not the real camera z. The live camera
 * sits at z ≈ 8 (`CameraRig`: TARGET.z −10 + RADIUS 18). The {@link PLANE_MARGIN}
 * oversize absorbs the 7→8 gap, so the planes still cover the frame. Don't
 * "fix" 7→8 without re-checking plane coverage.
 */
export const CAMERA_BASE_Z = 7;

/**
 * Oversize factor applied to every backdrop plane so camera orbit / zoom-out
 * never reveals a plane edge. CameraRig derives its max zoom-out FOV from this
 * same value, which is why it must be shared rather than duplicated.
 */
export const PLANE_MARGIN = 1.4;

/**
 * Aspect ratio of the shared backdrop canvas (3432×2429). Theater uses it to
 * size each plane; CameraRig uses it to bound the horizontal zoom-out so the
 * frustum can never exceed the painting it's looking at.
 */
export const PLANE_IMG_ASPECT = 3432 / 2429; // ≈ 1.413

// ─── Camera framing ─────────────────────────────────────────────────────────
// The orbit camera's resting state, shared by the rig that drives it and the
// other systems that need to reason about where it actually sits.

/**
 * The camera's actual resting distance on the +Z axis (world units). The orbit
 * rig places the camera at `CameraRig`'s `TARGET.z (-10) + RADIUS (18) = 8`;
 * `Stars` reads this to size its depth-parallax spawn. Distinct from
 * {@link CAMERA_BASE_Z} (7), which is only the *plane-sizing* reference — the
 * {@link PLANE_MARGIN} oversize absorbs the 7-vs-8 difference.
 */
export const CAMERA_DISTANCE_Z = 8;

/** Max horizontal orbit swing (radians, ~12.5°). Shared by the drag rig
 *  (`CameraRig`) and the gyroscope input (`gyro`) so tilt and drag clamp alike. */
export const CAMERA_AZ_LIMIT = 0.22;
/** Max vertical orbit swing (radians, ~7°). Shared by `CameraRig` and `gyro`. */
export const CAMERA_EL_LIMIT = 0.12;
