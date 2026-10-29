import { ImageResponse } from 'next/og';
import { IconArt } from './icon-art';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Full-bleed square: iOS rounds the corners itself and fills transparency with black.
export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} />, size);
}
