import { describe, expect, it } from 'vitest';
import { pickStageTracks } from './live-room.page';

const SCREEN = { id: 'screen' };
const CAMERA = { id: 'camera' };

describe('pickStageTracks', () => {
  it('fills the stage with the camera when nothing is being shared', () => {
    expect(pickStageTracks(null, CAMERA, false)).toEqual({ main: CAMERA, inset: null });
  });

  it('puts a screen share on the main stage with the camera as the inset', () => {
    expect(pickStageTracks(SCREEN, CAMERA, false)).toEqual({ main: SCREEN, inset: CAMERA });
  });

  it('swaps the two when the viewer taps the inset', () => {
    expect(pickStageTracks(SCREEN, CAMERA, true)).toEqual({ main: CAMERA, inset: SCREEN });
  });

  /**
   * A teacher can share their screen before switching the camera on. Showing
   * an empty inset in that window would be a visible hole in the layout.
   */
  it('shows no inset while only the screen is live', () => {
    expect(pickStageTracks(SCREEN, null, false)).toEqual({ main: SCREEN, inset: null });
  });

  it('shows nothing at all before the host publishes', () => {
    expect(pickStageTracks(null, null, false)).toEqual({ main: null, inset: null });
  });

  /**
   * The camera must reclaim the whole stage when a share ends, rather than
   * leaving the viewer looking at a frozen last frame of the shared window.
   */
  it('gives the stage back to the camera when the share stops', () => {
    const during = pickStageTracks(SCREEN, CAMERA, false);
    const after = pickStageTracks(null, CAMERA, false);
    expect(during.main).toBe(SCREEN);
    expect(after).toEqual({ main: CAMERA, inset: null });
  });
});
