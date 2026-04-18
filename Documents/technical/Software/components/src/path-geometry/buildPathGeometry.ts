/**
 * Path geometry builder types.
 *
 * This module defines the contract for converting a routed centerline path
 * into drawable geometry (closed shapes) using offset bands.
 *
 * Core idea:
 * - Input: a centerline path (points)
 * - Output: path geometry commands (SVG-compatible, but structured)
 * - Shapes are constructed as bands between two offsets from the centerline
 *
 * Responsibilities of this module:
 * - convert centerline into filled shape geometry
 * - support variable width along path
 * - support asymmetric bands (not centered)
 * - support progressive reveal (animation)
 * - output renderer-agnostic path commands
 *
 * Out of scope:
 * - layout / routing
 * - collision avoidance
 * - multi-line coordination
 * - rendering (canvas/svg/etc)
 */

/** 2D point in world coordinates */
export interface Point {
  x: number;
  y: number;
}

/**
 * Centerline waypoint.
 *
 * The full path is an ordered list of waypoints.
 * First = source, last = target.
 *
 * `radius` is optional and may be used to generate arc joins.
 * If omitted, corners may be treated as sharp.
 */
export interface Waypoint extends Point {
  radius?: number;
}

/**
 * Offset band definition at a specific point along the path.
 *
 * Offsets are measured perpendicular to the centerline direction.
 *
 * Convention:
 * - negative = left side of path
 * - positive = right side of path
 */
export interface OffsetBand {
  /**
   * Inner boundary offset from centerline.
   *
   * Example:
   * - -5 means 5 units to the left
   * - +4 means 4 units to the right
   */
  innerOffset: number;

  /**
   * Outer boundary offset from centerline.
   *
   * Must be >= innerOffset.
   */
  outerOffset: number;
}

/**
 * Band profile across the path.
 *
 * Allows the band to change over distance (taper, shift, etc).
 *
 * `t` is normalized distance along path (0 → start, 1 → end)
 */
export type BandProfile = (t: number) => OffsetBand;

/**
 * Input to the geometry builder.
 */
export interface PathGeometryInput {
  /**
   * Centerline path.
   *
   * Must contain at least two points.
   */
  points: Waypoint[];

  /**
   * Defines how the band is positioned relative to the centerline.
   *
   * This replaces "side" and "width" concepts.
   *
   * Examples:
   * - centered pipe: [-w/2, +w/2]
   * - fluid on one side: [4, 5]
   * - multi-fluid segments: different ranges
   */
  band: BandProfile;

  /**
   * Progress along path (for animation).
   *
   * Range:
   * - 0 = nothing
   * - 1 = full path
   *
   * Geometry should be truncated accordingly.
   */
  progress: number;
}

/**
 * Structured path commands (SVG-compatible).
 *
 * These map directly to SVG path instructions, but are explicit and typed.
 */
export type PathGeometryCommand =
  | { kind: 'moveTo'; x: number; y: number }
  | { kind: 'lineTo'; x: number; y: number }
  | {
      kind: 'arc';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArc: boolean;
      sweep: boolean;
      x: number;
      y: number;
    }
  | { kind: 'closePath' };

/**
 * Output geometry.
 *
 * Represents a closed shape that can be filled by a renderer.
 */
export interface PathGeometry {
  commands: PathGeometryCommand[];
}

/**
 * Build path geometry for a band along a centerline.
 *
 * The implementation must:
 * - walk the centerline path
 * - compute normals at each segment
 * - offset points using band profile
 * - construct left and right boundaries
 * - join boundaries correctly (line or arc)
 * - close the shape
 *
 * Output must represent a valid closed path.
 *
 * This function does NOT:
 * - render anything
 * - validate layout correctness
 */
export function buildPathGeometry(
  input: PathGeometryInput
): PathGeometry {
  throw new Error('buildPathGeometry is not implemented.');
}